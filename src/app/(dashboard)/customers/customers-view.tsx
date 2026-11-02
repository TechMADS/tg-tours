"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, MoreHorizontal, Pencil, Plus, Search, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { deleteCustomer, fetchCustomers } from "@/actions/customers";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SelectionCheckbox } from "@/components/shared/selection-checkbox";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { CustomersPage } from "@/lib/data/customers";
import type { Customer } from "@/types/models";
import { formatDate } from "@/lib/format";
import { downloadPdfReport } from "@/lib/reports/pdf";
import { reportBulkDelete, runBulkDelete } from "@/lib/bulk-delete";
import { CustomerFormDialog } from "./customer-form";

export function CustomersView({
  initial,
  canEdit,
  canManage,
}: {
  initial: CustomersPage;
  canEdit: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState(initial.items);
  const [next, setNext] = useState(initial.nextCursor);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, startLoad] = useTransition();
  const [downloadingReport, setDownloadingReport] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const canDelete = canManage;

  async function downloadCustomerReport() {
    setDownloadingReport(true);
    try {
      const query = q;
      let page = await fetchCustomers(query);
      const customers = [...page.items];
      while (page.nextCursor) {
        page = await fetchCustomers(query, page.nextCursor);
        customers.push(...page.items);
      }

      await downloadPdfReport({
        title: "Customers report",
        period: query.trim() ? `Search: ${query.trim()}` : "All customers",
        fileName: "customers",
        summary: [
          ["Customers", String(customers.length)],
          ["Search", query.trim() || "None"],
        ],
        sections: [{
          title: "Customer register",
          columns: ["Name", "Phone", "Email", "Country", "Invoice number(s)", "Date of birth"],
          rows: customers.map((customer) => [
            customer.name,
            customer.phone || "—",
            customer.email || "—",
            customer.country || "—",
            customer.invoiceNumbers.join(", ") || "—",
            customer.dateOfBirth ? formatDate(customer.dateOfBirth) : "—",
          ]),
        }],
      });
    } catch (error) {
      console.error("Customer report PDF download failed:", error);
      toast.error("Could not download the customer report. Please try again.");
    } finally {
      setDownloadingReport(false);
    }
  }

  const load = useCallback((query: string, cursor?: string | null, append = false) => {
    startLoad(async () => {
      const page = await fetchCustomers(query, cursor);
      setItems((prev) => (append ? [...prev, ...page.items] : page.items));
      setNext(page.nextCursor);
    });
  }, []);

  // Debounced search; skip the first run because the server already sent page 1
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSelectedIds(new Set());
            }}
            placeholder="Search name or phone…"
            className="pl-9"
          />
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-none"
            disabled={downloadingReport}
            onClick={downloadCustomerReport}
          >
            <Download className="mr-2 size-4" />
            {downloadingReport ? "Preparing report…" : "Download report"}
          </Button>
          {canEdit && (
            <Button className="flex-1 sm:flex-none" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="mr-2 size-4" /> Add customer
            </Button>
          )}
        </div>
      </div>
      {canDelete && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
          <span className="text-sm">{selectedIds.size} selected</span>
          <Button type="button" variant="destructive" onClick={() => setConfirmBulkDelete(true)}>
            <Trash2 className="mr-2 size-4" /> Delete selected
          </Button>
        </div>
      )}

      <div className="space-y-3 md:hidden">
        {canDelete && items.length > 0 && (
          <label className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
            <SelectionCheckbox
              checked={items.every((customer) => selectedIds.has(customer.id))}
              indeterminate={items.some((customer) => selectedIds.has(customer.id))
                && !items.every((customer) => selectedIds.has(customer.id))}
              onChange={(event) => {
                setSelectedIds(event.target.checked
                  ? new Set(items.map((customer) => customer.id))
                  : new Set());
              }}
              label="Select all loaded customers"
            />
            Select all loaded customers
          </label>
        )}
        {items.length === 0 ? (
          <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
            {loading ? "Loading…" : q ? "No customers match your search." : "No customers yet. Add your first one."}
          </div>
        ) : items.map((customer) => (
          <article key={customer.id} className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                {canDelete && (
                  <SelectionCheckbox
                    checked={selectedIds.has(customer.id)}
                    onChange={(event) => {
                      setSelectedIds((current) => {
                        const nextSelected = new Set(current);
                        if (event.target.checked) nextSelected.add(customer.id);
                        else nextSelected.delete(customer.id);
                        return nextSelected;
                      });
                    }}
                    label={`Select customer ${customer.name}`}
                  />
                )}
                <Link
                  href={`/customers/${customer.id}`}
                  className="min-w-0 break-words font-medium hover:underline"
                >
                  {customer.name}
                </Link>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`Actions for ${customer.name}`}
                  className={buttonVariants({ variant: "ghost", size: "icon" })}
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => router.push(`/customers/${customer.id}`)}>
                    <User className="mr-2 size-4" /> View
                  </DropdownMenuItem>
                  {canEdit && (
                    <DropdownMenuItem onClick={() => { setEditing(customer); setFormOpen(true); }}>
                      <Pencil className="mr-2 size-4" /> Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleting(customer)}
                    >
                      <Trash2 className="mr-2 size-4" /> Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <dl className="grid min-w-0 grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Phone</dt>
                <dd className="break-words">{customer.phone || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="break-all">{customer.email || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Country</dt>
                <dd className="break-words">{customer.country || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Date of birth</dt>
                <dd>{customer.dateOfBirth ? formatDate(customer.dateOfBirth) : "—"}</dd>
              </div>
              <div className="min-w-0 min-[420px]:col-span-2">
                <dt className="text-xs text-muted-foreground">Invoice number</dt>
                <dd className="break-words">{customer.invoiceNumbers.join(", ") || "—"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {canDelete && (
                <TableHead className="w-10">
                  <SelectionCheckbox
                    checked={items.length > 0 && items.every((customer) => selectedIds.has(customer.id))}
                    indeterminate={items.some((customer) => selectedIds.has(customer.id))
                      && !items.every((customer) => selectedIds.has(customer.id))}
                    onChange={(event) => {
                      setSelectedIds(event.target.checked
                        ? new Set(items.map((customer) => customer.id))
                        : new Set());
                    }}
                    label="Select all loaded customers"
                  />
                </TableHead>
              )}
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Invoice number</TableHead>
              <TableHead>Date of birth</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canDelete ? 8 : 7} className="text-muted-foreground h-24 text-center">
                  {loading ? "Loading…" : q ? "No customers match your search." : "No customers yet. Add your first one."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((c) => (
                <TableRow key={c.id}>
                  {canDelete && (
                    <TableCell>
                      <SelectionCheckbox
                        checked={selectedIds.has(c.id)}
                        onChange={(event) => {
                          setSelectedIds((current) => {
                            const nextSelected = new Set(current);
                            if (event.target.checked) nextSelected.add(c.id);
                            else nextSelected.delete(c.id);
                            return nextSelected;
                          });
                        }}
                        label={`Select customer ${c.name}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Link href={`/customers/${c.id}`} className="flex items-center gap-2 font-medium hover:underline">
                      <User className="text-muted-foreground size-4" /> {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.phone || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email || "—"}</TableCell>
                  <TableCell>{c.country || "—"}</TableCell>
                  <TableCell>
                    {c.invoiceNumbers.length ? (
                      <div className="flex flex-col gap-1">
                        {c.invoiceNumbers.map((invoiceNo) => (
                          <span key={invoiceNo} className="whitespace-nowrap">{invoiceNo}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.dateOfBirth ? formatDate(c.dateOfBirth) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label="Row actions"
                        className={buttonVariants({ variant: "ghost", size: "icon" })}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/customers/${c.id}`)}>
                          <User className="mr-2 size-4" /> View
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem onClick={() => { setEditing(c); setFormOpen(true); }}>
                            <Pencil className="mr-2 size-4" /> Edit
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleting(c)}
                          >
                            <Trash2 className="mr-2 size-4" /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{items.length} shown</span>
        {next && (
          <Button variant="outline" disabled={loading} onClick={() => load(q, next, true)}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        )}
      </div>

      {canEdit && <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editing}
        onSaved={() => load(q)}
      />}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this customer?"
        description={`"${deleting?.name ?? ""}" will be removed from the list. Past bookings and invoices keep their history.`}
        onConfirm={async () => {
          if (!deleting) return;
          const res = await deleteCustomer(deleting.id);
          if (res.ok) { toast.success("Customer deleted"); load(q); }
          else toast.error(res.error);
        }}
      />
      {canDelete && (
        <ConfirmDialog
          open={confirmBulkDelete}
          onOpenChange={setConfirmBulkDelete}
          title={`Delete ${selectedIds.size} selected customers?`}
          description="Customers in active bookings will be skipped. All other selected customers will be removed from the list."
          confirmLabel="Delete selected"
          onConfirm={async () => {
            const result = await runBulkDelete([...selectedIds], deleteCustomer);
            reportBulkDelete(result, "customer");
            setSelectedIds(new Set(result.failedIds));
            if (result.deletedIds.length > 0) load(q);
          }}
        />
      )}
    </div>
  );
}