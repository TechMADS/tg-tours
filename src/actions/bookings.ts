"use server";
import { revalidatePath } from "next/cache";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleEditor } from "@/lib/auth/session";
import { toMinor } from "@/lib/finance/currency";
import { todayIST } from "@/lib/format";
import {
  COL, auditEntry, createMeta, deleteMeta, toSearchName, updateMeta,
} from "@/lib/firestore/helpers";
import { bookingInputSchema } from "@/lib/validators/booking";
import type { AgeCategory, BookingStatus, PerCategory } from "@/types/models";
import type { Role } from "@/types/roles";

type Result = { ok: true; id: string } | { ok: false; error: string };
const MANAGE: Role[] = ["admin", "manager"];

class UserError extends Error {}
function fail(e: unknown): Result {
  if (e instanceof UserError) return { ok: false, error: e.message };
  throw e;
}

type Raw = {
  isDeleted: boolean; status: BookingStatus; closeDate: string;
  memberCount: number; totalAmount: number; rates: PerCategory;
};

export async function createBooking(input: unknown): Promise<Result> {
  const user = await requireModuleEditor("bookings", MANAGE);
  const parsed = bookingInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const id = await adminDb.runTransaction(async (tx) => {
      const year = todayIST().slice(0, 4);
      const pkgRef = adminDb.collection(COL.packages).doc(d.packageId);
      const counterRef = adminDb.collection(COL.counters).doc(`booking-${year}`);
      const [pkgSnap, counterSnap] = await Promise.all([tx.get(pkgRef), tx.get(counterRef)]);

      const pkg = pkgSnap.data();
      if (!pkgSnap.exists || !pkg || pkg.isDeleted) throw new UserError("Package not found");
      if (pkg.status !== "active") throw new UserError("Only Active packages can be booked");

      const n = ((counterSnap.data()?.value as number | undefined) ?? 0) + 1;
      const bookingNo = `ADN-B-${year}-${String(n).padStart(4, "0")}`;
      const ref = adminDb.collection(COL.bookings).doc();

      tx.set(counterRef, { value: n });
      tx.set(ref, {
        bookingNo,
        title: d.title,
        contactName: d.contactName,
        searchName: toSearchName(d.title),
        packageId: d.packageId,
        packageName: pkg.name,
        destination: pkg.destination,
        currency: pkg.price.currency,
        travelStart: d.travelStart,
        travelEnd: d.travelEnd,
        closeDate: d.closeDate,
        minPersons: d.minPersons,
        maxPersons: d.maxPersons,
        rates: { adult: toMinor(d.adultPrice), child: toMinor(d.childPrice), senior: toMinor(d.seniorPrice) },
        counts: { adult: 0, child: 0, senior: 0 },
        memberCount: 0,
        totalAmount: 0,
        status: "open",
        notes: d.notes,
        ...createMeta(user),
      });
      tx.set(
        adminDb.collection(COL.auditLogs).doc(),
        auditEntry(user, "booking.create", "booking", ref.id, {
          bookingNo, title: d.title, contactName: d.contactName,
        }),
      );
      return ref.id;
    });
    revalidatePath("/bookings");
    revalidatePath("/");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateBooking(id: string, input: unknown): Promise<Result> {
  const user = await requireModuleEditor("bookings", MANAGE);
  const parsed = bookingInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const rates: PerCategory = {
    adult: toMinor(d.adultPrice), child: toMinor(d.childPrice), senior: toMinor(d.seniorPrice),
  };

  try {
    await adminDb.runTransaction(async (tx) => {
      const ref = adminDb.collection(COL.bookings).doc(id);
      const snap = await tx.get(ref);
      const b = snap.data() as Raw | undefined;
      if (!snap.exists || !b || b.isDeleted) throw new UserError("Booking not found");
      if (b.status === "completed" || b.status === "cancelled") {
        throw new UserError("A completed or cancelled booking can't be edited");
      }
      if (d.maxPersons > 0 && d.maxPersons < b.memberCount) {
        throw new UserError(`${b.memberCount} members have already joined, so the maximum can't be lower.`);
      }

      const ratesChanged = (["adult", "child", "senior"] as const).some((k) => rates[k] !== b.rates[k]);
      let members: QueryDocumentSnapshot[] = [];
      if (d.repriceExisting && ratesChanged) {
        members = (await tx.get(ref.collection("members").where("status", "==", "active"))).docs;
      }

      // ---- all reads done; writes below ----
      let total = b.totalAmount;
      let repriced = 0;
      if (members.length) {
        total = 0;
        for (const m of members) {
          const md = m.data();
          let price = md.price as number;
          if (!md.priceOverridden) {
            price = rates[md.category as AgeCategory];
            tx.update(m.ref, { price, ...updateMeta(user) });
            repriced++;
          }
          total += price;
        }
      }

      tx.update(ref, {
        title: d.title,
        contactName: d.contactName,
        searchName: toSearchName(d.title),
        travelStart: d.travelStart,
        travelEnd: d.travelEnd,
        closeDate: d.closeDate,
        minPersons: d.minPersons,
        maxPersons: d.maxPersons,
        rates,
        totalAmount: total,
        notes: d.notes,
        ...updateMeta(user),
      });
      tx.set(
        adminDb.collection(COL.auditLogs).doc(),
        auditEntry(user, "booking.update", "booking", id, {
          before: { rates: b.rates, closeDate: b.closeDate },
          after: { rates, closeDate: d.closeDate, contactName: d.contactName },
          membersRepriced: repriced,
        }),
      );
    });
    revalidatePath("/bookings");
    revalidatePath(`/bookings/${id}`);
    revalidatePath("/");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function setBookingStatus(id: string, status: BookingStatus): Promise<Result> {
  const user = await requireModuleEditor("bookings", MANAGE);
  if (!["open", "closed", "completed", "cancelled"].includes(status)) {
    return { ok: false, error: "Invalid status" };
  }

  const ref = adminDb.collection(COL.bookings).doc(id);
  const snap = await ref.get();
  const b = snap.data() as Raw | undefined;
  if (!snap.exists || !b || b.isDeleted) return { ok: false, error: "Booking not found" };
  if (status === "open" && todayIST() > b.closeDate) {
    return { ok: false, error: "The close date has passed. Edit the booking and extend it first." };
  }

  const batch = adminDb.batch();
  batch.update(ref, { status, ...updateMeta(user) });
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "booking.status", "booking", id, { from: b.status, to: status }),
  );
  await batch.commit();

  revalidatePath("/bookings");
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/");
  return { ok: true, id };
}

export async function deleteBooking(id: string): Promise<Result> {
  const user = await requireModuleEditor("bookings", MANAGE);
  const ref = adminDb.collection(COL.bookings).doc(id);
  const snap = await ref.get();
  const b = snap.data() as Raw | undefined;
  if (!snap.exists || !b || b.isDeleted) return { ok: false, error: "Booking not found" };
  if (b.memberCount > 0) {
    return { ok: false, error: "This booking has members. Cancel the booking instead of deleting it." };
  }

  const batch = adminDb.batch();
  batch.update(ref, deleteMeta(user));
  batch.set(adminDb.collection(COL.auditLogs).doc(), auditEntry(user, "booking.delete", "booking", id));
  await batch.commit();

  revalidatePath("/bookings");
  revalidatePath("/");
  return { ok: true, id };
}