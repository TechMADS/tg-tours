import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { listBookings } from "@/lib/data/bookings";
import { listExpenses } from "@/lib/data/expenses";
import { listPackages } from "@/lib/data/packages";
import type { CurrencyCode } from "@/lib/finance/currency";
import { convertMoneyEntryAmount } from "@/lib/finance/fx";
import { getSettings } from "@/lib/settings";
import { todayIST } from "@/lib/format";
import { listTargetsWithProgress } from "@/lib/data/targets";
import { DashboardOverview } from "./dashboard-overview";
import { TargetsPanel } from "./targets/targets-panel";

function lastSixMonths(today: string) {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 5);
  return Array.from({ length: 6 }, (_, index) => {
    const month = new Date(date);
    month.setUTCMonth(date.getUTCMonth() + index);
    const key = month.toISOString().slice(0, 7);
    return {
      key,
      label: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(month),
    };
  });
}

export default async function DashboardPage() {
  const user = await requireModule("dashboard");
  const today = todayIST();
  const months = lastSixMonths(today);
  const monthKeys = new Set(months.map(({ key }) => key));
  const [bookings, packages, expenses, settings, targets] = await Promise.all([
    listBookings(),
    listPackages(),
    user.role === "admin" || user.role === "manager" ? listExpenses() : Promise.resolve([]),
    user.role === "admin" || user.role === "manager" ? getSettings() : Promise.resolve(null),
    user.role === "admin" || user.role === "manager"
      ? listTargetsWithProgress()
      : Promise.resolve([]),
  ]);
  const packageById = new Map(packages.map((pkg) => [pkg.id, pkg]));
  const expensesByBooking = new Map<string, typeof expenses>();
  const bookingById = new Map(bookings.map((booking) => [booking.id, booking]));

  for (const expense of expenses) {
    if (!expense.bookingId || !bookingById.has(expense.bookingId)) continue;
    expensesByBooking.set(expense.bookingId, [
      ...(expensesByBooking.get(expense.bookingId) ?? []),
      expense,
    ]);
  }

  const revenue: Partial<Record<CurrencyCode, number>> = {};
  const bookingExpenseTotals: Partial<Record<CurrencyCode, number>> = {};
  const companyExpenseTotals: Partial<Record<CurrencyCode, number>> = {};
  const cost: Partial<Record<CurrencyCode, number>> = {};
  const profit: Partial<Record<CurrencyCode, number>> = {};
  const unavailable: Partial<Record<CurrencyCode, boolean>> = {};
  const monthly = months.map((month) => ({
    ...month,
    bookings: 0,
    travelers: 0,
    revenue: {} as Partial<Record<CurrencyCode, number>>,
    bookingExpenses: {} as Partial<Record<CurrencyCode, number>>,
    companyExpenses: {} as Partial<Record<CurrencyCode, number>>,
    expenses: {} as Partial<Record<CurrencyCode, number>>,
    profit: {} as Partial<Record<CurrencyCode, number>>,
    unavailable: {} as Partial<Record<CurrencyCode, boolean>>,
  }));
  const monthByKey = new Map(monthly.map((month) => [month.key, month]));
  const statuses = { open: 0, closed: 0, completed: 0, cancelled: 0 };
  let activeTravelers = 0;

  for (const expense of expenses) {
    if (expense.bookingId) continue;
    const currency = expense.money.currency;
    companyExpenseTotals[currency] = (companyExpenseTotals[currency] ?? 0) + expense.money.amount;

    const month = monthByKey.get(expense.date.slice(0, 7));
    if (month) {
      month.companyExpenses[currency] = (month.companyExpenses[currency] ?? 0) + expense.money.amount;
      month.expenses[currency] = (month.expenses[currency] ?? 0) + expense.money.amount;
    }
  }

  for (const booking of bookings) {
    statuses[booking.status]++;
    if (booking.status === "cancelled") continue;
    activeTravelers += booking.memberCount;

    const pkg = packageById.get(booking.packageId);
    const packageCostPerMember = pkg?.cost && settings
      ? convertMoneyEntryAmount(pkg.cost, booking.currency, settings.fx.rates)
      : pkg?.cost ? undefined : 0;
    const packageCost = packageCostPerMember === undefined
      ? null
      : packageCostPerMember * booking.memberCount;
    const bookingExpenses = (expensesByBooking.get(booking.id) ?? []).reduce<number | null>(
      (total, expense) => {
        if (total === null || !settings) return null;
        const converted = convertMoneyEntryAmount(expense.money, booking.currency, settings.fx.rates);
        return converted === undefined ? null : total + converted;
      },
      0,
    );
    const totalExpenses = packageCost === null || bookingExpenses === null
      ? null
      : packageCost + bookingExpenses;
    revenue[booking.currency] = (revenue[booking.currency] ?? 0) + booking.totalAmount;
    if (totalExpenses !== null) {
      bookingExpenseTotals[booking.currency] =
        (bookingExpenseTotals[booking.currency] ?? 0) + totalExpenses;
    }
    if (totalExpenses === null) {
      unavailable[booking.currency] = true;
    } else {
      cost[booking.currency] = (cost[booking.currency] ?? 0) + totalExpenses;
      profit[booking.currency] =
        (profit[booking.currency] ?? 0)
        + booking.totalAmount - totalExpenses;
    }

    const monthKey = booking.travelStart.slice(0, 7);
    if (!monthKeys.has(monthKey)) continue;
    const month = monthByKey.get(monthKey)!;
    month.bookings++;
    month.travelers += booking.memberCount;
    month.revenue[booking.currency] = (month.revenue[booking.currency] ?? 0) + booking.totalAmount;
    if (totalExpenses !== null) {
      month.bookingExpenses[booking.currency] =
        (month.bookingExpenses[booking.currency] ?? 0) + totalExpenses;
    }
    if (totalExpenses === null) {
      month.unavailable[booking.currency] = true;
    } else {
      month.expenses[booking.currency] = (month.expenses[booking.currency] ?? 0) + totalExpenses;
      month.profit[booking.currency] =
        (month.profit[booking.currency] ?? 0) + booking.totalAmount - totalExpenses;
    }
  }

  for (const month of monthly) {
    for (const currency of Object.keys(month.companyExpenses) as CurrencyCode[]) {
      month.profit[currency] = (month.profit[currency] ?? 0) - (month.companyExpenses[currency] ?? 0);
    }
  }
  for (const currency of Object.keys(companyExpenseTotals) as CurrencyCode[]) {
    profit[currency] = (profit[currency] ?? 0) - (companyExpenseTotals[currency] ?? 0);
    cost[currency] = (cost[currency] ?? 0) + (companyExpenseTotals[currency] ?? 0);
  }

  const upcoming = bookings
    .filter((booking) =>
      (booking.status === "open" || booking.status === "closed")
      && booking.travelStart >= today,
    )
    .sort((a, b) => a.travelStart.localeCompare(b.travelStart))
    .slice(0, 5)
    .map((booking) => ({
      id: booking.id,
      bookingNo: booking.bookingNo,
      title: booking.title,
      destination: booking.destination,
      travelStart: booking.travelStart,
      memberCount: booking.memberCount,
      maxPersons: booking.maxPersons,
      currency: booking.currency,
      totalAmount: booking.totalAmount,
      status: booking.status === "open" ? "open" as const : "closed" as const,
    }));
  const currencies = Array.from(new Set(
    [
      ...bookings.filter((booking) => booking.status !== "cancelled").map((booking) => booking.currency),
      ...Object.keys(companyExpenseTotals) as CurrencyCode[],
    ],
  )).sort();

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="Here's what's happening at ABC Tours and Travels."
      />
      <DashboardOverview
        today={today}
        months={monthly}
        currencies={currencies}
        revenue={revenue}
        bookingExpenses={bookingExpenseTotals}
        companyExpenses={companyExpenseTotals}
        expenses={cost}
        profit={profit}
        unavailable={unavailable}
        bookingCount={bookings.filter((booking) => booking.status !== "cancelled").length}
        activeTravelers={activeTravelers}
        statuses={statuses}
        upcoming={upcoming}
        showFinancials={user.role === "admin" || user.role === "manager"}
      />
      {(user.role === "admin" || user.role === "manager") && (
        <div className="mt-8">
          <TargetsPanel targets={targets} today={today} />
        </div>
      )}
    </>
  );
}
