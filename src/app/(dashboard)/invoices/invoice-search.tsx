"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Search, Trash2, X } from "lucide-react";
import { deleteInvoice } from "@/actions/invoices";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReportPdfButton } from "@/components/shared/report-pdf-button";
import { SelectionCheckbox } from "@/components/shared/selection-checkbox";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, type CurrencyCode } from "@/lib/finance/currency";
import { formatDate } from "@/lib/format";
import { reportBulkDelete, runBulkDelete } from "@/lib/bulk-delete";
import { formatReportAmount } from "@/lib/reports/pdf";
import type { Invoice } from "@/types/models";

type Period = "today" | "week" | "month" | "year" | "all-time" | "custom";
type DateRange = { start: string; end: string };

const statusLabels = {
  draft: "Draft",
  sent: "Unpaid",
  partially_paid: "Partially paid",
  paid: "Paid",
  cancelled: "Cancelled",
} as const;

function periodRange(period: Exclude<Period, "custom">, today: string): DateRange {
  if (period === "all-time") return { start: "", end: "" };

  const date = new Date(`${today}T00:00:00.000Z`);
  let start: string;
  switch (period) {
    case "today":
      start = today;
      break;
    case "week":
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      start = date.toISOString().slice(0, 10);
      break;
    case "month":
      start = `${today.slice(0, 7)}-01`;
      break;
    case "year":
      start = `${today.slice(0, 4)}-01-01`;
      break;
  }
  return { start, end: today };
}

