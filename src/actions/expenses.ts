"use server";

import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleEditor } from "@/lib/auth/session";
import { buildMoneyEntry } from "@/lib/finance/fx";
import { toMinor } from "@/lib/finance/currency";
import { COL, auditEntry, createMeta, deleteMeta } from "@/lib/firestore/helpers";
import { getExpense } from "@/lib/data/expenses";
import { getBooking } from "@/lib/data/bookings";
import { getSettings } from "@/lib/settings";
import { createInvoiceStorageConfig } from "@/lib/r2/invoice-storage";
import { expenseInputSchema } from "@/lib/validators/expense";
import type { ExpenseReceipt } from "@/types/models";
import type { Role } from "@/types/roles";

type Result = { ok: true; id: string } | { ok: false; error: string };
const MANAGE: Role[] = ["admin", "manager"];
const MAX_RECEIPT_SIZE = 10 * 1024 * 1024;
const RECEIPT_EXTENSIONS = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

function isReceiptContentType(type: string): type is keyof typeof RECEIPT_EXTENSIONS {
  return Object.hasOwn(RECEIPT_EXTENSIONS, type);
}

function hasValidReceiptSignature(type: string, bytes: Buffer) {
  if (type === "application/pdf") return bytes.toString("ascii", 0, 5) === "%PDF-";
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return type === "image/webp"
    && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP";
}

export async function createExpense(formData: FormData): Promise<Result> {
  const user = await requireModuleEditor("finance", MANAGE);
  const parsed = expenseInputSchema.safeParse({
    date: formData.get("date"),
    description: formData.get("description"),
    category: formData.get("category"),
    vendor: formData.get("vendor") ?? "",
    payee: formData.get("payee") ?? undefined,
    bookingId: formData.get("bookingId") ?? undefined,
    amount: Number(formData.get("amount")),
    currency: formData.get("currency"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const input = parsed.data;
  if (!input.bookingId && !input.payee) {
    return { ok: false, error: "Enter the employee or vendor name for this company expense" };
  }
  if (input.bookingId && !(await getBooking(input.bookingId))) {
    return { ok: false, error: "Booking not found" };
  }
  const settings = await getSettings();
  if (
    input.currency !== "INR"
    && (!settings.fx.rates[input.currency] || settings.fx.rates[input.currency] <= 0)
  ) {
    return { ok: false, error: `Set an exchange rate for ${input.currency} in Settings before recording an expense` };
  }

  const file = formData.get("receipt");
  const receiptFile = file instanceof File && file.size > 0 ? file : null;
  let receiptBytes: Buffer | undefined;
  let receiptContentType: keyof typeof RECEIPT_EXTENSIONS | undefined;
  if (receiptFile) {
    const type = receiptFile.type;
    if (!isReceiptContentType(type)) {
      return { ok: false, error: "Use a PDF, JPEG, PNG, or WebP receipt up to 10 MB" };
    }
    receiptContentType = type;
    if (receiptFile.size > MAX_RECEIPT_SIZE) {
      return { ok: false, error: "Use a PDF, JPEG, PNG, or WebP receipt up to 10 MB" };
    }
    receiptBytes = Buffer.from(await receiptFile.arrayBuffer());
    if (!hasValidReceiptSignature(receiptFile.type, receiptBytes)) {
      return { ok: false, error: "The selected receipt is not a valid PDF or image" };
    }
  }

  const expenseRef = adminDb.collection(COL.transactions).doc();
  let receipt: ExpenseReceipt | null = null;
  const storage = receiptFile ? createInvoiceStorageConfig() : null;
  if (receiptFile && !storage?.ok) {
    return { ok: false, error: storage?.error ?? "Private receipt storage is unavailable" };
  }

  if (receiptFile && storage?.ok && receiptBytes && receiptContentType) {
    const extension = RECEIPT_EXTENSIONS[receiptContentType];
    const objectPath = `finance-expenses/${user.uid}/${randomUUID()}.${extension}`;
    try {
      await storage.client.send(new PutObjectCommand({
        Bucket: storage.bucketName,
        Key: objectPath,
        Body: receiptBytes,
        ContentType: receiptContentType,
        CacheControl: "private, no-store",
        Metadata: { "uploaded-by": user.uid },
      }));
      receipt = {
        id: randomUUID(),
        name: receiptFile.name.slice(0, 180),
        objectPath,
        contentType: receiptContentType,
        size: receiptFile.size,
      };
    } catch (error) {
      console.error("Expense receipt upload failed:", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      storage.client.destroy();
      return { ok: false, error: "Receipt upload failed. Check private R2 storage configuration." };
    }
  }

  const money = buildMoneyEntry({
    currency: input.currency,
    amount: toMinor(input.amount),
    defaultRates: settings.fx.rates,
    defaultFeePercent: 0,
  });
  const batch = adminDb.batch();
  batch.set(expenseRef, {
    type: "expense",
    date: input.date,
    description: input.description,
    category: input.category,
    vendor: input.vendor,
    ...(input.payee ? { payee: input.payee } : {}),
    ...(input.bookingId ? { bookingId: input.bookingId } : {}),
    money,
    note: input.note,
    receipt,
    ...createMeta(user),
  });
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "expense.create", "expense", expenseRef.id, {
      date: input.date, category: input.category, amount: money.amount, currency: money.currency,
      ...(input.payee ? { payee: input.payee } : {}),
      ...(input.bookingId ? { bookingId: input.bookingId } : {}),
      receipt: Boolean(receipt),
    }),
  );
  try {
    await batch.commit();
  } catch (error) {
    console.error("Expense record creation failed:", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    if (receipt && storage?.ok) {
      try {
        await storage.client.send(new DeleteObjectCommand({
          Bucket: storage.bucketName,
          Key: receipt.objectPath,
        }));
      } catch (cleanupError) {
        console.error("Orphaned expense receipt cleanup failed:", {
          name: cleanupError instanceof Error ? cleanupError.name : "UnknownError",
        });
      }
    }
    return { ok: false, error: "Could not save the expense. Please try again." };
  } finally {
    if (receipt && storage?.ok) storage.client.destroy();
  }

  revalidatePath("/finance");
  revalidatePath("/company-expenses");
  if (input.bookingId) revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true, id: expenseRef.id };
}

export async function deleteExpense(id: string): Promise<Result> {
  const user = await requireModuleEditor("finance", MANAGE);
  const expense = await getExpense(id);
  if (!expense) return { ok: false, error: "Expense not found" };

  const batch = adminDb.batch();
  batch.update(adminDb.collection(COL.transactions).doc(id), deleteMeta(user));
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "expense.delete", "expense", id, {
      date: expense.date, category: expense.category, amount: expense.money.amount,
      currency: expense.money.currency,
      ...(expense.bookingId ? { bookingId: expense.bookingId } : {}),
    }),
  );
  await batch.commit();
  revalidatePath("/finance");
  revalidatePath("/company-expenses");
  if (expense.bookingId) revalidatePath(`/bookings/${expense.bookingId}`);
  return { ok: true, id };
}
