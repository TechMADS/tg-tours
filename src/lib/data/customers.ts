import "server-only";
import { FieldPath } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COL, serializeDoc } from "@/lib/firestore/helpers";
import type { Customer } from "@/types/models";

const PAGE_SIZE = 20;
export type CustomersPage = {
  items: Array<Customer & { invoiceNumbers: string[]; dateOfBirth: string | null }>;
  nextCursor: string | null;
};

function isMissingIndexError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  return (
    (error.code === 9 || error.code === "failed-precondition" || error.code === "FAILED_PRECONDITION") &&
    /requires an index/i.test(error.message)
  );
}

/** Strips the encrypted ID numbers so they can never reach the browser */
export function toCustomer(snap: FirebaseFirestore.DocumentSnapshot): Customer {
  const c = serializeDoc<Customer & { idDocs?: Array<Record<string, string>> }>(snap);
  return {
    ...c,
    idDocs: (c.idDocs ?? []).map((d) => ({
      id: d.id,
      type: d.type as Customer["idDocs"][number]["type"],
      last4: d.last4,
    })),
  };
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const snap = await adminDb.collection(COL.customers).doc(id).get();
  if (!snap.exists || snap.data()?.isDeleted) return null;
  return toCustomer(snap);
}

/**
 * Alphabetical, prefix search on name. If the search is 3+ digits it searches phone instead.
 * cursor = "<last value>|<last doc id>"
 */
export async function listCustomersPage(rawQuery = "", cursor?: string | null): Promise<CustomersPage> {
  const q = rawQuery.trim().toLowerCase();
  const digits = q.replace(/[\s+-]/g, "");
  const byPhone = /^\d{3,}$/.test(digits);
  const field = byPhone ? "phoneDigits" : "searchName";
  const term = byPhone ? digits : q;

  const buildQuery = (excludeDeleted: boolean, after?: string | null) => {
    let query: FirebaseFirestore.Query = adminDb.collection(COL.customers);
    if (excludeDeleted) query = query.where("isDeleted", "==", false);
    query = query.orderBy(field).orderBy(FieldPath.documentId());
    if (term) query = query.where(field, ">=", term).where(field, "<", term + "\uf8ff");
    if (after) {
      const i = after.lastIndexOf("|");
      query = query.startAfter(after.slice(0, i), after.slice(i + 1));
    }
    return query;
  };

  let docs: FirebaseFirestore.QueryDocumentSnapshot[];
  let hasMore: boolean;
  try {
    const snap = await buildQuery(true, cursor).limit(PAGE_SIZE + 1).get();
    docs = snap.docs.slice(0, PAGE_SIZE);
    hasMore = snap.docs.length > PAGE_SIZE;
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;

    const matchingDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let scanCursor = cursor;
    let exhausted = false;
    while (matchingDocs.length <= PAGE_SIZE && !exhausted) {
      const snap = await buildQuery(false, scanCursor).limit(PAGE_SIZE + 1).get();
      for (const doc of snap.docs) {
        if (doc.data().isDeleted === false) matchingDocs.push(doc);
        if (matchingDocs.length > PAGE_SIZE) break;
      }
      exhausted = snap.docs.length < PAGE_SIZE + 1;
      const lastScanned = snap.docs[snap.docs.length - 1];
      if (!exhausted && matchingDocs.length <= PAGE_SIZE && lastScanned) {
        scanCursor = `${lastScanned.get(field)}|${lastScanned.id}`;
      }
    }
    docs = matchingDocs.slice(0, PAGE_SIZE);
    hasMore = matchingDocs.length > PAGE_SIZE;
  }

  const last = docs[docs.length - 1];
  const customers = docs.map(toCustomer);
  const customerIds = customers.map((customer) => customer.id);
  const invoiceNumbersByCustomer = new Map(customers.map((customer) => [customer.id, new Set<string>()]));
  const dateOfBirthByCustomer = new Map<string, { date: string; status: string }>();

  if (customers.length > 0) {
    const memberships = await adminDb.collectionGroup("members")
      .where("customerId", "in", customerIds)
      .get();
    const customersByBooking = new Map<string, Set<string>>();

    for (const membership of memberships.docs) {
      const member = membership.data();
      const customerId = member.customerId;
      const bookingId = membership.ref.parent.parent?.id;
      if (typeof customerId !== "string" || !bookingId) continue;
      if (typeof member.dateOfBirth === "string") {
        const existing = dateOfBirthByCustomer.get(customerId);
        if (!existing || (member.status === "active" && existing.status !== "active")) {
          dateOfBirthByCustomer.set(customerId, {
            date: member.dateOfBirth,
            status: member.status,
          });
        }
      }
      const bookingCustomers = customersByBooking.get(bookingId) ?? new Set<string>();
      bookingCustomers.add(customerId);
      customersByBooking.set(bookingId, bookingCustomers);
    }

    const addInvoices = (invoices: FirebaseFirestore.QuerySnapshot) => {
      for (const invoice of invoices.docs) {
        const data = invoice.data();
        if (data.isDeleted || typeof data.invoiceNo !== "string") continue;

        const directCustomerId = data.customer?.id;
        if (typeof directCustomerId === "string") {
          invoiceNumbersByCustomer.get(directCustomerId)?.add(data.invoiceNo);
        }
        const bookingId = data.bookingId;
        if (typeof bookingId === "string") {
          for (const customerId of customersByBooking.get(bookingId) ?? []) {
            invoiceNumbersByCustomer.get(customerId)?.add(data.invoiceNo);
          }
        }
      }
    };

    const directInvoices = await adminDb.collection(COL.invoices)
      .where("customer.id", "in", customerIds)
      .get();
    addInvoices(directInvoices);

    const bookingIds = Array.from(customersByBooking.keys());
    for (let offset = 0; offset < bookingIds.length; offset += 30) {
      const bookingIdBatch = bookingIds.slice(offset, offset + 30);
      const bookingInvoices = await adminDb.collection(COL.invoices)
        .where("bookingId", "in", bookingIdBatch)
        .get();
      addInvoices(bookingInvoices);
    }
  }

  return {
    items: customers.map((customer) => ({
      ...customer,
      invoiceNumbers: Array.from(invoiceNumbersByCustomer.get(customer.id) ?? [])
        .sort((a, b) => a.localeCompare(b)),
      dateOfBirth: dateOfBirthByCustomer.get(customer.id)?.date ?? null,
    })),
    nextCursor: hasMore && last ? `${last.get(field)}|${last.id}` : null,
  };
}

