"use server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleEditor } from "@/lib/auth/session";
import { toMinor } from "@/lib/finance/currency";
import type { MoneyEntry } from "@/lib/finance/fx";
import {
  COL, auditEntry, createMeta, deleteMeta, serializeDoc, toSearchName, updateMeta,
} from "@/lib/firestore/helpers";
import {
  packageInputSchema, packageStatusSchema, type PackageInput,
} from "@/lib/validators/package";
import type { Role } from "@/types/roles";
import type { TravelPackage } from "@/types/models";
import { FieldValue } from "firebase-admin/firestore";

type Result = { ok: true; id: string } | { ok: false; error: string };
const MANAGE: Role[] = ["admin", "manager"];
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function hasValidImageSignature(type: string, bytes: Buffer) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return type === "image/webp"
    && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP";
}

export async function uploadPackageImage(formData: FormData) {
  await requireModuleEditor("packages", MANAGE);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Choose an image to upload" };
  }
  if (!IMAGE_EXTENSIONS[file.type] || file.size > MAX_IMAGE_SIZE) {
    return { ok: false as const, error: "Use a JPEG, PNG, or WebP image up to 8 MB" };
  }

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const endpoint = process.env.R2_ENDPOINT;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
    return { ok: false as const, error: "Set the R2 account, credentials, bucket, and endpoint to enable image uploads" };
  }
  if (!publicBaseUrl) {
    return { ok: false as const, error: "Set R2_PUBLIC_BASE_URL to the public URL for your R2 bucket" };
  }

  let endpointUrl: URL;
  let publicUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
    publicUrl = new URL(publicBaseUrl);
  } catch {
    return { ok: false as const, error: "R2_ENDPOINT and R2_PUBLIC_BASE_URL must be valid URLs" };
  }
  if (
    endpointUrl.protocol !== "https:"
    || endpointUrl.hostname !== `${accountId}.r2.cloudflarestorage.com`
    || endpointUrl.pathname !== "/"
    || endpointUrl.search
    || endpointUrl.hash
  ) {
    return { ok: false as const, error: "R2_ENDPOINT must be your HTTPS Cloudflare R2 S3 endpoint" };
  }
  if (publicUrl.protocol !== "https:" || publicUrl.search || publicUrl.hash) {
    return { ok: false as const, error: "R2_PUBLIC_BASE_URL must be an HTTPS URL without a query or fragment" };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasValidImageSignature(file.type, bytes)) {
    return { ok: false as const, error: "The selected file is not a valid image" };
  }

  const objectPath = `package-images/${randomUUID()}.${IMAGE_EXTENSIONS[file.type]}`;
  const client = new S3Client({
    region: "auto",
    endpoint: endpointUrl.origin,
    credentials: { accessKeyId, secretAccessKey },
  });
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectPath,
      Body: bytes,
      ContentType: file.type,
      CacheControl: "public, max-age=31536000",
    }));
  } catch (error) {
    console.error("R2 image upload failed:", error instanceof Error ? error.message : "Unknown error");
    return { ok: false as const, error: "Image upload failed. Check the R2 bucket and credentials." };
  } finally {
    client.destroy();
  }

  const url = `${publicUrl.origin}${publicUrl.pathname.replace(/\/+$/, "")}/${objectPath}`;
  return { ok: true as const, url };
}

function toDoc(d: PackageInput, cost: MoneyEntry | null) {
  const base = toMinor(d.price);
  return {
    name: d.name,
    searchName: toSearchName(d.name),
    destination: d.destination,
    days: d.days,
    nights: d.nights,
    groupType: d.groupType,
    minPersons: d.minPersons,
    maxPersons: d.groupType === "couple" ? 2 : 0,
    price: { currency: d.currency, amount: base }, // base per-person price
    cost,
    priceTiers: [
      { fromPersons: 1, amount: base },
      ...d.extraTiers.map((t) => ({ fromPersons: t.fromPersons, amount: toMinor(t.price) })),
    ],
    inclusions: d.inclusions,
    exclusions: d.exclusions,
    rooms: d.rooms,
    travelProviders: d.travelProviders,
    itinerary: d.itinerary.map((x, i) => ({ day: i + 1, title: x.title, description: x.description })),
    status: d.status,
  };
}

