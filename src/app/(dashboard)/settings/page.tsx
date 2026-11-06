import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { listEmployeeAccounts } from "@/actions/employee-access";
import { EmployeeAccessManager } from "./employee-access-manager";
import { ChangeAdminPassword } from "./change-admin-password";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await requireUser(["admin"]);
  const [settings, employees] = await Promise.all([
    getSettings(),
    listEmployeeAccounts(),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business details, currency conversion and employee access"
      />
      <SettingsForm initial={settings} />
      <ChangeAdminPassword email={user.email} />
      <EmployeeAccessManager initialEmployees={employees} />
    </>
  );
}