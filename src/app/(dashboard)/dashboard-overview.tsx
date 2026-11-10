"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  CalendarDays,
  CircleDollarSign,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CURRENCIES, formatMoney, type CurrencyCode } from "@/lib/finance/currency";
import { formatDate } from "@/lib/format";
import type { BookingStatus } from "@/types/models";

type DashboardMonth = {
  key: string;
  label: string;
  bookings: number;
  travelers: number;
  revenue: Partial<Record<CurrencyCode, number>>;
  bookingExpenses: Partial<Record<CurrencyCode, number>>;
  companyExpenses: Partial<Record<CurrencyCode, number>>;
  expenses: Partial<Record<CurrencyCode, number>>;
  profit: Partial<Record<CurrencyCode, number>>;
  unavailable: Partial<Record<CurrencyCode, boolean>>;
};

type UpcomingBooking = {
  id: string;
  bookingNo: string;
  title: string;
  destination: string;
  travelStart: string;
  memberCount: number;
  maxPersons: number;
  currency: CurrencyCode;
  totalAmount: number;
  status: "open" | "closed";
};

type Props = {
  today: string;
  months: DashboardMonth[];
  currencies: CurrencyCode[];
  revenue: Partial<Record<CurrencyCode, number>>;
  pendingCollection: Partial<Record<CurrencyCode, number>>;
  bookingExpenses: Partial<Record<CurrencyCode, number>>;
  companyExpenses: Partial<Record<CurrencyCode, number>>;
  expenses: Partial<Record<CurrencyCode, number>>;
  profit: Partial<Record<CurrencyCode, number>>;
  unavailable: Partial<Record<CurrencyCode, boolean>>;
  bookingCount: number;
  activeTravelers: number;
  statuses: Record<BookingStatus, number>;
  upcoming: UpcomingBooking[];
  showFinancials: boolean;
};

const SERIES_COLORS = {
  revenue: "var(--chart-1)",
  bookingExpenses: "var(--chart-2)",
  companyExpenses: "var(--chart-3)",
  expenses: "var(--chart-4)",
  profit: "var(--chart-5)",
  bookings: "var(--chart-1)",
  travelers: "var(--chart-3)",
};

function MetricCard({
  title,
  value,
  detail,
  icon,
  accent,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardDescription>{title}</CardDescription>
          <CardTitle className="text-2xl">{value}</CardTitle>
        </div>
        <span className={`rounded-md p-2 ${accent}`}>{icon}</span>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{detail}</CardContent>
    </Card>
  );
}

