import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { canEditAssignedModules, canManageAssignedModules } from "@/types/roles";
import { listCustomersPage } from "@/lib/data/customers";
import { CustomersView } from "./customers-view";

export default async function CustomersPage() {
  const user = await requireModule("customers");
  const initial = await listCustomersPage();

  return (
    <>
      <PageHeader title="Customers" description="Search by name or phone number." />
      <CustomersView
        initial={initial}
        canEdit={canEditAssignedModules(user)}
        canManage={canManageAssignedModules(user)}
      />
    </>
  );
}