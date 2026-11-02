import { GetObjectCommand } from "@aws-sdk/client-s3";
import { canAccessModule } from "@/components/layout/nav-items";
import { getCurrentUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { COL, auditEntry } from "@/lib/firestore/helpers";
import { createInvoiceStorageConfig } from "@/lib/r2/invoice-storage";

const CONTENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string; memberId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessModule(user, "bookings")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { bookingId, memberId } = await params;
  const bookingRef = adminDb.collection(COL.bookings).doc(bookingId);
  const memberRef = bookingRef.collection("members").doc(memberId);
  const [booking, member] = await Promise.all([bookingRef.get(), memberRef.get()]);
  if (!booking.exists || booking.data()?.isDeleted || !member.exists) {
    return Response.json({ error: "Aadhaar card not found" }, { status: 404 });
  }

  const card = member.data()?.aadhaarCard;
  const extension = typeof card?.contentType === "string"
    ? CONTENT_TYPES[card.contentType as keyof typeof CONTENT_TYPES]
    : undefined;
  if (
    !extension
    || typeof card.objectPath !== "string"
    || !card.objectPath.startsWith(`member-aadhaar/${bookingId}/${memberId}/`)
    || !card.objectPath.endsWith(`.${extension}`)
    || typeof card.name !== "string"
  ) {
    return Response.json({ error: "Aadhaar card not found" }, { status: 404 });
  }

  await adminDb.collection(COL.auditLogs).add(
    auditEntry(user, "member.aadhaar.view", "booking", bookingId, { memberId }),
  );

  const storage = createInvoiceStorageConfig();
  if (!storage.ok) return Response.json({ error: storage.error }, { status: 503 });

  try {
    const result = await storage.client.send(new GetObjectCommand({
      Bucket: storage.bucketName,
      Key: card.objectPath,
    }));
    if (!result.Body) {
      return Response.json({ error: "Aadhaar card contents are unavailable" }, { status: 404 });
    }

    const contents = await result.Body.transformToByteArray();
    const body = new ArrayBuffer(contents.byteLength);
    new Uint8Array(body).set(contents);
    return new Response(body, {
      headers: {
        "Content-Type": card.contentType,
        "Content-Length": String(contents.byteLength),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(card.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Aadhaar card download failed:", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "Private file storage could not provide the Aadhaar card." }, { status: 502 });
  } finally {
    storage.client.destroy();
  }
}
