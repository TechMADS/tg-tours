import { z } from "zod";
import { HARD_LIMIT } from "@/lib/booking-utils";
import { todayIST } from "@/lib/format";

export const GENDERS = ["male", "female", "other"] as const;
export const CATEGORIES = ["adult", "child", "senior"] as const;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const price = z.number().min(0, "Cannot be negative").max(1_000_000_000, "Price is too large");

export const bookingInputSchema = z
  .object({
    packageId: z.string().min(1, "Choose a package"),
    title: z.string().trim().min(2, "Title is too short").max(100, "Max 100 characters"),
    contactName: z.string().trim().min(2, "Enter the booked person's name").max(80, "Max 80 characters"),
    travelStart: date,
    travelEnd: date,
    closeDate: date,
    minPersons: z.number().int("Whole number").min(1, "At least 1").max(HARD_LIMIT, `Max ${HARD_LIMIT}`),
    maxPersons: z.number().int("Whole number").min(0, "Cannot be negative").max(HARD_LIMIT, `Max ${HARD_LIMIT}`),
    adultPrice: price,
    childPrice: price,
    seniorPrice: price,
    repriceExisting: z.boolean(),
    notes: z.string().trim().max(500, "Max 500 characters"),
  })
  .superRefine((d, ctx) => {
    const bad = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (d.travelEnd < d.travelStart) bad("travelEnd", "End date can't be before the start date");
    if (d.closeDate > d.travelStart) bad("closeDate", "Close date must be on or before the travel start");
    if (d.maxPersons !== 0 && d.maxPersons < d.minPersons) bad("maxPersons", "Maximum can't be below the minimum");
  });
export type BookingInput = z.infer<typeof bookingInputSchema>;

export const memberInputSchema = z
  .object({
    customerId: z.string(), // "" = create a new customer from name/phone/email
    name: z.string().trim().max(80, "Max 80 characters"),
    phone: z
      .string()
      .trim()
      .max(20, "Max 20 characters")
      .refine((v) => v === "" || /^\+?[0-9\s-]{7,20}$/.test(v), "Enter a valid phone number"),
    email: z
      .string()
      .trim()
      .max(100, "Max 100 characters")
      .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email"),
    gender: z.enum(GENDERS),
    category: z.enum(CATEGORIES),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date of birth")
      .refine((value) => value <= todayIST(), "Date of birth cannot be in the future")
      .refine((value) => {
        const parsed = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
      }, "Choose a valid date of birth"),
    age: z
      .string()
      .trim()
      .refine((v) => v === "" || (/^\d{1,3}$/.test(v) && Number(v) <= 120), "Enter a valid age"),
    sourceId: z.string().min(1, "Choose an order source"),
    price,
    note: z.string().trim().max(300, "Max 300 characters"),
  })
  .superRefine((d, ctx) => {
    if (!d.customerId && d.name.length < 2) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "Pick a customer or enter a name" });
    }
  });
export type MemberInput = z.infer<typeof memberInputSchema>;