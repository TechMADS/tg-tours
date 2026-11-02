"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAuth } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";
import {
  EMPLOYEE_ACCESS_MODES,
  EMPLOYEE_MODULES,
  isModuleKey,
  type EmployeeAccessMode,
  type ModuleKey,
} from "@/types/roles";

const modulesSchema = z
  .array(z.enum(EMPLOYEE_MODULES))
  .min(1, "Select at least one module")
  .max(EMPLOYEE_MODULES.length)
  .refine((modules) => new Set(modules).size === modules.length, "Remove duplicate modules");
const accessModeSchema = z.enum(EMPLOYEE_ACCESS_MODES);
const employeePasswordSchema = z.string().min(8, "Password must be at least 8 characters").max(128);

const employeeSchema = z.object({
  name: z.string().trim().min(1, "Enter the employee's name").max(100),
  email: z.string().trim().email("Enter a valid email").transform((email) => email.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  modules: modulesSchema,
  accessMode: accessModeSchema,
});

export type EmployeeAccount = {
  uid: string;
  name: string;
  email: string;
  modules: ModuleKey[];
  accessMode: EmployeeAccessMode;
  disabled: boolean;
};

type ActionResult = { ok: true } | { ok: false; error: string };
type CreateEmployeeResult =
  | { ok: true; employee: EmployeeAccount; password: string }
  | { ok: false; error: string };

function errorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    return error.code;
  }
  return undefined;
}

export async function listEmployeeAccounts(): Promise<EmployeeAccount[]> {
  await requireUser(["admin"]);
  const employees: EmployeeAccount[] = [];
  let pageToken: string | undefined;

  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (user.customClaims?.role !== "employee") continue;
      const modules = Array.isArray(user.customClaims.modules)
        ? user.customClaims.modules.filter(isModuleKey)
        : [];
      employees.push({
        uid: user.uid,
        name: user.displayName ?? "",
        email: user.email ?? "",
        modules,
        accessMode: user.customClaims.accessMode === "editor" ? "editor" : "viewer",
        disabled: user.disabled,
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return employees.sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
}

export async function createEmployee(input: unknown): Promise<CreateEmployeeResult> {
  await requireUser(["admin"]);
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  let created: Awaited<ReturnType<typeof adminAuth.createUser>>;
  try {
    created = await adminAuth.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.name,
    });
  } catch (error) {
    if (errorCode(error) === "auth/email-already-exists") {
      return { ok: false, error: "An account with this email already exists" };
    }
    throw error;
  }

  try {
    await adminAuth.setCustomUserClaims(created.uid, {
      role: "employee",
      modules: parsed.data.modules,
      accessMode: parsed.data.accessMode,
    });
  } catch (error) {
    try {
      await adminAuth.deleteUser(created.uid);
    } catch (cleanupError) {
      console.error("Could not remove employee account after setup failed:", {
        uid: created.uid,
        code: errorCode(cleanupError),
      });
    }
    throw error;
  }

  return {
    ok: true,
    employee: {
      uid: created.uid,
      name: created.displayName ?? parsed.data.name,
      email: created.email ?? parsed.data.email,
      modules: parsed.data.modules,
      accessMode: parsed.data.accessMode,
      disabled: false,
    },
    password: parsed.data.password,
  };
}

export async function resetEmployeePassword(
  uid: string,
  input: unknown,
): Promise<ActionResult> {
  await requireUser(["admin"]);
  if (!uid || uid.length > 128) return { ok: false, error: "Invalid employee account" };

  const parsedPassword = employeePasswordSchema.safeParse(input);
  if (!parsedPassword.success) {
    return { ok: false, error: parsedPassword.error.issues[0].message };
  }

  const employee = await adminAuth.getUser(uid);
  if (employee.customClaims?.role !== "employee") {
    return { ok: false, error: "Employee account not found" };
  }

  await adminAuth.updateUser(uid, { password: parsedPassword.data });
  try {
    await adminAuth.revokeRefreshTokens(uid);
  } catch (error) {
    try {
      await adminAuth.updateUser(uid, { disabled: true });
    } catch (disableError) {
      console.error("Could not disable employee after password reset revocation failed:", {
        uid,
        code: errorCode(disableError),
      });
    }
    throw error;
  }

  return { ok: true };
}

export async function deleteEmployee(uid: string): Promise<ActionResult> {
  await requireUser(["admin"]);
  if (!uid || uid.length > 128) return { ok: false, error: "Invalid employee account" };

  const employee = await adminAuth.getUser(uid);
  if (employee.customClaims?.role !== "employee") {
    return { ok: false, error: "Employee account not found" };
  }

  await adminAuth.deleteUser(uid);
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateEmployeeModules(
  uid: string,
  input: unknown,
  accessModeInput: unknown,
): Promise<ActionResult> {
  await requireUser(["admin"]);
  if (!uid || uid.length > 128) return { ok: false, error: "Invalid employee account" };

  const parsed = modulesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const parsedAccessMode = accessModeSchema.safeParse(accessModeInput);
  if (!parsedAccessMode.success) return { ok: false, error: "Choose Editor or Viewer access" };

  const employee = await adminAuth.getUser(uid);
  if (employee.customClaims?.role !== "employee") {
    return { ok: false, error: "Employee account not found" };
  }

  await adminAuth.setCustomUserClaims(uid, {
    ...employee.customClaims,
    role: "employee",
    modules: parsed.data,
    accessMode: parsedAccessMode.data,
  });
  try {
    await adminAuth.revokeRefreshTokens(uid);
  } catch (error) {
    try {
      await adminAuth.updateUser(uid, { disabled: true });
    } catch (disableError) {
      console.error("Could not disable employee after session revocation failed:", {
        uid,
        code: errorCode(disableError),
      });
    }
    throw error;
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function setEmployeeDisabled(
  uid: string,
  disabled: boolean,
): Promise<ActionResult> {
  await requireUser(["admin"]);
  if (!uid || uid.length > 128) return { ok: false, error: "Invalid employee account" };
  if (typeof disabled !== "boolean") return { ok: false, error: "Invalid account status" };

  const employee = await adminAuth.getUser(uid);
  if (employee.customClaims?.role !== "employee") {
    return { ok: false, error: "Employee account not found" };
  }

  await adminAuth.updateUser(uid, { disabled });
  await adminAuth.revokeRefreshTokens(uid);
  revalidatePath("/settings");
  return { ok: true };
}
