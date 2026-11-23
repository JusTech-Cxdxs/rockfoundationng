# Deploying Rock Foundation Automobile's system

How the system goes live and stays live: the two Vercel projects, the
database, the settings (by name only; values never go in the repository or
in chat), the first deploy, every later deploy, backups and rolling back.
The step-by-step first set-up, with screens to click, is
[SETUP.md](SETUP.md); this page is the checklist around it.

## What runs where

| Part | Where | Notes |
|---|---|---|
| Staff portal (`apps/portal`) | Vercel project 1, region Frankfurt (`fra1`) | `portal.rockfoundationng.com` once the domain is set |
| Customer portal (`apps/website`) | Vercel project 2, region Frankfurt | `my.rockfoundationng.com`; customers, fleet contacts, bookings, estimate links |
| Database | Supabase Pro, PostgreSQL, EU region | Daily backups by Supabase; point-in-time recovery is an add-on |
| Scheduled jobs | Vercel cron (daily) and the Supabase scheduler (every few minutes) | [SETUP.md](SETUP.md) §6 has the SQL |
| Backup copy | Cloudflare R2, written by a GitHub Actions job every night | Encrypted before it leaves; see "Backups" below |
| Email | Your SMTP provider | WhatsApp beside every email ([SETUP.md](SETUP.md) §5, §5a) |

`main` is the live branch: what is merged into `main` is what Vercel builds
for Production. Every other branch gets a Preview deploy.

## Settings, by name

Set them in each Vercel project for **Production** (and **Preview**, with a
Preview database, never the live one). What each does:
[.env.example](../.env.example) and [OPERATIONS_CHECKLIST.md](OPERATIONS_CHECKLIST.md).

| Needed by | Names |
|---|---|
| Both projects | `DATABASE_URL` (pooler), `DIRECT_URL` (direct), `BETTER_AUTH_SECRET` (same value in both), `NEXT_PUBLIC_PORTAL_URL`, `NEXT_PUBLIC_WEBSITE_URL`, `NEXT_PUBLIC_ORGANISATION_NAME`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` |
| Staff portal | `BETTER_AUTH_URL`, `CRON_SECRET`, `PLATFORM_OWNER_EMAIL`, `MASTER_ADMIN_NAME`, `MASTER_ADMIN_EMAIL`, `MASTER_ADMIN_PASSWORD`, `NEXT_PUBLIC_SITE_TAGLINE` |
| Customer portal | `WEBSITE_ORGANISATION_SLUG` (`rock-foundation`), `NEXT_PUBLIC_ORGANISATION_LEGAL_NAME`, `NEXT_PUBLIC_CONTACT_ADDRESS`, `NEXT_PUBLIC_CONTACT_PHONE` |
| Enyo (optional) | `ENYO_LLM_PROVIDER`, `ENYO_LLM_API_KEY`, `ENYO_LLM_MODEL` ([ENYO.md](ENYO.md)) |
| Automatic WhatsApp (off until set) | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` ([SETUP.md](SETUP.md) §5a) |
| QuickBooks Online (off until set) | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_TOKEN_KEY`, `QBO_ENVIRONMENT` ([SETUP.md](SETUP.md) §5b) |
| The demo (a demo deployment only) | `DEMO_STAFF_PASSWORD`, `DEMO_CUSTOMER_PASSWORD` ([DEMO.md](DEMO.md)) |
| Nightly backup (GitHub secrets, not Vercel) | `BACKUP_DATABASE_URL`, `BACKUP_ENCRYPTION_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |

A production build stops with a clear message when a required setting is
missing; the live site keeps running on the previous version.

## The first deploy

1. Supabase project on Pro in an EU region; enable `pg_cron` and `pg_net`.
2. The two Vercel projects ([SETUP.md](SETUP.md) §2), their settings above.
3. Deploy the **staff portal** first. Its build pushes the database schema
   (never with data loss allowed), turns row-level security on, and creates
   Rock Foundation Automobile, the Ota Workshop, its departments (Workshop,
   Mechanical, Electrical and diagnostics, Body and spraying, Car wash,
   Store), the roles and the platform administrator.
4. Deploy the **customer portal**.
5. Scheduled jobs: the Supabase scheduler SQL ([SETUP.md](SETUP.md) §6).
6. Domains ([SETUP.md](SETUP.md) §7): `portal.` and `my.` on
   rockfoundationng.com; then update the three address settings and the
   scheduler, and redeploy.
