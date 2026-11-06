"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { requireModuleEditor } from "@/lib/auth/session";
import { calcTotals } from "@/lib/finance/tax";
import { buildMoneyEntry } from "@/lib/finance/fx";
import { percentToBps, toMinor } from "@/lib/finance/currency";
import { todayIST } from "@/lib/format";
import { COL, auditEntry, createMeta, deleteMeta, updateMeta } from "@/lib/firestore/helpers";
import { getInvoice } from "@/lib/data/invoices";
import { invoiceInputSchema, type InvoiceInput } from "@/lib/validators/invoice";
import { getSettings } from "@/lib/settings";
import { getBooking } from "@/lib/data/bookings";
import { createInvoiceStorageConfig, invoiceObjectStorageError } from "@/lib/r2/invoice-storage";
import type { Invoice, InvoiceAttachment, InvoicePayment, InvoiceStatus } from "@/types/models";
import type { Role } from "@/types/roles";

type Result = { ok: true; id: string; invoiceNo?: string } | { ok: false; error: string };
const MANAGE: Role[] = ["admin", "manager"];
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
const DOCUMENT_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} satisfies Record<InvoiceAttachment["contentType"], string>;

function isInvoiceDocumentType(contentType: string): contentType is InvoiceAttachment["contentType"] {
  return Object.hasOwn(DOCUMENT_TYPES, contentType);
}

function buildInvoice(
  input: InvoiceInput,
  invoiceNo: string,
  business: Invoice["business"],
  rates: Record<string, number>,
  previous?: Pick<Invoice, "payments" | "package">,
): Omit<Invoice, "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "isDeleted"> {
  const subtotal = toMinor(input.package.totalPrice);
  const discount = toMinor(input.discount);
  const tax = {
    enabled: input.taxEnabled,
    rateBps: percentToBps(input.taxRatePercent),
    mode: input.taxMode,
  } as const;
  const totals = calcTotals({ lineTotals: [subtotal], discount, tax });
  const payments: InvoicePayment[] = input.payments.map((payment, index) => {
    const amount = toMinor(payment.amount);
    const previousPayment = payment.paymentId
      ? previous?.payments.find((item) => item.paymentId === payment.paymentId)
      : previous?.payments[index];
    const money = previousPayment?.amount === amount && previousPayment.date === payment.date
      && previousPayment.money?.currency === input.currency
      ? previousPayment.money
      : buildMoneyEntry({
          currency: input.currency,
          amount,
          defaultRates: rates,
          defaultFeePercent: 0,
        });
    return {
      paymentId: previousPayment?.paymentId ?? randomUUID(),
      amount,
      date: payment.date,
      money,
    };
  });
  const amountPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remainingBalance = Math.max(totals.total - amountPaid, 0);
  const packageCostAmount = toMinor(input.package.cost);
  const previousPackageCost = previous?.package.cost;
  const packageCost = packageCostAmount > 0
    ? previousPackageCost?.amount === packageCostAmount
      && previousPackageCost.currency === input.currency
      ? previousPackageCost
      : buildMoneyEntry({
          currency: input.currency,
          amount: packageCostAmount,
          defaultRates: rates,
          defaultFeePercent: 0,
        })
    : null;
  const status: InvoiceStatus = remainingBalance === 0 && totals.total > 0
    ? "paid"
    : amountPaid > 0 ? "partially_paid" : "sent";

  return {
    invoiceNo,
    bookingId: input.bookingId || null,
    issueDate: input.issueDate,
    tripDestination: input.tripDestination,
    tripStatus: input.tripStatus,
    customer: { id: null, ...input.customer },
    package: {
      ...input.package,
      totalPrice: subtotal,
      cost: packageCost,
    },
    business,
    currency: input.currency,
    discount,
    tax,
    subtotal,
    taxable: totals.taxable,
    taxAmount: totals.taxAmount,
    total: totals.total,
    payments,
    nextPaymentDue: input.nextPaymentDue.amount !== undefined && input.nextPaymentDue.date
      ? {
          amount: toMinor(input.nextPaymentDue.amount),
          date: input.nextPaymentDue.date,
        }
      : null,
    amountPaid,
    remainingBalance,
    status,
    paymentTerms: input.paymentTerms,
    cancellationPolicy: input.cancellationPolicy,
    termsAndConditions: input.termsAndConditions,
    importantNotes: input.importantNotes,
    attachments: input.attachments,
  };
}

