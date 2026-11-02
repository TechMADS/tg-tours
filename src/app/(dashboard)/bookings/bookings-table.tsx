"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Eye, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBooking } from "@/actions/bookings";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable } from "@/components/shared/data-table";
import { ReportPdfButton } from "@/components/shared/report-pdf-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { displayStatus } from "@/lib/booking-utils";
import { formatMoney } from "@/lib/finance/currency";
import { formatDate } from "@/lib/format";
import { reportBulkDelete, runBulkDelete } from "@/lib/bulk-delete";
import { formatReportAmount } from "@/lib/reports/pdf";
import type { Booking } from "@/types/models";
import { SlotMeter } from "./slot-meter";
import { BookingStatusBadge } from "./status-badge";

type Period = "today" | "week" | "month" | "year" | "all-time" | "custom";
type DateRange = { from: string; to: string };

function periodRange(period: Exclude<Period, "custom">, today: string): DateRange {
  if (period === "all-time") return { from: "", to: "" };

  const date = new Date(`${today}T00:00:00.000Z`);
  let from: string;
  switch (period) {
    case "today":
      from = today;
      break;
    case "week":
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      from = date.toISOString().slice(0, 10);
      break;
    case "month":
      from = `${today.slice(0, 7)}-01`;
      break;
    case "year":
      from = `${today.slice(0, 4)}-01-01`;
      break;
  }
  return { from, to: today };
}

