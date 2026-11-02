import { PageHeader } from "@/components/shared/page-header";
import { requireModuleEditor } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { PackageForm } from "../package-form";

export default async function NewPackagePage() {
  await requireModuleEditor("packages", ["admin", "manager"]);
  const settings = await getSettings();

  return (
    <>
      <PageHeader title="New package" description="Create a tour package." />
      <PackageForm pkg={null} rates={settings.fx.rates} />
    </>
  );
}