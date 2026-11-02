"use client";

import { useState } from "react";
import { ReportPdfButton } from "@/components/shared/report-pdf-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CURRENCIES, formatMoney, type CurrencyCode } from "@/lib/finance/currency";
import { formatDate } from "@/lib/format";
import { formatReportAmount } from "@/lib/reports/pdf";

type ReportBooking = {
  id: string;
  bookingNo: string;
  title: string;
  travelStart: string;
  currency: CurrencyCode;
  status: string;
  revenue: number;
  packageCost: number | null;
  bookingExpenses: number | null;
};

type ReportCompanyExpense = {
  id: string;
  date: string;
  description: string;
  category: string;
  payee: string;
  currency: CurrencyCode;
  amount: number;
};

type Props = {
  bookings: ReportBooking[];
  companyExpenses: ReportCompanyExpense[];
  today: string;
};

type Totals = {
  revenue: number;
  bookingExpenses: number;
  companyExpenses: number;
  bookingExpensesUnavailable: boolean;
  bookingCount: number;
};

type Period = "today" | "week" | "month" | "year" | "all-time" | "custom";
type DateRange = { start: string; end: string };

const day = (value: string) => value.slice(0, 10);
const within = (value: string, start: string, end: string) =>
  day(value) >= start && day(value) <= end;

