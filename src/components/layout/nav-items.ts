import {
  BarChart3, CalendarCheck, FileText, LayoutDashboard, Megaphone,
  Package, ReceiptText, Settings, Target, Users, Wallet, type LucideIcon,
} from "lucide-react";
import type { ModuleKey, Role, SessionUser } from "@/types/roles";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
  module: ModuleKey | null;
};

const ALL: Role[] = ["admin", "manager", "staff"];
const MGMT: Role[] = ["admin", "manager"];

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, roles: ALL, module: "dashboard" },
  { label: "Bookings", href: "/bookings", icon: CalendarCheck, roles: ALL, module: "bookings" },
  { label: "Packages", href: "/packages", icon: Package, roles: ALL, module: "packages" },
  { label: "Customers", href: "/customers", icon: Users, roles: ALL, module: "customers" },
  { label: "Order Sources", href: "/order-sources", icon: Megaphone, roles: MGMT, module: "order-sources" },
  { label: "Invoices", href: "/invoices", icon: FileText, roles: ALL, module: "invoices" },
  { label: "Finance", href: "/finance", icon: Wallet, roles: MGMT, module: "finance" },
  { label: "Company Expenses", href: "/company-expenses", icon: ReceiptText, roles: MGMT, module: "finance" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, roles: MGMT, module: "analytics" },
  { label: "Targets", href: "/targets", icon: Target, roles: MGMT, module: null },
  { label: "Settings", href: "/settings", icon: Settings, roles: ["admin"], module: null },
];

export function canAccessNavItem(user: Pick<SessionUser, "role" | "modules">, item: NavItem) {
  if (user.role === "employee") {
    return item.module !== null && user.modules?.includes(item.module) === true;
  }
  return item.roles.includes(user.role);
}

export function canAccessModule(
  user: Pick<SessionUser, "role" | "modules">,
  module: ModuleKey,
) {
  const item = NAV_ITEMS.find((navItem) => navItem.module === module);
  return item ? canAccessNavItem(user, item) : false;
}

export function getDefaultPath(user: Pick<SessionUser, "role" | "modules">) {
  return NAV_ITEMS.find((item) => canAccessNavItem(user, item))?.href ?? "/login";
}