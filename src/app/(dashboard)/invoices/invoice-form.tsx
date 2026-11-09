"use client";

import Image from "next/image";
import { useEffect, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { createInvoice, updateInvoice, uploadInvoiceDocument } from "@/actions/invoices";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCIES, CURRENCY_CODES, formatMoney, percentToBps, toMinor, type CurrencyCode } from "@/lib/finance/currency";
import { convertMinorAmount } from "@/lib/finance/fx";
import { calcTotals } from "@/lib/finance/tax";
import { formatDuration } from "@/lib/format";
import { invoiceInputSchema, type InvoiceInput } from "@/lib/validators/invoice";
import type { Invoice, InvoiceAttachment, InvoiceBookingOption } from "@/types/models";
import type { AppSettings } from "@/lib/validators/settings";
import { InvoiceDocument } from "./invoice-document";
import { InvoicePdfButton } from "./invoice-pdf-button";

const selectClass = "border-input bg-background h-10 w-full min-w-0 rounded-md border px-3 text-sm";
const dateValue = (date: string) => date.slice(0, 10);
const durationCounts = (duration: string) => ({
  nights: duration.match(/(\d+)\s*nights?/i)?.[1] ?? "",
  days: duration.match(/(\d+)\s*days?/i)?.[1] ?? "",
});
const formatPackageDuration = (nights: string, days: string) => {
  if (!nights || !days) return "";
  const nightCount = Number(nights);
  const dayCount = Number(days);
  return `${nightCount} ${nightCount === 1 ? "night" : "nights"} / ${dayCount} ${dayCount === 1 ? "day" : "days"}`;
};
const DEFAULT_PAYMENT_TERMS = "- 40% advance payment is due on or before booking confirmation.\n- Remaining amount is due on or before the travel date.";
const DEFAULT_CANCELLATION = "- Cancellation made more than 7 days before travel: 75% of the package amount will be deducted.\n- Cancellation made within 3 days of travel: 100% of the package amount will be deducted.\n- No refund is provided for last-minute cancellations or no-shows.\n- Eligible refunds are processed within 7-10 working days.";
const DEFAULT_TERMS = "- Guide charges must be paid; otherwise, guidance will be provided remotely.\n- Rates are applicable for group bookings; participant changes may affect the cost.\n- Hotel check-in and check-out timings are subject to hotel policies.\n- Rooms are provided on a sharing basis, subject to availability.\n- Sightseeing is covered as per itinerary; sequence may change due to conditions.\n- The company is not responsible for delays due to natural or unforeseen circumstances.\n- Personal expenses are not included unless mentioned.\n- Clients must carry valid government-issued ID proof.\n- Any damages will be chargeable to the client.\n- Management reserves the right to modify the itinerary.";
const DEFAULT_NOTES = "- Rates are calculated based on group size.\n- Changes in itinerary may affect the cost.\n- Entry tickets and personal expenses are not included.";

function ErrorText({ message }: { message?: string }) {
  return message ? <p className="text-destructive text-xs">{message}</p> : null;
}

function AttachmentPreview({
  attachment,
  invoiceId,
  file,
}: {
  attachment: InvoiceAttachment;
  invoiceId?: string;
  file?: File;
}) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!attachment.contentType.startsWith("image/") && attachment.contentType !== "application/pdf") {
      return;
    }

    let objectUrl: string | undefined;
    const controller = new AbortController();
    const loadPreview = async () => {
      try {
        const blob = file ?? await (async () => {
          if (!invoiceId) throw new Error("Saved attachment is unavailable");
          const response = await fetch(
            `/api/invoices/${invoiceId}/attachments/${attachment.id}`,
            { signal: controller.signal },
          );
          if (!response.ok) throw new Error("Attachment preview failed to load");
          return response.blob();
        })();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      } catch {
        if (!controller.signal.aborted) setError("Preview could not be loaded.");
      }
    };

    void loadPreview();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.contentType, attachment.id, file, invoiceId]);

  if (!attachment.contentType.startsWith("image/") && attachment.contentType !== "application/pdf") {
    return <p className="mt-2 text-xs text-muted-foreground">Preview isn’t available for this document type.</p>;
  }
  if (error) return <p className="mt-2 text-xs text-destructive">{error}</p>;
  if (!previewUrl) return <p className="mt-2 text-xs text-muted-foreground">Loading preview…</p>;

  return attachment.contentType === "application/pdf" ? (
    <iframe
      src={previewUrl}
      title={`Preview of ${attachment.name}`}
      className="mt-3 h-72 w-full rounded-md border bg-white"
    />
  ) : (
    <Image
      src={previewUrl}
      alt={`Preview of ${attachment.name}`}
      width={800}
      height={600}
      unoptimized
      className="mt-3 max-h-72 w-full rounded-md border bg-white object-contain"
    />
  );
}

