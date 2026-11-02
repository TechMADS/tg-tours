import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { canManageAssignedModules } from "@/types/roles";
import { listBookings } from "@/lib/data/bookings";
import { todayIST } from "@/lib/format";
import { BookingsTable } from "./bookings-table";

export default async function BookingsPage() {
  const user = await requireModule("bookings");
  const bookings = await listBookings();

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Group bookings. Add members one by one until the booking closes."
      />
      <BookingsTable
        data={bookings}
        today={todayIST()}
        canManage={canManageAssignedModules(user)}
      />
    </>
  );
}