7. Sign in as the platform administrator, fill in the business details, add
   the staff, switch on the optional roles you have people for (Settings →
   Roles), set car wash prices, the guarantee per job type and the estimate
   approval rule (Settings → Estimates, car wash and warranty), the QuickBooks
   account names (Settings → QuickBooks) and the booking days and places
   (Settings → Bookings).
8. Run the checks below, then the backup once by hand.

## Every later deploy

1. Work on a branch; CI (`.github/workflows/ci.yml`) runs lint, typecheck,
   the unit tests of every package and the build; the browser tests
   (`e2e.yml`) run every role's journeys, the security and isolation checks
   and the accessibility check.
2. Merge into `main` only when both are green. Vercel builds Production.
3. **Database changes are additive only** once live: new tables, new
   columns with a default or nullable, new enum values. Never rename or drop
   a column that holds data, and never change a column's type in place. The
   build applies them with `prisma db push` without data loss; anything that
   would lose data stops the build.
4. After the deploy, the checks below.

## Checks after a deploy (10 minutes)

- `https://portal.rockfoundationng.com/api/health` and
  `https://my.rockfoundationng.com/api/health` answer `ok`.
- Sign in as the Owner: the dashboard loads; Approvals opens.
- Front Desk: open a Job Card for a test vehicle (any job type), add a
  photo, then cancel it.
- Store Keeper: the parts list opens and shows no cost anywhere.
- Accounts: a customer statement opens; Money → QuickBooks "Check the figures"
  for yesterday works.
- Customer portal: sign in as a test customer; the vehicle and its jobs show;
  `/book` offers days.
- Settings → Scheduled jobs: every job ran in the last hour (support,
  reminders) or day (the morning job).
- Supabase → Logs: no new errors.

## Backups

- **Supabase** keeps daily backups for 7 days (Pro). Add point-in-time
  recovery once real money is in the system.
- **A copy outside Supabase, every night:** `.github/workflows/backup.yml`
  runs `scripts/backup/backup-to-r2.sh` at 01:40 Lagos time. It dumps the
  database (`pg_dump`, custom format), encrypts it with AES-256 (a passphrase
  in `BACKUP_ENCRYPTION_KEY`; the Owner keeps a copy offline: without it the
  backups cannot be read), and uploads it to the R2 bucket with its
  checksum. Daily copies are kept 30 days, the copy of the 1st of each month
  for a year. Add the same keep-by dates as a lifecycle rule on the bucket.
- **Setting it up:** create the R2 bucket and an API token with read and write
  on that bucket only; add the six secrets in GitHub (Settings → Secrets and
  variables → Actions); run Actions → "Nightly backup to R2" → Run workflow
  once and check the file is in the bucket. Without the secrets the job says
  what is missing and stops.
- **Restore** (the quarterly drill, [RUNBOOKS.md](RUNBOOKS.md) §3):
  `scripts/backup/restore-from-r2.sh daily/YYYY-MM-DD.dump.enc` into a new,
  empty database. It checks the checksum and refuses the live database or
  one that already has tables.

## Rolling back

- **The apps:** Vercel → the project → Deployments → the last good one →
  **Instant Rollback**. Do both projects if both changed. Because database
  changes are additive, the previous version runs on the newer database.
- **Data entered by mistake:** the Recycle bin restores deleted records for
  30 days; the audit trail shows who changed what.
- **The database itself** (rare): restore Supabase's daily backup or
  point-in-time copy into a new project, or the R2 copy with the restore
  script, then point the two projects' `DATABASE_URL` and `DIRECT_URL` at it.

## The demo

The demo lives in its own organisation ("Rock Foundation Automobile (Demo)")
with invented people and records ([DEMO.md](DEMO.md)). `npm run demo:reset`
refuses a hosted or production database unless `DEMO_RESET_CONFIRM` is set to
the exact phrase it prints, never touches the real organisation, and removes
only the records it made.

## Not in this build (later upgrades)

Payroll and HR, vehicle sales, more branches (multi-branch), a dealership
warranty module (manufacturers' warranties on vehicles sold), an assembly
plant, and SAP.

Powered by EJO · JusTech
