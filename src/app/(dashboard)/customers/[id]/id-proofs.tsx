"use client";
import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { revealCustomerId } from "@/actions/customers";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { CustomerTrip } from "@/lib/data/customers";
import { ID_TYPES } from "@/lib/validators/customer";
import type { CustomerIdDoc } from "@/types/models";

function Row({ customerId, doc, canReveal }: { customerId: string; doc: CustomerIdDoc; canReveal: boolean }) {
  const [number, setNumber] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Auto-hide after 15 seconds
  useEffect(() => {
    if (!number) return;
    const t = setTimeout(() => setNumber(null), 15000);
    return () => clearTimeout(t);
  }, [number]);

  function reveal() {
    startTransition(async () => {
      const res = await revealCustomerId(customerId, doc.id);
      if (res.ok) setNumber(res.number);
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div>
        <p className="text-muted-foreground text-xs">{ID_TYPES[doc.type]}</p>
        <p className="font-mono text-sm tracking-wider">{number ?? `•••• ${doc.last4}`}</p>
      </div>
      {canReveal &&
        (number ? (
          <Button variant="ghost" size="sm" onClick={() => setNumber(null)}>
            <EyeOff className="mr-1 size-4" /> Hide
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={pending} onClick={reveal}>
            <Eye className="mr-1 size-4" /> {pending ? "…" : "Reveal"}
          </Button>
        ))}
    </div>
  );
}

export function IdProofs({
  customerId, docs, trips, canReveal, canViewMemberProofs,
}: {
  customerId: string;
  docs: CustomerIdDoc[];
  trips: CustomerTrip[];
  canReveal: boolean;
  canViewMemberProofs: boolean;
}) {
  const memberProofs = trips.filter((trip) => trip.dateOfBirth || trip.hasAadhaarCard);
  if (docs.length === 0 && memberProofs.length === 0) {
    return <p className="text-muted-foreground text-sm">No ID proofs on file.</p>;
  }

  return (
    <div className="space-y-2">
      {docs.map((d) => <Row key={d.id} customerId={customerId} doc={d} canReveal={canReveal} />)}
      {memberProofs.map((trip) => (
        <div key={`${trip.bookingId}-${trip.memberId}`} className="space-y-3 rounded-md border p-3">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="text-sm font-medium">{trip.title}</p>
            <p className="text-muted-foreground text-xs">
              Date of birth: {trip.dateOfBirth ? formatDate(trip.dateOfBirth) : "—"}
            </p>
          </div>
          {trip.hasAadhaarCard && canViewMemberProofs && (
            <a
              href={`/api/bookings/${trip.bookingId}/members/${trip.memberId}/aadhaar`}
              target="_blank"
              rel="noreferrer"
              className="block w-fit"
            >
              <Image
                src={`/api/bookings/${trip.bookingId}/members/${trip.memberId}/aadhaar`}
                alt={`Aadhaar proof for ${trip.title}`}
                width={480}
                height={300}
                unoptimized
                className="max-h-64 w-auto max-w-full rounded-md border object-contain"
              />
              <span className="text-primary mt-1 block text-xs underline">Open full-size proof</span>
            </a>
          )}
          {trip.hasAadhaarCard && !canViewMemberProofs && (
            <p className="text-muted-foreground text-xs">Aadhaar proof requires Bookings access.</p>
          )}
        </div>
      ))}
      {canReveal && <p className="text-muted-foreground pt-1 text-xs">Each reveal is recorded in the audit log.</p>}
    </div>
  );
}