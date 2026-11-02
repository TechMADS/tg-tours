import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireModuleEditor } from "@/lib/auth/session";
import { getBooking } from "@/lib/data/bookings";
import { BookingForm } from "../../booking-form";

export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModuleEditor("bookings", ["admin", "manager"]);
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();

  return (
    <>
      <PageHeader title={`Edit ${booking.title}`} description={booking.bookingNo} />
      <BookingForm packages={[]} booking={booking} />
    </>
  );
}