export type CustomerTrip = {
  memberId: string;
  bookingId: string;
  title: string;
  bookingNo: string;
  travelStart: string;
  travelEnd: string;
  bookingStatus: string;
  currency: string;
  category: string;
  price: number;
  memberStatus: "active" | "cancelled";
  dateOfBirth: string | null;
  hasAadhaarCard: boolean;
};

export async function listCustomerTrips(customerId: string): Promise<CustomerTrip[]> {
  const snap = await adminDb.collectionGroup("members").where("customerId", "==", customerId).get();
  if (snap.empty) return [];

  const refs = new Map(snap.docs.map((m) => [m.ref.parent.parent!.path, m.ref.parent.parent!]));
  const bookings = new Map(
    (await adminDb.getAll(...refs.values())).map((b) => [b.ref.path, b]),
  );

  const trips: CustomerTrip[] = [];
  for (const m of snap.docs) {
    const b = bookings.get(m.ref.parent.parent!.path);
    const bd = b?.data();
    if (!b?.exists || !bd || bd.isDeleted) continue;
    const member = m.data();
    trips.push({
      memberId: m.id,
      bookingId: b.id,
      title: bd.title,
      bookingNo: bd.bookingNo,
      travelStart: bd.travelStart,
      travelEnd: bd.travelEnd,
      bookingStatus: bd.status,
      currency: bd.currency,
      category: member.category,
      price: member.price,
      memberStatus: member.status,
      dateOfBirth: typeof member.dateOfBirth === "string" ? member.dateOfBirth : null,
      hasAadhaarCard: typeof member.aadhaarCard?.objectPath === "string",
    });
  }
  return trips.sort((a, b) => b.travelStart.localeCompare(a.travelStart));
}