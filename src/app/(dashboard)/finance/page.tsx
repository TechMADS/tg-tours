import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { listBookings } from "@/lib/data/bookings";
import { listExpenses } from "@/lib/data/expenses";
import { listInvoices } from "@/lib/data/invoices";
import { listPackages } from "@/lib/data/packages";
import { convertMoneyEntryAmount } from "@/lib/finance/fx";
import { getSettings } from "@/lib/settings";
import { todayIST } from "@/lib/format";
import { FinanceDashboard } from "./finance-dashboard";

export default async function Page() {
  await requireModule("finance");
  const [bookings, packages, allExpenses, invoices, settings] = await Promise.all([
    listBookings(),
    listPackages(),
    listExpenses(),
    listInvoices(),
    getSettings(),
  ]);
  const packageById = new Map(packages.map((pkg) => [pkg.id, pkg]));
  const expensesByBooking = new Map<string, (typeof allExpenses)>();
  const bookingIds = new Set(bookings.map((booking) => booking.id));

  for (const expense of allExpenses) {
    if (!expense.bookingId || !bookingIds.has(expense.bookingId)) continue;
    expensesByBooking.set(expense.bookingId, [
      ...(expensesByBooking.get(expense.bookingId) ?? []),
      expense,
    ]);
  }

  const reports = bookings.map((booking) => {
    const pkg = packageById.get(booking.packageId);
    const packageCostPerMember = pkg?.cost
      ? convertMoneyEntryAmount(pkg.cost, booking.currency, settings.fx.rates)
      : 0;
    const packageCost = packageCostPerMember === undefined
      ? null
      : packageCostPerMember * booking.memberCount;
    const bookingExpenses = (expensesByBooking.get(booking.id) ?? []).reduce<number | null>(
      (total, expense) => {
        if (total === null) return null;
        const converted = convertMoneyEntryAmount(expense.money, booking.currency, settings.fx.rates);
        return converted === undefined ? null : total + converted;
      },
      0,
    );

    return {
      id: booking.id,
      bookingNo: booking.bookingNo,
      title: booking.title,
      travelStart: booking.travelStart,
      currency: booking.currency,
      status: booking.status,
      packageCost,
      bookingExpenses,
    };
  });
  const reportInvoices = invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    issueDate: invoice.issueDate,
    currency: invoice.currency,
    status: invoice.status,
    amountPaid: invoice.amountPaid,
    remainingBalance: invoice.remainingBalance,
    payments: invoice.payments.map(({ amount, date }) => ({ amount, date })),
  }));
  const companyExpenses = allExpenses
    .filter((expense) => !expense.bookingId)
    .map((expense) => ({
      id: expense.id,
      date: expense.date,
      description: expense.description,
      category: expense.category,
      payee: expense.payee || expense.vendor,
      currency: expense.money.currency,
      amount: expense.money.amount,
    }));

  return (
    <>
      <PageHeader title="Finance" description="Review invoice payments, pending collections, expenses, and profit over a selected period." />
      <FinanceDashboard bookings={reports} invoices={reportInvoices} companyExpenses={companyExpenses} today={todayIST()} />
    </>
  );
}
