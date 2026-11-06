import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/session";
import { canManageAssignedModules } from "@/types/roles";
import { getPackage } from "@/lib/data/packages";
import { formatMoney } from "@/lib/finance/currency";
import { formatDate } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { GROUP_LABEL } from "@/lib/validators/package";
import { personsLabel } from "@/lib/finance/pricing";
import type { PackageListing } from "@/types/models";
import { PackageActions } from "./package-actions";
import { ListingPhotoGallery } from "./listing-photo-gallery";
import { SharePhotosButton } from "./share-photos-button";
import { StatusBadge } from "../status-badge";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-muted-foreground text-xs">{label}</p>
            <div className="text-sm">{children}</div>
        </div>
    );
}

function ListingsCard({
    title, listings, packageName,
}: { title: string; listings: PackageListing[]; packageName: string }) {
    return (
        <Card>
            <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
            <CardContent className="space-y-5">
                {listings.length === 0 ? (
                    <p className="text-muted-foreground text-sm">None added.</p>
                ) : listings.map((listing, index) => (
                    <section key={`${listing.name}-${index}`} className="space-y-4 rounded-lg border p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold">{listing.name}</h3>
                                {listing.phone && (
                                    <a className="text-muted-foreground text-base hover:underline" href={`tel:${listing.phone}`}>
                                        {listing.phone}
                                    </a>
                                )}
                            </div>
                            <SharePhotosButton photoUrls={listing.photos} />
                        </div>
                        {listing.photos.length > 0 && (
                            <ListingPhotoGallery
                                photos={listing.photos}
                                packageName={packageName}
                                listingName={listing.name}
                            />
                        )}
                    </section>
                ))}
            </CardContent>
        </Card>
    );
}

export default async function PackageDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const user = await requireModule("packages");
    const { id } = await params;
    const [pkg, settings] = await Promise.all([getPackage(id), getSettings()]);
    if (!pkg) notFound();

    const approxInr =
        pkg.price.currency !== "INR" && settings.fx.rates[pkg.price.currency]
            ? Math.round(pkg.price.amount * settings.fx.rates[pkg.price.currency])
            : null;
    return (
        <>
            <PageHeader
                title={pkg.name}
                description={`${pkg.destination} · ${pkg.days}D / ${pkg.nights}N`}
                actions={
                    <>
                        {canManageAssignedModules(user) && <PackageActions pkg={pkg} />}
                    </>
                }
            />

            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="lg:col-span-2">
                    <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Status"><StatusBadge status={pkg.status} /></Field>
                        <Field label="Group">
                            {GROUP_LABEL[pkg.groupType]}
                            <p className="text-muted-foreground text-xs">{personsLabel(pkg)}</p>
                        </Field>
                        <Field label="Starting price">
                            <span className="font-semibold">{formatMoney(pkg.price.amount, pkg.price.currency)}</span>{" "}
                            <span className="text-muted-foreground">/ person</span>
                            {approxInr !== null && (
                                <p className="text-muted-foreground text-xs">≈ {formatMoney(approxInr, "INR")} per person</p>
                            )}
                        </Field>
                        <Field label="Duration">{pkg.days} days, {pkg.nights} nights</Field>
                        <Field label="Last updated">{formatDate(pkg.updatedAt)}</Field>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader><CardTitle>Pricing by group size</CardTitle></CardHeader>
                    <CardContent>
                        <ul className="divide-y text-sm">
                            {pkg.priceTiers.map((t, i) => {
                                const next = pkg.priceTiers[i + 1];
                                const hi = next ? next.fromPersons - 1 : pkg.maxPersons > 0 ? pkg.maxPersons : null;
                                const label =
                                    hi === null ? `${t.fromPersons}+ persons`
                                        : hi === t.fromPersons ? `${t.fromPersons} ${t.fromPersons === 1 ? "person" : "persons"}`
                                            : `${t.fromPersons} to ${hi} persons`;
                                return (
                                    <li key={t.fromPersons} className="flex items-center justify-between py-2">
                                        <span>{label}</span>
                                        <span className="font-medium">
                                            {formatMoney(t.amount, pkg.price.currency)}{" "}
                                            <span className="text-muted-foreground font-normal">per person</span>
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Inclusions</CardTitle></CardHeader>
                    <CardContent>
                        {pkg.inclusions.length === 0 ? (
                            <p className="text-muted-foreground text-sm">None listed.</p>
                        ) : (
                            <ul className="space-y-2">
                                {pkg.inclusions.map((t, i) => (
                                    <li key={i} className="flex gap-2 text-sm">
                                        <Check className="mt-0.5 size-4 shrink-0 text-green-600" /> {t}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Exclusions</CardTitle></CardHeader>
                    <CardContent>
                        {pkg.exclusions.length === 0 ? (
                            <p className="text-muted-foreground text-sm">None listed.</p>
                        ) : (
                            <ul className="space-y-2">
                                {pkg.exclusions.map((t, i) => (
                                    <li key={i} className="flex gap-2 text-sm">
                                        <X className="text-destructive mt-0.5 size-4 shrink-0" /> {t}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                <ListingsCard title="Rooms and stays" listings={pkg.rooms} packageName={pkg.name} />
                <ListingsCard title="Travel and vehicles" listings={pkg.travelProviders} packageName={pkg.name} />

                <Card className="lg:col-span-2">
                    <CardHeader><CardTitle>Itinerary</CardTitle></CardHeader>
                    <CardContent>
                        {pkg.itinerary.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No itinerary added yet.</p>
                        ) : (
                            <ol className="space-y-4">
                                {pkg.itinerary.map((d) => (
                                    <li key={d.day} className="flex gap-4">
                                        <span className="bg-brand-gradient text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                                            {d.day}
                                        </span>
                                        <div>
                                            <p className="font-medium">{d.title}</p>
                                            {d.description && (
                                                <p className="text-muted-foreground text-sm whitespace-pre-line">{d.description}</p>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}