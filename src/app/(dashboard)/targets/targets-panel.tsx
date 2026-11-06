"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  CirclePause,
  CirclePlay,
  Clock3,
  Flag,
  PartyPopper,
  Pencil,
  Plus,
  Sparkles,
  Target as TargetIcon,
  Trash2,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCIES, CURRENCY_CODES, formatMoney } from "@/lib/finance/currency";
import { formatDate, todayIST } from "@/lib/format";
import { getTargetDateRange, targetPeriodLabel } from "@/lib/targets-period";
import type {
  TargetMetric,
  TargetPeriod,
  TargetProgress,
} from "@/types/models";
import {
  createTarget,
  deleteTarget,
  setTargetStatus,
  updateTarget,
} from "@/actions/targets";

const METRICS: { value: TargetMetric; label: string; unit: string }[] = [
  { value: "bookings", label: "Total bookings", unit: "bookings" },
  { value: "completed_bookings", label: "Completed bookings", unit: "bookings" },
  { value: "revenue", label: "Revenue", unit: "revenue" },
  { value: "profit", label: "Profit", unit: "profit" },
  { value: "customers", label: "New customers", unit: "customers" },
  { value: "travelers", label: "Travelers", unit: "travelers" },
];

const PERIODS: { value: TargetPeriod; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half_yearly", label: "Half-yearly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom date range" },
];

type Props = {
  targets: TargetProgress[];
  today: string;
  management?: boolean;
};

type FormState = {
  name: string;
  metric: TargetMetric;
  targetValue: string;
  currency: string;
  period: TargetPeriod;
  periodDate: string;
  customEndDate: string;
  description: string;
};

function isMoney(metric: TargetMetric) {
  return metric === "revenue" || metric === "profit";
}

