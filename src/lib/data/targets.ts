import "server-only";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COL, serializeDoc } from "@/lib/firestore/helpers";
import { convertMoneyEntryAmount } from "@/lib/finance/fx";
import { getSettings } from "@/lib/settings";
import { todayIST } from "@/lib/format";
import type {
  Booking,
  FinanceExpense,
  Target,
  TargetMetric,
  TargetProgress,
} from "@/types/models";

type RangeGroup = {
  startDate: string;
  endDate: string;
  targets: Target[];
};

function istTimestamp(date: string, endOfDay: boolean) {
  return Timestamp.fromDate(
    new Date(`${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+05:30`),
  );
}

function hasMetric(targets: Target[], ...metrics: TargetMetric[]) {
  return targets.some((target) => metrics.includes(target.metric));
}

async function queryRange(group: RangeGroup) {
  const needsTravelBookings = hasMetric(group.targets, "revenue", "profit", "travelers");
  const needsCreatedBookings = hasMetric(group.targets, "bookings", "completed_bookings");
  const bookingsPromise = needsTravelBookings
    ? adminDb.collection(COL.bookings)
      .where("travelStart", ">=", group.startDate)
      .where("travelStart", "<=", group.endDate)
      .select("isDeleted", "status", "memberCount", "totalAmount", "currency", "packageId")
      .get()
    : Promise.resolve(null);
  const createdBookingsPromise = needsCreatedBookings
    ? adminDb.collection(COL.bookings)
      .where("createdAt", ">=", istTimestamp(group.startDate, false))
      .where("createdAt", "<=", istTimestamp(group.endDate, true))
      .select("isDeleted", "status")
      .get()
    : Promise.resolve(null);
  const customerPromise = hasMetric(group.targets, "customers")
    ? adminDb.collection(COL.customers)
      .where("createdAt", ">=", istTimestamp(group.startDate, false))
      .where("createdAt", "<=", istTimestamp(group.endDate, true))
      .select("isDeleted")
      .get()
    : Promise.resolve(null);
  const companyExpensesPromise = hasMetric(group.targets, "profit")
    ? adminDb.collection(COL.transactions)
      .where("date", ">=", group.startDate)
      .where("date", "<=", group.endDate)
      .select("isDeleted", "type", "bookingId", "money")
      .get()
    : Promise.resolve(null);

  const [bookingsSnapshot, createdBookingsSnapshot, customersSnapshot, expensesSnapshot] = await Promise.all([
    bookingsPromise,
    createdBookingsPromise,
    customerPromise,
    companyExpensesPromise,
  ]);
  const bookings = (bookingsSnapshot?.docs ?? [])
    .map((doc) => serializeDoc<Booking>(doc))
    .filter((booking) => booking.isDeleted === false && booking.status !== "cancelled");
  const createdBookings = (createdBookingsSnapshot?.docs ?? [])
    .map((doc) => serializeDoc<Pick<Booking, "id" | "isDeleted" | "status">>(doc))
    .filter((booking) => booking.isDeleted === false && booking.status !== "cancelled");
  const bookingExpenses = new Map<string, FinanceExpense[]>();

  if (hasMetric(group.targets, "profit") && bookings.length > 0) {
    const bookingIds = Array.from(new Set(bookings.map((booking) => booking.id)));
    const expenseSnapshots = await Promise.all(
      Array.from({ length: Math.ceil(bookingIds.length / 30) }, (_, index) =>
        adminDb.collection(COL.transactions)
          .where("bookingId", "in", bookingIds.slice(index * 30, (index + 1) * 30))
          .where("isDeleted", "==", false)
          .where("type", "==", "expense")
          .select("bookingId", "money")
          .get(),
      ),
    );
    for (const snapshot of expenseSnapshots) {
      for (const doc of snapshot.docs) {
        const expense = serializeDoc<FinanceExpense>(doc);
        const linked = bookingExpenses.get(expense.bookingId!) ?? [];
        linked.push(expense);
        bookingExpenses.set(expense.bookingId!, linked);
      }
    }
  }

  const packagesById = new Map<string, { cost?: FinanceExpense["money"] | null; isDeleted: boolean }>();
  const packageIds = Array.from(new Set(bookings.map((booking) => booking.packageId)));
  if (hasMetric(group.targets, "profit") && packageIds.length > 0) {
    const packageSnapshots = await Promise.all(
      Array.from({ length: Math.ceil(packageIds.length / 30) }, (_, index) =>
        adminDb.collection(COL.packages)
          .where(FieldPath.documentId(), "in", packageIds.slice(index * 30, (index + 1) * 30))
          .select("cost", "isDeleted")
          .get(),
      ),
    );
    for (const snapshot of packageSnapshots) {
      for (const doc of snapshot.docs) {
        const data = doc.data();
        packagesById.set(doc.id, {
          cost: data.cost ?? null,
          isDeleted: data.isDeleted !== false,
        });
      }
    }
  }

  const settings = hasMetric(group.targets, "profit") ? await getSettings() : null;
  const companyExpenses = (expensesSnapshot?.docs ?? [])
    .filter((doc) => doc.data().isDeleted === false && doc.data().type === "expense" && !doc.data().bookingId)
    .map((doc) => serializeDoc<FinanceExpense>(doc));
  const customerCount = customersSnapshot?.docs.filter((doc) => doc.data().isDeleted === false).length ?? null;

  return {
    bookings,
    createdBookings,
    bookingExpenses,
    packagesById,
    settings,
    companyExpenses,
    customerCount,
  };
}

