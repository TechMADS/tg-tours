import { notFound } from "next/navigation";
import { canAccessModule } from "@/components/layout/nav-items";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { CustomerActions } from "./customer-actions";
import { IdProofs } from "./id-proofs";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABEL } from "@/lib/booking-utils";
import { formatMoney, type CurrencyCode } from "@/lib/finance/currency";
import { getCustomer, listCustomerTrips } from "@/lib/data/customers";
import { canEditAssignedModules, canManageAssignedModules } from "@/types/roles";

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-sm whitespace-pre-line">{value || "—"}</p>
    </div>
  );
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("customers");
  const { id } = await params;
  const customer = await getCustomer(id);
  const trips = await listCustomerTrips(id);

  if (!customer) notFound();
  const dateOfBirth = trips.find((trip) => trip.memberStatus === "active" && trip.dateOfBirth)?.dateOfBirth
    ?? trips.find((trip) => trip.dateOfBirth)?.dateOfBirth;

  return (
    <>
      <PageHeader
        title={customer.name}
        description={`Customer since ${formatDate(customer.createdAt)}`}
        actions={
          <CustomerActions
            customer={customer}
            canEdit={canEditAssignedModules(user)}
            canManage={canManageAssignedModules(user)}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="grid items-start gap-4 sm:grid-cols-2">
            <div className="space-y-4">
              <Field label="Phone" value={customer.phone} />
              <Field label="Country" value={customer.country} />
            </div>
            <div className="space-y-4">
              <Field label="Email" value={customer.email} />
              <Field label="Date of birth" value={dateOfBirth ? formatDate(dateOfBirth) : undefined} />
            </div>
            <div className="sm:col-span-2"><Field label="Address" value={customer.address} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ID proofs</CardTitle></CardHeader>
          <CardContent>
            <IdProofs
              customerId={customer.id}
              docs={customer.idDocs}
              trips={trips}
              canReveal={user.role === "admin" || user.role === "manager"}
              canViewMemberProofs={canAccessModule(user, "bookings")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent><Field label="" value={customer.notes} /></CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Trips ({trips.filter((t) => t.memberStatus === "active").length})</CardTitle></CardHeader>
          <CardContent>
            {trips.length === 0 ? (
              <p className="text-muted-foreground text-sm">Not part of any booking yet.</p>
            ) : (
              <ul className="divide-y">
                {trips.map((t) => (
                  <li key={t.bookingId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div>
                      <Link href={`/bookings/${t.bookingId}`} className="font-medium hover:underline">{t.title}</Link>
                      <p className="text-muted-foreground text-xs">
                        {t.bookingNo} · {formatDate(t.travelStart)} – {formatDate(t.travelEnd)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="capitalize">{t.bookingStatus}</Badge>
                      {t.memberStatus === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
                      <span className="text-muted-foreground">{CATEGORY_LABEL[t.category as keyof typeof CATEGORY_LABEL]}</span>
                      <span className="font-medium">{formatMoney(t.price, t.currency as CurrencyCode)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}