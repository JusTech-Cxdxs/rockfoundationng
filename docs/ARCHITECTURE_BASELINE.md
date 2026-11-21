# Architecture and security baseline

**Status:** binding. Every change is checked against this document; changing
a rule here is itself a reviewed change. Where something is not built yet it
says **Planned**.

The one question for every change: **which of these rules does it touch, and
how does it keep them?**

---

## 0. The system as built

| Part | Where | Runs on | Notes |
|---|---|---|---|
| Staff portal | `apps/portal` (Next.js 15 App Router) | Vercel | Pages are server components; every write is a server action in `lib/actions/*` that calls Prisma directly. Route handlers only for auth, health, the live pulse, search, Enyo and scheduled jobs (`app/api/**`). |
| Customer portal | `apps/website` (Next.js 15) | Vercel (separate project) | `/customer-portal`, estimate approval links, support, privacy and terms, with its own Better Auth instance (`lib/auth-customer.ts`) on the customer tables. |
| Database | `packages/database` (Prisma 5.22) | Supabase PostgreSQL 16 (Pro) | The apps connect as the owner role. Supabase's public roles have no grants and row-level security is on for every table (§7). |
| Email | `apps/portal/lib/email.ts`, `apps/website/lib/email.ts` | Any SMTP server | One adapter per app; templates in `lib/email-templates/**`. |
| WhatsApp | `apps/portal/lib/whatsapp-messages.ts`, `app/d/[token]` | The person's own WhatsApp | "Send on WhatsApp" opens WhatsApp with the message and a secure document link; the server sends nothing. |
| Enyo | `packages/enyo`, `apps/*/lib/enyo` | Anthropic Claude (server-side) | Reads only through the asking person's permissions (§16). |
| Realtime | `lib/realtime-ping.ts`, `components/NotificationProvider.tsx` | Supabase Realtime | Data-free pings (§10). |
| Scheduled jobs | `app/api/cron/*` | Vercel Cron (daily), Supabase scheduler (every few minutes) | `CRON_SECRET` in the Authorization header, compared in constant time (`lib/cron-auth.ts`). |

## 1. Identity

- **Staff** sign in through Better Auth (`apps/portal/lib/auth.ts`):
  sessions in the database, HTTP-only cookies, 7-day sessions refreshed once
  a day of activity, sign-in and reset requests limited per address
  (`AUTH_SIGNIN_PER_MINUTE`, `AUTH_RESET_REQUESTS_PER_5_MIN`). A session
  cannot be created for a switched-off account, and `requireUser` re-checks
  on every request.
- **Customers** sign in to the customer portal through a separate Better
  Auth instance (`apps/website/lib/auth-customer.ts`) on separate tables
  (`Customer`, `CustomerSession`, `CustomerAccount`, `CustomerVerification`)
  with the cookie prefix `customer-auth` and 30-day sessions. A customer
  token can never be used on the staff portal, or the reverse. Customer
  pages query by the session's customer id, never by an id from the address.
- Every server action calls `requireUser()` first; every database write in
  that request is attributed to that person, with their organisation.
- Public sign-up is closed for staff and customers. Staff are added by an
  administrator (Staff → add a staff member: the person sets their own
  password from an email link; no password is ever emailed).
- An account with no organisation sees nothing of substance until an
  administrator places it; the check fails closed.

## 2. Organisation model (tenancy)

```
Platform (JusTech) ─┬─ Organisation (Rock Foundation Automobile) ─ Business unit ─ Branch (Ota Workshop) ─ Department ─ Team
                    └─ Organisation (Rock Foundation Automobile (Demo))
```

- **Platform team** = holders of the platform administrator role. Shown to
  the organisation as "Platform support"; the owner account
  (`PLATFORM_OWNER_EMAIL`) can only be changed by the owner.
- **Tenant fence:** `decide()` refuses any record whose branch is outside the
  person's organisation, before any scope (ALL included). Lists use
  `reachWhere`; organisation-owned data uses `orgWhere`.

## 3. Roles (segregation of duties)

| Role | Always on | Scope | Does |
|---|---|---|---|
| Owner / GMD | Yes | Whole organisation | Everything, including final approvals, cancellations, credit, stock adjustments; the only role with `store.cost.view` |
| Front Desk / Customer Care | Yes | Branch | Customers, vehicles, Job Cards, estimates, payments, messages, Support centre |
| Workshop Supervisor / Service Advisor | Optional | Branch | Assigns technicians, inspects, approves estimates before the Owner |
| Technician | Optional | Assigned jobs | Inspects, works, writes estimates and parts requests on their own jobs |
| Store Keeper | Optional | Branch | Parts, stock, goods received, issuing parts; selling prices only |
| Accounts | Optional | Branch | Payments, refunds, sensitive exports |
| Security | Optional | Branch | The gate |

