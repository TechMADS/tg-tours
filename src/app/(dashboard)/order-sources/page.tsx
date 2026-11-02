import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { canManageAssignedModules } from "@/types/roles";
import { listOrderSources } from "@/lib/data/order-sources";
import { OrderSourcesTable } from "./order-sources-table";

export default async function OrderSourcesPage() {
  const user = await requireModule("order-sources");
  const sources = await listOrderSources();

  return (
    <>
      <PageHeader
        title="Order Sources"
        description="Where your bookings come from. Used in analytics to see which channels work."
      />
      <OrderSourcesTable
        data={sources}
        canManage={canManageAssignedModules(user)}
      />
    </>
  );
}