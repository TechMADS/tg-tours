import Image from "next/image";
import { calcTotals } from "@/lib/finance/tax";
import {
  formatMoney,
  percentToBps,
  toMinor,
  type CurrencyCode,
} from "@/lib/finance/currency";
import { formatDate } from "@/lib/format";
import type { AppSettings } from "@/lib/validators/settings";
import type { InvoiceInput } from "@/lib/validators/invoice";

export function InvoiceDocument({
  values,
  business,
}: {
  values: InvoiceInput;
  business: AppSettings["business"];
}) {
  const totalPrice = toMinor(Number(values.package.totalPrice) || 0);
  const discount = toMinor(Number(values.discount) || 0);
  const tax = {
    enabled: values.taxEnabled,
    rateBps: percentToBps(Number(values.taxRatePercent) || 0),
    mode: values.taxMode,
  };
  const totals = calcTotals({ lineTotals: [totalPrice], discount, tax });
  const advancePaid = values.payments.reduce(
    (sum, payment) => sum + toMinor(Number(payment.amount) || 0),
    0,
  );
  const balance = Math.max(totals.total - advancePaid, 0);
  const currency = values.currency as CurrencyCode;

  return (
    <article
      id="invoice-preview"
      className="invoice-print-area mx-auto w-full max-w-3xl min-w-0 space-y-4 overflow-hidden text-slate-900"
    >
      <div
        data-pdf-page
        className="min-w-0 border bg-white p-5 shadow-sm sm:p-8"
      >
        <header className="flex min-w-0 flex-col items-start gap-3 border-b border-slate-300 pb-4 text-left sm:flex-row sm:items-center sm:gap-4">
          <div className="flex w-28 shrink-0 items-center justify-center sm:w-[clamp(96px,32%,182px)]">
            <Image
              src="/adn-logo.png"
              alt="ADN Adventures logo"
              width={182}
              height={106}
              unoptimized
              className="h-auto w-full object-contain"
              priority
            />
          </div>
          <div className="min-w-0 break-words">
            <p className="text-xl font-bold tracking-wide uppercase sm:text-2xl">
              {business.name || "ADN ADVENTURES"}
            </p>
            <p className="text-lg tracking-widest uppercase">
              Tours &amp; Travels
            </p>
            {business.tagline && (
              <p className="text-sm text-slate-600">
                {business.tagline}
              </p>
            )}
            <p className="text-sm text-slate-600">
              MSME Registration No: UDAYAM-PY-03-0062646
            </p>
            <p className="text-xs text-slate-600">
              Inside Techgajana Campus, Thiruvalluvar Street, Near MGR Statue, Villianur, Puducherry - 605110
            </p>
            {business.gstin && (
              <p className="mt-1 text-xs">GSTIN: {business.gstin}</p>
            )}
            {business.address && (
              <p className="mt-1 text-xs whitespace-pre-line">
                {business.address}
              </p>
            )}
          </div>
        </header>

        <div className="space-y-2 border-b border-slate-300 py-3 text-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
            <span>
              Invoice No: <strong>{values.invoiceNo}</strong>
            </span>
            <span>
              Invoice Date:{" "}
              <strong>
                {values.issueDate ? formatDate(values.issueDate) : "—"}
              </strong>
            </span>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
            <span>
              Trip Destination: <strong>{values.tripDestination || "—"}</strong>
            </span>
            <span>
              Trip Status:{" "}
              <strong className="capitalize">
                {values.tripStatus || "upcoming"}
              </strong>
            </span>
          </div>
        </div>

        <section className="border-b border-slate-300 py-3 text-sm">
          <h2 className="mb-2 text-base font-bold">Client Details</h2>
          <p>
            <strong>Name:</strong> {values.customer.name || "—"}
          </p>
          <p>
            <strong>Mobile:</strong> {values.customer.phone || "—"}
          </p>
          <p className="whitespace-pre-line">
            <strong>Address:</strong> {values.customer.address || "—"}
          </p>
        </section>

        <section className="border-b border-slate-300 py-3 text-sm">
          <h2 className="mb-2 text-base font-bold">Package Details</h2>
          <table className="w-full border-collapse">
            <tbody>
              <InvoiceRow
                label="Package Destination"
                value={values.package.destination || "—"}
              />
              <InvoiceRow
                label="Package Date"
                value={`${values.package.startDate ? formatDate(values.package.startDate) : ""} to ${values.package.endDate ? formatDate(values.package.endDate) : ""}`}
              />
              <InvoiceRow label="Duration" value={values.package.duration || "—"} />
              <InvoiceRow
                label="Number of Members"
                value={`${Number(values.package.memberCount) || 0} Members`}
              />
              <InvoiceRow
                label="Total Package Price"
                value={formatMoney(totalPrice, currency)}
              />
              {discount > 0 && (
                <InvoiceRow
                  label="Discount"
                  value={`- ${formatMoney(discount, currency)}`}
                />
              )}
              {tax.enabled && tax.rateBps > 0 && (
                <InvoiceRow
                  label={`GST (${tax.rateBps / 100}%)`}
                  value={formatMoney(totals.taxAmount, currency)}
                />
              )}
              <InvoiceRow
                label="Advance Paid"
                value={formatMoney(advancePaid, currency)}
              />
              <InvoiceRow
                label="Remaining Balance"
                value={formatMoney(balance, currency)}
                emphasis
              />
            </tbody>
          </table>
          {values.payments.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-1 font-bold">Payment History</h3>
              <ul className="space-y-1">
                {values.payments.map((payment, index) => (
                  <li
                    key={`${payment.date}-${index}`}
                    className="flex flex-wrap justify-between gap-x-3 gap-y-1"
                  >
                    <span>
                      Payment {index + 1} ·{" "}
                      {payment.date ? formatDate(payment.date) : "—"}
                    </span>
                    <span>
                      {formatMoney(
                        toMinor(Number(payment.amount) || 0),
                        currency,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <div
        data-pdf-page
        className="min-w-0 border bg-white p-5 shadow-sm sm:p-8"
      >
        <section className="space-y-3 border-b border-slate-300 py-3 text-sm">
          <TermsSection title="Payment Terms" value={values.paymentTerms} />
          <TermsSection
            title="Cancellation Policy"
            value={values.cancellationPolicy}
          />
          <TermsSection
            title="Terms & Conditions"
            value={values.termsAndConditions}
          />
          <TermsSection title="Important Notes" value={values.importantNotes} />
        </section>

        <footer className="pt-8 text-right">
          <div className="mb-1 ml-auto flex h-[82px] w-56 items-end justify-center border-b border-slate-400 bg-transparent">
            <Image
              src="/adn-signature.png"
              alt="Authorized signature"
              width={240}
              height={69}
              unoptimized
              className="h-[69px] w-[240px] bg-transparent object-contain"
              priority
            />
          </div>
          <p className="text-sm font-bold">Authorized Signature</p>
          <p className="mt-6 text-center font-bold">
            Thank You &amp; Have a Great Journey Ahead!
          </p>
        </footer>
      </div>
    </article>
  );
}

function InvoiceRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <tr>
      <th className="w-2/3 break-words border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">
        {label}
      </th>
      <td
        className={`break-words border border-slate-300 px-3 py-2 ${emphasis ? "font-bold text-red-600" : ""}`}
      >
        {value}
      </td>
    </tr>
  );
}

function TermsSection({ title, value }: { title: string; value: string }) {
  if (!value.trim()) return null;
  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  return (
    <div>
      <h3 className="font-bold">{title}</h3>
      <div className="space-y-0.5">
        {lines.map((line, index) => {
          const bullet = line.match(/^\s*[-•]\s+(.*)$/);
          return bullet ? (
            <div
              key={index}
              className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-x-1"
            >
              <span aria-hidden="true">•</span>
              <span>{bullet[1]}</span>
            </div>
          ) : (
            <p key={index}>{line}</p>
          );
        })}
      </div>
    </div>
  );
}