function periodRange(period: Exclude<Period, "custom">, today: string) {
  if (period === "all-time") return null;

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

function SummaryCard({
  title,
  amount,
  currency,
  description,
  unavailable,
  valueClassName,
}: {
  title: string;
  amount: number;
  currency: CurrencyCode;
  description: string;
  unavailable?: boolean;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className={`text-xl ${valueClassName ?? ""}`}>
          {unavailable ? "Unavailable — check exchange rates" : formatMoney(amount, currency)}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{description}</CardContent>
    </Card>
  );
}

export function FinanceDashboard({ bookings, companyExpenses, today }: Props) {
  const [period, setPeriod] = useState<Period>("month");
  const [customRange, setCustomRange] = useState<DateRange>(() => periodRange("month", today)!);
  const range = period === "custom" ? customRange : periodRange(period, today);
  const validRange = period !== "custom"
    || Boolean(range?.start && range.end && range.start <= range.end);
  const changeDate = (key: keyof DateRange, value: string) => {
    const currentRange = range ?? { start: "", end: "" };
    setCustomRange({ ...currentRange, [key]: value });
    setPeriod("custom");
  };
  const isInPeriod = (value: string) =>
    period === "all-time"
    || (validRange && range !== null && within(value, range.start, range.end));
  const selectedBookings = bookings.filter((booking) =>
    booking.status !== "cancelled" && isInPeriod(booking.travelStart),
  );
  const selectedCompanyExpenses = companyExpenses.filter((expense) =>
    isInPeriod(expense.date),
  );
  const totalsByCurrency = new Map<CurrencyCode, Totals>();

  for (const booking of selectedBookings) {
    const totals = totalsByCurrency.get(booking.currency) ?? {
      revenue: 0,
      bookingExpenses: 0,
      companyExpenses: 0,
      bookingExpensesUnavailable: false,
      bookingCount: 0,
    };
    totals.revenue += booking.revenue;
    totals.bookingCount++;

    if (booking.packageCost === null || booking.bookingExpenses === null) {
      totals.bookingExpensesUnavailable = true;
    } else {
      totals.bookingExpenses += booking.packageCost + booking.bookingExpenses;
    }
    totalsByCurrency.set(booking.currency, totals);
  }

  for (const expense of selectedCompanyExpenses) {
    const totals = totalsByCurrency.get(expense.currency) ?? {
      revenue: 0,
      bookingExpenses: 0,
      companyExpenses: 0,
      bookingExpensesUnavailable: false,
      bookingCount: 0,
    };
    totals.companyExpenses += expense.amount;
    totalsByCurrency.set(expense.currency, totals);
  }

  const currencies = Array.from(totalsByCurrency.keys()).sort((a, b) => a.localeCompare(b));
  const periodLabel = period === "custom"
    ? `Custom range: ${range?.start || "Any date"} to ${range?.end || "Any date"}`
    : period === "all-time"
      ? "All time"
      : `${period === "week" ? "This week" : period === "month" ? "This month" : period === "year" ? "This year" : "Today"} (${range?.start} to ${range?.end})`;
  const pdfReport = {
    title: "Finance report",
    period: periodLabel,
    fileName: `finance-${period}`,
    summary: [
      ["Non-cancelled bookings", String(selectedBookings.length)],
      ["Company expenses", String(selectedCompanyExpenses.length)],
      ["Currencies", currencies.join(", ") || "None"],
    ] as [string, string][],
    sections: [
      ...currencies.map((currency) => {
        const totals = totalsByCurrency.get(currency)!;
        const totalExpenses = totals.bookingExpenses + totals.companyExpenses;
        return {
          title: `${currency} - ${CURRENCIES[currency].name}`,
          columns: ["Metric", "Amount"],
          rows: [
            ["Booking revenue", formatReportAmount(totals.revenue, currency)],
            ["Booking expenses", totals.bookingExpensesUnavailable ? "Unavailable" : formatReportAmount(totals.bookingExpenses, currency)],
            ["Company expenses", formatReportAmount(totals.companyExpenses, currency)],
            ["Total expenses", totals.bookingExpensesUnavailable ? "Unavailable" : formatReportAmount(totalExpenses, currency)],
            ["Profit", totals.bookingExpensesUnavailable ? "Unavailable" : formatReportAmount(totals.revenue - totalExpenses, currency)],
          ],
        };
      }),
      {
        title: "Bookings in this period",
        columns: ["Booking No.", "Booking", "Travel date", "Currency", "Revenue", "Expenses", "Profit"],
        rows: selectedBookings.map((booking) => {
          const bookingExpense = booking.packageCost === null || booking.bookingExpenses === null
            ? null
            : booking.packageCost + booking.bookingExpenses;
          return [
            booking.bookingNo,
            booking.title,
            formatDate(booking.travelStart),
            booking.currency,
            formatReportAmount(booking.revenue, booking.currency),
            bookingExpense === null ? "Unavailable" : formatReportAmount(bookingExpense, booking.currency),
            bookingExpense === null ? "Unavailable" : formatReportAmount(booking.revenue - bookingExpense, booking.currency),
          ];
        }),
      },
      {
        title: "Company expenses in this period",
        columns: ["Date", "Description", "Category", "Payee", "Currency", "Amount"],
        rows: selectedCompanyExpenses.map((expense) => [
          formatDate(expense.date),
          expense.description,
          expense.category,
          expense.payee,
          expense.currency,
          formatReportAmount(expense.amount, expense.currency),
        ]),
      },
    ],
  };

  return (
    <div className="space-y-6">
      {validRange && (
        <div className="flex justify-end">
          <ReportPdfButton report={pdfReport} />
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Reporting period</CardTitle>
          <CardDescription>
            Bookings are filtered by travel start date; company expenses are filtered by expense date.
            Cancelled bookings are excluded and currency totals stay separate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="finance-period">Period</Label>
              <select
                id="finance-period"
                value={period}
                onChange={(event) => setPeriod(event.target.value as Period)}
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
              <Label htmlFor="finance-start">From</Label>
              <Input
                id="finance-start"
                type="date"
                value={range?.start ?? ""}
                onChange={(event) => changeDate("start", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="finance-end">To</Label>
              <Input
                id="finance-end"
                type="date"
                value={range?.end ?? ""}
                onChange={(event) => changeDate("end", event.target.value)}
              />
            </div>
          </div>
          {!validRange && (
            <p className="text-destructive text-sm">Choose a valid date range.</p>
          )}
        </CardContent>
      </Card>

      {currencies.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            No bookings or company expenses in this date range.
          </CardContent>
        </Card>
      ) : currencies.map((currency) => {
        const totals = totalsByCurrency.get(currency)!;
        const totalExpenses = totals.bookingExpenses + totals.companyExpenses;
        const profit = totals.revenue - totalExpenses;
        const companyExpenseCount = selectedCompanyExpenses
          .filter((expense) => expense.currency === currency)
          .length;
        return (
          <section key={currency} className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {currency} · {CURRENCIES[currency].name}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                title="Booking revenue"
                amount={totals.revenue}
                currency={currency}
                description={`Total from ${totals.bookingCount} booking${totals.bookingCount === 1 ? "" : "s"} in this period.`}
              />
              <SummaryCard
                title="Booking expenses"
                amount={totals.bookingExpenses}
                currency={currency}
                unavailable={totals.bookingExpensesUnavailable}
                description="Package costs and expenses recorded against bookings."
              />
              <SummaryCard
                title="Company expenses"
                amount={totals.companyExpenses}
                currency={currency}
                description={`${companyExpenseCount} company expense${companyExpenseCount === 1 ? "" : "s"} in this period.`}
              />
              <SummaryCard
                title="Total expenses"
                amount={totalExpenses}
                currency={currency}
                unavailable={totals.bookingExpensesUnavailable}
                description="Company expenses plus booking expenses."
              />
              <SummaryCard
                title="Profit"
                amount={profit}
                currency={currency}
                unavailable={totals.bookingExpensesUnavailable}
                description="Booking revenue minus total expenses."
                valueClassName={profit >= 0 ? "text-green-700 dark:text-green-400" : "text-destructive"}
              />
            </div>
          </section>
        );
      })}

      {selectedBookings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bookings in this period</CardTitle>
            <CardDescription>Revenue, expenses, and profit for each booking.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Booking</th>
                  <th className="py-2 pr-3 font-medium">Travel date</th>
                  <th className="py-2 pr-3 font-medium">Currency</th>
                  <th className="py-2 pr-3 text-right font-medium">Revenue</th>
                  <th className="py-2 pr-3 text-right font-medium">Expenses</th>
                  <th className="py-2 text-right font-medium">Profit</th>
                </tr>
              </thead>
              <tbody>
                {selectedBookings.map((booking) => {
                  const expenses = booking.packageCost === null || booking.bookingExpenses === null
                    ? null
                    : booking.packageCost + booking.bookingExpenses;
                  return (
                    <tr key={booking.id} className="border-b last:border-0">
                      <td className="py-3 pr-3 font-medium">
                        {booking.title}
                        <span className="text-muted-foreground block text-xs">{booking.bookingNo}</span>
                      </td>
                      <td className="py-3 pr-3">{formatDate(booking.travelStart)}</td>
                      <td className="py-3 pr-3">{booking.currency}</td>
                      <td className="py-3 pr-3 text-right">{formatMoney(booking.revenue, booking.currency)}</td>
                      <td className="py-3 pr-3 text-right">
                        {expenses === null ? "Unavailable" : formatMoney(expenses, booking.currency)}
                      </td>
                      <td className="py-3 text-right">
                        {expenses === null ? "Unavailable" : formatMoney(booking.revenue - expenses, booking.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
