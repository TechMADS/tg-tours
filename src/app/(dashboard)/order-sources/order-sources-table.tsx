"use client";
import { useState, useTransition } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteOrderSource, seedOrderSources } from "@/actions/order-sources";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";
import { reportBulkDelete, runBulkDelete } from "@/lib/bulk-delete";
import type { OrderSource } from "@/types/models";
import { OrderSourceForm } from "./order-source-form";

export function OrderSourcesTable({
    data,
    canManage,
}: {
    data: OrderSource[];
    canManage: boolean;
}) {
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<OrderSource | null>(null);
    const [deleting, setDeleting] = useState<OrderSource | null>(null);
    const [seeding, startSeed] = useTransition();

    const openCreate = () => { setEditing(null); setFormOpen(true); };
    const openEdit = (s: OrderSource) => { setEditing(s); setFormOpen(true); };

    const actionColumn: ColumnDef<OrderSource> = {
            id: "actions",
            header: "",
            enableSorting: false,
            cell: ({ row }) => (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        aria-label="Row actions"
                        className={buttonVariants({ variant: "ghost", size: "icon" })}
                    >
                        <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(row.original)}>
                            <Pencil className="mr-2 size-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleting(row.original)}
                        >
                            <Trash2 className="mr-2 size-4" /> Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        };
    const columns: ColumnDef<OrderSource>[] = [
        { accessorKey: "name", header: "Name", cell: (c) => <span className="font-medium">{c.getValue<string>()}</span> },
        {
            id: "status",
            header: "Status",
            accessorFn: (r) => (r.active ? "Active" : "Inactive"),
            cell: (c) => (
                <Badge variant={c.row.original.active ? "default" : "secondary"}>
                    {c.getValue<string>()}
                </Badge>
            ),
        },
        {
            accessorKey: "notes",
            header: "Notes",
            enableSorting: false,
            cell: (c) => <span className="text-muted-foreground">{c.getValue<string>() || "—"}</span>,
        },
        {
            accessorKey: "createdAt",
            header: "Created",
            cell: (c) => formatDate(c.getValue<string>()),
        },
        ...(canManage ? [actionColumn] : []),
    ];

    return (
        <>
            {data.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                        <p className="font-medium">No order sources yet</p>
                        <p className="text-muted-foreground max-w-sm text-sm">
                            Add your own, or start with common ones like Website, Instagram,
                            WhatsApp and Walk-in. You can edit them afterwards.
                        </p>
                        {canManage ? <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                            <Button className="w-full sm:w-auto" variant="outline" disabled={seeding}
                                onClick={() => startSeed(async () => {
                                    const res = await seedOrderSources();
                                    if (!res.ok) toast.error(res.error);
                                })}>
                                <Sparkles className="mr-2 size-4" /> {seeding ? "Adding…" : "Add common sources"}
                            </Button>
                            <Button className="w-full sm:w-auto" onClick={openCreate}><Plus className="mr-2 size-4" /> Add source</Button>
                        </div> : null}
                    </CardContent>
                </Card>
            ) : (
                <DataTable
                    columns={columns}
                    data={data}
                    searchPlaceholder="Search sources…"
                    toolbar={canManage
                        ? <Button onClick={openCreate}><Plus className="mr-2 size-4" /> Add source</Button>
                        : undefined}
                    bulkDelete={canManage ? {
                        getId: (source) => source.id,
                        onDelete: async (sources) => {
                            const result = await runBulkDelete(sources.map((source) => source.id), deleteOrderSource);
                            reportBulkDelete(result, "source");
                        },
                    } : undefined}
                />
            )}

            {canManage && <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing ? "Edit order source" : "New order source"}</DialogTitle>
                    </DialogHeader>
                    {/* Mounted only while open, so the form resets every time */}
                    <OrderSourceForm source={editing} onDone={() => setFormOpen(false)} />
                </DialogContent>
            </Dialog>}

            {canManage && <ConfirmDialog
                open={!!deleting}
                onOpenChange={(o) => !o && setDeleting(null)}
                title="Delete this order source?"
                description={`"${deleting?.name ?? ""}" will be removed from the list. Past records keep their history.`}
                onConfirm={async () => {
                    if (!deleting) return;
                    const res = await deleteOrderSource(deleting.id);
                    if (res.ok) toast.success("Source deleted");
                    else toast.error(res.error);
                }}
            />}
        </>
    );
}