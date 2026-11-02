import { PageHeader } from "@/components/shared/page-header";
import { requireModuleEditor } from "@/lib/auth/session";
import { listBookings } from "@/lib/data/bookings";
import { getSettings } from "@/lib/settings";
import { todayIST } from "@/lib/format";
import { suggestInvoiceNumber } from "@/lib/data/invoices";
import { listPackages } from "@/lib/data/packages";
import { convertMoneyEntryAmount } from "@/lib/finance/fx";
import type { InvoiceBookingOption } from "@/types/models";
import { InvoiceForm } from "../invoice-form";

export default async function NewInvoicePage() {
  await requireModuleEditor("invoices", ["admin", "manager"]);
  const today = todayIST();
  const [bookings, packages, settings, invoiceNo] = await Promise.all([
    listBookings(),
    listPackages(),
    getSettings(),
    suggestInvoiceNumber(today),
  ]);
  const packageById = new Map(packages.map((pkg) => [pkg.id, pkg]));
  const options: InvoiceBookingOption[] = bookings.map((booking) => {
    const packageCost = packageById.get(booking.packageId)?.cost;
    const defaultPackageCost = packageCost
      ? convertMoneyEntryAmount(packageCost, booking.currency, settings.fx.rates)
      : undefined;
    return {
      id: booking.id,
      bookingNo: booking.bookingNo,
      title: booking.title,
      contactName: booking.contactName,
      destination: booking.destination,
      packageName: packageById.get(booking.packageId)?.name,
      travelStart: booking.travelStart,
      travelEnd: booking.travelEnd,
      memberCount: booking.memberCount,
      totalAmount: booking.totalAmount,
      currency: booking.currency,
      defaultPackageCost,
      packageCostConversionMissing: Boolean(packageCost && defaultPackageCost === undefined),
      status: booking.status,
    };
  });

  return (
    <>
      <PageHeader title="Create Invoice" description="Create an invoice manually or prefill it from a booking." />
      <InvoiceForm
        bookings={options}
        business={settings.business}
        defaultTax={settings.gst}
        fxRates={settings.fx.rates}
        today={today}
        suggestedInvoiceNo={invoiceNo}
      />
    </>
  );
}