function LineChart({
  labels,
  series,
  formatValue,
  ariaLabel,
}: {
  labels: string[];
  series: { label: string; color: string; values: (number | null)[] }[];
  formatValue: (value: number) => string;
  ariaLabel: string;
}) {
  const width = 760;
  const height = 270;
  const left = 72;
  const right = 18;
  const top = 18;
  const bottom = 40;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = series.flatMap((item) => item.values)
    .filter((value): value is number => value !== null);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (index: number) => left + (labels.length <= 1
    ? plotWidth / 2
    : (index / (labels.length - 1)) * plotWidth);
  const y = (value: number) => top + ((max - value) / span) * plotHeight;
  const ticks = Array.from({ length: 4 }, (_, index) => max - (span * index) / 3);

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          className="h-auto min-w-[560px] w-full overflow-visible"
        >
          {ticks.map((tick, index) => (
            <g key={index}>
              <line
                x1={left}
                x2={width - right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="currentColor"
                className="text-border"
                strokeDasharray={index === ticks.length - 1 ? undefined : "3 5"}
              />
              <text
                x={left - 10}
                y={y(tick) + 4}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize="10"
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}
          {series.map((item) => {
            let hasPreviousPoint = false;
            const path = item.values.map((value, index) => {
              if (value === null) {
                hasPreviousPoint = false;
                return "";
              }
              const command = hasPreviousPoint ? "L" : "M";
              hasPreviousPoint = true;
              return `${command} ${x(index)} ${y(value)}`;
            }).filter(Boolean).join(" ");
            return (
              <g key={item.label}>
                <path d={path} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {item.values.map((value, index) => (
                  value === null ? null : (
                  <circle key={index} cx={x(index)} cy={y(value)} r="4" fill={item.color}>
                    <title>{`${labels[index]} · ${item.label}: ${formatValue(value)}`}</title>
                  </circle>
                  )
                ))}
              </g>
            );
          })}
          {labels.map((label, index) => (
            <text
              key={label}
              x={x(index)}
              y={height - 12}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize="11"
            >
              {label}
            </text>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {series.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DashboardOverview({
  months,
  currencies,
  revenue,
  pendingCollection,
  expenses,
  profit,
  unavailable,
  bookingCount,
  activeTravelers,
  statuses,
  upcoming,
  showFinancials,
}: Props) {
  const [currency, setCurrency] = useState<CurrencyCode>(currencies[0] ?? "INR");
  const activeBookings = statuses.open + statuses.closed;
  const hasFinancialData = Boolean(
    revenue[currency] || pendingCollection[currency] || expenses[currency] || profit[currency],
  );
  const financialUnavailable = Boolean(unavailable[currency]);
  const money = (value: number | undefined) => formatMoney(value ?? 0, currency);
  const statusTotal = Object.values(statuses).reduce((sum, count) => sum + count, 0);

  const financialSeries = [
    {
      label: "Revenue",
      color: SERIES_COLORS.revenue,
      values: months.map((month) => (month.revenue[currency] ?? 0) / 100),
    },
    {
      label: "Booking expenses",
      color: SERIES_COLORS.bookingExpenses,
      values: months.map((month) =>
        month.unavailable[currency] ? null : (month.bookingExpenses[currency] ?? 0) / 100,
      ),
    },
    {
      label: "Company expenses",
      color: SERIES_COLORS.companyExpenses,
      values: months.map((month) => (month.companyExpenses[currency] ?? 0) / 100),
    },
    {
      label: "Total expenses",
      color: SERIES_COLORS.expenses,
      values: months.map((month) =>
        month.unavailable[currency] ? null : (month.expenses[currency] ?? 0) / 100,
      ),
    },
    {
      label: "Profit",
      color: SERIES_COLORS.profit,
      values: months.map((month) =>
        month.unavailable[currency] ? null : (month.profit[currency] ?? 0) / 100,
      ),
    },
  ];
  const bookingSeries = [
    {
      label: "Bookings",
      color: SERIES_COLORS.bookings,
      values: months.map((month) => month.bookings),
    },
    {
      label: "Travelers",
      color: SERIES_COLORS.travelers,
      values: months.map((month) => month.travelers),
    },
  ];

  return (
    <div className="space-y-6">
      <div className={`grid gap-4 sm:grid-cols-2 ${showFinancials ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
        <MetricCard
          title="Bookings"
          value={String(bookingCount)}
          detail={`${activeBookings} active · ${statuses.completed} completed · ${statuses.cancelled} cancelled`}
          icon={<CalendarDays className="size-4" />}
          accent="bg-primary/10 text-primary"
        />
        <MetricCard
          title="Active travellers"
          value={String(activeTravelers)}
          detail="Members in non-cancelled bookings."
          icon={<Users className="size-4" />}
          accent="bg-primary/10 text-primary"
        />
        {showFinancials && (
          <>
            <MetricCard
              title="All-time revenue"
              value={money(revenue[currency])}
              detail="Total paid on issued invoices."
              icon={<CircleDollarSign className="size-4" />}
              accent="bg-primary/10 text-primary"
            />
            <MetricCard
              title="Pending collection"
              value={money(pendingCollection[currency])}
              detail="Remaining balances on issued invoices."
              icon={<CircleDollarSign className="size-4" />}
              accent="bg-primary/10 text-primary"
            />
            <MetricCard
              title="All-time expenses"
              value={financialUnavailable ? "Unavailable" : money(expenses[currency])}
              detail="Booking and company expenses."
              icon={<ArrowDownRight className="size-4" />}
              accent="bg-primary/10 text-primary"
            />
            <MetricCard
              title="All-time profit"
              value={financialUnavailable ? "Unavailable" : money(profit[currency])}
              detail="Revenue minus total expenses."
              icon={<CircleDollarSign className="size-4" />}
              accent={
                profit[currency] !== undefined && profit[currency]! < 0
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary"
              }
            />
          </>
        )}
      </div>

      <div className={`grid items-start gap-4 ${showFinancials ? "xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.8fr)]" : "xl:grid-cols-2"}`}>
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Revenue, expenses &amp; profit</CardTitle>
              <CardDescription>Revenue by payment date · expenses by travel and expense dates · last six months</CardDescription>
            </div>
            {showFinancials && (
              <select
                aria-label="Chart currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                {(currencies.length ? currencies : ["INR" as const]).map((code) => (
                  <option key={code} value={code}>{code} · {CURRENCIES[code].name}</option>
                ))}
              </select>
            )}
          </CardHeader>
          <CardContent>
            {showFinancials ? (
              <div className="space-y-4">
                {!hasFinancialData && (
                  <p className="text-muted-foreground text-xs">No invoice payments in this currency yet.</p>
                )}
                {financialUnavailable && (
                  <p className="text-amber-700 text-xs dark:text-amber-300">
                    Some booking costs could not be converted. Check configured exchange rates.
                  </p>
                )}
                <LineChart
                  labels={months.map((month) => month.label)}
                  series={financialSeries}
                  formatValue={(value) => formatMoney(Math.round(value * 100), currency)}
                  ariaLabel={`Monthly invoice revenue, booking expenses, company expenses, total expenses and profit in ${currency}`}
                />
              </div>
            ) : (
              <LineChart
                labels={months.map((month) => month.label)}
                series={bookingSeries}
                formatValue={(value) => String(Math.round(value))}
                ariaLabel="Monthly booking and traveler counts"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Booking status</CardTitle>
            <CardDescription>Current status of all bookings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {([
              ["Open", statuses.open, "bg-emerald-500"],
              ["Closed", statuses.closed, "bg-amber-500"],
              ["Completed", statuses.completed, "bg-sky-500"],
              ["Cancelled", statuses.cancelled, "bg-rose-500"],
            ] as const).map(([label, count, color]) => (
              <div key={label} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="text-muted-foreground">{count} · {statusTotal ? Math.round((count / statusTotal) * 100) : 0}%</span>
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div className={`${color} h-full rounded-full`} style={{ width: `${statusTotal ? (count / statusTotal) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className={`grid items-start gap-4 ${showFinancials ? "xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.9fr)]" : "xl:grid-cols-1"}`}>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming bookings</CardTitle>
            <CardDescription>Next trips with open or closed booking status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm">No upcoming bookings.</p>
            ) : upcoming.map((booking) => (
              <Link
                key={booking.id}
                href={`/bookings/${booking.id}`}
                className="hover:bg-muted/50 flex items-center justify-between gap-4 rounded-md border p-3 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{booking.title}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {booking.bookingNo} · {booking.destination}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {formatDate(booking.travelStart)} · {booking.memberCount} traveler{booking.memberCount === 1 ? "" : "s"}
                    {booking.maxPersons > 0 ? ` / ${booking.maxPersons} slots` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Badge variant={booking.status === "open" ? "default" : "secondary"}>
                    {booking.status}
                  </Badge>
                  {showFinancials && (
                    <span className="mt-1 block text-xs font-medium">
                      {formatMoney(booking.totalAmount, booking.currency)}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        {showFinancials ? (
          <Card>
            <CardHeader>
              <CardTitle>Financial summary</CardTitle>
              <CardDescription>Invoice payments and outstanding balances · grouped by currency</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {currencies.length === 0 ? (
                <p className="text-muted-foreground text-sm">No invoice or expense financial data yet.</p>
              ) : currencies.map((code) => (
                <div key={code} className="space-y-2 border-b pb-3 last:border-0 last:pb-0">
                  <p className="text-sm font-semibold">{code} · {CURRENCIES[code].name}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span className="text-muted-foreground">Revenue collected</span>
                    <strong className="text-right">{money(revenue[code])}</strong>
                    <span className="text-muted-foreground">Pending collection</span>
                    <strong className="text-right">{money(pendingCollection[code])}</strong>
                    <span className="text-muted-foreground">Total expenses</span>
                    <strong className="text-right">
                      {unavailable[code] ? "Unavailable" : money(expenses[code])}
                    </strong>
                    <span className="text-muted-foreground">Profit</span>
                    <strong className="text-right">
                      {unavailable[code] ? "Unavailable" : money(profit[code])}
                    </strong>
                  </div>
                </div>
              ))}
              <Link href="/finance" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                View finance report <ArrowDownRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
