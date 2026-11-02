"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createExpense, deleteExpense } from "@/actions/expenses";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SelectionCheckbox } from "@/components/shared/selection-checkbox";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CURRENCIES,
  CURRENCY_CODES,
  formatMoney,
  type CurrencyCode,
} from "@/lib/finance/currency";
import { formatDate } from "@/lib/format";
import { reportBulkDelete, runBulkDelete } from "@/lib/bulk-delete";
import type { FinanceExpense } from "@/types/models";

export function BookingExpensesPanel({
  bookingId,
  currency,
  expenses,
  today,
}: {
  bookingId: string;
  currency: CurrencyCode;
  expenses: FinanceExpense[];
  today: string;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

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
        toast.success("Expense recorded");
        form.reset();
        router.refresh();
      } catch (error) {
        console.error("Booking expense creation action failed:", error);
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
        toast.success("Expense removed");
        router.refresh();
      } catch (error) {
        console.error("Booking expense deletion action failed:", error);
        toast.error("Could not remove the expense. Please try again.");
      }
    });
  }

  return (
    <>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Booking expenses</CardTitle>
          <CardDescription>
            Record costs for this booking. Expenses are also included in Finance
            reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <form className="space-y-4" onSubmit={submitExpense}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="booking-expense-date">Date</Label>
                <Input
                  id="booking-expense-date"
                  name="date"
                  type="date"
                  defaultValue={today}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking-expense-category">Category</Label>
                <Input
                  id="booking-expense-category"
                  name="category"
                  maxLength={80}
                  placeholder="Transport, lodging…"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-expense-description">Description</Label>
              <Input
                id="booking-expense-description"
                name="description"
                maxLength={160}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="booking-expense-amount">Amount</Label>
                <Input
                  id="booking-expense-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking-expense-currency">Currency</Label>
                <select
                  id="booking-expense-currency"
                  name="currency"
                  defaultValue={currency}
                  className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                >
                  {CURRENCY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code} ({CURRENCIES[code].name})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-expense-vendor">Vendor (optional)</Label>
              <Input
                id="booking-expense-vendor"
                name="vendor"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-expense-note">Notes (optional)</Label>
              <Textarea
                id="booking-expense-note"
                name="note"
                maxLength={1000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-expense-receipt">
                Receipt (optional)
              </Label>
              <Input
                id="booking-expense-receipt"
                name="receipt"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
              />
              <p className="text-muted-foreground text-xs">
                PDF, JPEG, PNG, or WebP up to 10 MB.
              </p>
            </div>
            <Button type="submit" disabled={saving}>
              <Plus className="mr-2 size-4" />{" "}
              {saving ? "Saving…" : "Add expense"}
            </Button>
          </form>

          <div className="space-y-3">
            {expenses.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No expenses recorded for this booking.
              </p>
            ) : (
              <>
                <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <SelectionCheckbox
                      checked={expenses.every((expense) =>
                        selectedIds.has(expense.id),
                      )}
                      indeterminate={
                        expenses.some((expense) =>
                          selectedIds.has(expense.id),
                        ) &&
                        !expenses.every((expense) =>
                          selectedIds.has(expense.id),
                        )
                      }
                      onChange={(event) => {
                        setSelectedIds(
                          event.target.checked
                            ? new Set(expenses.map((expense) => expense.id))
                            : new Set(),
                        );
                      }}
                      label="Select all booking expenses"
                    />
                    Select all
                  </label>
                  <span className="flex items-center gap-3 text-sm">
                    {selectedIds.size > 0 && (
                      <span>{selectedIds.size} selected</span>
                    )}
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
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="flex min-w-0 items-start justify-between gap-3 rounded-md border p-3"
                  >
                    <SelectionCheckbox
                      checked={selectedIds.has(expense.id)}
                      onChange={(event) => {
                        setSelectedIds((current) => {
                          const nextSelected = new Set(current);
                          if (event.target.checked)
                            nextSelected.add(expense.id);
                          else nextSelected.delete(expense.id);
                          return nextSelected;
                        });
                      }}
                      label={`Select expense ${expense.description}`}
                    />
                    <div className="min-w-0 space-y-1">
                      <p className="truncate font-medium">
                        {expense.description}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatDate(expense.date)} · {expense.category}
                        {expense.vendor ? ` · ${expense.vendor}` : ""}
                      </p>
                      {expense.note && (
                        <p className="text-muted-foreground text-xs">
                          {expense.note}
                        </p>
                      )}
                      {expense.receipt && (
                        <a
                          className="text-primary inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                          href={`/api/finance/expenses/${expense.id}/receipt`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {expense.receipt.contentType === "application/pdf" ? (
                            <FileText className="size-3.5" />
                          ) : (
                            <Receipt className="size-3.5" />
                          )}
                          {expense.receipt.name}
                        </a>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <strong className="text-sm">
                        {formatMoney(
                          expense.money.amount,
                          expense.money.currency,
                        )}
                      </strong>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${expense.description}`}
                        disabled={deleting}
                        onClick={() => setExpenseToDelete(expense.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={expenseToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setExpenseToDelete(null);
        }}
        title="Delete this expense?"
        description="The expense will be removed from finance reports. The change will be recorded in the audit log."
        confirmLabel="Delete expense"
        onConfirm={() => {
          if (expenseToDelete) removeExpense(expenseToDelete);
          setExpenseToDelete(null);
        }}
      />
      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Delete ${selectedIds.size} selected expenses?`}
        description="The selected expenses will be removed from finance reports. The changes will be recorded in the audit log."
        confirmLabel="Delete selected"
        onConfirm={async () => {
          const result = await runBulkDelete([...selectedIds], deleteExpense);
          reportBulkDelete(result, "expense");
          setSelectedIds(new Set(result.failedIds));
          if (result.deletedIds.length > 0) router.refresh();
        }}
      />
    </>
  );
}
