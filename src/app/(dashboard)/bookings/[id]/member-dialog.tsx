"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { addMember, updateMember, uploadMemberAadhaar } from "@/actions/members";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_LABEL, GENDER_LABEL } from "@/lib/booking-utils";
import { CURRENCIES, formatMoney, fromMinor, toMinor } from "@/lib/finance/currency";
import {
  CATEGORIES, GENDERS, memberInputSchema, type MemberInput,
} from "@/lib/validators/booking";
import type { AgeCategory, Booking, Customer, Member } from "@/types/models";
import { CustomerPicker } from "./customer-picker";

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";
const msg = (m?: string) => (m && /expected|nan/i.test(m) ? "Enter a valid number" : m);
const Err = ({ m }: { m?: string }) => (m ? <p className="text-destructive text-xs">{msg(m)}</p> : null);

type Source = { id: string; name: string };
type Chosen = { id: string; name: string; phone: string };
type Mode = "pick" | "new" | "chosen";

export function MemberDialog({
  open, onOpenChange, booking, sources, member, takenIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  booking: Booking;
  sources: Source[];
  member: Member | null;
  takenIds: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{member ? "Edit member" : "Add member"}</DialogTitle>
        </DialogHeader>
        {open && (
          <MemberForm
            key={member?.id ?? "new"}
            booking={booking}
            sources={sources}
            member={member}
            takenIds={takenIds}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MemberForm({
  booking, sources, member, takenIds, onDone,
}: {
  booking: Booking; sources: Source[]; member: Member | null; takenIds: string[]; onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [aadhaarInputKey, setAadhaarInputKey] = useState(0);
  const [keepOpenAfterSave, setKeepOpenAfterSave] = useState(false);
  const [prevCategory, setPrevCategory] = useState<AgeCategory>(member?.category ?? "adult");
  const [mode, setMode] = useState<Mode>(member ? "chosen" : "pick");
  const [chosen, setChosen] = useState<Chosen | null>(
    member ? { id: member.customerId ?? "", name: member.name, phone: member.phone } : null,
  );

  const blank = (sourceId = ""): MemberInput => ({
    customerId: "", name: "", phone: "", email: "",
    gender: "male", category: "adult", dateOfBirth: "", age: "",
    sourceId, price: fromMinor(booking.rates.adult), note: "",
  });

  const {
    register, control, handleSubmit, reset, setValue, getValues,
    formState: { errors },
  } = useForm<MemberInput>({
    resolver: zodResolver(memberInputSchema),
    defaultValues: member
      ? {
          customerId: member.customerId ?? "", name: member.name, phone: member.phone, email: "",
          gender: member.gender, category: member.category,
          dateOfBirth: member.dateOfBirth ?? "",
          age: member.age === null ? "" : String(member.age),
          sourceId: member.sourceId, price: fromMinor(member.price), note: member.note,
        }
      : blank(sources.length === 1 ? sources[0].id : ""),
  });

  const category = useWatch({ control, name: "category" });
  const price = useWatch({ control, name: "price" });
  const standard = booking.rates[category];
  const custom = Number.isFinite(price) && toMinor(price) !== standard;
  const symbol = CURRENCIES[booking.currency].symbol;

  function clearCustomer() {
    setValue("customerId", "");
    setValue("name", "");
    setValue("phone", "");
    setValue("email", "");
    setChosen(null);
  }
  function pick(c: Customer) {
    setValue("customerId", c.id, { shouldValidate: true });
    setValue("name", c.name);
    setValue("phone", c.phone ?? "");
    setValue("email", "");
    setChosen({ id: c.id, name: c.name, phone: c.phone ?? "" });
    setMode("chosen");
  }

  // Switching category swaps the price to that category's rate, unless the price was customised
  function onCategoryChange(next: AgeCategory) {
    const current = toMinor(Number(getValues("price")));
    if (current === booking.rates[prevCategory]) setValue("price", fromMinor(booking.rates[next]));
    setPrevCategory(next);
  }

  function submit(v: MemberInput, force = false, keepOpen = false) {
    startTransition(async () => {
      const res = member
        ? await updateMember(booking.id, member.id, v)
        : await addMember(booking.id, v, force);

      if (!res.ok) {
        if ("duplicate" in res && res.duplicate) {
          toast.warning(res.error, {
            duration: 10000,
            action: {
              label: "Add anyway",
              onClick: () => submit(v, true, keepOpen),
            },
          });
        } else {
          toast.error(res.error);
        }
        return;
      }

      const savedMemberId = member?.id ?? res.memberId;
      if (aadhaarFile && savedMemberId) {
        const upload = await uploadMemberAadhaar(booking.id, savedMemberId, aadhaarFile);
        if (!upload.ok) {
          toast.error(`Member saved, but Aadhaar upload failed: ${upload.error} Edit the member to retry.`);
        } else {
          toast.success(member ? "Member updated" : `${chosen?.name || v.name} added`);
        }
      } else {
        toast.success(member ? "Member updated" : `${chosen?.name || v.name} added`);
      }

      if (keepOpen) {
        setPrevCategory("adult");
        setKeepOpenAfterSave(false);
        reset(blank(v.sourceId));
        setAadhaarFile(null);
        setAadhaarInputKey((current) => current + 1);
        setChosen(null);
        setMode("pick");
      } else {
        onDone();
      }
    });
  }

  const hasOldSource = member && !sources.some((s) => s.id === member.sourceId);

  return (
    <form onSubmit={handleSubmit((v) => submit(v, false, keepOpenAfterSave))} className="space-y-4">
      {/* Customer */}
      <div className="space-y-2 rounded-md border p-3">
        <Label>Customer</Label>

        {mode === "chosen" && chosen && (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{chosen.name}</p>
              <p className="text-muted-foreground text-xs">
                {chosen.phone || "No phone"}
                {!chosen.id && " · not linked to a customer record"}
              </p>
              {member && chosen.id && (
                <p className="text-muted-foreground mt-1 text-xs">
                  To change name or phone,{" "}
                  <Link href={`/customers/${chosen.id}`} className="underline" target="_blank">
                    edit the customer
                  </Link>
                  .
                </p>
              )}
            </div>
            {!member && (
              <Button type="button" variant="ghost" size="sm"
                onClick={() => { clearCustomer(); setMode("pick"); }}>
                Change
              </Button>
            )}
          </div>
        )}

        {mode === "pick" && (
          <>
            <CustomerPicker takenIds={takenIds} onPick={pick} onNew={() => { clearCustomer(); setMode("new"); }} />
            <Err m={errors.name?.message} />
          </>
        )}

        {mode === "new" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="mname">Full name</Label>
              <Input id="mname" autoFocus autoComplete="off" {...register("name")} />
              <Err m={errors.name?.message} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mphone">Phone</Label>
                <Input id="mphone" type="tel" {...register("phone")} />
                <Err m={errors.phone?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memail">Email (optional)</Label>
                <Input id="memail" type="email" {...register("email")} />
                <Err m={errors.email?.message} />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              A customer record is created automatically. You can add address and ID proofs later.
            </p>
            <Button type="button" variant="ghost" size="sm"
              onClick={() => { clearCustomer(); setMode("pick"); }}>
              Search existing customers instead
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="mgender">Gender</Label>
          <select id="mgender" className={selectClass} {...register("gender")}>
            {GENDERS.map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mcat">Category</Label>
          <select
            id="mcat" className={selectClass}
            {...register("category", { onChange: (e) => onCategoryChange(e.target.value as AgeCategory) })}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mdob">Date of birth</Label>
          <Input id="mdob" type="date" {...register("dateOfBirth")} />
          <Err m={errors.dateOfBirth?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mage">Age (optional)</Label>
          <Input id="mage" inputMode="numeric" {...register("age")} />
          <Err m={errors.age?.message} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="maadhaar">Aadhaar card image (optional)</Label>
        <Input
          key={aadhaarInputKey}
          id="maadhaar"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setAadhaarFile(event.target.files?.[0] ?? null)}
        />
        {aadhaarFile && (
          <p className="text-muted-foreground text-xs">Selected: {aadhaarFile.name}</p>
        )}
        {member?.aadhaarCard && (
          <Link
            href={`/api/bookings/${booking.id}/members/${member.id}/aadhaar`}
            target="_blank"
            className="text-sm text-primary underline"
          >
            View uploaded Aadhaar card
          </Link>
        )}
        <p className="text-muted-foreground text-xs">JPEG, PNG, or WebP up to 10 MB. Stored privately.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="msource">Order source</Label>
        <select id="msource" className={selectClass} {...register("sourceId")}>
          <option value="">Select source</option>
          {hasOldSource && <option value={member!.sourceId}>{member!.sourceName} (inactive)</option>}
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <Err m={errors.sourceId?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mprice">Price ({symbol})</Label>
        <Input id="mprice" type="number" step="0.01" min={0} {...register("price", { valueAsNumber: true })} />
        <p className="text-muted-foreground text-xs">
          Standard {CATEGORY_LABEL[category].toLowerCase()} rate: {formatMoney(standard, booking.currency)}
          {custom && <span className="text-foreground font-medium"> · custom price</span>}
        </p>
        <Err m={errors.price?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mnote">Note (optional)</Label>
        <Textarea id="mnote" rows={2} {...register("note")} />
        <Err m={errors.note?.message} />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>Cancel</Button>
        {!member && (
          <Button
            type="submit" variant="outline" disabled={pending}
            onClick={() => setKeepOpenAfterSave(true)}
          >
            Save &amp; add another
          </Button>
        )}
        <Button type="submit" disabled={pending} onClick={() => setKeepOpenAfterSave(false)}>
          {pending ? "Saving…" : member ? "Save changes" : "Save member"}
        </Button>
      </div>
    </form>
  );
}