"use client";
import Image from "next/image";
import { useRef, useState, type ChangeEvent } from "react";
import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useFieldArray, useForm, useWatch, type Control, type FieldErrors, type UseFormRegister,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { createPackage, updatePackage, uploadPackageImage } from "@/actions/packages";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCIES, CURRENCY_CODES, formatMoney, fromMinor, toMinor, type CurrencyCode } from "@/lib/finance/currency";
import {
  GROUP_LABEL, GROUP_TYPES, PACKAGE_STATUSES, STATUS_LABEL,
  packageFormSchema, type PackageFormValues,
} from "@/lib/validators/package";
import type { TravelPackage } from "@/types/models";
import { SharePhotosButton } from "./[id]/share-photos-button";

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

// Turns raw zod "expected number" messages (empty number field) into something friendly
const msg = (m?: string) => (m && /expected|nan/i.test(m) ? "Enter a valid number" : m);
const Err = ({ m }: { m?: string }) =>
  m ? <p className="text-destructive text-xs">{msg(m)}</p> : null;

/* ---------- simple string list (inclusions / exclusions) ---------- */
function ListField({
  control, register, name, title, description, placeholder,
}: {
  control: Control<PackageFormValues>;
  register: UseFormRegister<PackageFormValues>;
  name: "inclusions" | "exclusions";
  title: string;
  description: string;
  placeholder: string;
}) {
  const { fields, append, remove } = useFieldArray({ control, name });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {fields.map((f, i) => (
          <div key={f.id} className="flex gap-2">
            <Input
              placeholder={placeholder}
              autoComplete="off"
              {...register(`${name}.${i}.value`)}
              onKeyDown={(e) => {
                // Enter adds the next row instead of submitting the form
                if (e.key === "Enter") {
                  e.preventDefault();
                  append({ value: "" });
                }
              }}
            />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => remove(i)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button" variant="outline" size="sm"
          disabled={fields.length >= 30}
          onClick={() => append({ value: "" })}
        >
          <Plus className="mr-1 size-4" /> Add
        </Button>
      </CardContent>
    </Card>
  );
}

type ListingFieldName = "rooms" | "travelProviders";
type ListingNamePath = `rooms.${number}.name` | `travelProviders.${number}.name`;
type ListingPhonePath = `rooms.${number}.phone` | `travelProviders.${number}.phone`;
type ListingPhotosPath = `rooms.${number}.photos` | `travelProviders.${number}.photos`;

function ListingPhotosField({
  control, name, label,
}: {
  control: Control<PackageFormValues>;
  name: ListingPhotosPath;
  label: string;
}) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (fields.length + files.length > 20) {
      toast.error("You can add up to 20 photos for this listing");
      return;
    }

    setUploading(true);
    let uploaded = 0;
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        const result = await uploadPackageImage(formData);
        if (!result.ok) {
          toast.error(`${file.name}: ${result.error}`);
          continue;
        }
        append({ url: result.url });
        uploaded++;
      }
      if (uploaded > 0) toast.success(`${uploaded} image${uploaded === 1 ? "" : "s"} uploaded`);
    } catch {
      toast.error("Image upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInput}
        id={`${name}-upload`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        disabled={uploading || fields.length >= 20}
        onChange={uploadImages}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Upload photos for ${label}`}
        disabled={uploading || fields.length >= 20}
        onClick={() => fileInput.current?.click()}
      >
        <Upload className="size-4" /> {uploading ? "Uploading photos…" : "Upload photos"}
      </Button>
      <p className="text-muted-foreground text-xs">JPEG, PNG, or WebP. Up to 8 MB each; max 20 photos for this listing.</p>
      {fields.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {fields.map((field, index) => (
              <figure key={field.id} className="relative min-w-0">
                <Image src={field.url} alt={`${label} photo ${index + 1}`} width={480} height={320} unoptimized className="aspect-video w-full rounded object-cover" />
                <figcaption className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{label} photo {index + 1}</span>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${label.toLowerCase()} photo ${index + 1}`} onClick={() => remove(index)}>
                    <Trash2 className="size-4" />
                  </Button>
                </figcaption>
              </figure>
            ))}
          </div>
          <SharePhotosButton photoUrls={fields.map((field) => field.url)} />
        </div>
      )}
    </div>
  );
}