function calculateProfit(
  target: Target,
  data: Awaited<ReturnType<typeof queryRange>>,
): number | null {
  const currency = target.currency!;
  const settings = data.settings;
  if (!settings) return null;

  let profit = 0;
  for (const booking of data.bookings) {
    if (booking.currency !== currency) continue;
    const pkg = data.packagesById.get(booking.packageId);
    const packageCost = pkg?.isDeleted || !pkg?.cost
      ? 0
      : convertMoneyEntryAmount(pkg.cost, booking.currency, settings.fx.rates);
    if (packageCost === undefined) return null;

    let bookingExpenseTotal = 0;
    for (const expense of data.bookingExpenses.get(booking.id) ?? []) {
      const converted = convertMoneyEntryAmount(expense.money, booking.currency, settings.fx.rates);
      if (converted === undefined) return null;
      bookingExpenseTotal += converted;
    }
    profit += booking.totalAmount - packageCost * booking.memberCount - bookingExpenseTotal;
  }

  for (const expense of data.companyExpenses) {
    if (expense.money.currency === currency) profit -= expense.money.amount;
  }
  return profit;
}

function actualFor(target: Target, data: Awaited<ReturnType<typeof queryRange>>) {
  switch (target.metric) {
    case "bookings":
      return data.createdBookings.length;
    case "completed_bookings":
      return data.createdBookings.filter((booking) => booking.status === "completed").length;
    case "revenue":
      return data.bookings
        .filter((booking) => booking.currency === target.currency)
        .reduce((total, booking) => total + booking.totalAmount, 0);
    case "profit":
      return calculateProfit(target, data);
    case "customers":
      return data.customerCount;
    case "travelers":
      return data.bookings.reduce((total, booking) => total + booking.memberCount, 0);
  }
}

async function claimCompletion(target: Target): Promise<string | null> {
  const ref = adminDb.collection(COL.targets).doc(target.id);
  const completedAt = Timestamp.now();
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data();
    if (
      !snapshot.exists
      || !current
      || current.isDeleted
      || current.status !== "active"
      || current.targetValue !== target.targetValue
      || current.startDate !== target.startDate
      || current.endDate !== target.endDate
      || current.metric !== target.metric
      || current.currency !== target.currency
    ) {
      return null;
    }
    if (current.completionNotifiedAt) return null;

    transaction.update(ref, { completedAt, completionNotifiedAt: completedAt });
    return completedAt.toDate().toISOString();
  });
}

async function clearCompletion(target: Target) {
  const ref = adminDb.collection(COL.targets).doc(target.id);
  const expectedNotifiedAt = target.completionNotifiedAt
    ? Date.parse(target.completionNotifiedAt)
    : Number.NaN;
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data();
    if (
      !snapshot.exists
      || !current
      || current.isDeleted
      || current.targetValue !== target.targetValue
      || current.startDate !== target.startDate
      || current.endDate !== target.endDate
      || current.metric !== target.metric
      || current.currency !== target.currency
      || !current.completionNotifiedAt
      || !(current.completionNotifiedAt instanceof Timestamp)
      || current.completionNotifiedAt.toMillis() !== expectedNotifiedAt
    ) {
      return false;
    }

    transaction.update(ref, {
      completedAt: FieldValue.delete(),
      completionNotifiedAt: FieldValue.delete(),
    });
    return true;
  });
}

export async function listTargetsWithProgress(): Promise<TargetProgress[]> {
  const snapshot = await adminDb.collection(COL.targets)
    .where("isDeleted", "==", false)
    .get();
  const targets = snapshot.docs
    .map((doc) => serializeDoc<Target>(doc))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));

  const groups = new Map<string, RangeGroup>();
  for (const target of targets) {
    const key = `${target.startDate}:${target.endDate}`;
    const group = groups.get(key) ?? {
      startDate: target.startDate,
      endDate: target.endDate,
      targets: [],
    };
    group.targets.push(target);
    groups.set(key, group);
  }

  const results = await Promise.all(
    Array.from(groups.entries()).map(async ([key, group]) => [key, await queryRange(group)] as const),
  );
  const dataByRange = new Map(results);
  const today = todayIST();

  return Promise.all(targets.map(async (target) => {
    const data = dataByRange.get(`${target.startDate}:${target.endDate}`)!;
    const actualValue = actualFor(target, data);
    const progressPercent = actualValue === null
      ? null
      : (actualValue / target.targetValue) * 100;
    const isComplete = progressPercent !== null && progressPercent >= 100;
    const completionTime = isComplete && target.status === "active"
      ? await claimCompletion(target)
      : null;
    const completionCleared = actualValue !== null && !isComplete
      ? await clearCompletion(target)
      : false;
    const celebration = completionTime !== null;
    const displayStatus = target.status === "paused"
      ? "paused"
      : isComplete
        ? "completed"
        : target.endDate < today
          ? "expired"
          : "in_progress";

    return {
      ...target,
      actualValue,
      remainingValue: actualValue === null ? null : Math.max(0, target.targetValue - actualValue),
      progressPercent,
      displayStatus,
      celebration,
      ...(completionTime
        ? { completedAt: completionTime, completionNotifiedAt: completionTime }
        : {}),
      ...(completionCleared ? { completedAt: null, completionNotifiedAt: null } : {}),
    };
  }));
}
