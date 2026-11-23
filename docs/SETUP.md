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
7. **Settings → Estimates, car wash and warranty** (`/settings/money`):
   - **Estimate approval.** Front desk prepares an estimate and the
     supervisor checks it. That check is the final approval unless you tick
     "The Owner approves every estimate" or set an amount above which you
     approve. You always approve an estimate with a discount above the limit,
     lines not charged to the customer (warranty, goodwill, internal) and a
     comeback on earlier work.
   - **Car wash prices.** A package with a price is a quick check-in: priced,
     started at once, then finished, paid and checked out without a close
     request. A package without a price goes through the normal steps.
   - **Workshop guarantee.** Days and/or kilometres per job type, whichever
     comes first (defaults: service 30 days or 1,000 km; repair 90 days or
     5,000 km; spraying 12 months; diagnostics and car wash none). It prints
     on the invoice and is fixed on the Job Card when the vehicle is checked
     out. A vehicle back within it can be opened as a comeback.

## 5. Email

Use the workshop's own mail provider (for example Google Workspace or
Microsoft 365) or a sending service. Set `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASSWORD` and
`SMTP_FROM="Rock Foundation Automobile <no-reply@your-domain>"` in **both**
projects. Send yourself a password reset to check it. **Settings** shows
sent and failed emails for the last 7 days.

## 5a. WhatsApp

WhatsApp is how most customers want to hear from the workshop, so it works in
two ways.

### Send on WhatsApp: works with no set-up

Every customer email has a **Send on WhatsApp** button beside it. Press it,
then **Open WhatsApp**, and WhatsApp opens on your own phone or computer with
the same message written; you press send. A document (the estimate, invoice
or receipt) goes as a secure link to its PDF (`https://<staff portal>/d/…`),
which works for 30 days and opens nothing else. No WhatsApp account set-up is
needed for this.

### Automatic WhatsApp: every message, by itself

Once it is set up, every email the two apps send that has a WhatsApp version
also goes out on WhatsApp by itself, from the business number: the check-in
(saying what the visit is for: a service, spraying, a car wash…), work
started, the estimate **with its PDF**, the approval link and its reminders,
ready for collection, collected, the "How did we do?" rating link, the
**invoice with its PDF**, each **payment receipt with its PDF**, refunds,
service reminders, support and complaint replies and announcements. Staff get
the notices that matter on a phone: something waiting for their approval, a
job assigned to them, a vehicle released at the gate, a broadcast.
**docs/WHATSAPP_TEMPLATES.md** lists every message, when it is sent, and the
few that stay email-only (password and set-password links, for example) with
the reason. The **Send on WhatsApp** buttons stay; beside the estimate,
invoice and receipt ones a **Send now on WhatsApp** button appears.

It is **off** until all of these are done:

1. **A Meta Business account.** At business.facebook.com, create the business
   account for Rock Foundation Automobile Investment Ltd (or use the one you
   have) and complete **Business verification** with the CAC registration
   (RC 1772429). Meta limits an unverified business to a few conversations a
   day.
2. **Add WhatsApp.** At developers.facebook.com → **My Apps → Create app**
   (type *Business*), add the **WhatsApp** product and link it to the
   business account. This creates a **WhatsApp Business Account**.
3. **Register the business phone number.** WhatsApp Manager → **Phone
   numbers → Add phone number**: the number customers know (for example
   0803 304 9194), verified by SMS or a call, with the display name *Rock
   Foundation Automobile*. A number already on the WhatsApp Business app can
   be connected too (Meta calls it coexistence); replies then keep arriving in
   that app. The portal does not read WhatsApp replies, and each customer
   message ends "Call us on 0803 304 9194".
4. **A permanent token.** Business settings → **Users → System users → Add**
   (an *Admin* system user named, say, *EJO WhatsApp*). **Assign assets**: the
   app and the WhatsApp Business Account (full control). **Generate new
   token** for the app, expiry *Never*, with the permissions
   **whatsapp_business_messaging** and **whatsapp_business_management**.
   Paste it straight into Vercel (step 7), never into an email or chat.
