import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/session";
import { canEditAssignedModules, canManageAssignedModules } from "@/types/roles";
import { CATEGORY_LABEL, GENDER_LABEL } from "@/lib/booking-utils";
import { getBooking, listMembers } from "@/lib/data/bookings";
import { listExpensesForBooking } from "@/lib/data/expenses";
import { listOrderSources } from "@/lib/data/order-sources";
import { getPackage } from "@/lib/data/packages";
import { formatMoney } from "@/lib/finance/currency";
import { convertMoneyEntryAmount } from "@/lib/finance/fx";
import { pricePerPerson } from "@/lib/finance/pricing";
import { formatDate, todayIST } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import type { CurrencyCode } from "@/lib/finance/currency";
import type { Gender } from "@/types/models";
import { SlotMeter } from "../slot-meter";
import { BookingStatusBadge } from "../status-badge";
import { BookingActions } from "./booking-actions";
import { MembersPanel } from "./members-panel";
import { BookingExpensesPanel } from "./booking-expenses-panel";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function BookingProfitability({
  revenue,
  memberCount,
  currency,
  packageCostConfigured,
  packageCostPerMember,
  bookingExpenses,
}: {
  revenue: number;
  memberCount: number;
  currency: CurrencyCode;
  packageCostConfigured: boolean;
  packageCostPerMember: number | null;
  bookingExpenses: number | null;
}) {
  const packageCost = !packageCostConfigured
    ? 0
    : packageCostPerMember === null ? null : packageCostPerMember * memberCount;
  const totalExpenses = packageCost === null || bookingExpenses === null
    ? null
    : packageCost + bookingExpenses;
  const profit = totalExpenses === null ? null : revenue - totalExpenses;
  const formatTotal = (amount: number | null) =>
    amount === null ? "Unavailable — check exchange rates" : formatMoney(amount, currency);

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Booking profitability</CardTitle>
        <p className="text-muted-foreground text-sm">
          Revenue minus total expenses.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <Field label="Total revenue">
          <span className="font-semibold">{formatTotal(revenue)}</span>
        </Field>
        <Field label="Total expenses">
          <span className="font-semibold">{formatTotal(totalExpenses)}</span>
        </Field>
        <Field label="Profit">
          <span className={`font-semibold ${profit !== null && profit < 0 ? "text-destructive" : ""}`}>
            {formatTotal(profit)}
          </span>
        </Field>
      </CardContent>
    </Card>
  );
}

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("bookings");
  const canManageBookings = canManageAssignedModules(user);
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();

  const [members, sources, pkg, expenses, settings] = await Promise.all([
    listMembers(id),
    listOrderSources(),
    getPackage(booking.packageId),
    user.role === "admin" || user.role === "manager" ? listExpensesForBooking(id) : Promise.resolve([]),
    user.role === "admin" || user.role === "manager" ? getSettings() : Promise.resolve(null),
  ]);

  const active = members.filter((m) => m.status === "active");
  const gender: Record<Gender, number> = { male: 0, female: 0, other: 0 };
  active.forEach((m) => gender[m.gender]++);

  // Does the package's group rate for today's headcount differ from this booking's adult rate?
  const pkgRate =
    pkg && pkg.price.currency === booking.currency
      ? pricePerPerson(pkg.priceTiers, Math.max(booking.memberCount, booking.minPersons))
      : null;
  const rateMismatch = pkgRate !== null && pkgRate !== booking.rates.adult;
  const packageCostPerMember = pkg?.cost && settings
    ? convertMoneyEntryAmount(pkg.cost, booking.currency, settings.fx.rates) ?? null
    : null;
  const bookingExpenses = expenses.reduce<number | null>((total, expense) => {
    if (total === null || !settings) return null;
    const converted = convertMoneyEntryAmount(expense.money, booking.currency, settings.fx.rates);
    return converted === undefined ? null : total + converted;
  }, 0);

  return (
    <>
      <PageHeader
        title={booking.title}
        description={`${booking.bookingNo} · ${booking.packageName} · ${booking.destination}`}
        actions={canManageBookings ? <BookingActions booking={booking} /> : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Booked person">{booking.contactName || "—"}</Field>
            <Field label="Status"><BookingStatusBadge b={booking} /></Field>
            <Field label="Slots"><SlotMeter b={booking} /></Field>
            <Field label="Travel">
              {formatDate(booking.travelStart)} – {formatDate(booking.travelEnd)}
            </Field>
            <Field label="Members can be added until">
              {formatDate(booking.closeDate)} <span className="text-muted-foreground">(end of day)</span>
            </Field>
            <Field label="Total of member prices">
              <span className="font-semibold">{formatMoney(booking.totalAmount, booking.currency)}</span>
            </Field>
            {booking.notes && <Field label="Notes"><span className="whitespace-pre-line">{booking.notes}</span></Field>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Rates and mix</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ul className="space-y-1">
              {(["adult", "child", "senior"] as const).map((c) => (
                <li key={c} className="flex justify-between">
                  <span>{CATEGORY_LABEL[c]} <span className="text-muted-foreground">× {booking.counts[c]}</span></span>
                  <span className="font-medium">{formatMoney(booking.rates[c], booking.currency)}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground border-t pt-3 text-xs">
              {(["male", "female", "other"] as const)
                .filter((g) => gender[g] > 0 || g !== "other")
                .map((g) => `${GENDER_LABEL[g]} ${gender[g]}`)
                .join(" · ")}
            </p>
            {rateMismatch && (
              <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                The package&apos;s group rate for {Math.max(booking.memberCount, booking.minPersons)} persons is{" "}
                {formatMoney(pkgRate!, booking.currency)}, but this booking charges{" "}
                {formatMoney(booking.rates.adult, booking.currency)} for adults. Edit the booking to change it.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {(user.role === "admin" || user.role === "manager") && (
        <BookingProfitability
          revenue={booking.totalAmount}
          memberCount={booking.memberCount}
          currency={booking.currency}
          packageCostConfigured={Boolean(pkg?.cost)}
          packageCostPerMember={packageCostPerMember}
          bookingExpenses={bookingExpenses}
        />
      )}

      <MembersPanel
        booking={booking}
        members={members}
        sources={sources.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))}
        canManage={canManageBookings}
        canEdit={canEditAssignedModules(user)}
      />
      {(user.role === "admin" || user.role === "manager") && (
        <BookingExpensesPanel
          bookingId={id}
          currency={booking.currency}
          expenses={expenses}
          today={todayIST()}
        />
      )}
    </>
  );
}