function initialValues(
  today: string,
  initial: Invoice | null,
  defaultTax: AppSettings["gst"],
  suggestedInvoiceNo: string,
): InvoiceInput {
  if (initial) {
    return {
      invoiceNo: initial.invoiceNo,
      bookingId: initial.bookingId ?? "",
      issueDate: dateValue(initial.issueDate),
      tripDestination: initial.tripDestination,
      tripStatus: initial.tripStatus,
      customer: {
        name: initial.customer.name,
        phone: initial.customer.phone,
        address: initial.customer.address,
      },
      package: {
        name: initial.package.name ?? "",
        destination: initial.package.destination,
        startDate: dateValue(initial.package.startDate),
        endDate: dateValue(initial.package.endDate),
        duration: initial.package.duration ?? formatDuration(initial.package.startDate, initial.package.endDate),
        memberCount: initial.package.memberCount,
        totalPrice: initial.package.totalPrice / 100,
        cost: initial.package.cost ? initial.package.cost.amount / 100 : 0,
      },
      currency: initial.currency,
      discount: initial.discount / 100,
      taxEnabled: initial.tax.enabled,
      taxRatePercent: initial.tax.rateBps / 100,
      taxMode: initial.tax.mode,
      payments: initial.payments.map((payment) => ({
        paymentId: payment.paymentId,
        amount: payment.amount / 100,
        date: dateValue(payment.date),
      })),
      nextPaymentDue: {
        amount: initial.nextPaymentDue ? initial.nextPaymentDue.amount / 100 : undefined,
        date: initial.nextPaymentDue ? dateValue(initial.nextPaymentDue.date) : "",
      },
      paymentTerms: initial.paymentTerms,
      cancellationPolicy: initial.cancellationPolicy,
      termsAndConditions: initial.termsAndConditions,
      importantNotes: initial.importantNotes,
      attachments: initial.attachments,
    };
  }

  return {
    invoiceNo: suggestedInvoiceNo,
    bookingId: "",
    issueDate: today,
    tripDestination: "",
    tripStatus: "upcoming",
    customer: { name: "", phone: "", address: "" },
    package: { name: "", destination: "", startDate: "", endDate: "", duration: "", memberCount: 1, totalPrice: 0, cost: 0 },
    currency: "INR",
    discount: 0,
    taxEnabled: defaultTax.enabled,
    taxRatePercent: defaultTax.defaultRatePercent,
    taxMode: defaultTax.mode,
    payments: [],
    nextPaymentDue: { amount: undefined, date: "" },
    paymentTerms: DEFAULT_PAYMENT_TERMS,
    cancellationPolicy: DEFAULT_CANCELLATION,
    termsAndConditions: DEFAULT_TERMS,
    importantNotes: DEFAULT_NOTES,
    attachments: [],
  };
}