`ROLE_GRANTS` in `apps/portal/lib/authz/catalogue.ts` is authoritative. The
Owner switches optional roles on in Settings → Roles
(`Organisation.optionalRoles`); while one is off its holders get nothing from
it and Front Desk gets the grants in `OPTIONAL_ROLE_COVER`. A person with
several roles gets the widest grant. The Owner may add a catalogue
permission to a role on the Roles page.

## 4. Permission model

`PERMISSIONS` in the catalogue is the only list of things that can be done.
A permission with no code enforcing it may not exist. The Permissions page,
the Profile page's "what I can do" and the welcome email are generated from
the same code (`lib/authz/describe-access.ts`).

## 5. Scope model

`ALL` (every branch of the organisation) · `BRANCH` · `DEPARTMENT` ·
`ASSIGNED` (the job's supervisor or technician) · `OWN`. `homeBranch` on a
check means the person must **belong** to that branch (approvals and money).

## 6. Authorization flow

```
request → requireUser → getPrincipal (roles, optional roles, grants, branch, organisation branches)
        → decide(permission, record) → tenant fence → scope → allowed / refused (audited as access.denied)
        → workflow state check (in the action, atomic compare-and-set)
        → database constraints (unique keys, foreign keys, triggers) → commit
```

- **Pages:** `guardPage` / `guardAnyPage`. **Actions:** `authorize`,
  `authorizeOnJobCard`, or an audited workflow check (`refuse`).
  **Buttons:** `allows` (same rule). **Records:** `canSeeRecord` /
  `seeOrNull` (out of reach = "not found"). **Lists, search, analytics:**
  `reachWhere`.
- **Anything hanging off a record** (payments, refunds, estimates, parts
  requests, audit trails): `seeJobCard` / `seeVehicle` / `seePart` check the
  parent record.
- A module switched off in `lib/modules.ts` has its permissions refused for
  everyone, the platform team included (`lib/edition.ts`).
- **Never:** trust a browser-supplied id, branch, role or price; hide a
  button as protection.
- **CI:** `tests/guard-coverage.test.ts` fails if any data-changing server
  action has no check; `tests/tenant-coverage.test.ts` fails if a read or
  write by id does not check the record or a fenced list loses its fence.

## 7. Tenant isolation rules

1. Every table is declared in `lib/governance/data-inventory.ts` (CI
   enforces it).
2. A branch table carries `branchId`; an organisation table
   `organisationId`; a child reaches its tenant through a declared parent
   column.
3. Every read of tenant data goes through `reachWhere` / `orgWhere` or a
   record check. Every create stamps the owner from the server.
4. Emails, notifications, search, analytics, exports, Enyo and realtime obey
   the same fence.
5. Row-level security is on for every table with no policies, and
   Supabase's `anon` and `authenticated` roles have no grants
   (`scripts/postdeploy/0001-rls-default-deny.sql`).

## 8. Data classification and lifecycle

The data inventory declares, for every table: tenancy, owner column,
classification (INTERNAL · PERSONAL · FINANCIAL · SECURITY · SECRET · AUDIT),
lifecycle (state machine · immutable · archive · cascade · expires · recycle
bin · editable), retention, and AI access (NEVER · AGGREGATE_ONLY ·
AUTHORISED_USER).

- Financial records (payments, refunds, goods receipts) and the audit trail
  are **immutable**.
- Business records end through their **workflow** (cancel, close with
  approval), not deletion.
- **Recycle bin** (`RecycleBinItem`, `lib/recycle-bin/`). Only for records
  created by mistake (Job Cards, customers, vehicles, parts, suppliers,
  staff) on which nothing of consequence has happened. One transaction locks
  the record, checks eligibility again under the lock, copies every row the
  delete removes into a snapshot, then deletes. Administrators restore within
  `RECYCLE_BIN_DAYS` (default 30, kept between 7 and 90); the daily clean-up
  removes expired snapshots and keeps a short tombstone. Records that took
  money are cancelled and refunded, never deleted.

## 9. Audit rules

- Business events: `writeAuditLog` (plain-language actions). Every data
  change: the database journal (before and after, secrets removed).
- Nothing in the audit trail is ever edited or deleted
  (`scripts/postdeploy/0005-audit-log-append-only.sql`). Scheduled-job runs
  are kept in their own view so they never bury people's work.

## 10. Realtime rules

A realtime ping carries **no data**, only "something changed". The browser
then re-reads through the same authorization. Caches and realtime are
accelerators, never authorities. The portal posts to one Supabase Realtime
broadcast topic (`lib/realtime-ping.ts`); browsers also call
`GET /api/live/pulse` (organisation-scoped) while in use. The customer
portal has its own `/api/customer/pulse`. **Planned:** private
per-organisation channels enforced by policies on `realtime.messages`.

## 11. Event rules

Every meaningful business change writes a named audit event
(`job_card.approved`, `payment.recorded` …). Notifications, the activity
feed, analytics, integrations and Enyo consume these events.

## 12. Transactions and concurrency

Two primitives, in `lib/integrity.ts` (pure half: `lib/integrity-core.ts`):

- **Compare-and-set:** workflow status changes are `updateMany` with the
  expected state in the `where`; 0 rows means someone else acted first, and
  the person sees "Someone else changed this just now; refresh" with nothing
  written.
- **Row locks** (`SELECT … FOR UPDATE`, ids sorted so two transactions queue
  instead of deadlocking) where a total is checked and then changed:
  payments, refunds and who-pays decisions (the Job Card row), stock
  reservation and release (`part_stock` rows), the last active administrator account, and
  one-per-record requests.
- Inside a transaction only the transaction client is used.
- **Idempotency keys** (unique in the database) on payments, refunds and
  goods receipts: a resent form records once.
- Human reference numbers (`JC-…`, `INV-…`, `RCT-…`, `GRN-…`, `PRS-…`) are
  "latest + 1" protected by a unique constraint; money and stock creations
  retry with the next number on a clash.
- Enforced in CI: `tests/integrity-coverage.test.ts` reads the source;
  `tests/concurrency.db.test.ts` runs real parallel transactions on a
  throwaway PostgreSQL; `packages/database/tests/audit-journal.test.ts`
  covers the journal rules.

## 13. Financial integrity

Totals are computed from immutable lines (estimate lines, payments,
refunds); paid amounts are always net of refunds; VAT is fixed on an
estimate when it is approved; a discount above the organisation's limit
needs the Owner; a cancelled job that took money cannot release the vehicle
until refunded.

## 14. Backup and recovery

Supabase Pro daily backups (point-in-time recovery as a paid add-on).
**Planned:** a nightly copy to Cloudflare R2. Targets and the restore drill
are in [RUNBOOKS.md](RUNBOOKS.md). Production database changes come only
from production deploys, never with data loss enabled.

## 15. Integration boundaries

External services (email, WhatsApp, Anthropic; QuickBooks later) sit behind
one adapter each (`lib/email.ts` is the pattern). Business code never calls a
provider directly. Integrations receive only what the triggering person may
see. Keys live only in the hosting settings.

## 16. AI security model

**Enyo is never an authorization authority.** It may read, summarise,
recommend and draft, always as the person using it, through the same
`authorize` / `reachWhere` tools, and only data whose inventory entry allows
AI. A person approves every action; the workflow, the fence and the database
decide whether it commits. SECRET data is never available to Enyo. Details:
[ENYO.md](ENYO.md).

## 17. Testing strategy

- `ci.yml` (every push to `main` and every pull request): lint, TypeScript
  strict, unit and source tests (catalogue decisions allowed **and** denied;
  guard, tenant, data-inventory and integrity coverage read the source),
  database tests on a throwaway PostgreSQL, a full production build,
  `npm audit`.
- `e2e.yml` (pull requests to `main`): Playwright against production builds
  of both apps, PostgreSQL 16 with the real schema and seed, a mail catcher,
  one account per role, a second organisation for cross-organisation
  attempts.
- `security.yml` (pull requests to `main`): Gitleaks over all history,
  Semgrep with project rules, OWASP ZAP baseline, access-control sweeps (role
  × page, IDOR, every server action signed out), RLS and grant probes,
  concurrency bursts. Details: [TESTING_PROGRAMME.md](TESTING_PROGRAMME.md).

## 18. Deployment

Push to `main` → CI → Vercel production deploy of each app:

1. `scripts/predeploy/*.sql` when the folder exists: additive, re-runnable
   SQL the push needs first;
2. `prisma db push` **without** `--accept-data-loss` (a destructive change
   stops the deploy);
3. `scripts/postdeploy/*.sql`: RLS on every table, no public grants,
   append-only audit;
4. the first sign-in (`scripts/seed-if-vercel.js`) and, when
   `DEMO_STAFF_PASSWORD` is set, the demo people.

Run by `scripts/db-push-if-vercel.js` (production only; previews skip).

## 19. Observability

Structured JSON error logs with a reference number shown to people
(`instrumentation.ts`, `lib/errors.ts`, `lib/log.ts`); `ErrorEvent` keeps
each reference for 90 days; `/api/health` on both apps; every scheduled job
recorded and shown on Settings with email-delivery health; refusals audited.
**Planned:** uptime and error alerting.

## 20. Scaling triggers (only with evidence)

| Add | When |
|---|---|
| Larger Supabase compute | Database CPU or memory regularly high on Supabase's reports |
| Read replica | Analytics or exports measurably slow the live system |
| Shared cache (Redis) | Rate limits or caches need sharing across many instances |
| Queue and workers | Emails or jobs take long enough to slow a person's action |
| Service extraction | A module needs independent scaling or release |
