import type { SessionUser } from "@/types/roles";
import { Brand } from "./brand";
import { NavLinks } from "./nav-links";

export function Sidebar({ user }: { user: SessionUser }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/15 bg-[#451024] md:flex">
      <div className="border-b border-white/15 px-5 py-5">
        <Brand inverse />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <NavLinks user={user} inverse />
      </div>
    </aside>
  );
}