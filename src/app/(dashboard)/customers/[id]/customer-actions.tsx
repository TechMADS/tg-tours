"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCustomer } from "@/actions/customers";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { Customer } from "@/types/models";
import { CustomerFormDialog } from "../customer-form";

export function CustomerActions({
  customer,
  canEdit,
  canManage,
}: {
  customer: Customer;
  canEdit: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  return (
    <>
      {canEdit && (
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-2 size-4" /> Edit
        </Button>
      )}
      {canManage && (
        <Button variant="destructive" onClick={() => setDelOpen(true)}>
          <Trash2 className="mr-2 size-4" /> Delete
        </Button>
      )}

      {canEdit && <CustomerFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        customer={customer}
        onSaved={() => router.refresh()}
      />}
      <ConfirmDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        title="Delete this customer?"
        description="Past bookings and invoices keep their history."
        onConfirm={async () => {
          const res = await deleteCustomer(customer.id);
          if (res.ok) { toast.success("Customer deleted"); router.replace("/customers"); }
          else toast.error(res.error);
        }}
      />
    </>
  );
}