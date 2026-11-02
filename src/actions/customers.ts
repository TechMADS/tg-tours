"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { requireModule, requireModuleEditor } from "@/lib/auth/session";
import { listCustomersPage } from "@/lib/data/customers";
import {
  COL, auditEntry, createMeta, deleteMeta, toSearchName, updateMeta,
} from "@/lib/firestore/helpers";
import { decrypt, encrypt } from "@/lib/security/crypto";
import {
  ID_TYPES, MAX_ID_DOCS, customerInputSchema, normalizeIdNumber, validateIdNumber,
  type CustomerInput,
} from "@/lib/validators/customer";

type Result =
  | { ok: true; id?: string }
  | { ok: false; error: string; duplicate?: boolean };

const MANAGEMENT = ["admin", "manager"] as const;

/* ---------- helpers ---------- */
function baseFields(d: CustomerInput) {
  return {
    name: d.name,
    searchName: toSearchName(d.name),
    phone: d.phone,
    phoneDigits: d.phone.replace(/\D/g, "").slice(-10),
    email: d.email.toLowerCase(),
    country: d.country,
    address: d.address,
    notes: d.notes,
  };
}

function encryptNewDocs(docs: CustomerInput["newIdDocs"]) {
  const out: { id: string; type: string; last4: string; encrypted: string }[] = [];
  for (const d of docs) {
    const number = normalizeIdNumber(d.number);
    const err = validateIdNumber(d.type, number);
    if (err) return { error: `${ID_TYPES[d.type]}: ${err}` };
    out.push({ id: randomUUID(), type: d.type, last4: number.slice(-4), encrypted: encrypt(number) });
  }
  return { docs: out };
}

async function findDuplicate(f: ReturnType<typeof baseFields>, exceptId?: string) {
  const col = adminDb.collection(COL.customers);
  if (f.phoneDigits.length >= 7) {
    const s = await col.where("isDeleted", "==", false).where("phoneDigits", "==", f.phoneDigits).limit(3).get();
    const hit = s.docs.find((d) => d.id !== exceptId);
    if (hit) return `A customer with this phone already exists: ${hit.data().name}`;
  }
  if (f.email) {
    const s = await col.where("isDeleted", "==", false).where("email", "==", f.email).limit(3).get();
    const hit = s.docs.find((d) => d.id !== exceptId);
    if (hit) return `A customer with this email already exists: ${hit.data().name}`;
  }
  return null;
}

/* ---------- list (called by the client for search and load more) ---------- */
export async function fetchCustomers(query: string, cursor?: string | null) {
  await requireModule("customers");
  return listCustomersPage(query, cursor);
}

/* ---------- create ---------- */
export async function createCustomer(input: unknown, force = false): Promise<Result> {
  const user = await requireModuleEditor("customers");

  const parsed = customerInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const fields = baseFields(parsed.data);
  if (!force) {
    const dup = await findDuplicate(fields);
    if (dup) return { ok: false, error: dup, duplicate: true };
  }

  const enc = encryptNewDocs(parsed.data.newIdDocs);
  if (enc.error) return { ok: false, error: enc.error };

  const ref = adminDb.collection(COL.customers).doc();
  const batch = adminDb.batch();
  batch.set(ref, { ...fields, idDocs: enc.docs, ...createMeta(user) });
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "customer.create", "customer", ref.id, {
      name: fields.name,
      idDocTypes: enc.docs!.map((d) => d.type),
    }),
  );
  await batch.commit();

  revalidatePath("/customers");
  return { ok: true, id: ref.id };
}

/* ---------- update ---------- */
export async function updateCustomer(id: string, input: unknown, force = false): Promise<Result> {
  const user = await requireModuleEditor("customers");

  const parsed = customerInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const ref = adminDb.collection(COL.customers).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.isDeleted) return { ok: false, error: "Customer not found" };

  const fields = baseFields(parsed.data);
  if (!force) {
    const dup = await findDuplicate(fields, id);
    if (dup) return { ok: false, error: dup, duplicate: true };
  }

  const existing = (snap.data()?.idDocs ?? []) as { id: string }[];
  const kept = existing.filter((d) => parsed.data.keepIdDocIds.includes(d.id));
  if (kept.length + parsed.data.newIdDocs.length > MAX_ID_DOCS) {
    return { ok: false, error: `A customer can have at most ${MAX_ID_DOCS} ID proofs` };
  }

  const enc = encryptNewDocs(parsed.data.newIdDocs);
  if (enc.error) return { ok: false, error: enc.error };

  const batch = adminDb.batch();
  batch.update(ref, { ...fields, idDocs: [...kept, ...enc.docs!], ...updateMeta(user) });
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "customer.update", "customer", id, {
      name: fields.name,
      idDocsAdded: enc.docs!.length,
      idDocsRemoved: existing.length - kept.length,
    }),
  );
  await batch.commit();

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { ok: true };
}

/* ---------- delete (soft) ---------- */
export async function deleteCustomer(id: string): Promise<Result> {
  const user = await requireModuleEditor("customers", [...MANAGEMENT]);

  const ref = adminDb.collection(COL.customers).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.isDeleted) return { ok: false, error: "Customer not found" };

  // Block deletion while the customer is an active member of a live booking
  const memberships = await adminDb.collectionGroup("members").where("customerId", "==", id).get();
  const activeRefs = new Map(
    memberships.docs
      .filter((m) => m.data().status === "active")
      .map((m) => [m.ref.parent.parent!.path, m.ref.parent.parent!]),
  );
  if (activeRefs.size) {
    const live = (await adminDb.getAll(...activeRefs.values())).some(
      (b) => b.exists && !b.data()?.isDeleted && ["open", "closed"].includes(b.data()?.status),
    );
    if (live) {
      return {
        ok: false,
        error: "This customer is in an upcoming booking. Cancel their membership first.",
      };
    }
  }

  const batch = adminDb.batch();
  batch.update(ref, deleteMeta(user));
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "customer.delete", "customer", id, { name: snap.data()?.name }),
  );
  await batch.commit();

  revalidatePath("/customers");
  return { ok: true };
}

/* ---------- reveal a full ID number (Admin / Manager, always logged) ---------- */
export async function revealCustomerId(customerId: string, docId: string) {
  const user = await requireModule("customers", [...MANAGEMENT]);

  const snap = await adminDb.collection(COL.customers).doc(customerId).get();
  if (!snap.exists || snap.data()?.isDeleted) return { ok: false as const, error: "Customer not found" };

  const doc = ((snap.data()?.idDocs ?? []) as { id: string; type: string; encrypted: string }[])
    .find((d) => d.id === docId);
  if (!doc) return { ok: false as const, error: "ID proof not found" };

  let number: string;
  try {
    number = decrypt(doc.encrypted);
  } catch {
    return { ok: false as const, error: "Could not decrypt. Check ID_ENCRYPTION_KEY." };
  }

  await adminDb.collection(COL.auditLogs).add(
    auditEntry(user, "customer.revealId", "customer", customerId, { docId, type: doc.type }),
  );
  return { ok: true as const, number };
}