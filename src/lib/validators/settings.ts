import { z } from "zod";

export const settingsSchema = z.object({
  business: z.object({
    name: z.string().min(1),
    tagline: z.string(),
    gstin: z.string().max(15),
    address: z.string(),
  }),
  gst: z.object({
    enabled: z.boolean(),
    defaultRatePercent: z.number().min(0).max(100),
    mode: z.enum(["exclusive", "inclusive"]),
    presets: z.array(z.number().min(0).max(100)).max(8),
  }),
  fx: z.object({
    rates: z.record(z.string(), z.number().positive()), // INR per 1 unit
    defaultFeePercent: z.number().min(0).max(20),
  }),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  business: {
    name: "ABC Tours and Travels",
    tagline: "",
    gstin: "",
    address: "",
  },
  gst: { enabled: false, defaultRatePercent: 5, mode: "exclusive", presets: [0, 5, 12, 18] },
  fx: {
    // PLACEHOLDER rates. Replace with real ones in Settings after first login.
    rates: { USD: 83, EUR: 90, GBP: 105, AED: 22.6, SGD: 62 },
    defaultFeePercent: 0,
  },
};