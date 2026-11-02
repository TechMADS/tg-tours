"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarDays,
  FileText,
  Plus,
  Receipt,
  Search,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { createExpense, deleteExpense } from "@/actions/expenses";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReportPdfButton } from "@/components/shared/report-pdf-button";
import { SelectionCheckbox } from "@/components/shared/selection-checkbox";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { CURRENCIES, CURRENCY_CODES, formatMoney, type CurrencyCode } from "@/lib/finance/currency";
import { formatDate } from "@/lib/format";
import { formatReportAmount } from "@/lib/reports/pdf";
import { reportBulkDelete, runBulkDelete } from "@/lib/bulk-delete";
import type { FinanceExpense } from "@/types/models";

const CATEGORIES = [
  "Staff salary",
  "Rent",
  "Office supplies",
  "Utilities",
  "Equipment",
  "Software",
  "Marketing",
  "Travel",
  "Maintenance",
  "Other",
];

type Period = "today" | "week" | "month" | "year" | "all-time" | "custom";
type DateRange = { from: string; to: string };

type Props = {
  expenses: FinanceExpense[];
  today: string;
  canManage: boolean;
};

function sumByCurrency(expenses: FinanceExpense[]) {
  const totals = new Map<CurrencyCode, number>();
  for (const expense of expenses) {
    const currency = expense.money.currency;
    totals.set(currency, (totals.get(currency) ?? 0) + expense.money.amount);
  }
  return Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function AmountList({ expenses, emptyLabel }: { expenses: FinanceExpense[]; emptyLabel: string }) {
  const totals = sumByCurrency(expenses);
  if (!totals.length) return <span className="text-muted-foreground">{emptyLabel}</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {totals.map(([currency, amount]) => (
        <span key={currency}>{formatMoney(amount, currency)}</span>
      ))}
    </span>
  );
}

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

function ExpenseReceiptLink({ expense }: { expense: FinanceExpense }) {
  if (!expense.receipt) return null;
  return (
    <a
      className="inline-flex max-w-full items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
      href={`/api/finance/expenses/${expense.id}/receipt`}
      target="_blank"
      rel="noreferrer"
    >
      {expense.receipt.contentType === "application/pdf"
        ? <FileText className="size-3.5 shrink-0" />
        : <Receipt className="size-3.5 shrink-0" />}
      <span className="truncate">{expense.receipt.name}</span>
    </a>
  );
}

