"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/types/roles";
import { canAccessNavItem } from "./nav-items";
import { NAV_ITEMS } from "./nav-items";

export function NavLinks({
  user,
  onNavigate,
  inverse = false,
}: {
  user: SessionUser;
  onNavigate?: () => void;
  inverse?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-1">
      {NAV_ITEMS.filter((item) => canAccessNavItem(user, item)).map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2",
              inverse ? "focus-visible:ring-white/60" : "focus-visible:ring-ring/40",
              active
                ? inverse
                  ? "bg-white/15 text-white shadow-sm ring-1 ring-white/20"
                  : "bg-secondary text-foreground shadow-sm ring-1 ring-border/70"
                : inverse
                  ? "text-white/80 hover:bg-white/10 hover:text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon
              className={cn(
                "size-[18px] shrink-0",
                inverse
                  ? "text-white"
                  : active && "text-primary",
              )}
              aria-hidden="true"
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}