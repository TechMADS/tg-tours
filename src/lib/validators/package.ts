import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/finance/currency";

export const PACKAGE_STATUSES = ["draft", "active", "archived"] as const;
export const packageStatusSchema = z.enum(PACKAGE_STATUSES);
export const STATUS_LABEL: Record<(typeof PACKAGE_STATUSES)[number], string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

export const GROUP_TYPES = ["couple", "fixed_group", "open_group"] as const;
export const GROUP_LABEL: Record<(typeof GROUP_TYPES)[number], string> = {
  couple: "Couple package",
  fixed_group: "Fixed group",
  open_group: "Open group (strangers)",
};

const common = {
  name: z.string().trim().min(2, "Name is too short").max(80, "Max 80 characters"),
  destination: z.string().trim().min(2, "Enter a destination").max(80, "Max 80 characters"),
  days: z.number().int().min(1, "At least 1 day").max(60, "Max 60 days"),
  nights: z.number().int().min(0, "Cannot be negative").max(60, "Max 60 nights"),
  groupType: z.enum(GROUP_TYPES),
  minPersons: z.number().int("Whole number").min(1, "At least 1").max(500, "Max 500"),
  currency: z.enum(CURRENCY_CODES),
  price: z.number().min(0, "Price cannot be negative").max(1_000_000_000, "Price is too large"),
  extraTiers: z
    .array(
      z.object({
        fromPersons: z.number().int("Whole number").min(2, "Enter persons"),
        price: z.number().min(0.01, "Enter a price").max(1_000_000_000, "Price is too large"),
      }),
    ),
  status: packageStatusSchema,
};

const dayItem = z.object({
  title: z.string().trim().min(1, "Add a title for each day").max(100, "Max 100 characters"),
  description: z.string().trim().max(1000, "Max 1000 characters"),
});
const imageUrl = z.string().trim().url("Enter a valid image URL").max(2048, "URL is too long")
  .refine((value) => /^https?:\/\//i.test(value), "Use a public HTTP or HTTPS URL");
const optionalImageUrl = z.string().trim().max(2048, "URL is too long")
  .refine((value) => value === "" || imageUrl.safeParse(value).success, "Enter a valid public image URL");
const phoneNumber = z.string().trim().max(20, "Max 20 characters")
  .refine((value) => value === "" || /^\+?[0-9\s-]{7,20}$/.test(value), "Enter a valid phone number");

const listingFormSchema = z.object({
  name: z.string().trim().max(100, "Max 100 characters"),
  phone: phoneNumber,
  photos: z.array(z.object({ url: optionalImageUrl })).max(20, "Max 20 photos per listing"),
}).superRefine((listing, ctx) => {
  if ((listing.name || listing.phone || listing.photos.length > 0) && listing.name.length < 2) {
    ctx.addIssue({ code: "custom", path: ["name"], message: "Enter a name" });
  }
});

const listingInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(100, "Max 100 characters"),
  phone: phoneNumber,
  photos: z.array(imageUrl).max(20, "Max 20 photos per listing"),
});

type Rules = {
  days: number;
  nights: number;
  groupType: string;
  minPersons: number;
  extraTiers: { fromPersons: number }[];
};
type Ctx = {
  addIssue: (i: { code: "custom"; path: (string | number)[]; message: string }) => void;
};

function rules(d: Rules, ctx: Ctx) {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: "custom", path, message });

  if (d.nights > d.days) issue(["nights"], "Nights can't exceed days");
  if (d.groupType === "couple" && d.minPersons !== 2) {
    issue(["minPersons"], "A couple package is exactly 2 persons");
  }

  let prev = 1;
  d.extraTiers.forEach((t, i) => {
    if (d.groupType === "couple") {
      issue(["extraTiers", i, "fromPersons"], "Group rates aren't available for couple packages");
    } else if (t.fromPersons <= prev) {
      issue(["extraTiers", i, "fromPersons"], `Must be above ${prev} (rates go in increasing order)`);
    }
    prev = t.fromPersons;
  });
}

/** What the form edits. Lists are objects so useFieldArray can manage them. */
export const packageFormSchema = z
  .object({
    ...common,
    inclusions: z.array(z.object({ value: z.string().trim().max(200, "Max 200 characters") })).max(30),
    exclusions: z.array(z.object({ value: z.string().trim().max(200, "Max 200 characters") })).max(30),
    rooms: z.array(listingFormSchema).max(20, "Max 20 rooms"),
    travelProviders: z.array(listingFormSchema).max(20, "Max 20 travel providers"),
    itinerary: z.array(dayItem).max(60),
  })
  .superRefine((d, ctx) => rules(d, ctx));
export type PackageFormValues = z.infer<typeof packageFormSchema>;

/** What the server action receives (plain string lists) */
export const packageInputSchema = z
  .object({
    ...common,
    inclusions: z.array(z.string().trim().min(1).max(200)).max(30),
    exclusions: z.array(z.string().trim().min(1).max(200)).max(30),
    rooms: z.array(listingInputSchema).max(20, "Max 20 rooms"),
    travelProviders: z.array(listingInputSchema).max(20, "Max 20 travel providers"),
    itinerary: z.array(dayItem).max(60),
  })
  .superRefine((d, ctx) => rules(d, ctx));
export type PackageInput = z.infer<typeof packageInputSchema>;