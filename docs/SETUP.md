# Setting up Rock Foundation Automobile's system

Step by step, from nothing to the first real Job Card. Allow about two hours
the first time. Secrets go only into the hosting settings, never into code,
chat or email.

## 1. Supabase (the database)

1. Create a Supabase organisation for the workshop on the **Pro** plan
   (daily backups), and a project in an EU region (Frankfurt is closest to
   Vercel's `fra1`).
2. **Project Settings → Database → Connection string**:
   - the **Transaction pooler** string (port 6543) becomes `DATABASE_URL`;
     add `?pgbouncer=true` at the end;
   - the **Direct connection** string (port 5432) becomes `DIRECT_URL`.
3. **Database → Settings → SSL Configuration**: enforce SSL.
4. **Project Settings → API**: note the project URL and the `anon` public key
   for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (instant updates; both are public by design).

Nothing else is created by hand: the first deploy creates every table, turns
row-level security on for each one and closes the public API
([ARCHITECTURE.md](ARCHITECTURE.md), "Changing the database").

## 2. Vercel (the two apps)

Create two Vercel projects from this repository, both on the **Pro** plan:

| Project | Root directory | Build | Address (later) |
|---|---|---|---|
| Staff portal | `apps/portal` | from `apps/portal/vercel.json` (`npm run vercel:portal`) | `portal.rockfoundationng.com` |
| Customer portal | `apps/website` | from `apps/website/vercel.json` (`npm run vercel:website`) | `my.rockfoundationng.com` |

Set the environment variables for **Production** in each project. The list,
with what each one does, is in [OPERATIONS_CHECKLIST.md](OPERATIONS_CHECKLIST.md)
§1 and [.env.example](../.env.example). At least:

- both projects: `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET` (the same
  value), `NEXT_PUBLIC_PORTAL_URL`, `NEXT_PUBLIC_WEBSITE_URL`,
  `NEXT_PUBLIC_ORGANISATION_NAME="Rock Foundation Automobile"`, `SMTP_*`;
- staff portal: `BETTER_AUTH_URL`, `CRON_SECRET`, `PLATFORM_OWNER_EMAIL`,
  `MASTER_ADMIN_NAME`, `MASTER_ADMIN_EMAIL`, `MASTER_ADMIN_PASSWORD`,
  `NEXT_PUBLIC_SITE_TAGLINE`;
- customer portal: `WEBSITE_ORGANISATION_SLUG="rock-foundation"`,
  `NEXT_PUBLIC_ORGANISATION_LEGAL_NAME`, `NEXT_PUBLIC_CONTACT_ADDRESS`,
  `NEXT_PUBLIC_CONTACT_PHONE`.

A production build stops with a clear message if a required variable is
missing, and the live site keeps running on the previous version.

## 3. The first deploy

Deploy the staff portal first. Its build:

1. pushes the database schema (never with data loss allowed);
2. turns row-level security on for every table and closes the public API;
3. creates Rock Foundation Automobile (legal name, RC number, the Ota
   address, the two hotlines, the website, VAT at 7.5%), the Ota Workshop
   branch, the roles and the platform administrator
   (`scripts/seed-if-vercel.js`).

Then deploy the customer portal. Check `https://<staff portal>/api/health`
and `https://<customer portal>/api/health` both answer `ok`.

## 4. First sign-in and the business details

1. Sign in to the staff portal with `MASTER_ADMIN_EMAIL` and its password,
   then remove `MASTER_ADMIN_PASSWORD` from Vercel.
2. **Business details** (`/organisation`): check the name, legal name,
   RC number, address, P.O. Box, hotlines and website. They print on every
   estimate, invoice, receipt and email.
3. **Business details**, the **Billing & Tax** section: VAT on or off (7.5% by default),
   the discount limit above which the Owner must approve, and whether
   deposits are required.
4. **Departments** (`/structure`): the workshop's departments and teams.
5. **Staff** (`/users`): add the GMD with the **Owner / GMD** role, then the
   front desk. Each person sets their own password from the email link; no
   password is ever emailed.
6. **Settings → Roles**: switch on the optional roles the workshop has
   people for (Workshop Supervisor, Technician, Store Keeper, Accounts,
   Security). While one is off, Front Desk covers its steps
   ([ROLES_AND_ACCESS.md](ROLES_AND_ACCESS.md)).

## 5. Email

Use the workshop's own mail provider (for example Google Workspace or
Microsoft 365) or a sending service. Set `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASSWORD` and
`SMTP_FROM="Rock Foundation Automobile <no-reply@your-domain>"` in **both**
projects. Send yourself a password reset to check it. **Settings** shows
sent and failed emails for the last 7 days.