export function InvoiceForm({
  bookings,
  business,
  defaultTax,
  fxRates,
  suggestedInvoiceNo,
  today,
  invoice = null,
}: {
  bookings: InvoiceBookingOption[];
  business: AppSettings["business"];
  defaultTax: AppSettings["gst"];
  fxRates: Record<string, number>;
  suggestedInvoiceNo: string;
  today: string;
  invoice?: Invoice | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [localAttachmentFiles, setLocalAttachmentFiles] = useState<Record<string, File>>({});
  const defaultValues = initialValues(today, invoice, defaultTax, suggestedInvoiceNo);
  const [durationNights, setDurationNights] = useState(() => durationCounts(defaultValues.package.duration).nights);
  const [durationDays, setDurationDays] = useState(() => durationCounts(defaultValues.package.duration).days);
  const { register, control, handleSubmit, setValue, formState: { errors } } = useForm<InvoiceInput>({
    resolver: zodResolver(invoiceInputSchema),
    defaultValues,
  });
  const payments = useFieldArray({ control, name: "payments" });
  const attachments = useFieldArray({ control, name: "attachments", keyName: "fieldKey" });
  const values = useWatch({ control }) as InvoiceInput;
  const totals = calcTotals({
    lineTotals: [toMinor(Number(values.package.totalPrice) || 0)],
    discount: toMinor(Number(values.discount) || 0),
    tax: {
      enabled: values.taxEnabled,
      rateBps: percentToBps(Number(values.taxRatePercent) || 0),
      mode: values.taxMode,
    },
  });
  const remaining = Math.max(
    totals.total - values.payments.reduce((sum, payment) => sum + toMinor(Number(payment.amount) || 0), 0),
    0,
  );
  const currencyField = register("currency");

  function updateDuration(nights: string, days: string) {
    setDurationNights(nights);
    setDurationDays(days);
    setValue("package.duration", formatPackageDuration(nights, days), { shouldDirty: true });
  }

  function convertInvoiceCurrency(nextCurrency: CurrencyCode) {
    const currentCurrency = values.currency;
    if (currentCurrency === nextCurrency) return true;

    const hasAmounts = Number(values.package.totalPrice) > 0
      || Number(values.package.cost) > 0
      || Number(values.discount) > 0
      || Number(values.nextPaymentDue.amount) > 0
      || values.payments.some((payment) => Number(payment.amount) > 0);
    const sourceRate = currentCurrency === "INR" ? 1 : fxRates[currentCurrency];
    const targetRate = nextCurrency === "INR" ? 1 : fxRates[nextCurrency];
    if (hasAmounts && (!sourceRate || !targetRate || sourceRate <= 0 || targetRate <= 0)) {
      toast.error("Configure exchange rates before changing the currency for an invoice with amounts");
      return false;
    }

    const convert = (amount: number) => hasAmounts
      ? convertMinorAmount(toMinor(Number(amount) || 0), sourceRate, targetRate) / 100
      : Number(amount) || 0;
    setValue("package.totalPrice", convert(values.package.totalPrice));
    setValue("package.cost", convert(values.package.cost));
    setValue("discount", convert(values.discount));
    if (values.nextPaymentDue.amount !== undefined) {
      setValue("nextPaymentDue.amount", convert(values.nextPaymentDue.amount));
    }
    values.payments.forEach((payment, index) => {
      setValue(`payments.${index}.amount`, convert(payment.amount));
    });
    setValue("currency", nextCurrency);
    return true;
  }

  function changeCurrency(event: ChangeEvent<HTMLSelectElement>) {
    const nextCurrency = event.target.value as CurrencyCode;
    if (!convertInvoiceCurrency(nextCurrency)) {
      event.currentTarget.value = values.currency;
      return;
    }
    currencyField.onChange(event);
  }

  function selectBooking(id: string) {
    const booking = bookings.find((item) => item.id === id);
    if (booking && !convertInvoiceCurrency(booking.currency)) return;
    setValue("bookingId", id);
    if (!booking) return;
    setValue("tripDestination", booking.destination);
    setValue("tripStatus", booking.status === "completed" ? "completed" : booking.status === "cancelled" ? "cancelled" : "upcoming");
    setValue("customer.name", booking.contactName || "");
    setValue("package.name", booking.packageName || "");
    setValue("package.destination", booking.destination);
    setValue("package.startDate", dateValue(booking.travelStart));
    setValue("package.endDate", dateValue(booking.travelEnd));
    const duration = formatDuration(booking.travelStart, booking.travelEnd);
    const counts = durationCounts(duration);
    setDurationNights(counts.nights);
    setDurationDays(counts.days);
    setValue("package.duration", formatPackageDuration(counts.nights, counts.days));
    setValue("package.memberCount", Math.max(booking.memberCount, 1));
    setValue("package.totalPrice", booking.totalAmount / 100);
    setValue("package.cost", (booking.defaultPackageCost ?? 0) / 100);
    setValue("currency", booking.currency);
    if (booking.packageCostConversionMissing) {
      toast.error("Could not convert the package default cost to the invoice currency. Enter the cost manually.");
    }
  }

  async function uploadDocuments(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (attachments.fields.length + selected.length > 10) {
      toast.error("You can attach up to 10 documents");
      return;
    }
    setUploading(true);
    try {
      for (const file of selected) {
        const data = new FormData();
        data.set("file", file);
        const result = await uploadInvoiceDocument(data);
        if (!result.ok) {
          toast.error(`${file.name}: ${result.error}`);
          continue;
        }
        setLocalAttachmentFiles((current) => ({ ...current, [result.attachment.id]: file }));
        attachments.append(result.attachment);
      }
    } catch {
      toast.error("Document upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  function onSubmit(data: InvoiceInput) {
    startTransition(async () => {
      const result = invoice
        ? await updateInvoice(invoice.id, data)
        : await createInvoice(data);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(invoice ? "Invoice updated" : "Invoice created");
      router.push(`/invoices/${result.id}`);
      router.refresh();
    });
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit, () => {
        toast.error("Please correct the highlighted fields before saving the invoice.");
      })}
      className="space-y-5"
    >
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Invoice Details</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invoiceNo">Invoice Number</Label>
                <Input id="invoiceNo" {...register("invoiceNo")} />
                <ErrorText message={errors.invoiceNo?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issueDate">Invoice Date</Label>
                <Input id="issueDate" type="date" {...register("issueDate")} />
                <ErrorText message={errors.issueDate?.message} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="bookingId">Prefill from booking (optional)</Label>
                <input type="hidden" {...register("bookingId")} />
                <select id="bookingId" className={selectClass} value={values.bookingId} onChange={(event) => selectBooking(event.target.value)}>
                  <option value="">Create a manual invoice</option>
                  {bookings.map((booking) => (
                    <option key={booking.id} value={booking.id}>
                      {booking.bookingNo} · {booking.title} · {booking.contactName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tripDestination">Trip Destination</Label>
                <Input id="tripDestination" {...register("tripDestination")} />
                <ErrorText message={errors.tripDestination?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tripStatus">Trip Status</Label>
                <select id="tripStatus" className={selectClass} {...register("tripStatus")}>
                  <option value="upcoming">Upcoming</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Client Details</CardTitle><CardDescription>Client information printed on the invoice.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clientName">Client Name</Label>
                <Input id="clientName" autoComplete="name" {...register("customer.name")} />
                <ErrorText message={errors.customer?.name?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientPhone">Mobile Number</Label>
                <Input id="clientPhone" type="tel" autoComplete="tel" {...register("customer.phone")} />
                <ErrorText message={errors.customer?.phone?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientAddress">Address</Label>
                <Textarea id="clientAddress" rows={3} {...register("customer.address")} />
                <ErrorText message={errors.customer?.address?.message} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Package Details</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="packageDestination">Package Destination</Label>
                <Input id="packageDestination" {...register("package.destination")} />
                <ErrorText message={errors.package?.destination?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="packageStart">Package Start Date</Label>
                <Input id="packageStart" type="date" {...register("package.startDate")} />
                <ErrorText message={errors.package?.startDate?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="packageEnd">Package End Date</Label>
                <Input id="packageEnd" type="date" {...register("package.endDate")} />
                <ErrorText message={errors.package?.endDate?.message} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="packageNights">Duration</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <Input
                      id="packageNights"
                      type="number"
                      min={0}
                      step={1}
                      className="pr-16"
                      value={durationNights}
                      onChange={(event) => updateDuration(event.target.value, durationDays)}
                      aria-label="Duration in nights"
                      placeholder="0"
                    />
                    <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">Nights</span>
                  </div>
                  <div className="relative">
                    <Input
                      id="packageDays"
                      type="number"
                      min={0}
                      step={1}
                      className="pr-12"
                      value={durationDays}
                      onChange={(event) => updateDuration(durationNights, event.target.value)}
                      aria-label="Duration in days"
                      placeholder="0"
                    />
                    <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">Days</span>
                  </div>
                </div>
                <ErrorText message={errors.package?.duration?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="membersCount">Number of Members</Label>
                <Input id="membersCount" type="number" min={1} {...register("package.memberCount", { valueAsNumber: true })} />
                <ErrorText message={errors.package?.memberCount?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <select id="currency" className={selectClass} {...currencyField} onChange={changeCurrency}>
                  {CURRENCY_CODES.map((code) => <option key={code} value={code}>{code} ({CURRENCIES[code].name})</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="packageTotal">Total Package Price ({CURRENCIES[values.currency].symbol})</Label>
                <Input id="packageTotal" type="number" min={0} step="0.01" {...register("package.totalPrice", { valueAsNumber: true })} />
                <ErrorText message={errors.package?.totalPrice?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount">Discount ({CURRENCIES[values.currency].symbol})</Label>
                <Input id="discount" type="number" min={0} step="0.01" {...register("discount", { valueAsNumber: true })} />
                <ErrorText message={errors.discount?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxEnabled">GST</Label>
                <select id="taxEnabled" className={selectClass} {...register("taxEnabled", { setValueAs: (value) => value === "true" })}>
                  <option value="false">No GST</option>
                  <option value="true">Add GST</option>
                </select>
              </div>
              {values.taxEnabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="taxRate">GST Rate (%)</Label>
                    <Input id="taxRate" type="number" min={0} max={100} step="0.01" {...register("taxRatePercent", { valueAsNumber: true })} />
                    <ErrorText message={errors.taxRatePercent?.message} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxMode">GST Mode</Label>
                    <select id="taxMode" className={selectClass} {...register("taxMode")}>
                      <option value="exclusive">Exclusive</option>
                      <option value="inclusive">Inclusive</option>
                    </select>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div><CardTitle>Payments</CardTitle><CardDescription>Record each advance or later payment with its date. Rows with an amount of 0 are ignored.</CardDescription></div>
              <Button type="button" variant="outline" size="sm" onClick={() => payments.append({ amount: 0, date: today })}>
                <Plus className="mr-1 size-4" /> Add Payment
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {payments.fields.map((field, index) => (
                <div key={field.id} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <input type="hidden" {...register(`payments.${index}.paymentId`)} />
                  <div className="space-y-2">
                    <Label htmlFor={`payment-${index}`}>Advance Paid ({CURRENCIES[values.currency].symbol})</Label>
                    <Input id={`payment-${index}`} type="number" min={0} step="0.01" {...register(`payments.${index}.amount`, { valueAsNumber: true })} />
                    <ErrorText message={errors.payments?.[index]?.amount?.message} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`payment-date-${index}`}>Date</Label>
                    <Input id={`payment-date-${index}`} type="date" {...register(`payments.${index}.date`)} />
                    <ErrorText message={errors.payments?.[index]?.date?.message} />
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove payment" onClick={() => payments.remove(index)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <p className="rounded-md bg-amber-500/10 p-3 text-sm font-medium">
                Remaining Balance: {formatMoney(remaining, values.currency)}
              </p>
              <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nextPaymentAmount">Next Payment Amount (optional)</Label>
                  <Input
                    id="nextPaymentAmount"
                    type="number"
                    min={0.01}
                    step="0.01"
                    {...register("nextPaymentDue.amount", {
                      setValueAs: (value: string) => value === "" ? undefined : Number(value),
                    })}
                  />
                  <ErrorText message={errors.nextPaymentDue?.amount?.message} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nextPaymentDate">Next Payment Due Date (optional)</Label>
                  <Input id="nextPaymentDate" type="date" {...register("nextPaymentDue.date")} />
                  <ErrorText message={errors.nextPaymentDue?.date?.message} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Terms &amp; Conditions</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <TextAreaField label="Payment Terms" name="paymentTerms" register={register} />
              <TextAreaField label="Cancellation Policy" name="cancellationPolicy" register={register} />
              <TextAreaField label="Terms and Conditions" name="termsAndConditions" register={register} />
              <TextAreaField label="Important Notes" name="importantNotes" register={register} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Attach Documents</CardTitle><CardDescription>PDF, JPEG, PNG, WebP, or DOCX; up to 10 MB each. Images are added as pages to the invoice PDF.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="invoice-documents" className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Upload className="size-4" /> {uploading ? "Uploading…" : "Choose files"}
              </Label>
              <Input
                id="invoice-documents"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
                multiple
                disabled={uploading}
                className="sr-only"
                onChange={(event) => {
                  void uploadDocuments(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
              {attachments.fields.map((attachment, index) => (
                <div key={attachment.fieldKey} className="min-w-0 rounded-md bg-muted px-3 py-2 text-sm">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{attachment.name}</span>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${attachment.name}`} onClick={() => attachments.remove(index)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <AttachmentPreview
                    attachment={attachment}
                    invoiceId={invoice?.id}
                    file={localAttachmentFiles[attachment.id]}
                  />
                </div>
              ))}
              <ErrorText message={errors.attachments?.message} />
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 xl:sticky xl:top-20">
          <InvoiceDocument values={values} business={business} />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button type="submit" className="w-full sm:w-auto" disabled={pending || uploading}>
          {pending ? "Saving…" : invoice ? "Save Invoice" : "Create Invoice"}
        </Button>
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => router.back()}>Cancel</Button>
        <InvoicePdfButton
          invoiceNo={values.invoiceNo}
          invoiceId={invoice?.id}
          attachments={values.attachments}
          localAttachmentFiles={localAttachmentFiles}
          className="w-full sm:ml-auto sm:w-auto"
        />
      </div>
    </form>
  );
}

function TextAreaField({
  label, name, register,
}: {
  label: string;
  name: "paymentTerms" | "cancellationPolicy" | "termsAndConditions" | "importantNotes";
  register: ReturnType<typeof useForm<InvoiceInput>>["register"];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} rows={5} {...register(name)} />
    </div>
  );
}