export function BookingsTable({
  data,
  today,
  canManage,
}: {
  data: Booking[];
  today: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<Booking | null>(null);
  const [period, setPeriod] = useState<Period>("all-time");
  const [customRange, setCustomRange] = useState<DateRange>({ from: "", to: "" });
  const range = period === "custom" ? customRange : periodRange(period, today);
  const { from, to } = range;
  const validRange = period === "custom"
    ? Boolean(from && to && from <= to)
    : !(from && to && from > to);
  const filteredData = data.filter((booking) =>
    validRange
    && (!from || booking.travelStart >= from)
    && (!to || booking.travelStart <= to),
  );
  const periodLabel = period === "custom"
    ? `Custom range: ${from || "Any date"} to ${to || "Any date"}`
    : period === "all-time"
      ? "All time"
      : `${period === "week" ? "This week" : period === "month" ? "This month" : period === "year" ? "This year" : "Today"} (${from} to ${to})`;
  const pdfReport = {
    title: "Bookings report",
    period: periodLabel,
    fileName: `bookings-${period}`,
    summary: [
      ["Bookings", String(filteredData.length)],
      ["Travelers", String(filteredData.reduce((sum, booking) => sum + booking.memberCount, 0))],
      ["Open", String(filteredData.filter((booking) => booking.status === "open").length)],
      ["Closed", String(filteredData.filter((booking) => booking.status === "closed").length)],
      ["Completed", String(filteredData.filter((booking) => booking.status === "completed").length)],
      ["Cancelled", String(filteredData.filter((booking) => booking.status === "cancelled").length)],
    ] as [string, string][],
    sections: [{
      title: "Bookings",
      columns: ["Booking No.", "Booking", "Destination", "Travel dates", "Status", "Members", "Total"],
      rows: filteredData.map((booking) => [
        booking.bookingNo,
        booking.title,
        booking.destination,
        `${formatDate(booking.travelStart)} - ${formatDate(booking.travelEnd)}`,
        displayStatus(booking).label,
        `${booking.memberCount}${booking.maxPersons > 0 ? ` / ${booking.maxPersons}` : ""}`,
        formatReportAmount(booking.totalAmount, booking.currency),
      ]),
    }],
  };

  function selectPeriod(next: Period) {
    setPeriod(next);
    if (next !== "custom") setCustomRange(periodRange(next, today));
  }

  function changeDate(key: keyof DateRange, value: string) {
    setCustomRange((current) => ({ ...current, [key]: value }));
    setPeriod("custom");
  }

  const addButton = canManage ? (
    <Link href="/bookings/new" className={buttonVariants()}>
      <Plus className="mr-2 size-4" /> New booking
    </Link>
  ) : null;

  const columns: ColumnDef<Booking>[] = [
    {
      id: "booking",
      header: "Booking",
      accessorFn: (r) => `${r.bookingNo} ${r.title} ${r.contactName ?? ""} ${r.destination}`,
      cell: ({ row }) => (
        <div>
          <Link href={`/bookings/${row.original.id}`} className="font-medium hover:underline">
            {row.original.title}
          </Link>
          <p className="text-muted-foreground text-xs">
            {row.original.bookingNo} · {row.original.destination}
          </p>
          {row.original.contactName && (
            <p className="text-muted-foreground text-xs">Booked by {row.original.contactName}</p>
          )}
        </div>
      ),
    },
    {
      id: "travel",
      header: "Travel",
      accessorFn: (r) => r.travelStart,
      cell: ({ row }) => (
        <span className="text-sm">
          {formatDate(row.original.travelStart)} – {formatDate(row.original.travelEnd)}
        </span>
      ),
    },
    {
      id: "closes",
      header: "Closes",
      accessorFn: (r) => r.closeDate,
      cell: ({ row }) => formatDate(row.original.closeDate),
    },
    {
      id: "slots",
      header: "Slots",
      accessorFn: (r) => r.memberCount,
      cell: ({ row }) => <SlotMeter b={row.original} />,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (r) => displayStatus(r).label,
      cell: ({ row }) => <BookingStatusBadge b={row.original} />,
    },
    {
      id: "total",
      header: "Total",
      accessorFn: (r) => r.totalAmount,
      cell: ({ row }) => formatMoney(row.original.totalAmount, row.original.currency),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Row actions"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => router.push(`/bookings/${row.original.id}`)}>
              <Eye className="mr-2 size-4" /> Open
            </DropdownMenuItem>
            {canManage && (
              <>
                <DropdownMenuItem onClick={() => router.push(`/bookings/${row.original.id}/edit`)}>
                  <Pencil className="mr-2 size-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleting(row.original)}
                >
                  <Trash2 className="mr-2 size-4" /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      {validRange && (
        <div className="mb-4 flex justify-end">
          <ReportPdfButton report={pdfReport} />
        </div>
      )}
      <Card className="mb-4">
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="bookings-period">Period</Label>
            <select
              id="bookings-period"
              value={period}
              onChange={(event) => selectPeriod(event.target.value as Period)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
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
            <Label htmlFor="bookings-from">From</Label>
            <Input
              id="bookings-from"
              type="date"
              value={from}
              onChange={(event) => changeDate("from", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bookings-to">To</Label>
            <Input
              id="bookings-to"
              type="date"
              value={to}
              onChange={(event) => changeDate("to", event.target.value)}
            />
          </div>
          {!validRange && (
            <p className="text-sm text-destructive sm:col-span-3">
              Choose a valid date range with the start date on or before the end date.
            </p>
          )}
        </CardContent>
      </Card>
      {data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="font-medium">No bookings yet</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Create a booking for a package and travel dates, then add members as they join.
              You need at least one Active package.
            </p>
            {addButton}
          </CardContent>
        </Card>
      ) : (
        filteredData.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="font-medium">No bookings in this date range</p>
              <p className="text-muted-foreground max-w-sm text-sm">
                Choose another period or adjust the custom dates.
              </p>
              {addButton}
            </CardContent>
          </Card>
        ) : (
          <DataTable
            columns={columns}
            data={filteredData}
            searchPlaceholder="Search bookings…"
            toolbar={addButton}
            bulkDelete={canManage ? {
              getId: (booking) => booking.id,
              onDelete: async (bookings) => {
                const result = await runBulkDelete(bookings.map((booking) => booking.id), deleteBooking);
                reportBulkDelete(result, "booking");
                if (result.deletedIds.length > 0) router.refresh();
              },
            } : undefined}
          />
        )
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this booking?"
        description={`"${deleting?.title ?? ""}" will be removed. Bookings with members can't be deleted; cancel them instead.`}
        onConfirm={async () => {
          if (!deleting) return;
          const res = await deleteBooking(deleting.id);
          if (res.ok) toast.success("Booking deleted");
          else toast.error(res.error);
        }}
      />
    </>
  );
}