# R2 package image storage

Package image uploads use Cloudflare R2's S3-compatible API. Set these server-side
variables in `.env.local` and in the deployment environment:

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://<public-bucket-domain>
```

Configure the bucket's public domain in Cloudflare and set `R2_PUBLIC_BASE_URL`
to that HTTPS origin (or origin plus path prefix). `R2_ENDPOINT` is the private
S3 API endpoint and cannot be used as the image URL. The public domain preserves
the existing behavior where package images can be displayed from their saved
URLs. Never expose the R2 access key or secret in a `NEXT_PUBLIC_` variable.

Invoice attachments, expense receipts, and booking-member Aadhaar images use a
**private** R2 bucket. Set a bucket-scoped
R2 API token with object read/write permission for that bucket in server-only
environment variables:

```env
R2_INVOICE_BUCKET_NAME=
R2_INVOICE_ACCESS_KEY_ID=
R2_INVOICE_SECRET_ACCESS_KEY=
```

Private document storage reuses `R2_ACCOUNT_ID` and `R2_ENDPOINT`, but not the
package image bucket or its public URL. Do not enable public access or configure
a public domain for this bucket. Downloads are served only through authenticated
application routes. Aadhaar images are limited to JPEG, PNG, or WebP up to 10 MB;
viewing requires access to the Bookings module and is audit logged.

# Employee access

Admins can create employee email/password accounts in **Settings → Employee
access**, select one or more sidebar modules, update access later, or disable an
account. Assign each employee **Editor** or **Viewer** access: editors can
change data in their assigned modules, while viewers can only view it.
Employees use the existing login page. Module grants and edit access are
enforced on server-rendered pages and server actions; hiding a sidebar link is
not the only access check. Settings remains admin-only.
The admin can set or reset an employee password in Settings. Newly set
credentials are shown only for the current Settings session; passwords are not
stored in readable form, and an existing password cannot be retrieved.

# Finance

The Finance page is available to admins and managers, and to employees explicitly
granted the Finance module. Weekly reports use
Monday–Sunday; monthly and custom date ranges are also available. Invoice
revenue and pending balances are grouped by invoice issue date, while advances
are grouped by payment date. Amounts remain separated by currency.

Set a default cost per booking on each package. Linked invoices prefill that
cost and allow an override; the saved cost and payment exchange rates are
snapshotted. Finance reports show package revenue, direct package cost, and
profit by package, and include direct costs in expenses. Manually entered
expenses can include a private PDF or image receipt stored in the invoice R2
bucket.

The separate **Company Expenses** page tracks costs not linked to bookings,
including staff salaries, rent, purchases, and utilities. Each record includes
an employee or vendor name; admins and managers can add or remove records, and
employees with Finance access can review them.

Deploy the Firestore indexes in `firestore.indexes.json` when applying schema
changes:

```sh
firebase deploy --only firestore:indexes
```
