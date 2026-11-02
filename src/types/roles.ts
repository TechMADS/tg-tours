export const ROLES = ["admin", "manager", "staff", "employee"] as const;
export type Role = (typeof ROLES)[number];
export const EMPLOYEE_ACCESS_MODES = ["editor", "viewer"] as const;
export type EmployeeAccessMode = (typeof EMPLOYEE_ACCESS_MODES)[number];

export const EMPLOYEE_MODULES = [
  "dashboard",
  "bookings",
  "packages",
  "customers",
  "order-sources",
  "invoices",
  "finance",
  "analytics",
] as const;
export type ModuleKey = (typeof EMPLOYEE_MODULES)[number];

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && EMPLOYEE_MODULES.some((module) => module === value);
}

export type SessionUser = {
  uid: string;
  email: string;
  name: string;
  role: Role;
  modules?: ModuleKey[];
  accessMode?: EmployeeAccessMode;
};

export function canEditAssignedModules(user: Pick<SessionUser, "role" | "accessMode">) {
  return user.role !== "employee" || user.accessMode === "editor";
}

export function canManageAssignedModules(user: Pick<SessionUser, "role" | "accessMode">) {
  return user.role === "admin"
    || user.role === "manager"
    || (user.role === "employee" && user.accessMode === "editor");
}