function formatTargetValue(value: number, target: TargetProgress) {
  return isMoney(target.metric)
    ? formatMoney(value, target.currency ?? "INR")
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

function badgeStyle(status: TargetProgress["displayStatus"]) {
  switch (status) {
    case "completed":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "expired":
      return "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    case "paused":
      return "border-muted-foreground/25 bg-muted text-muted-foreground";
    default:
      return "border-primary/25 bg-primary/10 text-primary";
  }
}

function statusLabel(status: TargetProgress["displayStatus"]) {
  return {
    in_progress: "In progress",
    completed: "Achieved",
    expired: "Expired",
    paused: "Paused",
  }[status];
}

function TargetCard({
  target,
  management,
  onEdit,
  onPause,
  onDelete,
}: {
  target: TargetProgress;
  management: boolean;
  onEdit: (target: TargetProgress) => void;
  onPause: (target: TargetProgress) => void;
  onDelete: (target: TargetProgress) => void;
}) {
  const percent = target.progressPercent;
  const fillPercent = Math.min(100, Math.max(0, percent ?? 0));
  const valueLabel = percent === null ? "Unavailable" : `${Math.round(percent)}%`;
  const isFinancial = isMoney(target.metric);
  const unit = METRICS.find(({ value }) => value === target.metric)?.unit ?? "";

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="truncate text-base">{target.name}</CardTitle>
            <CardDescription>
              {METRICS.find(({ value }) => value === target.metric)?.label}
              {isFinancial ? ` · ${target.currency}` : ""}
              {" · "}{targetPeriodLabel(target.period)}
            </CardDescription>
          </div>
          <Badge className={`shrink-0 rounded-full border px-2.5 py-1 tracking-normal ${badgeStyle(target.displayStatus)}`}>
            {target.displayStatus === "completed" && <Check aria-hidden="true" />}
            {target.displayStatus === "expired" && <Clock3 aria-hidden="true" />}
            {statusLabel(target.displayStatus)}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <span>{formatDate(target.startDate)} – {formatDate(target.endDate)}</span>
          {target.displayStatus === "expired" && <span>· Period ended</span>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {target.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{target.description}</p>
        )}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Achieved</p>
            <p className="truncate text-lg font-semibold tabular-nums">
              {target.actualValue === null
                ? "Unavailable"
                : `${formatTargetValue(target.actualValue, target)}${isFinancial ? "" : ` ${unit}`}`}
              <span className="text-sm font-normal text-muted-foreground">
                {" / "}{formatTargetValue(target.targetValue, target)}
                {isFinancial ? "" : ` ${unit}`}
              </span>
            </p>
          </div>
          <p className={`shrink-0 text-lg font-semibold tabular-nums ${target.displayStatus === "completed" ? "text-emerald-600 dark:text-emerald-400" : "text-primary"}`}>
            {valueLabel}
          </p>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${target.name} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fillPercent}
          aria-valuetext={percent === null ? "Progress unavailable" : `${percent.toFixed(1)} percent`}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${
              target.displayStatus === "completed"
                ? "bg-emerald-500"
                : target.displayStatus === "expired"
                  ? "bg-rose-500"
                  : "bg-brand-gradient"
            }`}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {target.remainingValue === null
              ? "Remaining unavailable"
              : target.remainingValue === 0
                ? target.actualValue !== null && target.actualValue > target.targetValue
                  ? `${formatTargetValue(target.actualValue - target.targetValue, target)} above goal`
                  : "Target reached"
                : `${formatTargetValue(target.remainingValue, target)} remaining`}
          </span>
          {target.completedAt && target.displayStatus === "completed" && (
            <span>Achieved {formatDate(target.completedAt)}</span>
          )}
        </div>
        {management && (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button variant="outline" size="sm" onClick={() => onEdit(target)}>
              <Pencil aria-hidden="true" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => onPause(target)}>
              {target.displayStatus === "paused"
                ? <><CirclePlay aria-hidden="true" /> Resume</>
                : <><CirclePause aria-hidden="true" /> Pause</>}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(target)}
            >
              <Trash2 aria-hidden="true" /> Delete
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function makeDefaultForm(today: string): FormState {
  return {
    name: "",
    metric: "bookings",
    targetValue: "",
    currency: "INR",
    period: "monthly",
    periodDate: today,
    customEndDate: "",
    description: "",
  };
}

function targetToForm(target: TargetProgress): FormState {
  return {
    name: target.name,
    metric: target.metric,
    targetValue: String(isMoney(target.metric) ? target.targetValue / 100 : target.targetValue),
    currency: target.currency ?? "INR",
    period: target.period,
    periodDate: target.startDate,
    customEndDate: target.period === "custom" ? target.endDate : "",
    description: target.description,
  };
}

function Celebration({
  target,
  onClose,
}: {
  target: TargetProgress;
  onClose: () => void;
}) {
  const confetti = typeof document === "undefined" ? null : createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden="true">
      {Array.from({ length: 44 }, (_, index) => {
        const style = {
          left: "50%",
          animationDelay: `${(index % 11) * 55}ms`,
          "--confetti-x": `${((index * 53) % 760) - 380}px`,
          "--confetti-y": `${((index * 47) % 360) - 180}px`,
          "--confetti-rotate": `${(index * 73) % 720}deg`,
        } as CSSProperties;
        return <span key={index} className={`target-confetti target-confetti-${index % 5}`} style={style} />;
      })}
    </div>,
    document.body,
  );
  const exceeded = target.progressPercent !== null && target.progressPercent > 100;

  return (
    <>
      {confetti}
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="overflow-hidden border-primary/20 p-0 sm:max-w-lg">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-brand-gradient" />
          <div className="px-6 pb-6 pt-9 text-center sm:px-9">
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
              <Trophy className="size-8 animate-bounce motion-reduce:animate-none" aria-hidden="true" />
            </div>
            <DialogHeader className="items-center text-center">
              <DialogTitle className="text-2xl">Congratulations! 🎉</DialogTitle>
              <DialogDescription className="max-w-sm text-center">
                {exceeded
                  ? "Outstanding! You've exceeded your target!"
                  : "You've successfully achieved your target!"}
              </DialogDescription>
            </DialogHeader>
            <div className="my-6 rounded-xl border bg-muted/40 p-4 text-left">
              <div className="flex items-center gap-2 font-semibold">
                <PartyPopper className="size-4 text-primary" aria-hidden="true" />
                {target.name}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Target</p>
                  <p className="font-medium">{formatTargetValue(target.targetValue, target)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Achieved</p>
                  <p className="font-medium">
                    {target.actualValue === null ? "Unavailable" : formatTargetValue(target.actualValue, target)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Achievement</p>
                  <p className="font-medium">{Math.round(target.progressPercent ?? 0)}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="font-medium">
                    {formatDate(target.completedAt ?? todayIST())}
                  </p>
                </div>
              </div>
            </div>
            <Button className="min-w-32" onClick={onClose}>
              <Sparkles aria-hidden="true" /> Awesome!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TargetsPanel({ targets, today, management = false }: Props) {
  const [isPending, startTransition] = useTransition();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TargetProgress | null>(null);
  const [form, setForm] = useState<FormState>(() => makeDefaultForm(today));
  const [pendingDelete, setPendingDelete] = useState<TargetProgress | null>(null);
  const [celebrationQueue, setCelebrationQueue] = useState<TargetProgress[]>(() => {
    const first = targets.filter((target) => target.celebration);
    return first;
  });
  const seenCelebrations = useRef(new Set(
    targets.filter((target) => target.celebration)
      .map((target) => `${target.id}:${target.completionNotifiedAt ?? ""}`),
  ));

  useEffect(() => {
    const unseen = targets.filter((target) => {
      if (!target.celebration) return false;
      const key = `${target.id}:${target.completionNotifiedAt ?? ""}`;
      if (seenCelebrations.current.has(key)) return false;
      seenCelebrations.current.add(key);
      return true;
    });
    if (unseen.length) setCelebrationQueue((queue) => [...queue, ...unseen]);
  }, [targets]);

  const openNewTarget = () => {
    setEditing(null);
    setForm(makeDefaultForm(today));
    setEditorOpen(true);
  };
  const openEditTarget = (target: TargetProgress) => {
    setEditing(target);
    setForm(targetToForm(target));
    setEditorOpen(true);
  };
  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submitTarget = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        const input = {
          name: form.name,
          metric: form.metric,
          targetValue: Number(form.targetValue),
          ...(isMoney(form.metric) ? { currency: form.currency } : {}),
          period: form.period,
          periodDate: form.periodDate,
          ...(form.period === "custom" ? { customEndDate: form.customEndDate } : {}),
          description: form.description,
        };
        const result = editing
          ? await updateTarget(editing.id, input)
          : await createTarget(input);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(editing ? "Target updated" : "Target created");
        setEditorOpen(false);
      } catch {
        toast.error("Could not save this target. Please try again.");
      }
    });
  };

  const toggleTarget = (target: TargetProgress) => startTransition(async () => {
    try {
      const nextStatus = target.displayStatus === "paused" ? "active" : "paused";
      const result = await setTargetStatus(target.id, nextStatus);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(nextStatus === "paused" ? "Target paused" : "Target resumed");
    } catch {
      toast.error("Could not update this target. Please try again.");
    }
  });

  const removeTarget = () => {
    if (!pendingDelete) return;
    startTransition(async () => {
      try {
        const result = await deleteTarget(pendingDelete.id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Target deleted");
        setPendingDelete(null);
      } catch {
        toast.error("Could not delete this target. Please try again.");
      }
    });
  };

  const activeTargets = targets.filter((target) =>
    target.displayStatus === "in_progress"
    || (target.displayStatus === "completed" && target.endDate >= today),
  );
  const achievedCount = targets.filter((target) => target.displayStatus === "completed").length;
  const inProgressCount = targets.filter((target) => target.displayStatus === "in_progress").length;
  const expiredCount = targets.filter((target) => target.displayStatus === "expired").length;
  const percentages = targets
    .filter((target) => target.displayStatus !== "paused" && target.progressPercent !== null)
    .map((target) => target.progressPercent!);
  const overall = percentages.length
    ? percentages.reduce((total, percent) => total + percent, 0) / percentages.length
    : 0;
  const shownTargets = management
    ? targets
    : [...activeTargets, ...targets.filter((target) => target.displayStatus === "paused")]
      .slice(0, 3);
  const periodRange = getTargetDateRange(form.period, form.periodDate, form.customEndDate);

  return (
    <section className="space-y-5" aria-labelledby="targets-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="targets-heading" className="text-xl font-semibold tracking-tight">
            {management ? "All targets" : "Targets & Achievements"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track progress automatically from your bookings, customers, and finance records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!management && (
            <Button variant="outline" render={<Link href="/targets" />}>
              View all targets <ArrowUpRight aria-hidden="true" />
            </Button>
          )}
          <Button onClick={openNewTarget}>
            <Plus aria-hidden="true" /> Set a target
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard icon={<TargetIcon />} label="Active targets" value={activeTargets.length} detail="Current period" />
        <SummaryCard icon={<Trophy />} label="Targets achieved" value={achievedCount} detail="Goal reached" />
        <SummaryCard icon={<Flag />} label="In progress" value={inProgressCount} detail="Still working toward goal" />
        <SummaryCard icon={<Clock3 />} label="Targets expired" value={expiredCount} detail="Period ended before goal" />
        <SummaryCard
          icon={<Sparkles />}
          label="Overall achievement"
          value={`${Math.round(overall)}%`}
          detail={`${expiredCount} expired · ${targets.filter((target) => target.displayStatus === "paused").length} paused`}
        />
      </div>

      {targets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center px-6 py-10 text-center">
            <span className="mb-3 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <TargetIcon aria-hidden="true" />
            </span>
            <h3 className="font-semibold">Set your first business target</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Choose a metric and period. Progress will be calculated from your existing business records.
            </p>
            <Button className="mt-4" onClick={openNewTarget}><Plus aria-hidden="true" /> Create a target</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {!management && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Your targets</h3>
                <p className="text-sm text-muted-foreground">Live progress for your current goals.</p>
              </div>
              <Link href="/targets" className="text-sm font-medium text-primary hover:underline">
                Manage targets
              </Link>
            </div>
          )}
          {management && targets.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{targets.length} target{targets.length === 1 ? "" : "s"}</span>
              <span aria-hidden="true">·</span>
              <span>Historical achievements remain available here</span>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {shownTargets.map((target) => (
              <TargetCard
                key={target.id}
                target={target}
                management={management}
                onEdit={openEditTarget}
                onPause={toggleTarget}
                onDelete={setPendingDelete}
              />
            ))}
          </div>
          {!management && targets.length > shownTargets.length && (
            <div className="text-center">
              <Button variant="outline" render={<Link href="/targets" />}>
                View all {targets.length} targets <ArrowUpRight aria-hidden="true" />
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit target" : "Create a target"}</DialogTitle>
            <DialogDescription>
              Progress is calculated from existing records. No manual achievement updates are needed.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitTarget} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target-name">Target name</Label>
              <Input
                id="target-name"
                required
                maxLength={100}
                placeholder="e.g. November booking goal"
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="target-metric">Metric</Label>
                <select
                  id="target-metric"
                  value={form.metric}
                  onChange={(event) => updateForm("metric", event.target.value as TargetMetric)}
                  className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                >
                  {METRICS.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-value">Target value {isMoney(form.metric) ? `(${form.currency})` : ""}</Label>
                <Input
                  id="target-value"
                  required
                  type="number"
                  min="0.01"
                  step={isMoney(form.metric) ? "0.01" : "1"}
                  value={form.targetValue}
                  onChange={(event) => updateForm("targetValue", event.target.value)}
                  placeholder={isMoney(form.metric) ? "500000" : "100"}
                />
              </div>
            </div>
            {isMoney(form.metric) && (
              <div className="space-y-2">
                <Label htmlFor="target-currency">Currency</Label>
                <select
                  id="target-currency"
                  value={form.currency}
                  onChange={(event) => updateForm("currency", event.target.value)}
                  className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                >
                  {CURRENCY_CODES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency} · {CURRENCIES[currency].name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="target-period">Period</Label>
                <select
                  id="target-period"
                  value={form.period}
                  onChange={(event) => updateForm("period", event.target.value as TargetPeriod)}
                  className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                >
                  {PERIODS.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-period-date">{form.period === "custom" ? "Start date" : "Choose a date in the period"}</Label>
                <Input
                  id="target-period-date"
                  type="date"
                  required
                  value={form.periodDate}
                  onChange={(event) => updateForm("periodDate", event.target.value)}
                />
              </div>
              {form.period === "custom" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="target-end-date">End date</Label>
                  <Input
                    id="target-end-date"
                    type="date"
                    required
                    min={form.periodDate}
                    value={form.customEndDate}
                    onChange={(event) => updateForm("customEndDate", event.target.value)}
                  />
                </div>
              )}
            </div>
            {periodRange && (
              <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                {targetPeriodLabel(form.period)} dates: {formatDate(periodRange.startDate)} – {formatDate(periodRange.endDate)} (India time)
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="target-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="target-description"
                maxLength={500}
                rows={3}
                placeholder="Add a note about this goal"
                value={form.description}
                onChange={(event) => updateForm("description", event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending || !periodRange}>
                {isPending ? "Saving…" : editing ? "Save changes" : "Create target"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this target?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.name}” will be removed from target tracking. Business records are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => { event.preventDefault(); removeTarget(); }}
            >
              {isPending ? "Deleting…" : "Delete target"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {celebrationQueue[0] && (
        <Celebration
          target={celebrationQueue[0]}
          onClose={() => setCelebrationQueue((queue) => queue.slice(1))}
        />
      )}
    </section>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  detail: string;
}) {
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        </div>
        <span className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</span>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{detail}</CardContent>
    </Card>
  );
}
