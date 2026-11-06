import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";
import { listTargetsWithProgress } from "@/lib/data/targets";
import { todayIST } from "@/lib/format";
import { TargetsPanel } from "./targets-panel";

export default async function TargetsPage() {
  await requireUser(["admin", "manager"]);
  const today = todayIST();
  const targets = await listTargetsWithProgress();

  return (
    <>
      <PageHeader
        title="Targets & Achievements"
        description="Set business goals and track live progress from your existing records."
      />
      <TargetsPanel targets={targets} today={today} management />
    </>
  );
}
