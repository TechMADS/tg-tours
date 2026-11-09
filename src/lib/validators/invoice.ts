import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/finance/currency";

const date = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Choose a valid date");

export const invoiceInputSchema = z.object({
  invoiceNo: z.string().trim().min(1, "Enter the invoice number").max(40, "Max 40 characters"),
  bookingId: z.string().trim(),
  issueDate: date,
  tripDestination: z.string().trim().min(2, "Enter the trip destination").max(100),
  tripStatus: z.enum(["upcoming", "completed", "cancelled"]),
  customer: z.object({
    name: z.string().trim().min(2, "Enter the client name").max(100),
    phone: z.string().trim().min(7, "Enter the mobile number").max(20)
      .regex(/^\+?[0-9\s()-]{7,20}$/, "Enter a valid mobile number"),
    address: z.string().trim().min(2, "Enter the client address").max(500),
  }),
  package: z.object({
    name: z.string().trim().max(80, "Max 80 characters"),
    destination: z.string().trim().min(2, "Enter the package destination").max(100),
    startDate: date,
    endDate: date,
    duration: z.string().trim().max(80, "Max 80 characters"),
    memberCount: z.number().int().min(1, "At least 1 member").max(500),
    totalPrice: z.number().min(0, "Cannot be negative").max(1_000_000_000),
    cost: z.number().min(0, "Cannot be negative").max(1_000_000_000),
  }),
  currency: z.enum(CURRENCY_CODES),
  discount: z.number().min(0, "Cannot be negative").max(1_000_000_000),
  taxEnabled: z.boolean(),
  taxRatePercent: z.number().min(0).max(100),
  taxMode: z.enum(["exclusive", "inclusive"]),
  payments: z.array(z.object({
    paymentId: z.string().uuid().optional(),
    amount: z.number().min(0, "Cannot be negative").max(1_000_000_000),
    date,
  })).max(20, "Add no more than 20 payments"),
  nextPaymentDue: z.object({
    amount: z.number().positive("Enter an amount greater than zero").max(1_000_000_000).optional(),
    date: z.union([date, z.literal("")]),
  }),
  paymentTerms: z.string().trim().max(3000),
  cancellationPolicy: z.string().trim().max(3000),
  termsAndConditions: z.string().trim().max(5000),
  importantNotes: z.string().trim().max(3000),
  attachments: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(180),
    objectPath: z.string().trim().min(1).max(500),
    contentType: z.enum([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
    size: z.number().int().positive().max(10 * 1024 * 1024),
  })).max(10, "Attach no more than 10 documents"),
}).superRefine((invoice, ctx) => {
  if (invoice.package.endDate < invoice.package.startDate) {
    ctx.addIssue({ code: "custom", path: ["package", "endDate"], message: "End date can't be before start date" });
  }
  if (invoice.discount > invoice.package.totalPrice) {
    ctx.addIssue({ code: "custom", path: ["discount"], message: "Discount can't exceed package price" });
  }
  if (invoice.nextPaymentDue.amount !== undefined && !invoice.nextPaymentDue.date) {
    ctx.addIssue({ code: "custom", path: ["nextPaymentDue", "date"], message: "Enter a due date for the next payment" });
  }
  if (invoice.nextPaymentDue.amount === undefined && invoice.nextPaymentDue.date) {
    ctx.addIssue({ code: "custom", path: ["nextPaymentDue", "amount"], message: "Enter the amount due on this date" });
  }
});

export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
