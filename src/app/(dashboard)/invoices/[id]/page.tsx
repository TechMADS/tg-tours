import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { canManageAssignedModules } from "@/types/roles";
import { getInvoice } from "@/lib/data/invoices";
import { fromMinor } from "@/lib/finance/currency";
import { formatDuration } from "@/lib/format";
import type { InvoiceInput } from "@/lib/validators/invoice";
import { InvoiceDocument } from "../invoice-document";
import { InvoiceActions } from "./invoice-actions";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireModule("invoices");
  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  const values: InvoiceInput = {
    invoiceNo: invoice.invoiceNo,
    bookingId: invoice.bookingId ?? "",
    issueDate: invoice.issueDate.slice(0, 10),
    tripDestination: invoice.tripDestination,
    tripStatus: invoice.tripStatus,
    customer: {
      name: invoice.customer.name,
      phone: invoice.customer.phone,
      address: invoice.customer.address,
    },
    package: {
      name: invoice.package.name ?? "",
      destination: invoice.package.destination,
      startDate: invoice.package.startDate.slice(0, 10),
      endDate: invoice.package.endDate.slice(0, 10),
      duration: invoice.package.duration ?? formatDuration(invoice.package.startDate, invoice.package.endDate),
      memberCount: invoice.package.memberCount,
      totalPrice: fromMinor(invoice.package.totalPrice),
      cost: invoice.package.cost ? fromMinor(invoice.package.cost.amount) : 0,
    },
    currency: invoice.currency,
    discount: fromMinor(invoice.discount),
    taxEnabled: invoice.tax.enabled,
    taxRatePercent: invoice.tax.rateBps / 100,
    taxMode: invoice.tax.mode,
    payments: invoice.payments.map((payment) => ({
      paymentId: payment.paymentId,
      amount: fromMinor(payment.amount),
      date: payment.date.slice(0, 10),
    })),
    paymentTerms: invoice.paymentTerms,
    cancellationPolicy: invoice.cancellationPolicy,
    termsAndConditions: invoice.termsAndConditions,
    importantNotes: invoice.importantNotes,
    attachments: invoice.attachments,
  };

  return (
    <>
      <PageHeader
        title={invoice.invoiceNo}
        description={`${invoice.customer.name} · ${invoice.tripDestination}`}
        actions={<InvoiceActions invoice={invoice} canManage={canManageAssignedModules(user)} />}
      />
      <InvoiceDocument
        values={values}
        business={{ ...invoice.business, tagline: invoice.business.tagline ?? "" }}
      />
      {invoice.attachments.length > 0 && (
        <section className="mt-6 rounded-md border p-4 print:hidden">
          <h2 className="mb-3 font-semibold">Supporting Documents</h2>
          <InvoiceActions invoice={invoice} canManage={false} showAttachments showControls={false} />
        </section>
      )}
    </>
  );
}
