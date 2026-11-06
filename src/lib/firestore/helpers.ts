import "server-only";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import type { SessionUser } from "@/types/roles";

export const COL = {
  users: "users",
  settings: "settings",
  orderSources: "orderSources",
  customers: "customers",
  packages: "packages",
  bookings: "bookings",
  invoices: "invoices",
  transactions: "transactions",
  expenseCategories: "expenseCategories",
  counters: "counters",
  stats: "stats",
  auditLogs: "auditLogs",
  targets: "targets",
} as const;

/* ---------- write metadata ---------- */
export const createMeta = (u: SessionUser) => ({
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  createdBy: u.uid,
  updatedBy: u.uid,
  isDeleted: false,
});

export const updateMeta = (u: SessionUser) => ({
  updatedAt: FieldValue.serverTimestamp(),
  updatedBy: u.uid,
});

export const deleteMeta = (u: SessionUser) => ({
  ...updateMeta(u),
  isDeleted: true,
  deletedAt: FieldValue.serverTimestamp(),
  deletedBy: u.uid,
});

/** Build an audit doc. Add it with batch.set / tx.set so it commits with the change. */
export const auditEntry = (
  u: SessionUser,
  action: string, // e.g. "customer.create"
  entity: string,
  entityId: string,
  data?: Record<string, unknown>,
) => ({
  action,
  entity,
  entityId,
  by: u.uid,
  byEmail: u.email,
  at: FieldValue.serverTimestamp(),
  ...(data ? { data } : {}),
});

/* ---------- reading ---------- */
// Timestamps can't be passed from server to client components, so convert them.
function convert(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(convert);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, convert(x)]));
  }
  return v;
}

export function serializeDoc<T>(snap: DocumentSnapshot): T {
  return { id: snap.id, ...(convert(snap.data()) as object) } as T;
}

/* ---------- small utilities ---------- */
export const toSearchName = (s: string) => s.trim().toLowerCase();

/** "2026-10" in India time, so month buckets match how you think about months */
export function monthKey(d: Date = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return `${get("year")}-${get("month")}`;
}