function invoiceYear(issueDate: string) {
  return /^\d{4}-/.test(issueDate) ? issueDate.slice(0, 4) : todayIST().slice(0, 4);
}

export async function createInvoice(input: unknown): Promise<Result> {
  const user = await requireModuleEditor("invoices", MANAGE);
  const parsed = invoiceInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;
  if (data.attachments.some((attachment) => !attachment.objectPath.startsWith(`invoice-documents/${user.uid}/`))) {
    return { ok: false, error: "Invalid invoice attachment" };
  }
  const settings = await getSettings();
  if (
    (data.package.cost > 0 || data.payments.length > 0) && data.currency !== "INR"
    && (!settings.fx.rates[data.currency] || settings.fx.rates[data.currency] <= 0)
  ) {
    return { ok: false, error: `Set an exchange rate for ${data.currency} in Settings before recording invoice payments or package costs` };
  }
  const business = {
    name: settings.business.name,
    tagline: settings.business.tagline,
    gstin: settings.business.gstin,
    address: settings.business.address,
  };
  if (data.bookingId && !(await getBooking(data.bookingId))) {
    return { ok: false, error: "The selected booking could not be found" };
  }
  const counterRef = adminDb.collection(COL.counters).doc(`invoice-${invoiceYear(data.issueDate)}`);
  const invoiceRef = adminDb.collection(COL.invoices).doc();
  const invoices = adminDb.collection(COL.invoices);

  try {
    const invoiceNo = await adminDb.runTransaction(async (tx) => {
      const counter = await tx.get(counterRef);
      const next = ((counter.data()?.value as number | undefined) ?? 0) + 1;
      const candidate = data.invoiceNo || `ABC-${invoiceYear(data.issueDate)}-${String(next).padStart(4, "0")}`;
      const duplicate = await tx.get(invoices.where("invoiceNo", "==", candidate).where("isDeleted", "==", false));
      if (!duplicate.empty) throw new Error("An invoice with this number already exists");

      const invoice = buildInvoice(data, candidate, business, settings.fx.rates);
      tx.set(counterRef, { value: next });
      tx.set(invoiceRef, { ...invoice, ...createMeta(user) });
      tx.set(
        adminDb.collection(COL.auditLogs).doc(),
        auditEntry(user, "invoice.create", "invoice", invoiceRef.id, {
          invoiceNo: candidate, total: invoice.total,
        }),
      );
      return candidate;
    });
    revalidatePath("/invoices");
    return { ok: true, id: invoiceRef.id, invoiceNo };
  } catch (error) {
    if (error instanceof Error && error.message === "An invoice with this number already exists") {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

export async function updateInvoice(id: string, input: unknown): Promise<Result> {
  const user = await requireModuleEditor("invoices", MANAGE);
  const parsed = invoiceInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const old = await getInvoice(id);
  if (!old) return { ok: false, error: "Invoice not found" };
  if (
    parsed.data.bookingId
    && parsed.data.bookingId !== old.bookingId
    && !(await getBooking(parsed.data.bookingId))
  ) {
    return { ok: false, error: "The selected booking could not be found" };
  }
  const previousPaths = new Set(old.attachments.map((attachment) => attachment.objectPath));
  if (parsed.data.attachments.some((attachment) =>
    !attachment.objectPath.startsWith(`invoice-documents/${user.uid}/`)
    && !previousPaths.has(attachment.objectPath))) {
    return { ok: false, error: "Invalid invoice attachment" };
  }
  const settings = await getSettings();
  const costAmount = toMinor(parsed.data.package.cost);
  const previousCost = old.package.cost;
  const packageCostNeedsRate = costAmount > 0
    && (previousCost?.amount !== costAmount || previousCost.currency !== parsed.data.currency);
  const paymentNeedsRate = parsed.data.payments.some((payment, index) => {
    const previousPayment = payment.paymentId
      ? old.payments.find((item) => item.paymentId === payment.paymentId)
      : old.payments[index];
    return previousPayment?.amount !== toMinor(payment.amount)
      || previousPayment.date !== payment.date
      || previousPayment.money?.currency !== parsed.data.currency;
  });
  if (
    (packageCostNeedsRate || paymentNeedsRate) && parsed.data.currency !== "INR"
    && (!settings.fx.rates[parsed.data.currency] || settings.fx.rates[parsed.data.currency] <= 0)
  ) {
    return { ok: false, error: `Set an exchange rate for ${parsed.data.currency} in Settings before recording invoice payments or package costs` };
  }
  const invoice = buildInvoice(
    parsed.data,
    parsed.data.invoiceNo || old.invoiceNo,
    old.business,
    settings.fx.rates,
    old,
  );
  const ref = adminDb.collection(COL.invoices).doc(id);

  try {
    await adminDb.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists || current.data()?.isDeleted) {
        throw new Error("Invoice not found");
      }
      const duplicate = await tx.get(
        adminDb.collection(COL.invoices)
          .where("invoiceNo", "==", invoice.invoiceNo)
          .where("isDeleted", "==", false),
      );
      if (duplicate.docs.some((doc) => doc.id !== id)) {
        throw new Error("An invoice with this number already exists");
      }
      tx.update(ref, { ...invoice, ...updateMeta(user) });
      tx.set(
        adminDb.collection(COL.auditLogs).doc(),
        auditEntry(user, "invoice.update", "invoice", id, {
          invoiceNo: invoice.invoiceNo, total: invoice.total,
        }),
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Invoice not found") {
      return { ok: false, error: error.message };
    }
    if (error instanceof Error && error.message === "An invoice with this number already exists") {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true, id };
}

export async function uploadInvoiceDocument(formData: FormData) {
  const user = await requireModuleEditor("invoices", MANAGE);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Choose a document to upload" };
  }
  if (!isInvoiceDocumentType(file.type) || file.size > MAX_DOCUMENT_SIZE) {
    return { ok: false as const, error: "Use a PDF, JPEG, PNG, WebP, or DOCX file up to 10 MB" };
  }
  const extension = DOCUMENT_TYPES[file.type];
  const storage = createInvoiceStorageConfig();
  if (!storage.ok) return { ok: false as const, error: storage.error };

  const objectPath = `invoice-documents/${user.uid}/${randomUUID()}.${extension}`;
  try {
    await storage.client.send(new PutObjectCommand({
      Bucket: storage.bucketName,
      Key: objectPath,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: file.type,
      CacheControl: "private, no-store",
      Metadata: { "uploaded-by": user.uid },
    }));
  } catch (error) {
    console.error("Invoice document upload failed:", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return { ok: false as const, error: invoiceObjectStorageError(error) };
  } finally {
    storage.client.destroy();
  }

  const attachment: InvoiceAttachment = {
    id: randomUUID(),
    name: file.name.slice(0, 180),
    objectPath,
    contentType: file.type,
    size: file.size,
  };
  return { ok: true as const, attachment };
}

export async function deleteInvoice(id: string): Promise<Result> {
  const user = await requireModuleEditor("invoices", MANAGE);
  const invoice = await getInvoice(id);
  if (!invoice) return { ok: false, error: "Invoice not found" };
  await adminDb.collection(COL.invoices).doc(id).update({
    ...deleteMeta(user),
  });
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true, id };
}
