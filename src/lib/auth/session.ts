import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase/admin";
import { canAccessModule, getDefaultPath } from "@/components/layout/nav-items";
import {
  canEditAssignedModules,
  isModuleKey,
  ROLES,
  type ModuleKey,
  type Role,
  type SessionUser,
} from "@/types/roles";

export const SESSION_COOKIE = "adn_session";
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

// cache() means this runs once per request even if layout + page both call it
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  try {
    const decoded = await adminAuth.verifySessionCookie(cookie, true);
    const role = decoded.role as Role | undefined;
    if (!role || !ROLES.includes(role)) return null;
    const modules = role === "employee" && Array.isArray(decoded.modules)
      ? decoded.modules.filter(isModuleKey)
      : undefined;
    if (role === "employee" && !modules?.length) return null;

    return {
      uid: decoded.uid,
      email: decoded.email ?? "",
      name: (decoded.name as string | undefined) ?? decoded.email ?? "User",
      role,
      ...(modules ? { modules } : {}),
      ...(role === "employee"
        ? { accessMode: decoded.accessMode === "editor" ? "editor" as const : "viewer" as const }
        : {}),
    };
  } catch {
    return null;
  }
});

/** Use in pages, layouts and server actions. Redirects if not allowed. */
export async function requireUser(allowed?: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (allowed && !allowed.includes(user.role)) redirect("/");
  return user;
}

/** Enforces module grants on server-rendered pages and server actions. */
export async function requireModule(module: ModuleKey, allowed?: Role[]): Promise<SessionUser> {
  const user = await requireUser(allowed);
  if (!canAccessModule(user, module)) redirect(getDefaultPath(user));
  return user;
}

/** Allows employees with Editor access, while preserving optional role restrictions for other roles. */
export async function requireModuleEditor(module: ModuleKey, allowed?: Role[]): Promise<SessionUser> {
  const user = await requireModule(module);
  if (user.role === "employee") {
    if (!canEditAssignedModules(user)) redirect(getDefaultPath(user));
  } else if (allowed && !allowed.includes(user.role)) {
    redirect("/");
  }
  return user;
}