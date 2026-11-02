"use client";
import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Search, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { cancelMember } from "@/actions/members";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CATEGORY_LABEL, GENDER_LABEL, blockReason } from "@/lib/booking-utils";
import { formatMoney } from "@/lib/finance/currency";
import { formatDate } from "@/lib/format";
import type { Booking, Member } from "@/types/models";
import { MemberDialog } from "./member-dialog";
import Link from "next/link";

export function MembersPanel({
    booking, members, sources, canManage, canEdit,
}: {
    booking: Booking;
    members: Member[];
    sources: { id: string; name: string }[];
    canManage: boolean;
    canEdit: boolean;
}) {
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Member | null>(null);
    const [cancelling, setCancelling] = useState<Member | null>(null);

    const reason = blockReason(booking);
    const locked = booking.status === "completed" || booking.status === "cancelled";
    const term = q.trim().toLowerCase();
    const shown = members.filter((m) => !term || m.searchName.includes(term) || m.phone.includes(term));

    return (
        <Card className="mt-4">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <CardTitle>Members ({booking.memberCount})</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                    {reason && <span className="text-muted-foreground text-xs">{reason}</span>}
                    {canEdit && (
                        <Button className="w-full sm:w-auto" disabled={!!reason} onClick={() => { setEditing(null); setOpen(true); }}>
                            <Plus className="mr-2 size-4" /> Add member
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {members.length > 8 && (
                    <div className="relative max-w-xs">
                        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members…" className="pl-9" />
                    </div>
                )}

                <div className="space-y-3 md:hidden">
                    {shown.length === 0 ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                            {members.length === 0 ? "No members yet. Add the first one." : "No members match."}
                        </div>
                    ) : shown.map((member) => {
                        const cancelled = member.status === "cancelled";
                        return (
                            <article
                                key={member.id}
                                className={`space-y-3 rounded-lg border p-4 ${cancelled ? "opacity-60" : ""}`}
                            >
                                <div className="flex min-w-0 items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {member.customerId ? (
                                                <Link
                                                    href={`/customers/${member.customerId}`}
                                                    className={`break-words font-medium ${cancelled ? "line-through" : "hover:underline"}`}
                                                >
                                                    {member.name}
                                                </Link>
                                            ) : (
                                                <span className={`break-words font-medium ${cancelled ? "line-through" : ""}`}>
                                                    {member.name}
                                                </span>
                                            )}
                                            {cancelled && <Badge variant="outline">Cancelled</Badge>}
                                        </div>
                                        <p className="mt-1 break-words text-xs text-muted-foreground">
                                            {GENDER_LABEL[member.gender]} · {CATEGORY_LABEL[member.category]}
                                            {member.age !== null ? ` · ${member.age}` : ""}
                                        </p>
                                    </div>
                                    {canEdit && !cancelled && !locked && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger
                                                aria-label={`Actions for ${member.name}`}
                                                className={buttonVariants({ variant: "ghost", size: "icon" })}
                                            >
                                                <MoreHorizontal className="size-4" />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => { setEditing(member); setOpen(true); }}>
                                                    <Pencil className="mr-2 size-4" /> Edit
                                                </DropdownMenuItem>
                                                {canManage && (
                                                    <DropdownMenuItem
                                                        className="text-destructive focus:text-destructive"
                                                        onClick={() => setCancelling(member)}
                                                    >
                                                        <UserMinus className="mr-2 size-4" /> Cancel member
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                                <dl className="grid min-w-0 grid-cols-2 gap-3 text-sm">
                                    <div className="min-w-0">
                                        <dt className="text-xs text-muted-foreground">Date of birth</dt>
                                        <dd>{member.dateOfBirth ? formatDate(member.dateOfBirth) : "—"}</dd>
                                    </div>
                                    <div className="min-w-0">
                                        <dt className="text-xs text-muted-foreground">Phone</dt>
                                        <dd className="break-words">{member.phone || "—"}</dd>
                                    </div>
                                    <div className="min-w-0">
                                        <dt className="text-xs text-muted-foreground">Source</dt>
                                        <dd className="break-words">{member.sourceName}</dd>
                                    </div>
                                    <div className="min-w-0">
                                        <dt className="text-xs text-muted-foreground">Price</dt>
                                        <dd className="flex flex-wrap items-center gap-1">
                                            <span>{formatMoney(member.price, booking.currency)}</span>
                                            {member.priceOverridden && !cancelled && (
                                                <Badge variant="secondary">Custom</Badge>
                                            )}
                                        </dd>
                                    </div>
                                    <div className="min-w-0">
                                        <dt className="text-xs text-muted-foreground">Aadhaar proof</dt>
                                        <dd>
                                            {member.aadhaarCard ? (
                                                <Link
                                                    href={`/api/bookings/${booking.id}/members/${member.id}/aadhaar`}
                                                    target="_blank"
                                                    className="text-primary underline"
                                                >
                                                    View proof
                                                </Link>
                                            ) : "—"}
                                        </dd>
                                    </div>
                                </dl>
                            </article>
                        );
                    })}
                </div>

                <div className="hidden overflow-x-auto rounded-lg border md:block">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Gender</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Date of birth</TableHead>
                                <TableHead>Aadhaar proof</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead className="text-right">Price</TableHead>
                                <TableHead className="w-12" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {shown.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-muted-foreground h-24 text-center">
                                        {members.length === 0 ? "No members yet. Add the first one." : "No members match."}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                shown.map((m) => {
                                    const cancelled = m.status === "cancelled";
                                    return (
                                        <TableRow key={m.id} className={cancelled ? "opacity-50" : undefined}>
                                            <TableCell className="font-medium">
                                                {m.customerId ? (
                                                    <Link href={`/customers/${m.customerId}`} className={cancelled ? "line-through" : "hover:underline"}>
                                                        {m.name}
                                                    </Link>
                                                ) : (
                                                    <span className={cancelled ? "line-through" : undefined}>{m.name}</span>
                                                )}
                                                {cancelled && <Badge variant="outline" className="ml-2">Cancelled</Badge>}
                                            </TableCell>
                                            <TableCell>{GENDER_LABEL[m.gender]}</TableCell>
                                            <TableCell>
                                                {CATEGORY_LABEL[m.category]}
                                                {m.age !== null && <span className="text-muted-foreground"> · {m.age}</span>}
                                            </TableCell>
                                            <TableCell>
                                                {m.dateOfBirth ? formatDate(m.dateOfBirth) : "—"}
                                            </TableCell>
                                            <TableCell>
                                                {m.aadhaarCard ? (
                                                    <Link
                                                        href={`/api/bookings/${booking.id}/members/${m.id}/aadhaar`}
                                                        target="_blank"
                                                        className="text-primary underline"
                                                    >
                                                        View proof
                                                    </Link>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>{m.phone || "—"}</TableCell>
                                            <TableCell>{m.sourceName}</TableCell>
                                            <TableCell className="text-right">
                                                {formatMoney(m.price, booking.currency)}
                                                {m.priceOverridden && !cancelled && (
                                                    <Badge variant="secondary" className="ml-2">Custom</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {canEdit && !cancelled && !locked && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger
                                                            aria-label="Member actions"
                                                            className={buttonVariants({ variant: "ghost", size: "icon" })}
                                                        >
                                                            <MoreHorizontal className="size-4" />
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => { setEditing(m); setOpen(true); }}>
                                                                <Pencil className="mr-2 size-4" /> Edit
                                                            </DropdownMenuItem>
                                                            {canManage && (
                                                                <DropdownMenuItem
                                                                    className="text-destructive focus:text-destructive"
                                                                    onClick={() => setCancelling(m)}
                                                                >
                                                                    <UserMinus className="mr-2 size-4" /> Cancel member
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>

            {canEdit && <MemberDialog
                open={open}
                onOpenChange={setOpen}
                booking={booking}
                sources={sources}
                member={editing}
                takenIds={members
                    .filter((m) => m.status === "active" && m.customerId)
                    .map((m) => m.customerId as string)}
            />}

            <ConfirmDialog
                open={!!cancelling}
                onOpenChange={(o) => !o && setCancelling(null)}
                title="Cancel this member?"
                description={`"${cancelling?.name ?? ""}" will be removed from the headcount and total, which frees a slot. The record stays for history.`}
                confirmLabel="Cancel member"
                onConfirm={async () => {
                    if (!cancelling) return;
                    const res = await cancelMember(booking.id, cancelling.id);
                    if (res.ok) toast.success("Member cancelled");
                    else toast.error(res.error);
                }}
            />
        </Card>
    );
}