Every customer email has a **Send on WhatsApp** button beside it, which
opens WhatsApp on the person's phone or computer with the same message and a
secure link to the document. No WhatsApp account set-up is needed for this.

## 6. Scheduled jobs

- **Vercel** runs the daily morning job by itself (`apps/portal/vercel.json`),
  sending `CRON_SECRET` automatically.
- **Supabase scheduler** runs the Support centre every few minutes. In
  Supabase → **Database → Extensions**, enable `pg_cron` and `pg_net`, then
  in the **SQL Editor** (replace the address and the secret):

```sql
SELECT cron.schedule('rf-support', '*/3 * * * *', $$
  SELECT net.http_get(
    url := 'https://portal.rockfoundationng.com/api/cron/support',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 60000);
$$);
SELECT cron.schedule('rf-support-enyo', '*/2 * * * *', $$
  SELECT net.http_get(
    url := 'https://portal.rockfoundationng.com/api/cron/support?step=enyo',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 60000);
$$);
```

Check with `SELECT status_code, created FROM net._http_response ORDER BY
created DESC LIMIT 5;` (200 is working; 401 means the secret does not match).
Each job's last run also shows on **Settings**.

## 7. Your domain

When rockfoundationng.com's subdomains are ready, add them in each Vercel
project (**Settings → Domains**), create the DNS records Vercel shows, then
update `BETTER_AUTH_URL`, `NEXT_PUBLIC_PORTAL_URL` and
`NEXT_PUBLIC_WEBSITE_URL` in both projects and the addresses in the Supabase
scheduler, and redeploy. Keep the `vercel.app` address working during the
move by listing it in `BETTER_AUTH_TRUSTED_ORIGINS`.

## 8. Enyo (optional)

Create an API key at console.anthropic.com (billing on, a monthly spend
limit set) and put it in `ENYO_LLM_API_KEY`, with
`ENYO_LLM_PROVIDER="anthropic"`, in both projects. **Settings → Enyo** then
shows it switched on. Without a key, Enyo says "not switched on yet" and
everything else works. See [ENYO.md](ENYO.md).

## 9. Bringing in existing records

Bring the records in through **Data Exchange** (`/data-exchange`) in this
order: staff, customers, vehicles, suppliers, parts, opening stock, then
invoice and job history and the Job Cards still open on the go-live day.
Details: [DATA_MIGRATION.md](DATA_MIGRATION.md).

From **QuickBooks Desktop**: open the Customer Center or the Item List and use
**Excel → Export** to save the list as an Excel or CSV file. From
**QuickBooks Online**: **Sales → Customers** (or **Products and services**) →
**Export to Excel**. From other spreadsheets: save as Excel or CSV.

For each file:

1. **New import**: choose what the file holds and upload it (any size; it is
   read in blocks).
2. Match the columns. Common column names are matched for you; a matching
   can be saved for the next file of the same kind.
3. Check the preview: each row shows whether it will be added, matched to an
   existing record, or refused, with the reason. Possible duplicates are
   listed, never merged silently.
4. A **second person** (the Owner) approves and loads it. Running the same
   file again adds nothing twice, and a finished import can be undone.

## 10. Before the first real Job Card

Work through [OPERATIONS_CHECKLIST.md](OPERATIONS_CHECKLIST.md) (firewall,
deployment protection, backups, MFA) and the drills in
[RUNBOOKS.md](RUNBOOKS.md).
