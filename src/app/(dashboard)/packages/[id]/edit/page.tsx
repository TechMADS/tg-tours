import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireModuleEditor } from "@/lib/auth/session";
import { getPackage } from "@/lib/data/packages";
import { getSettings } from "@/lib/settings";
import { PackageForm } from "../../package-form";

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleEditor("packages", ["admin", "manager"]);
  const { id } = await params;
  const [pkg, settings] = await Promise.all([getPackage(id), getSettings()]);
  if (!pkg) notFound();

  return (
    <>
      <PageHeader title={`Edit ${pkg.name}`} />
      <PackageForm pkg={pkg} rates={settings.fx.rates} />
    </>
  );
}