5. **Note the two IDs.** WhatsApp Manager → **API setup** shows the **Phone
   number ID** and the **WhatsApp Business Account ID**.
6. **Create every template.** WhatsApp Manager → **Message templates →
   Create template**, one for each entry in **docs/WHATSAPP_TEMPLATES.md**,
   exactly as written there: the name (`rf_…`), the category, English, the
   header (*Document* where it says so; upload any sample PDF), the body word
   for word, the footer and the samples. Meta usually approves within minutes
   to a day; until then its messages fail quietly (the email still goes) and
   **Settings → WhatsApp** shows the template as pending.
7. **Set the settings in BOTH Vercel projects** (staff portal and customer
   portal) → Settings → Environment Variables, for Production:

   | Name | Value |
   | --- | --- |
   | `WHATSAPP_ACCESS_TOKEN` | the permanent token (step 4) |
   | `WHATSAPP_PHONE_NUMBER_ID` | the Phone number ID (step 5) |
   | `WHATSAPP_BUSINESS_ACCOUNT_ID` | the WhatsApp Business Account ID (step 5) |
   | `WHATSAPP_GRAPH_VERSION` | `v27.0` (or leave it out: that is the default) |
   | `WHATSAPP_TEMPLATE_LANGUAGE` | `en` (or leave it out), the language of the templates |

   Then **redeploy** both projects (Deployments → the latest → **Redeploy**).
8. **Check it.** Settings → **WhatsApp** shows *Automatic sending is on*,
   each template's approval, and **Send a test template**: send
   `rf_staff_update` to your own phone. Every message sent, failed or skipped
   is listed there (the number's last four digits only; kept 90 days).

**Customers must agree.** WhatsApp messages a business starts need the
customer's agreement (Meta's rules and the Nigeria Data Protection Act).
When a customer is registered, the box
**"The customer agrees to receive updates on WhatsApp"** is ticked once a
phone number is typed: ask them, and untick it if they say no. It is recorded with your name and the time. It can
be changed on the customer's page (**Edit details**) and by the customer in
the customer portal (**Profile → Notifications**). Customers brought in from
a spreadsheet stay off unless the file has a *WhatsApp updates* column saying
*Yes*. Messages go to the customer's WhatsApp number when one is recorded
(Customer care details), otherwise to their phone.

**Colleagues choose for themselves** on **My profile → WhatsApp notices**,
with their mobile number. Off until they do.

**Meta charges per message** it delivers (utility messages cost less than
marketing ones; the customer announcement is a marketing template). Add a
payment method in WhatsApp Manager → **Billing**. To stop all automatic
WhatsApp at once, remove `WHATSAPP_ACCESS_TOKEN` from both projects and
redeploy: the **Send on WhatsApp** buttons keep working.

## 5b. QuickBooks

QuickBooks stays the accounting system. Nothing needs setting up on the server
for the QuickBooks Desktop file or the CSV files: the Owner or Accounts opens
**Settings → QuickBooks**, makes the account and item names match the company
file, and then exports from **Money → QuickBooks**. The full guide for the
accountant is [QUICKBOOKS_IMPORT.md](QUICKBOOKS_IMPORT.md).

The **QuickBooks Online connection** is optional and off until these are set
in the **portal** project (names only here; the values come from the Intuit
developer app, never in chat or code): `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`,
`QBO_REDIRECT_URI` (`https://<portal address>/api/quickbooks/callback`),
`QBO_TOKEN_KEY` (32 random bytes, base64) and `QBO_ENVIRONMENT` (`sandbox`
first, then `production`). Redeploy, then the Owner connects it in
**Settings → QuickBooks**.

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
-- Scheduled notices, access-changed emails and personal reminders.
SELECT cron.schedule('rf-reminders', '*/10 * * * *', $$
  SELECT net.http_get(
    url := 'https://portal.rockfoundationng.com/api/cron/reminders',
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
