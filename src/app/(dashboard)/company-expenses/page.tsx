import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { canManageAssignedModules } from "@/types/roles";
import { listExpenses } from "@/lib/data/expenses";
import { todayIST } from "@/lib/format";
import { CompanyExpensesDashboard } from "./company-expenses-dashboard";

export default async function CompanyExpensesPage() {
  const user = await requireModule("finance");
  const expenses = (await listExpenses()).filter((expense) => !expense.bookingId);

  return (
    <>
      <PageHeader
        title="Company expenses"
        description="Track payroll, rent, purchases, and other costs that are not tied to a booking."
      />
      <CompanyExpensesDashboard
        expenses={expenses}
        today={todayIST()}
        canManage={canManageAssignedModules(user)}
      />
    </>
  );
}
