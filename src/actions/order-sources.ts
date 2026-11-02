"use server";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleEditor } from "@/lib/auth/session";
import {
  COL, auditEntry, createMeta, deleteMeta, toSearchName, updateMeta,
} from "@/lib/firestore/helpers";
import { orderSourceSchema } from "@/lib/validators/order-source";
import type { ActionResult } from "@/types/action";
import type { Role } from "@/types/roles";

const ALLOWED: Role[] = ["admin", "manager"];
const DEFAULT_SOURCES = [
  "Website", "Instagram", "Facebook", "WhatsApp",
  "Google", "Walk-in", "Referral", "Travel Agent",
];

async function nameTaken(searchName: string, exceptId?: string) {
  const snap = await adminDb
    .collection(COL.orderSources)
    .where("searchName", "==", searchName)
    .where("isDeleted", "==", false)
    .get();
  return snap.docs.some((d) => d.id !== exceptId);
}

export async function createOrderSource(input: unknown): Promise<ActionResult> {
  const user = await requireModuleEditor("order-sources", ALLOWED);

  const parsed = orderSourceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const searchName = toSearchName(parsed.data.name);
  if (await nameTaken(searchName)) {
    return { ok: false, error: "A source with this name already exists" };
  }

  const ref = adminDb.collection(COL.orderSources).doc();
  const batch = adminDb.batch();
  batch.set(ref, { ...parsed.data, searchName, ...createMeta(user) });
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "orderSource.create", "orderSource", ref.id, { name: parsed.data.name }),
  );
  await batch.commit();

  revalidatePath("/order-sources");
  return { ok: true };
}

export async function updateOrderSource(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireModuleEditor("order-sources", ALLOWED);

  const parsed = orderSourceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const ref = adminDb.collection(COL.orderSources).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.isDeleted) return { ok: false, error: "Source not found" };

  const searchName = toSearchName(parsed.data.name);
  if (await nameTaken(searchName, id)) {
    return { ok: false, error: "A source with this name already exists" };
  }

  const batch = adminDb.batch();
  batch.update(ref, { ...parsed.data, searchName, ...updateMeta(user) });
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "orderSource.update", "orderSource", id, {
      before: { name: snap.data()?.name, active: snap.data()?.active },
      after: { name: parsed.data.name, active: parsed.data.active },
    }),
  );
  await batch.commit();

  revalidatePath("/order-sources");
  return { ok: true };
}

export async function deleteOrderSource(id: string): Promise<ActionResult> {
  const user = await requireModuleEditor("order-sources", ALLOWED);

  const ref = adminDb.collection(COL.orderSources).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.isDeleted) return { ok: false, error: "Source not found" };

  // Don't delete a source that bookings depend on. Deactivate it instead.
  const used = await adminDb
    .collectionGroup("members")
    .where("sourceId", "==", id)
    .limit(1)
    .get();
  if (!used.empty) {
    return {
      ok: false,
      error: "This source is used by bookings. Mark it Inactive instead of deleting.",
    };
  }

  const batch = adminDb.batch();
  batch.update(ref, deleteMeta(user));
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "orderSource.delete", "orderSource", id, { name: snap.data()?.name }),
  );
  await batch.commit();

  revalidatePath("/order-sources");
  return { ok: true };
}

/** One-click starter list, only allowed while the list is empty */
export async function seedOrderSources(): Promise<ActionResult> {
  const user = await requireModuleEditor("order-sources", ALLOWED);

  const existing = await adminDb
    .collection(COL.orderSources)
    .where("isDeleted", "==", false)
    .limit(1)
    .get();
  if (!existing.empty) return { ok: false, error: "Sources already exist" };

  const batch = adminDb.batch();
  for (const name of DEFAULT_SOURCES) {
    batch.set(adminDb.collection(COL.orderSources).doc(), {
      name,
      searchName: toSearchName(name),
      active: true,
      notes: "",
      ...createMeta(user),
    });
  }
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "orderSource.seed", "orderSource", "-", { count: DEFAULT_SOURCES.length }),
  );
  await batch.commit();

  revalidatePath("/order-sources");
  return { ok: true };
}