import type { TargetPeriod } from "@/types/models";

export type TargetDateRange = { startDate: string; endDate: string };

const DAY_MS = 86_400_000;

function dateOnly(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? parsed
    : null;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getTargetDateRange(
  period: TargetPeriod,
  periodDate: string,
  customEndDate?: string,
): TargetDateRange | null {
  const anchor = dateOnly(periodDate);
  if (!anchor) return null;

  if (period === "custom") {
    const end = customEndDate ? dateOnly(customEndDate) : null;
    return end && end >= anchor
      ? { startDate: periodDate, endDate: customEndDate! }
      : null;
  }

  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  let startMonth = month;
  let endMonth = month;
  const startYear = year;
  const endYear = year;

  if (period === "daily") {
    return { startDate: periodDate, endDate: periodDate };
  }

  if (period === "weekly") {
    const start = new Date(anchor);
    start.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7));
    return {
      startDate: formatDate(start),
      endDate: formatDate(new Date(start.getTime() + 6 * DAY_MS)),
    };
  }

  if (period === "monthly") {
    return {
      startDate: `${periodDate.slice(0, 7)}-01`,
      endDate: formatDate(new Date(Date.UTC(year, month + 1, 0))),
    };
  }

  if (period === "quarterly") {
    startMonth = Math.floor(month / 3) * 3;
    endMonth = startMonth + 2;
  } else if (period === "half_yearly") {
    startMonth = month < 6 ? 0 : 6;
    endMonth = startMonth + 5;
  } else if (period === "yearly") {
    startMonth = 0;
    endMonth = 11;
  }

  return {
    startDate: formatDate(new Date(Date.UTC(startYear, startMonth, 1))),
    endDate: formatDate(new Date(Date.UTC(endYear, endMonth + 1, 0))),
  };
}

export function targetPeriodLabel(period: TargetPeriod) {
  return {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    quarterly: "Quarterly",
    half_yearly: "Half-yearly",
    yearly: "Yearly",
    custom: "Custom range",
  }[period];
}