export function CompanyExpensesDashboard({ expenses, today, canManage }: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [period, setPeriod] = useState<Period>("all-time");
  const [customRange, setCustomRange] = useState<DateRange>({ from: "", to: "" });
  const range = period === "custom" ? customRange : periodRange(period, today);
  const { from, to } = range;
  const validDateRange = !(from && to && from > to);

  const filteredExpenses = useMemo(() => {
    if (!validDateRange) return [];
    const query = search.trim().toLocaleLowerCase();
    return expenses.filter((expense) => {
      const date = expense.date.slice(0, 10);
      if (from && date < from) return false;
      if (to && date > to) return false;
      if (category !== "all" && expense.category !== category) return false;
      if (!query) return true;
      return [
        expense.description,
        expense.category,
        expense.payee,
        expense.vendor,
        expense.note,
      ].some((value) => value?.toLocaleLowerCase().includes(query));
    });
  }, [category, expenses, from, search, to, validDateRange]);

  const monthExpenses = expenses.filter((expense) => expense.date.slice(0, 7) === today.slice(0, 7));
  const categories = Array.from(new Set(expenses.map((expense) => expense.category)))
    .sort((a, b) => a.localeCompare(b));

  function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startSaving(async () => {
      try {
        const result = await createExpense(formData);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Company expense recorded");
        form.reset();
        setDialogOpen(false);
        router.refresh();
      } catch (error) {
        console.error("Company expense creation action failed:", error);
        toast.error("Could not save the expense. Please try again.");
      }
    });
  }

  function removeExpense(id: string) {
    startDeleting(async () => {
      try {
        const result = await deleteExpense(id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Company expense removed");
        router.refresh();
      } catch (error) {
        console.error("Company expense deletion action failed:", error);
        toast.error("Could not remove the expense. Please try again.");
      }
    });
  }

  const hasFilters = Boolean(search || category !== "all" || from || to);
  const periodLabel = period === "custom"
    ? `Custom range: ${from || "Any date"} to ${to || "Any date"}`
    : period === "all-time"
      ? "All time"
      : `${period === "week" ? "This week" : period === "month" ? "This month" : period === "year" ? "This year" : "Today"} (${from} to ${to})`;
  const pdfReport = {
    title: "Company expenses report",
    period: periodLabel,
    fileName: `company-expenses-${period}`,
    summary: [
      ["Expense entries", String(filteredExpenses.length)],
      ["Category filter", category === "all" ? "All categories" : category],
      ["Search", search.trim() || "None"],
      ...sumByCurrency(filteredExpenses).map(([currency, amount]) => [
        `Total ${currency}`,
        formatReportAmount(amount, currency),
      ]),
    ] as [string, string][],
    sections: [{
      title: "Expense register",
      columns: ["Date", "Description", "Category", "Paid to", "Currency", "Amount", "Note"],
      rows: filteredExpenses.map((expense) => [
        formatDate(expense.date),
        expense.description,
        expense.category,
        expense.payee || expense.vendor || "—",
        expense.money.currency,
        formatReportAmount(expense.money.amount, expense.money.currency),
        expense.note || "",
      ]),
    }],
  };

  function selectPeriod(next: Period) {
    setPeriod(next);
    setSelectedIds(new Set());
    if (next !== "custom") setCustomRange(periodRange(next, today));
  }

  function changeDate(key: keyof DateRange, value: string) {
    setCustomRange((current) => ({ ...current, [key]: value }));
    setPeriod("custom");
    setSelectedIds(new Set());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-end gap-3">
        <div className="w-full max-w-xs space-y-2">
          <Label htmlFor="company-expense-period">Period</Label>
          <select
            id="company-expense-period"
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
        <div className="flex flex-wrap justify-end gap-2">
          {validDateRange && <ReportPdfButton report={pdfReport} />}
          {canManage && (
            <Button type="button" onClick={() => setDialogOpen(true)}>
              <Plus /> Add expense
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardDescription>Company expenses</CardDescription>
              <CardTitle className="text-xl">{expenses.length} entries</CardTitle>
            </div>
            <Building2 className="size-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-sm">
            <AmountList expenses={expenses} emptyLabel="No expenses recorded yet" />
            <p className="mt-1 text-xs text-muted-foreground">All time · totals stay grouped by currency</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardDescription>This month</CardDescription>
              <CardTitle className="text-xl">{monthExpenses.length} entries</CardTitle>
            </div>
            <CalendarDays className="size-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-sm">
            <AmountList expenses={monthExpenses} emptyLabel="No expenses this month" />
            <p className="mt-1 text-xs text-muted-foreground">{today.slice(0, 7)} · grouped by currency</p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-2 xl:col-span-1">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardDescription>Filtered results</CardDescription>
              <CardTitle className="text-xl">{filteredExpenses.length} entries</CardTitle>
            </div>
            <Wallet className="size-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-sm">
            <AmountList expenses={filteredExpenses} emptyLabel="No matching expenses" />
            <p className="mt-1 text-xs text-muted-foreground">Based on the filters below</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expense register</CardTitle>
          <CardDescription>
            Search and review payroll, rent, purchases, and other company spending.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.7fr)_repeat(2,minmax(9rem,0.65fr))_auto]">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search expenses"
                className="pl-9"
                placeholder="Search expenses or payees…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSelectedIds(new Set());
                }}
              />
            </div>
            <select
              aria-label="Filter by category"
              className="border-input bg-background h-10 min-w-0 rounded-md border px-3 text-sm"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setSelectedIds(new Set());
              }}
            >
              <option value="all">All categories</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <Input aria-label="From date" type="date" value={from} onChange={(event) => changeDate("from", event.target.value)} />
            <Input aria-label="To date" type="date" value={to} onChange={(event) => changeDate("to", event.target.value)} />
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                className="sm:col-span-2 xl:col-span-1"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                  setSelectedIds(new Set());
                  selectPeriod("all-time");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
          {!validDateRange && (
            <p className="text-sm text-destructive">The start date must be on or before the end date.</p>
          )}
          {canManage && filteredExpenses.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
              <label className="flex items-center gap-2 text-sm">
                <SelectionCheckbox
                  checked={filteredExpenses.every((expense) => selectedIds.has(expense.id))}
                  indeterminate={filteredExpenses.some((expense) => selectedIds.has(expense.id))
                    && !filteredExpenses.every((expense) => selectedIds.has(expense.id))}
                  onChange={(event) => {
                    setSelectedIds(event.target.checked
                      ? new Set(filteredExpenses.map((expense) => expense.id))
                      : new Set());
                  }}
                  label="Select all filtered expenses"
                />
                Select all filtered expenses
              </label>
              <span className="flex items-center gap-3 text-sm">
                {selectedIds.size > 0 && <span>{selectedIds.size} selected</span>}
                <Button
                  type="button"
                  variant="destructive"
                  disabled={selectedIds.size === 0 || deleting}
                  onClick={() => setConfirmBulkDelete(true)}
                >
                  <Trash2 className="mr-2 size-4" /> Delete selected
                </Button>
              </span>
            </div>
          )}
          {filteredExpenses.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center">
              <Users className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">
                {expenses.length ? "No expenses match these filters" : "No company expenses yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {expenses.length
                  ? "Try changing or clearing the filters."
                  : "Record salaries, rent, purchases, and other business costs here."}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {filteredExpenses.map((expense) => (
                  <article key={expense.id} className="min-w-0 rounded-lg border p-4">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      {canManage && (
                        <SelectionCheckbox
                          checked={selectedIds.has(expense.id)}
                          onChange={(event) => {
                            setSelectedIds((current) => {
                              const nextSelected = new Set(current);
                              if (event.target.checked) nextSelected.add(expense.id);
                              else nextSelected.delete(expense.id);
                              return nextSelected;
                            });
                          }}
                          label={`Select expense ${expense.description}`}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="break-words font-medium">{expense.description}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(expense.date)} · {expense.category}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold">{formatMoney(expense.money.amount, expense.money.currency)}</p>
                        {canManage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="mt-1"
                            aria-label={`Delete ${expense.description}`}
                            disabled={deleting}
                            onClick={() => setExpenseToDelete(expense.id)}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      <p><span className="text-muted-foreground">Paid to: </span>{expense.payee || expense.vendor || "—"}</p>
                      {expense.note && <p className="break-words text-muted-foreground">{expense.note}</p>}
                      <ExpenseReceiptLink expense={expense} />
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      {canManage && (
                        <th className="px-3 py-3 font-medium">
                          <SelectionCheckbox
                            checked={filteredExpenses.every((expense) => selectedIds.has(expense.id))}
                            indeterminate={filteredExpenses.some((expense) => selectedIds.has(expense.id))
                              && !filteredExpenses.every((expense) => selectedIds.has(expense.id))}
                            onChange={(event) => {
                              setSelectedIds(event.target.checked
                                ? new Set(filteredExpenses.map((expense) => expense.id))
                                : new Set());
                            }}
                            label="Select all filtered expenses"
                          />
                        </th>
                      )}
                      <th className="px-3 py-3 font-medium">Date</th>
                      <th className="px-3 py-3 font-medium">Expense</th>
                      <th className="px-3 py-3 font-medium">Category</th>
                      <th className="px-3 py-3 font-medium">Paid to</th>
                      <th className="px-3 py-3 text-right font-medium">Amount</th>
                      {canManage && <th className="px-3 py-3 text-right font-medium">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((expense) => (
                      <tr key={expense.id} className="border-b last:border-0">
                        {canManage && (
                          <td className="px-3 py-3">
                            <SelectionCheckbox
                              checked={selectedIds.has(expense.id)}
                              onChange={(event) => {
                                setSelectedIds((current) => {
                                  const nextSelected = new Set(current);
                                  if (event.target.checked) nextSelected.add(expense.id);
                                  else nextSelected.delete(expense.id);
                                  return nextSelected;
                                });
                              }}
                              label={`Select expense ${expense.description}`}
                            />
                          </td>
                        )}
                        <td className="whitespace-nowrap px-3 py-3">{formatDate(expense.date)}</td>
                        <td className="max-w-64 px-3 py-3">
                          <p className="break-words font-medium">{expense.description}</p>
                          {expense.note && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{expense.note}</p>}
                          <ExpenseReceiptLink expense={expense} />
                        </td>
                        <td className="px-3 py-3">{expense.category}</td>
                        <td className="max-w-48 break-words px-3 py-3">{expense.payee || expense.vendor || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-medium">
                          {formatMoney(expense.money.amount, expense.money.currency)}
                        </td>
                        {canManage && (
                          <td className="px-3 py-3 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Delete ${expense.description}`}
                              disabled={deleting}
                              onClick={() => setExpenseToDelete(expense.id)}
                            >
                              <Trash2 />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <>
          <ConfirmDialog
            open={confirmBulkDelete}
            onOpenChange={setConfirmBulkDelete}
            title={`Delete ${selectedIds.size} selected expenses?`}
            description="The selected expense records will be removed from finance. This action cannot be undone."
            confirmLabel="Delete selected"
            onConfirm={async () => {
              const result = await runBulkDelete([...selectedIds], deleteExpense);
              reportBulkDelete(result, "expense");
              setSelectedIds(new Set(result.failedIds));
              if (result.deletedIds.length > 0) router.refresh();
            }}
          />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Add company expense</DialogTitle>
                <DialogDescription>
                  Add salaries, rent, supplies, or other costs. This record will not be linked to a booking.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={submitExpense}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company-expense-date">Date</Label>
                    <Input id="company-expense-date" name="date" type="date" defaultValue={today} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-expense-category">Category</Label>
                    <select
                      id="company-expense-category"
                      name="category"
                      defaultValue="Staff salary"
                      className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                      required
                    >
                      {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-expense-description">Description</Label>
                  <Input
                    id="company-expense-description"
                    name="description"
                    maxLength={160}
                    placeholder="October salary, office rent, laptop purchase…"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-expense-payee">Employee or vendor name</Label>
                  <Input
                    id="company-expense-payee"
                    name="payee"
                    maxLength={120}
                    placeholder="Employee name or company/vendor"
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company-expense-amount">Amount</Label>
                    <Input id="company-expense-amount" name="amount" type="number" step="0.01" min="0.01" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-expense-currency">Currency</Label>
                    <select
                      id="company-expense-currency"
                      name="currency"
                      defaultValue="INR"
                      className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                    >
                      {CURRENCY_CODES.map((code) => (
                        <option key={code} value={code}>{code} ({CURRENCIES[code].name})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-expense-receipt">Receipt (optional)</Label>
                  <Input
                    id="company-expense-receipt"
                    name="receipt"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                  />
                  <p className="text-xs text-muted-foreground">PDF, JPEG, PNG, or WebP up to 10 MB.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-expense-note">Notes (optional)</Label>
                  <Textarea id="company-expense-note" name="note" maxLength={1000} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    <Plus /> {saving ? "Saving…" : "Record expense"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <ConfirmDialog
            open={expenseToDelete !== null}
            onOpenChange={(open) => {
              if (!open) setExpenseToDelete(null);
            }}
            title="Delete this company expense?"
            description="The expense will be removed from finance reports. The change will be recorded in the audit log."
            confirmLabel="Delete expense"
            onConfirm={() => {
              if (expenseToDelete) removeExpense(expenseToDelete);
              setExpenseToDelete(null);
            }}
          />
        </>
      )}
    </div>
  );
}
