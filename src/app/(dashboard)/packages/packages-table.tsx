"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Archive, CheckCircle2, Eye, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deletePackage, setPackageStatus } from "@/actions/packages";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable } from "@/components/shared/data-table";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoney } from "@/lib/finance/currency";
import { GROUP_LABEL, STATUS_LABEL } from "@/lib/validators/package";
import { personsLabel } from "@/lib/finance/pricing";
import { reportBulkDelete, runBulkDelete } from "@/lib/bulk-delete";
import type { PackageStatus, TravelPackage } from "@/types/models";
import { StatusBadge } from "./status-badge";

export function PackagesTable({
    data, rates, canManage,
}: { data: TravelPackage[]; rates: Record<string, number>; canManage: boolean }) {
    const router = useRouter();
    const [deleting, setDeleting] = useState<TravelPackage | null>(null);
    const [busy, startTransition] = useTransition();

    // Approximate INR value, used for sorting and the "≈" hint
    const inr = (p: TravelPackage) =>
        p.price.currency === "INR" ? p.price.amount : Math.round(p.price.amount * (rates[p.price.currency] ?? 0));

    function changeStatus(p: TravelPackage, status: PackageStatus) {
        startTransition(async () => {
            const res = await setPackageStatus(p.id, status);
            if (res.ok) toast.success(`Marked ${STATUS_LABEL[status]}`);
            else toast.error(res.error);
        });
    }

    const addButton = canManage ? (
        <Link href="/packages/new" className={buttonVariants()}>
            <Plus className="mr-2 size-4" /> Add package
        </Link>
    ) : null;

    const columns: ColumnDef<TravelPackage>[] = [
        {
            accessorKey: "name",
            header: "Package",
            cell: ({ row }) => (
                <Link href={`/packages/${row.original.id}`} className="font-medium hover:underline">
                    {row.original.name}
                </Link>
            ),
        },
        { accessorKey: "destination", header: "Destination" },
        {
            id: "group",
            header: "Group",
            accessorFn: (r) => GROUP_LABEL[r.groupType],
            cell: ({ row }) => (
                <div>
                    <p>{GROUP_LABEL[row.original.groupType]}</p>
                    <p className="text-muted-foreground text-xs">{personsLabel(row.original)}</p>
                </div>
            ),
        },
        {
            id: "duration",
            header: "Duration",
            accessorFn: (r) => r.days,
            cell: ({ row }) => `${row.original.days}D / ${row.original.nights}N`,
        },
        {
            id: "price",
            header: "Price",
            accessorFn: (r) => inr(r),
            cell: ({ row }) => {
                const p = row.original;
                return (
                    <div>
                        <span className="font-medium">{formatMoney(p.price.amount, p.price.currency)}</span>{" "}
                        <span className="text-muted-foreground text-xs">/ person</span>
                        {p.priceTiers.length > 1 && (
                            <p className="text-muted-foreground text-xs">+ {p.priceTiers.length - 1} group rate(s)</p>
                        )}
                        {p.price.currency !== "INR" && (
                            <p className="text-muted-foreground text-xs">≈ {formatMoney(inr(p), "INR")}</p>
                        )}
                    </div>
                );
            },
        },
        {
            id: "status",
            header: "Status",
            accessorFn: (r) => STATUS_LABEL[r.status],
            cell: ({ row }) => <StatusBadge status={row.original.status} />,
        },
        {
            id: "actions",
            header: "",
            enableSorting: false,
            cell: ({ row }) => {
                const p = row.original;
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            aria-label="Row actions"
                            className={buttonVariants({ variant: "ghost", size: "icon" })}
                        >
                            <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/packages/${p.id}`)}>
                                <Eye className="mr-2 size-4" /> View
                            </DropdownMenuItem>
                            {canManage && (
                                <>
                                    <DropdownMenuItem onClick={() => router.push(`/packages/${p.id}/edit`)}>
                                        <Pencil className="mr-2 size-4" /> Edit
                                    </DropdownMenuItem>
                                    {p.status !== "active" && (
                                        <DropdownMenuItem disabled={busy} onClick={() => changeStatus(p, "active")}>
                                            <CheckCircle2 className="mr-2 size-4" /> Mark Active
                                        </DropdownMenuItem>
                                    )}
                                    {p.status !== "archived" && (
                                        <DropdownMenuItem disabled={busy} onClick={() => changeStatus(p, "archived")}>
                                            <Archive className="mr-2 size-4" /> Archive
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => setDeleting(p)}
                                    >
                                        <Trash2 className="mr-2 size-4" /> Delete
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },
    ];

    return (
        <>
            {data.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                        <p className="font-medium">No packages yet</p>
                        <p className="text-muted-foreground max-w-sm text-sm">
                            Create your first tour package with price, inclusions and an itinerary.
                        </p>
                        {addButton}
                    </CardContent>
                </Card>
            ) : (
                <DataTable
                    columns={columns}
                    data={data}
                    searchPlaceholder="Search name, destination, status…"
                    toolbar={addButton}
                    bulkDelete={canManage ? {
                        getId: (pkg) => pkg.id,
                        onDelete: async (packages) => {
                            const result = await runBulkDelete(packages.map((pkg) => pkg.id), deletePackage);
                            reportBulkDelete(result, "package");
                            if (result.deletedIds.length > 0) router.refresh();
                        },
                    } : undefined}
                />
            )}

            <ConfirmDialog
                open={!!deleting}
                onOpenChange={(o) => !o && setDeleting(null)}
                title="Delete this package?"
                description={`"${deleting?.name ?? ""}" will be removed. If bookings use it, archive it instead.`}
                onConfirm={async () => {
                    if (!deleting) return;
                    const res = await deletePackage(deleting.id);
                    if (res.ok) toast.success("Package deleted");
                    else toast.error(res.error);
                }}
            />
        </>
    );
}