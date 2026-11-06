import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { COL, serializeDoc } from "@/lib/firestore/helpers";
import type { Invoice } from "@/types/models";
import { todayIST } from "@/lib/format";

const read = (doc: FirebaseFirestore.DocumentSnapshot) => serializeDoc<Invoice>(doc);

export async function listInvoices(): Promise<Invoice[]> {
  const snapshot = await adminDb.collection(COL.invoices)
    .where("isDeleted", "==", false)
    .get();
  return snapshot.docs.map(read).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const snapshot = await adminDb.collection(COL.invoices).doc(id).get();
  if (!snapshot.exists || snapshot.data()?.isDeleted) return null;
  return read(snapshot);
}

export async function suggestInvoiceNumber(issueDate: string): Promise<string> {
  const year = /^\d{4}-\d{2}-\d{2}$/.test(issueDate)
    ? issueDate.slice(0, 4)
    : todayIST().slice(0, 4);
  const counter = await adminDb.collection(COL.counters).doc(`invoice-${year}`).get();
  const next = ((counter.data()?.value as number | undefined) ?? 0) + 1;
  return `ABC-${year}-${String(next).padStart(4, "0")}`;
}
