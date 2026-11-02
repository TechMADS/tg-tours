import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireModuleEditor } from "@/lib/auth/session";
import { getInvoice } from "@/lib/data/invoices";
import { listBookings } from "@/lib/data/bookings";
import { listPackages } from "@/lib/data/packages";
import { convertMoneyEntryAmount } from "@/lib/finance/fx";
import { getSettings } from "@/lib/settings";
import { todayIST } from "@/lib/format";
import type { InvoiceBookingOption } from "@/types/models";
import { InvoiceForm } from "../../invoice-form";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModuleEditor("invoices", ["admin", "manager"]);
  const { id } = await params;
  const [invoice, bookings, packages, settings] = await Promise.all([
    getInvoice(id),
    listBookings(),
    listPackages(),
    getSettings(),
  ]);
  if (!invoice) notFound();

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
      <PageHeader title={`Edit ${invoice.invoiceNo}`} description="Update invoice details and documents." />
      <InvoiceForm
        bookings={options}
        business={{ ...invoice.business, tagline: invoice.business.tagline ?? "" }}
        defaultTax={settings.gst}
        fxRates={settings.fx.rates}
        suggestedInvoiceNo={invoice.invoiceNo}
        today={todayIST()}
        invoice={invoice}
      />
    </>
  );
}
