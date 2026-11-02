import { PageHeader } from "@/components/shared/page-header";
import { requireModuleEditor } from "@/lib/auth/session";
import { listActivePackages } from "@/lib/data/packages";
import { todayIST } from "@/lib/format";
import { BookingForm } from "../booking-form";

export default async function NewBookingPage() {
  await requireModuleEditor("bookings", ["admin", "manager"]);
  const packages = await listActivePackages();

  return (
    <>
      <PageHeader title="New booking" description="Set up the trip. You add members on the next screen." />
      <BookingForm packages={packages} booking={null} defaultCloseDate={todayIST()} />
    </>
  );
}