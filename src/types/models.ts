import type { CurrencyCode } from "@/lib/finance/currency";
import type { MoneyEntry } from "@/lib/finance/fx";
import type { TaxConfig } from "@/lib/finance/tax";

type ISO = string;

export type Meta = {
  id: string;
  createdAt: ISO;
  updatedAt: ISO;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
  deletedAt?: ISO | null;
  deletedBy?: string | null;
};

export type Money = { currency: CurrencyCode; amount: number }; // minor units

export type OrderSource = Meta & {
  name: string;
  searchName: string;
  active: boolean;
  notes?: string;
};

export type IdType =
  | "aadhaar" | "pan" | "passport" | "voter_id" | "driving_license" | "other";

// What the browser sees. The encrypted number stays on the server.
export type CustomerIdDoc = { id: string; type: IdType; last4: string };

export type Customer = Meta & {
  name: string;
  searchName: string;
  phone: string;
  phoneDigits: string; // last 10 digits, for search and duplicate checks
  email: string;
  country: string;
  address: string;
  notes: string;
  idDocs: CustomerIdDoc[];
};

export type PackageStatus = "draft" | "active" | "archived";

export type GroupType = "couple" | "fixed_group" | "open_group";

// amount = per-person price in minor units, applies from `fromPersons` upward; base price starts at 1
export type PriceTier = { fromPersons: number; amount: number };

export type PackageListing = {
  name: string;
  phone: string;
  photos: string[];
};

export type TravelPackage = Meta & {
  name: string;
  searchName: string;
  destination: string;
  days: number;
  nights: number;
  groupType: GroupType;
  minPersons: number;
  maxPersons: number;     // 0 = no limit
  price: Money;           // base per-person price (the first tier)
  cost?: MoneyEntry | null;
  priceTiers: PriceTier[]; // sorted, first tier starts at minPersons
  inclusions: string[];
  exclusions: string[];
  rooms: PackageListing[];
  travelProviders: PackageListing[];
  roomImages?: string[];
  transportImages?: string[];
  itinerary: { day: number; title: string; description: string }[];
  status: PackageStatus;
};

export type AgeCategory = "adult" | "child" | "senior";
export type Gender = "male" | "female" | "other";
export type PerCategory = Record<AgeCategory, number>; // minor units for rates, headcount for counts
export type BookingStatus = "open" | "closed" | "completed" | "cancelled";

export type Booking = Meta & {
  bookingNo: string; // ADN-B-2026-0001
  title: string;
  contactName: string;
  searchName: string;
  packageId: string;
  packageName: string;
  destination: string;
  currency: CurrencyCode;
  travelStart: string; // "YYYY-MM-DD" (IST)
  travelEnd: string;
  closeDate: string;   // members can be added until the end of this day
  minPersons: number;
  maxPersons: number;  // 0 = no limit
  rates: PerCategory;  // per-person price by category
  counts: PerCategory; // active members by category
  memberCount: number; // active members
  totalAmount: number; // sum of active member prices
  status: BookingStatus;
  notes: string;
};

export type Member = Meta & {
  bookingId: string;
  customerId: string | null; // null only for members created before this change
  name: string;
  searchName: string;
  gender: Gender;
  category: AgeCategory;
  dateOfBirth?: string;
  aadhaarCard?: {
    name: string;
    objectPath: string;
    contentType: "image/jpeg" | "image/png" | "image/webp";
    size: number;
  } | null;
  age: number | null;
  phone: string;
  sourceId: string;
  sourceName: string;
  price: number; // minor units, booking currency
  priceOverridden: boolean;
  status: "active" | "cancelled";
  note: string;
};

export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "cancelled";

export type InvoicePayment = { paymentId?: string; amount: number; date: ISO; money?: MoneyEntry }; // amount in minor units
export type InvoiceAttachmentContentType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export type InvoiceAttachment = {
  id: string;
  name: string;
  objectPath: string;
  contentType: InvoiceAttachmentContentType;
  size: number;
};

export type Invoice = Meta & {
  invoiceNo: string; // ADN-2026-0001
  bookingId: string | null;
  issueDate: ISO;
  tripDestination: string;
  tripStatus: "upcoming" | "completed" | "cancelled";
  customer: { id: string | null; name: string; email?: string; phone: string; address: string };
  package: {
    name?: string;
    destination: string;
    startDate: ISO;
    endDate: ISO;
    duration?: string;
    memberCount: number;
    totalPrice: number;
    cost?: MoneyEntry | null;
  };
  business: { name: string; tagline?: string; gstin: string; address: string }; // snapshot
  currency: CurrencyCode;
  discount: number;
  tax: TaxConfig;       // snapshot, overridable per invoice
  subtotal: number;
  taxable: number;
  taxAmount: number;
  total: number;
  payments: InvoicePayment[];
  nextPaymentDue?: { amount: number; date: ISO } | null;
  amountPaid: number;   // total payments in invoice currency
  remainingBalance: number;
  status: InvoiceStatus;
  paymentTerms: string;
  cancellationPolicy: string;
  termsAndConditions: string;
  importantNotes: string;
  attachments: InvoiceAttachment[];
};

export type InvoiceBookingOption = {
  id: string;
  bookingNo: string;
  title: string;
  contactName: string;
  destination: string;
  packageName?: string;
  travelStart: string;
  travelEnd: string;
  memberCount: number;
  totalAmount: number;
  currency: CurrencyCode;
  defaultPackageCost?: number;
  packageCostConversionMissing?: boolean;
  status: BookingStatus;
};

export type TransactionType = "income" | "expense" | "refund";
export type PaymentMethod = "cash" | "upi" | "bank_transfer" | "card" | "cheque" | "other";

export type Transaction = Meta & {
  type: TransactionType;
  date: ISO;
  monthKey: string; // "2026-10", IST
  money: MoneyEntry; // original currency, frozen rate, INR values, fee
  method: PaymentMethod;
  categoryId?: string;   // expenses
  categoryName?: string;
  vendor?: string;       // expenses
  bookingId?: string;
  invoiceId?: string;
  customerId?: string;
  appliedToInvoice?: number; // minor units in the invoice's currency
  reference?: string;
  note?: string;
};

export type ExpenseCategory = Meta & { name: string; active: boolean };

export type ExpenseReceipt = {
  id: string;
  name: string;
  objectPath: string;
  contentType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  size: number;
};

export type FinanceExpense = Meta & {
  date: ISO;
  description: string;
  category: string;
  vendor: string;
  payee?: string;
  bookingId?: string;
  money: MoneyEntry;
  note: string;
  receipt: ExpenseReceipt | null;
};

export type TargetMetric =
  | "bookings"
  | "completed_bookings"
  | "revenue"
  | "profit"
  | "customers"
  | "travelers";
export type TargetPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly"
  | "custom";
export type TargetRecordStatus = "active" | "paused";
export type TargetDisplayStatus = "in_progress" | "completed" | "expired" | "paused";

export type Target = Meta & {
  name: string;
  metric: TargetMetric;
  targetValue: number;
  currency?: CurrencyCode;
  period: TargetPeriod;
  startDate: ISO;
  endDate: ISO;
  description: string;
  status: TargetRecordStatus;
  completedAt?: ISO | null;
  completionNotifiedAt?: ISO | null;
};

export type TargetProgress = Target & {
  actualValue: number | null;
  remainingValue: number | null;
  progressPercent: number | null;
  displayStatus: TargetDisplayStatus;
  celebration: boolean;
};