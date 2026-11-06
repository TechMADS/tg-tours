"use server";

import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";
import { toMinor } from "@/lib/finance/currency";
import { getTargetDateRange } from "@/lib/targets-period";
import { COL, auditEntry, createMeta, deleteMeta, updateMeta } from "@/lib/firestore/helpers";
import { targetInputSchema } from "@/lib/validators/target";
import type { Target } from "@/types/models";

type Result = { ok: true; id: string } | { ok: false; error: string };
const MANAGEMENT_ROLES = ["admin", "manager"] as const;

async function requireTargetManager() {
  return requireUser([...MANAGEMENT_ROLES]);
}

function refreshTargets() {
  revalidatePath("/");
  revalidatePath("/targets");
}

export async function createTarget(input: unknown): Promise<Result> {
  const user = await requireTargetManager();
  const parsed = targetInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;
  const range = getTargetDateRange(data.period, data.periodDate, data.customEndDate);
  if (!range) return { ok: false, error: "Choose a valid target date range" };
  const targetValue = data.metric === "revenue" || data.metric === "profit"
    ? toMinor(data.targetValue)
    : data.targetValue;
  if (!Number.isSafeInteger(targetValue) || targetValue <= 0) {
    return { ok: false, error: "Enter a valid target value greater than zero" };
  }

  const ref = adminDb.collection(COL.targets).doc();
  const target = {
    name: data.name,
    metric: data.metric,
    targetValue,
    ...(data.currency ? { currency: data.currency } : {}),
    period: data.period,
    startDate: range.startDate,
    endDate: range.endDate,
    description: data.description,
    status: "active",
  };
  const batch = adminDb.batch();
  batch.set(ref, { ...target, ...createMeta(user) });
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "target.create", "target", ref.id, {
      name: target.name,
      metric: target.metric,
      period: target.period,
      startDate: target.startDate,
      endDate: target.endDate,
    }),
  );
  await batch.commit();
  refreshTargets();
  return { ok: true, id: ref.id };
}

export async function updateTarget(id: string, input: unknown): Promise<Result> {
  const user = await requireTargetManager();
  const parsed = targetInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;
  const range = getTargetDateRange(data.period, data.periodDate, data.customEndDate);
  if (!range) return { ok: false, error: "Choose a valid target date range" };
  const targetValue = data.metric === "revenue" || data.metric === "profit"
    ? toMinor(data.targetValue)
    : data.targetValue;
  if (!Number.isSafeInteger(targetValue) || targetValue <= 0) {
    return { ok: false, error: "Enter a valid target value greater than zero" };
  }

  const ref = adminDb.collection(COL.targets).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.isDeleted) {
    return { ok: false, error: "Target not found" };
  }
  const previous = snapshot.data() as Target;
  const completionChanged = previous.metric !== data.metric
    || previous.targetValue !== targetValue
    || previous.currency !== data.currency
    || previous.period !== data.period
    || previous.startDate !== range.startDate
    || previous.endDate !== range.endDate;
  const update: Record<string, unknown> = {
    name: data.name,
    metric: data.metric,
    targetValue,
    currency: data.currency ?? FieldValue.delete(),
    period: data.period,
    startDate: range.startDate,
    endDate: range.endDate,
    description: data.description,
    ...(completionChanged
      ? { completedAt: FieldValue.delete(), completionNotifiedAt: FieldValue.delete() }
      : {}),
    ...updateMeta(user),
  };
  const batch = adminDb.batch();
  batch.update(ref, update);
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "target.update", "target", id, {
      before: {
        metric: previous.metric,
        targetValue: previous.targetValue,
        startDate: previous.startDate,
        endDate: previous.endDate,
      },
      after: {
        metric: data.metric,
        targetValue,
        startDate: range.startDate,
        endDate: range.endDate,
      },
    }),
  );
  await batch.commit();
  refreshTargets();
  return { ok: true, id };
}

export async function setTargetStatus(
  id: string,
  status: "active" | "paused",
): Promise<Result> {
  const user = await requireTargetManager();
  if (status !== "active" && status !== "paused") {
    return { ok: false, error: "Invalid target status" };
  }
  const ref = adminDb.collection(COL.targets).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.isDeleted) {
    return { ok: false, error: "Target not found" };
  }
  const batch = adminDb.batch();
  batch.update(ref, {
    status,
    ...updateMeta(user),
  });
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, status === "paused" ? "target.pause" : "target.resume", "target", id),
  );
  await batch.commit();
  refreshTargets();
  return { ok: true, id };
}

export async function deleteTarget(id: string): Promise<Result> {
  const user = await requireTargetManager();
  const ref = adminDb.collection(COL.targets).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.isDeleted) {
    return { ok: false, error: "Target not found" };
  }
  const batch = adminDb.batch();
  batch.update(ref, deleteMeta(user));
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "target.delete", "target", id, { name: snapshot.data()?.name }),
  );
  await batch.commit();
  refreshTargets();
  return { ok: true, id };
}