function ListingField({
  control, register, errors, name, title, description, listingLabel,
}: {
  control: Control<PackageFormValues>;
  register: UseFormRegister<PackageFormValues>;
  errors: FieldErrors<PackageFormValues>;
  name: ListingFieldName;
  title: string;
  description: string;
  listingLabel: string;
}) {
  const { fields, append, remove } = useFieldArray({ control, name });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.map((field, index) => {
          const itemName = `${name}.${index}.name` as ListingNamePath;
          const itemPhone = `${name}.${index}.phone` as ListingPhonePath;
          const photosName = `${name}.${index}.photos` as ListingPhotosPath;
          const itemErrors = errors[name]?.[index];

          return (
            <div key={field.id} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{listingLabel} {index + 1}</p>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${listingLabel.toLowerCase()} ${index + 1}`}
                  onClick={() => remove(index)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${name}-${index}-name`}>{listingLabel} name</Label>
                  <Input id={`${name}-${index}-name`} placeholder={`e.g. ${listingLabel} name`} {...register(itemName)} />
                  <Err m={itemErrors?.name?.message} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${name}-${index}-phone`}>Mobile number</Label>
                  <Input id={`${name}-${index}-phone`} type="tel" autoComplete="tel" placeholder="e.g. +91 98765 43210" {...register(itemPhone)} />
                  <Err m={itemErrors?.phone?.message} />
                </div>
              </div>
              <ListingPhotosField control={control} name={photosName} label={`${listingLabel} ${index + 1}`} />
            </div>
          );
        })}
        <Button
          type="button" variant="outline" size="sm"
          disabled={fields.length >= 20}
          onClick={() => append({ name: "", phone: "", photos: [] })}
        >
          <Plus className="mr-1 size-4" /> Add {listingLabel.toLowerCase()}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ---------- main form ---------- */
export function PackageForm({
  pkg, rates,
}: { pkg: TravelPackage | null; rates: Record<string, number> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register, control, handleSubmit, setValue, getValues,
    formState: { errors },
  } = useForm<PackageFormValues>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: {
      name: pkg?.name ?? "",
      destination: pkg?.destination ?? "",
      days: pkg?.days ?? 3,
      nights: pkg?.nights ?? 2,
      groupType: pkg?.groupType ?? "open_group",
      minPersons: pkg?.minPersons ?? 1,
      maxPersons: pkg?.maxPersons ?? 0,
      currency: pkg?.price.currency ?? "INR",
      price: pkg ? fromMinor(pkg.price.amount) : 0,
      cost: pkg?.cost ? fromMinor(pkg.cost.amount) : 0,
      costCurrency: pkg?.cost?.currency ?? pkg?.price.currency ?? "INR",
      extraTiers: (pkg?.priceTiers ?? [])
        .slice(1)
        .map((t) => ({ fromPersons: t.fromPersons, price: fromMinor(t.amount) })),
      status: pkg?.status ?? "draft",
      inclusions: (pkg?.inclusions ?? []).map((value) => ({ value })),
      exclusions: (pkg?.exclusions ?? []).map((value) => ({ value })),
      rooms: (pkg?.rooms ?? []).map((room) => ({
        ...room,
        photos: room.photos.map((url) => ({ url })),
      })),
      travelProviders: (pkg?.travelProviders ?? []).map((provider) => ({
        ...provider,
        photos: provider.photos.map((url) => ({ url })),
      })),
      itinerary: (pkg?.itinerary ?? []).map(({ title, description }) => ({ title, description })),
    },
  });

  const itin = useFieldArray({ control, name: "itinerary" });
  const tiers = useFieldArray({ control, name: "extraTiers" });
  const currency = useWatch({ control, name: "currency" }) as CurrencyCode;
  const price = useWatch({ control, name: "price" });
  const minP = useWatch({ control, name: "minPersons" });
  const extra = useWatch({ control, name: "extraTiers" });
  const groupType = useWatch({ control, name: "groupType" });

  const rate = rates[currency];

  function onGroupTypeChange(t: string) {
    if (t === "couple") {
      setValue("minPersons", 2);
      setValue("maxPersons", 2);
      tiers.replace([]);
    } else if (t === "open_group") {
      setValue("minPersons", 1);
      setValue("maxPersons", 0);
    } else if (getValues("minPersons") < 2) {
      setValue("minPersons", 2);
    }
  }

  // Live preview of what each group size pays
  const preview = [
    { from: minP, price },
    ...(extra ?? []).map((t) => ({ from: t.fromPersons, price: t.price })),
  ].filter((r) => Number.isFinite(r.from) && r.from > 0 && Number.isFinite(r.price) && r.price > 0);

  function onSubmit(v: PackageFormValues) {
    startTransition(async () => {
      const payload = {
        ...v,
        inclusions: v.inclusions.map((x) => x.value).filter(Boolean),
        exclusions: v.exclusions.map((x) => x.value).filter(Boolean),
        rooms: v.rooms
          .filter((room) => room.name.trim() || room.phone.trim() || room.photos.some((photo) => photo.url.trim()))
          .map((room) => ({ ...room, photos: room.photos.map((photo) => photo.url).filter(Boolean) })),
        travelProviders: v.travelProviders
          .filter((provider) => provider.name.trim() || provider.phone.trim() || provider.photos.some((photo) => photo.url.trim()))
          .map((provider) => ({ ...provider, photos: provider.photos.map((photo) => photo.url).filter(Boolean) })),
      };
      const res = pkg ? await updatePackage(pkg.id, payload) : await createPackage(payload);
      if (res.ok) {
        toast.success(pkg ? "Package updated" : "Package created");
        router.push(`/packages/${res.id}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-6">
      {/* Basics */}
      <Card>
        <CardHeader><CardTitle>Basics</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Package name</Label>
            <Input id="name" autoFocus placeholder="e.g. Magical Bali Escape" {...register("name")} />
            <Err m={errors.name?.message} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="destination">Destination</Label>
            <Input id="destination" placeholder="e.g. Bali, Indonesia" {...register("destination")} />
            <Err m={errors.destination?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="days">Days</Label>
            <Input id="days" type="number" min={1} {...register("days", { valueAsNumber: true })} />
            <Err m={errors.days?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nights">Nights</Label>
            <Input id="nights" type="number" min={0} {...register("nights", { valueAsNumber: true })} />
            <Err m={errors.nights?.message} />
          </div>
        </CardContent>
      </Card>

      {/* Group size */}
      <Card>
        <CardHeader>
          <CardTitle>Group size</CardTitle>
          <CardDescription>
            Couple packages are fixed at 2. For a fixed group such as 12 members, set the same
            number in both boxes. Strangers trips are open groups where each person joins individually.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="groupType">Package type</Label>
            <select
              id="groupType"
              className={selectClass}
              {...register("groupType", { onChange: (e) => onGroupTypeChange(e.target.value) })}
            >
              {GROUP_TYPES.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="minPersons">Minimum persons</Label>
            <Input
              id="minPersons" type="number" min={1}
              disabled={groupType === "couple"}
              {...register("minPersons", { valueAsNumber: true })}
            />
            <Err m={errors.minPersons?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxPersons">Maximum persons</Label>
            <Input
              id="maxPersons" type="number" min={0}
              disabled={groupType === "couple"}
              {...register("maxPersons", { valueAsNumber: true })}
            />
            <p className="text-muted-foreground text-xs">0 means no limit.</p>
            <Err m={errors.maxPersons?.message} />
          </div>
        </CardContent>
      </Card>

      {/* Pricing */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing and status</CardTitle>
          <CardDescription>
            Prices are per person. A booking can still be agreed at a different amount.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <select id="currency" className={selectClass} {...register("currency")}>
                {CURRENCY_CODES.map((c) => (
                  <option key={c} value={c}>{c} ({CURRENCIES[c].name})</option>
                ))}
              </select>
              <Err m={errors.currency?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">
                Price per person ({Number.isFinite(minP) ? minP : "…"} persons and above)
              </Label>
              <Input id="price" type="number" step="0.01" min={0} {...register("price", { valueAsNumber: true })} />
              <Err m={errors.price?.message} />
              {currency !== "INR" && rate && Number.isFinite(price) && price > 0 && (
                <p className="text-muted-foreground text-xs">
                  ≈ {formatMoney(Math.round(toMinor(price) * rate), "INR")} per person at your default rate
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">Default package cost per booking</Label>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_5rem] gap-3">
                <Input id="cost" type="number" step="0.01" min={0} {...register("cost", { valueAsNumber: true })} />
                <select id="costCurrency" className={`${selectClass} min-w-0 px-1`} {...register("costCurrency")}>
                  {CURRENCY_CODES.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </div>
              <p className="text-muted-foreground text-xs">
                Used as the starting cost on invoices linked to this package. You can override it per invoice.
              </p>
              <Err m={errors.cost?.message} />
              <Err m={errors.costCurrency?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select id="status" className={selectClass} {...register("status")}>
                {PACKAGE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <p className="text-muted-foreground text-xs">Only Active packages can be booked.</p>
            </div>
          </div>

          {/* Group rates */}
          <div className="space-y-3 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Group rates (optional)</p>
              <p className="text-muted-foreground text-xs">
                Lower the per-person price for bigger groups. The new price applies to everyone in
                the booking. Add them in increasing order.
              </p>
            </div>

            {groupType === "couple" ? (
              <p className="text-muted-foreground text-xs">Not available for couple packages.</p>
            ) : (
              <>
                {tiers.fields.map((f, i) => (
                  <div key={f.id} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">From</span>
                      <Input
                        type="number" min={2} className="w-24"
                        {...register(`extraTiers.${i}.fromPersons`, { valueAsNumber: true })}
                      />
                      <span className="text-sm">persons, price per person</span>
                      <Input
                        type="number" step="0.01" min={0} className="w-36"
                        {...register(`extraTiers.${i}.price`, { valueAsNumber: true })}
                      />
                      <Button type="button" variant="ghost" size="icon" aria-label="Remove rate"
                        onClick={() => tiers.remove(i)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <Err m={errors.extraTiers?.[i]?.fromPersons?.message} />
                    <Err m={errors.extraTiers?.[i]?.price?.message} />
                  </div>
                ))}
                <Button
                  type="button" variant="outline" size="sm"
                  disabled={tiers.fields.length >= 6}
                  onClick={() => tiers.append({ fromPersons: (Number(minP) || 1) + 2, price: 0 })}
                >
                  <Plus className="mr-1 size-4" /> Add group rate
                </Button>
              </>
            )}
          </div>

          {preview.length > 0 && (
            <div className="bg-muted rounded-md p-3 text-sm">
              <p className="mb-1 font-medium">What customers will pay</p>
              <ul className="space-y-1">
                {preview.map((r, i) => (
                  <li key={i} className="text-muted-foreground">
                    {r.from}+ persons: {formatMoney(toMinor(r.price), currency)} per person
                    {" "}({formatMoney(toMinor(r.price) * r.from, currency)} for {r.from})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <ListField
        control={control} register={register} name="inclusions"
        title="Inclusions" description="What the price covers. Press Enter to add the next line."
        placeholder="e.g. Airport transfers"
      />
      <ListField
        control={control} register={register} name="exclusions"
        title="Exclusions" description="What the customer pays for separately."
        placeholder="e.g. Flights, visa fees"
      />
      <ListingField
        control={control} register={register} errors={errors} name="rooms"
        title="Rooms and stays" description="Add each room or property separately with its contact number and photos."
        listingLabel="Room"
      />
      <ListingField
        control={control} register={register} errors={errors} name="travelProviders"
        title="Travel and vehicles" description="Add each travel provider or vehicle separately with its contact number and photos."
        listingLabel="Travel / vehicle"
      />

      {/* Itinerary */}
      <Card>
        <CardHeader>
          <CardTitle>Itinerary</CardTitle>
          <CardDescription>Day-by-day plan. Day numbers follow the order below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {itin.fields.map((f, i) => (
            <div key={f.id} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Day {i + 1}</p>
                <div className="flex">
                  <Button type="button" variant="ghost" size="icon" aria-label="Move up"
                    disabled={i === 0} onClick={() => itin.move(i, i - 1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Move down"
                    disabled={i === itin.fields.length - 1} onClick={() => itin.move(i, i + 1)}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove day"
                    onClick={() => itin.remove(i)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <Input placeholder="Title, e.g. Arrival and Ubud tour" {...register(`itinerary.${i}.title`)} />
              <Err m={errors.itinerary?.[i]?.title?.message} />
              <Textarea rows={3} placeholder="What happens on this day…" {...register(`itinerary.${i}.description`)} />
              <Err m={errors.itinerary?.[i]?.description?.message} />
            </div>
          ))}
          <Button
            type="button" variant="outline" size="sm"
            disabled={itin.fields.length >= 60}
            onClick={() => itin.append({ title: "", description: "" })}
          >
            <Plus className="mr-1 size-4" /> Add day
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button className="w-full sm:w-auto" type="submit" disabled={pending}>
          {pending ? "Saving…" : pkg ? "Save changes" : "Create package"}
        </Button>
        <Link
          href={pkg ? `/packages/${pkg.id}` : "/packages"}
          className={buttonVariants({ variant: "outline", className: "w-full sm:w-auto" })}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}