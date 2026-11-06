import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { COL, serializeDoc } from "@/lib/firestore/helpers";
import type { TravelPackage } from "@/types/models";

/** Fills in the new fields for packages saved before group pricing existed */
function normalize(p: TravelPackage): TravelPackage {
  const min = p.minPersons ?? 1;
  return {
    ...p,
    groupType: p.groupType ?? "open_group",
    minPersons: min,
    maxPersons: p.maxPersons ?? 0,
    priceTiers: p.priceTiers?.length
      ? [{ ...p.priceTiers[0], fromPersons: 1 }, ...p.priceTiers.slice(1)]
      : [{ fromPersons: 1, amount: p.price.amount }],
    rooms: p.rooms ?? (p.roomImages?.length
      ? [{ name: "Existing room photos", phone: "", photos: p.roomImages }]
      : []),
    travelProviders: p.travelProviders ?? (p.transportImages?.length
      ? [{ name: "Existing transport photos", phone: "", photos: p.transportImages }]
      : []),
  };
}

const read = (d: FirebaseFirestore.DocumentSnapshot) => normalize(serializeDoc<TravelPackage>(d));

export async function listPackages(): Promise<TravelPackage[]> {
  const snap = await adminDb.collection(COL.packages).where("isDeleted", "==", false).get();
  return snap.docs.map(read).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** For the booking form in the next phase */
export async function listActivePackages(): Promise<TravelPackage[]> {
  const snap = await adminDb
    .collection(COL.packages)
    .where("isDeleted", "==", false)
    .where("status", "==", "active")
    .get();
  return snap.docs.map(read).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPackage(id: string): Promise<TravelPackage | null> {
  const snap = await adminDb.collection(COL.packages).doc(id).get();
  if (!snap.exists || snap.data()?.isDeleted) return null;
  return read(snap);
}