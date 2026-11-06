import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth/session";
import { adminAuth } from "@/lib/firebase/admin";

const requestSchema = z.object({
  idToken: z.string().min(1).max(10_000),
  newPassword: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Please sign in as an admin and try again" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid new password" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(parsed.data.idToken);
  } catch {
    return NextResponse.json({ error: "Could not verify your current password" }, { status: 401 });
  }

  if (
    decoded.uid !== user.uid
    || decoded.role !== "admin"
    || Date.now() / 1000 - decoded.auth_time > 5 * 60
  ) {
    return NextResponse.json({ error: "Could not verify your current password" }, { status: 401 });
  }

  try {
    await adminAuth.updateUser(user.uid, { password: parsed.data.newPassword });
  } catch (error) {
    console.error("Admin password change failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Password change failed. Please try again." }, { status: 500 });
  }

  let sessionsRevoked = true;
  try {
    await adminAuth.revokeRefreshTokens(user.uid);
  } catch (error) {
    sessionsRevoked = false;
    console.error("Admin password changed, but other sessions could not be revoked:", error instanceof Error ? error.message : "Unknown error");
  }

  const response = NextResponse.json({ ok: true, sessionsRevoked });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