async function nameTaken(searchName: string, exceptId?: string) {
  const snap = await adminDb
    .collection(COL.packages)
    .where("searchName", "==", searchName)
    .where("isDeleted", "==", false)
    .get();
  return snap.docs.some((d) => d.id !== exceptId);
}

const NEEDS_PRICE = "Set a price above 0 before making a package Active";

export async function createPackage(input: unknown): Promise<Result> {
  const user = await requireModuleEditor("packages", MANAGE);

  const parsed = packageInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const doc = toDoc(parsed.data, null);
  if (doc.status === "active" && doc.price.amount <= 0) return { ok: false, error: NEEDS_PRICE };
  if (await nameTaken(doc.searchName)) {
    return { ok: false, error: "A package with this name already exists" };
  }

  const ref = adminDb.collection(COL.packages).doc();
  const batch = adminDb.batch();
  batch.set(ref, { ...doc, ...createMeta(user) });
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "package.create", "package", ref.id, {
      name: doc.name, status: doc.status, price: doc.price,
    }),
  );
  await batch.commit();

  revalidatePath("/packages");
  return { ok: true, id: ref.id };
}

export async function updatePackage(id: string, input: unknown): Promise<Result> {
  const user = await requireModuleEditor("packages", MANAGE);

  const parsed = packageInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const ref = adminDb.collection(COL.packages).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.isDeleted) return { ok: false, error: "Package not found" };

  const previous = serializeDoc<TravelPackage>(snap);
  const previousCost = previous.cost ?? null;
  const doc = toDoc(parsed.data, previousCost);
  if (doc.status === "active" && doc.price.amount <= 0) return { ok: false, error: NEEDS_PRICE };
  if (await nameTaken(doc.searchName, id)) {
    return { ok: false, error: "A package with this name already exists" };
  }

  const batch = adminDb.batch();
  batch.update(ref, {
    ...doc,
    roomImages: FieldValue.delete(),
    transportImages: FieldValue.delete(),
    priceBasis: FieldValue.delete(),
    ...updateMeta(user),
  });
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "package.update", "package", id, {
      before: { name: snap.data()?.name, price: snap.data()?.price, status: snap.data()?.status },
      after: { name: doc.name, price: doc.price, status: doc.status },
    }),
  );
  await batch.commit();

  revalidatePath("/packages");
  revalidatePath(`/packages/${id}`);
  revalidatePath("/");
  return { ok: true, id };
}

export async function setPackageStatus(id: string, status: unknown): Promise<Result> {
  const user = await requireModuleEditor("packages", MANAGE);

  const parsedStatus = packageStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { ok: false, error: "Invalid status" };

  const ref = adminDb.collection(COL.packages).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.isDeleted) return { ok: false, error: "Package not found" };

  if (parsedStatus.data === "active" && !(snap.data()?.price?.amount > 0)) {
    return { ok: false, error: NEEDS_PRICE };
  }

  const batch = adminDb.batch();
  batch.update(ref, { status: parsedStatus.data, ...updateMeta(user) });
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "package.status", "package", id, {
      from: snap.data()?.status, to: parsedStatus.data,
    }),
  );
  await batch.commit();

  revalidatePath("/packages");
  revalidatePath(`/packages/${id}`);
  return { ok: true, id };
}

export async function deletePackage(id: string): Promise<Result> {
  const user = await requireModuleEditor("packages", MANAGE);

  const ref = adminDb.collection(COL.packages).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.isDeleted) return { ok: false, error: "Package not found" };

  const used = await adminDb.collection(COL.bookings).where("packageId", "==", id).limit(1).get();
  if (!used.empty) {
    return { ok: false, error: "Bookings use this package. Archive it instead of deleting." };
  }

  const batch = adminDb.batch();
  batch.update(ref, deleteMeta(user));
  batch.set(
    adminDb.collection(COL.auditLogs).doc(),
    auditEntry(user, "package.delete", "package", id, { name: snap.data()?.name }),
  );
  await batch.commit();

  revalidatePath("/packages");
  return { ok: true, id };
}