export function InvoiceSearch({
  invoices,
  canManage,
  today,
}: {
  invoices: Invoice[];
  canManage: boolean;
  today: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [period, setPeriod] = useState<Period>("all-time");
  const [customRange, setCustomRange] = useState<DateRange>({ start: "", end: "" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const range = period === "custom" ? customRange : periodRange(period, today);
  const { start: startDate, end: endDate } = range;
  const invalidRange = Boolean(startDate && endDate && startDate > endDate);
  const filteredInvoices = useMemo(() => {
    if (invalidRange) return [];
    const query = name.trim().toLocaleLowerCase();
    return invoices.filter((invoice) => {
      const issueDate = invoice.issueDate.slice(0, 10);
      return (
        (!query || invoice.customer.name.toLocaleLowerCase().includes(query))
        && (!startDate || issueDate >= startDate)
        && (!endDate || issueDate <= endDate)
      );
    });
  }, [endDate, invalidRange, invoices, name, startDate]);
  const totalsByCurrency = filteredInvoices.reduce((totals, invoice) => {
    totals.set(invoice.currency, (totals.get(invoice.currency) ?? 0) + invoice.total);
    return totals;
  }, new Map<CurrencyCode, number>());
  const hasFilters = Boolean(name || startDate || endDate || period !== "all-time");
  const periodLabel = period === "custom"
    ? `Custom range: ${startDate || "Any date"} to ${endDate || "Any date"}`
    : period === "all-time"
      ? "All time"
      : `${period === "week" ? "This week" : period === "month" ? "This month" : period === "year" ? "This year" : "Today"} (${startDate} to ${endDate})`;
  const pdfReport = {
    title: "Invoices report",
    period: `${periodLabel}${name.trim() ? ` · Client: ${name.trim()}` : ""}`,
    fileName: `invoices-${period}`,
    summary: [
      ["Invoices", String(filteredInvoices.length)],
      ["Search", name.trim() || "None"],
      ...Array.from(totalsByCurrency, ([currency, total]) => [
        `Total ${currency}`,
        formatReportAmount(total, currency),
      ]),
    ] as [string, string][],
    sections: [{
      title: "Invoice register",
      columns: ["Invoice", "Client", "Phone", "Destination", "Issue date", "Currency", "Total", "Paid", "Balance", "Status"],
      rows: filteredInvoices.map((invoice) => [
        invoice.invoiceNo,
        invoice.customer.name,
        invoice.customer.phone || "—",
        invoice.tripDestination,
        formatDate(invoice.issueDate),
        invoice.currency,
        formatReportAmount(invoice.total, invoice.currency),
        formatReportAmount(invoice.amountPaid, invoice.currency),
        formatReportAmount(invoice.remainingBalance, invoice.currency),
        statusLabels[invoice.status],
      ]),
    }],
  };

  function selectPeriod(next: Period) {
    setPeriod(next);
    setSelectedIds(new Set());
    if (next !== "custom") setCustomRange(periodRange(next, today));
  }

  function changeDate(key: keyof DateRange, value: string) {
    setCustomRange({ ...range, [key]: value });
    setPeriod("custom");
    setSelectedIds(new Set());
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!invalidRange && <ReportPdfButton report={pdfReport} />}
      </div>
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(8rem,0.8fr))_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="invoice-search-name">Client name</Label>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="invoice-search-name"
              type="search"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSelectedIds(new Set());
              }}
              placeholder="Search by client name"
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoice-search-period">Period</Label>
          <select
            id="invoice-search-period"
            value={period}
            onChange={(event) => selectPeriod(event.target.value as Period)}
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
          >
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
            <option value="all-time">All time</option>
            <option value="custom">Custom range</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoice-search-start">From date</Label>
          <Input
            id="invoice-search-start"
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(event) => changeDate("start", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoice-search-end">To date</Label>
          <Input
            id="invoice-search-end"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => changeDate("end", event.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!hasFilters}
          onClick={() => {
            setName("");
            setSelectedIds(new Set());
            selectPeriod("all-time");
          }}
        >
          <X className="mr-2 size-4" /> Clear
        </Button>
      </div>

      {invalidRange && (
        <p className="text-sm text-destructive">The start date must be on or before the end date.</p>
      )}

      {invoices.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center sm:p-12">
          <h2 className="text-lg font-semibold">No invoices yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a manual invoice or start with an existing booking.
          </p>
          {canManage && (
            <Link href="/invoices/new" className={`${buttonVariants()} mt-4`}>
              Create your first invoice
            </Link>
          )}
        </div>
      ) : filteredInvoices.length === 0 ? (
        <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          No invoices match your search and date filters.
        </p>
      ) : (
        <div className="space-y-3">
          {canManage && selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
              <span className="text-sm">{selectedIds.size} selected</span>
              <Button type="button" variant="destructive" onClick={() => setConfirmBulkDelete(true)}>
                <Trash2 className="mr-2 size-4" /> Delete selected
              </Button>
            </div>
          )}
        <div className="overflow-x-auto rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-sm text-muted-foreground">
            <span>Showing {filteredInvoices.length} of {invoices.length} invoices</span>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              {Array.from(totalsByCurrency, ([currency, total]) => (
                <span key={currency}>Total · {formatMoney(total, currency)}</span>
              ))}
            </span>
          </div>
          <table className="w-full min-w-[740px] text-left text-sm">
            <thead className="bg-muted/70 text-muted-foreground">
              <tr>
                {canManage && (
                  <th className="px-4 py-3 font-medium">
                    <SelectionCheckbox
                      checked={filteredInvoices.length > 0
                        && filteredInvoices.every((invoice) => selectedIds.has(invoice.id))}
                      indeterminate={filteredInvoices.some((invoice) => selectedIds.has(invoice.id))
                        && !filteredInvoices.every((invoice) => selectedIds.has(invoice.id))}
                      onChange={(event) => {
                        setSelectedIds(event.target.checked
                          ? new Set(filteredInvoices.map((invoice) => invoice.id))
                          : new Set());
                      }}
                      label="Select all filtered invoices"
                    />
                  </th>
                )}
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Destination</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-muted/40">
                  {canManage && (
                    <td className="px-4 py-3">
                      <SelectionCheckbox
                        checked={selectedIds.has(invoice.id)}
                        onChange={(event) => {
                          setSelectedIds((current) => {
                            const nextSelected = new Set(current);
                            if (event.target.checked) nextSelected.add(invoice.id);
                            else nextSelected.delete(invoice.id);
                            return nextSelected;
                          });
                        }}
                        label={`Select invoice ${invoice.invoiceNo}`}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/invoices/${invoice.id}`} className="text-primary underline-offset-4 hover:underline">
                      {invoice.invoiceNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div>{invoice.customer.name}</div>
                    <div className="text-xs text-muted-foreground">{invoice.customer.phone}</div>
                  </td>
                  <td className="px-4 py-3">{invoice.tripDestination}</td>
                  <td className="px-4 py-3">{formatDate(invoice.issueDate)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(invoice.total, invoice.currency)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                      {statusLabels[invoice.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
      {canManage && (
        <ConfirmDialog
          open={confirmBulkDelete}
          onOpenChange={setConfirmBulkDelete}
          title={`Delete ${selectedIds.size} selected invoices?`}
          description="The selected invoices will be removed from the list. Their deletion will be recorded."
          confirmLabel="Delete selected"
          onConfirm={async () => {
            const result = await runBulkDelete([...selectedIds], deleteInvoice);
            reportBulkDelete(result, "invoice");
            setSelectedIds(new Set(result.failedIds));
            if (result.deletedIds.length > 0) router.refresh();
          }}
        />
      )}
    </div>
  );
}
