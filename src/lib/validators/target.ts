import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/finance/currency";
import { getTargetDateRange } from "@/lib/targets-period";

const date = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Choose a valid date");

export const targetInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a target name").max(100, "Max 100 characters"),
  metric: z.enum([
    "bookings", "completed_bookings", "revenue", "profit", "customers", "travelers",
  ]),
  targetValue: z.number()
    .finite()
    .int("Target value must be a whole number")
    .positive("Target must be greater than zero")
    .max(1_000_000_000),
  currency: z.enum(CURRENCY_CODES).optional(),
  period: z.enum([
    "daily", "weekly", "monthly", "quarterly", "half_yearly", "yearly", "custom",
  ]),
  periodDate: date,
  customEndDate: date.optional(),
  description: z.string().trim().max(500, "Max 500 characters").default(""),
}).superRefine((target, ctx) => {
  const isFinancial = target.metric === "revenue" || target.metric === "profit";
  if (isFinancial && !target.currency) {
    ctx.addIssue({
      code: "custom",
      path: ["currency"],
      message: "Choose a currency for this financial target",
    });
  }
  if (!isFinancial && target.currency) {
    ctx.addIssue({
      code: "custom",
      path: ["currency"],
      message: "Currency is only used for revenue and profit targets",
    });
  }
  if (target.period === "custom" && !target.customEndDate) {
    ctx.addIssue({
      code: "custom",
      path: ["customEndDate"],
      message: "Choose an end date for the custom range",
    });
  }
  if (!getTargetDateRange(target.period, target.periodDate, target.customEndDate)) {
    ctx.addIssue({
      code: "custom",
      path: ["customEndDate"],
      message: "The date range is invalid",
    });
  }
});

export type TargetInput = z.infer<typeof targetInputSchema>;
