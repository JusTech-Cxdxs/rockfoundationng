# Architecture

How the Rock Foundation Automobile system is put together, for an engineer
who has to read it, run it or change it. The binding rules are in
[ARCHITECTURE_BASELINE.md](ARCHITECTURE_BASELINE.md); where the two differ on
a detail, this page and the code are newer.

- [The two applications](#the-two-applications)
- [The database package](#the-database-package)
- [Repository layout](#repository-layout)
- [How a request flows](#how-a-request-flows)
- [Organisations, branches and the fence](#organisations-branches-and-the-fence)
- [Roles, permissions and scopes](#roles-permissions-and-scopes)
- [Audit trail and deletes](#audit-trail-and-deletes)
- [Workflow integrity](#workflow-integrity)
- [Scheduled work, email and realtime](#scheduled-work-email-and-realtime)
- [Modules, the menu and the brand](#modules-the-menu-and-the-brand)
- [System design and scale](#system-design-and-scale)
- [Adding a module](#adding-a-module)
- [Changing the database](#changing-the-database)
- [Coding rules](#coding-rules)

## The two applications

| App | Who uses it | What it is |
|---|---|---|
| `apps/portal` | Staff | The staff portal. Next.js 15 App Router. Pages are server components. Every write is a server action in `lib/actions/*` that authorises and then calls Prisma directly. |
| `apps/website` | Customers | The customer portal under `/customer-portal` (its root opens the sign-in), with its own customer sign-in, plus the estimate approval links, the support page and the privacy and terms pages. |

There is no separate API server. Server actions give one place to
authorise, validate, write and audit.

```
staff browser ──► staff portal ──Prisma──► PostgreSQL ◄──Prisma── customer portal ◄── customer browser
                    │  ▲                                              │
                    │  └── scheduled jobs (Vercel Cron, Supabase)     └──► SMTP
                    ├──► SMTP
                    ├──► Anthropic (Enyo, server-side only)
                    └──► realtime ping ("something changed", no data) ──► staff browsers
```

## The database package

`packages/database` (imported as `@ejo/database`) holds:

- `prisma/schema.prisma`: every table. PostgreSQL 16.
- `src/index.ts`: the one shared Prisma client.
- `src/audit-journal.ts`: records every write with its before and after
  values (secrets removed; a transaction that rolls back leaves no entry).
- `prisma/seed.ts`: Rock Foundation Automobile, the Ota workshop, the roles
  and the platform administrator.

Both applications use this package. There is no second path to the
database.

## Repository layout

```
rockfoundationng/
├── apps/
│   ├── portal/                     staff portal (Next.js)
│   │   ├── app/(app)/<module>/     signed-in pages; a module's layout or page guards it (guardPage / guardAnyPage)
│   │   ├── app/(auth)/             sign-in, forgot and reset password
│   │   ├── app/print/              printable documents (same record checks as the pages)
│   │   ├── app/d/[token]/          secure document links sent on WhatsApp (30 days, revocable)
│   │   ├── app/api/                auth, health, live pulse, search, Enyo, scheduled jobs
│   │   ├── lib/actions/            server actions ('use server'); *-form-handlers.ts adapt forms to them
│   │   ├── lib/authz/              permission catalogue, enforcement, navigation
│   │   ├── lib/governance/         data inventory (every table declared)
│   │   ├── lib/data-exchange/      imports, the cut-over checklist
│   │   ├── lib/exports/            exports to Excel and CSV
│   │   ├── lib/recycle-bin/        recoverable deletes
│   │   ├── lib/email-templates/    one file per email
│   │   ├── lib/pdf/                estimate, invoice, receipt and inspection PDFs
│   │   ├── lib/*.ts                pure rules and helpers (billing, credit, reminders, integrity, calendars)
│   │   ├── components/             shared UI (components/ui for page building blocks)
│   │   ├── tests/                  unit and source-coverage tests (node --test)
│   │   └── e2e/                    Playwright specs, seed, security sweeps
│   └── website/                    customer portal (Next.js)
├── packages/
│   ├── database/                   Prisma schema, client, audit journal, seed
│   ├── enyo/                       the assistant's shared core (model client, tools, guardrails)
│   ├── ui/                         shared React components
│   ├── types/                      shared TypeScript types
│   ├── utils/                      framework-free helpers
│   └── config/                     design token fallbacks
├── scripts/                        deploy scripts; postdeploy/ SQL
├── docs/                           this folder
└── .github/workflows/              ci.yml, e2e.yml, security.yml
```

Code that both apps need goes in `packages/*` and is imported as `@ejo/*`.
Where the two apps need the same small helper with different runtime
dependencies (email, auth), each app keeps its own copy and the copies say
so in a comment.

## How a request flows

A member of staff presses a button. This is what happens, in order:

```
browser
  └─► middleware.ts            sign-in cookie present; submission flood limit; security headers
        └─► page or server action
              requireUser()                 session read from the database; switched-off accounts refused
              authorize(permission, record) tenant fence first, then scope; a refusal is audited as access.denied
              workflow check                compare-and-set on the status the person saw; row locks for money and stock
              Prisma write                  the audit journal records before and after
              writeAuditLog(...)            the business event in plain words (who, what, which record)
        └─► after the response              emails, realtime ping; their failure never undoes the action
```

1. **Page.** A page under `app/(app)/<module>/` is a server component. It
   calls `guardPage('<permission>', '<path>')` before it reads anything.
   A person without the permission is sent to *Access denied*.
2. **Server action.** A form or button calls an exported function in
   `lib/actions/<area>.ts`. Each one starts with `requireUser()` and
   `authorize(...)` (or a named guard such as `authorizeOnJobCard`).
   `tests/guard-coverage.test.ts` reads the source and fails if a
   data-changing action has no check.
3. **Authorisation.** `lib/authz/server.ts` loads the person's roles,
   grants, branch and organisation once per request and calls the pure
   `decide()` function in `lib/authz/catalogue.ts`. Buttons use `allows()`,
   which is the same rule, so a hidden button and a refused action never
   disagree.
4. **Prisma.** Reads of a list go through `reachWhere` / `orgWhere`; reads
   of one record check that record (`seeOrNull`, `canSeeRecord`). Creates
   stamp the organisation and branch from the server, never from the form.
5. **Audit.** The journal in `packages/database` records the data change;
   `writeAuditLog` in `lib/workshop-core.ts` records the business event.

The customer portal follows the same shape with its own customer session
(`apps/website/lib/auth-customer.ts`). Customer pages query by the session's
customer id, never by an id from the address.

## Organisations, branches and the fence

```
Platform team ─ Organisation ─ Business unit ─ Branch ─ Department ─ Team ─ People
                            └─ customers and vehicles (organisation-wide)
```

- One database can hold more than one organisation (Rock Foundation
  Automobile and its demo organisation). Nothing in code assumes a
  particular one: the organisation, its business unit and the Ota workshop
  are rows created by the seed.
- **The tenant fence.** A record outside the person's organisation is
  refused before any scope is considered, including the widest one. Out of
  reach and missing look the same ("not found").
- **The branch fence.** Most records belong to a branch. A person scoped to
  a branch sees that branch's records only. Rock Foundation runs one
  workshop today; the fence is already in place for more branches later.
- **Branches have a kind** (`lib/branch-types.ts`): workshop, head office or
  warehouse. Job cards only live on workshop branches; parts and stock only
  load into a workshop or a warehouse.
- Every table is declared in `lib/governance/data-inventory.ts` with its
  tenancy, owner column, sensitivity, lifecycle, retention and whether Enyo
  may read it. `tests/data-inventory.test.ts` fails if a table is missing.
- Staff and customers are separate identity systems: different tables and
  different cookies. A customer session cannot be used on the staff portal.

## Roles, permissions and scopes

- `PERMISSIONS` in `lib/authz/catalogue.ts` is the only list of things that
  can be done. The same file holds each role's default grants
  (`ROLE_GRANTS`) and what Front Desk covers while an optional role is off
  (`OPTIONAL_ROLE_COVER`, applied by `effectiveRoles`). The Permissions
  page, the Roles page and each person's "what I can do" are generated from
  it.
- The optional roles switched on are stored on the organisation
  (`optionalRoles`) and read by `lib/authz/server.ts`, cached for a minute.
- Five scopes: `ALL` (every branch of the organisation), `BRANCH`,
  `DEPARTMENT`, `ASSIGNED` (the job's supervisor or technician) and `OWN`.
- Cost prices, margins, stock value and profit need `store.cost.view`,
  which only the Owner holds by default.
- Separation of duties is in the actions, not only in the roles: nobody
  approves their own request, and an import is never approved by the
  person who prepared it.
- What each role sees and does: [ROLES_AND_ACCESS.md](ROLES_AND_ACCESS.md).

## Audit trail and deletes

- Every data change is journalled with before and after values. Every
  business step is a named event (`job_card.approved`,
  `payment.recorded`) with the person and the organisation.
- Audit rows are append-only in the database
  (`scripts/postdeploy/0005-audit-log-append-only.sql`).
- Business records end through their workflow (cancel, close, reject), not
  by deletion. Payments, refunds and goods receipts are never changed.
- **Recycle bin** (`lib/recycle-bin/`). A record made by mistake, with
  nothing of consequence on it, is moved to the bin and can be restored
  whole for a set period (`RECYCLE_BIN_DAYS`, 30 by default). Undoing an
  import also moves what it added to the bin.

## Workflow integrity

Two tools, in `lib/integrity.ts`:

- **Compare-and-set.** A status change includes the status the person saw
  in its `where`. If someone else acted first, nothing is written and the
  person is told to refresh.
- **Row locks** (`SELECT … FOR UPDATE`) where a total is checked and then
  changed: payments, refunds, stock.

Payments, refunds and goods receipts also carry an idempotency key, so a
form sent twice records once.

## Scheduled work, email and realtime

- Scheduled routes are under `apps/portal/app/api/cron/`: `pricing-alerts`
  (the daily morning job, which also runs scheduled exports and the
  clean-ups), `export-schedules`, `support` (the Support centre's mail and
  follow-ups, and `?step=enyo`) and `service-reminders` (a count of
  reminders due, for monitoring). Each needs
  `Authorization: Bearer <CRON_SECRET>` (`lib/cron-auth.ts`). Vercel runs
  the daily ones (`apps/portal/vercel.json`); the Supabase scheduler calls
  the frequent ones (setup: [SETUP.md](SETUP.md)). Every run is recorded
  (`lib/job-runs.ts`) and shown on Settings.
- Email goes through one adapter per app (`lib/email.ts`) over SMTP. Every
  customer email also has a "Send on WhatsApp" button that opens WhatsApp
  with the same message and a secure document link (`app/d/[token]`).
- A realtime ping carries no data, only "something changed". Each browser
  then re-reads through the same permission checks. Without the realtime
  settings the browser polls `GET /api/live/pulse`.

## Modules, the menu and the brand

`apps/portal/lib/modules.ts` lists the modules and is the module switch: a
module set to `DISABLED` is off the menu, the dashboard, search, Enyo and
the customer portal, and `lib/edition.ts` makes its permissions refused on
the server. `lib/authz/navigation.ts` builds each person's menu from the
modules and the permission catalogue, so nobody sees a door they cannot
open.

Colours are defined once as CSS variables in each app's `globals.css`
(`--brand-blue` #3E4095, `--brand-red` #EC3237, `--brand-red-web` #DD3333,
`--whatsapp` #25D366) and used through the `--ejo-*` names, with light and
dark values. The font is Roboto through `next/font`. The logos are
`public/brand/logo.png` and `public/brand/emblem.png` in each app, used as
published. The platform's own name and the "Powered by EJO · JusTech" line
live in `packages/enyo/src/brand.ts` (`npm run brand:sync` copies it to both
apps). The workshop's name, address and phones come from the organisation
record inside the portal.

## Money and the workshop warranty

- **Who approves an estimate** is one pure rule, `lib/money/rules.ts`
  `ownerMustApprove`: the supervisor's check is final unless the Owner's
  setting, an amount, a discount above the limit, a line not charged to the
  customer or a comeback says otherwise. When the Owner does the check, it is
  the Owner's approval in the same step.
- **Credit notes** (`lib/actions/credit-notes.ts`) are asked for against an
  issued invoice and approved by the Owner (CN-YYYY-NNNNNN). A pending note
  holds its amount; the Job Card row is locked while it is decided, so two
  requests can never credit the same money. Approved notes count as settled
  wherever a balance is worked out: checkout, close requests, recording a
  payment, credit limits (`lib/credit.ts`), statements and the Job Card page.
- **Statements and ageing** (`lib/money/statements-server.ts`): balance =
  invoice total − (payments − refunds) − approved credit notes, aged from the
  invoice date in Lagos days: 0–30, 31–60, 61–90, over 90.
- **POS** is a payment method with the terminal's transaction reference.
- **The quick car wash** (`lib/workshop/car-wash.ts`): a priced package opens
  with its estimate already approved (`customerApprovedVia: COUNTER`) and the
  work started; it moves in-progress → completed (invoice) → checked out once
  paid, with no close request.
- **The workshop guarantee** (`lib/money/warranty.ts`): terms per job type in
  Settings, frozen on the invoice at issue (`Invoice.guarantee`) and fixed on
  the Job Card at checkout (`warrantyUntil`, `warrantyUntilKm`, whichever
  comes first). A comeback (`JobCard.comebackOfId`) is only allowed on the
  vehicle's own checked-out job whose guarantee still runs; its lines bill to
  WARRANTY and the Owner approves. Faulty parts are claimed back from
  suppliers (`SupplierClaim`, CLM-YYYY-NNNNNN). The warranty report shows the
  comeback rate by job type and technician, warranty and goodwill cost, and
  open claims.

## System design and scale

- **Stateless app servers.** Both apps run as serverless functions on
  Vercel. No request depends on the machine that served the last one: no
  sticky sessions, sessions live in the database, so Vercel adds instances
  as traffic grows and removes them when it falls.
- **Database connections.** At run time the apps connect through
  Supabase's transaction pooler (`DATABASE_URL` with `pgbouncer=true`), so
  many short-lived functions share a few real connections.
  `PRISMA_CONNECTION_LIMIT` keeps each instance small. Schema pushes use the
  direct connection (`DIRECT_URL`).
- **Correctness under load.** Money and stock totals are checked under row
  locks; status changes are compare-and-set; payments, refunds and goods
  receipts carry idempotency keys. Two people pressing the same button at
  the same moment cannot record twice or overspend
  (`tests/concurrency.db.test.ts` proves it against a real database).
- **Rate limits.** Sign-in and password resets are limited per address
  (`AUTH_*`, `CUSTOMER_*`); Enyo is limited per person, per customer and per
  address (`ENYO_*`); `middleware.ts` limits floods of form submissions.
- **Caching.** Slow-changing lookups (the organisation's branches, the
  optional roles) use `unstable_cache` with tags, so a change clears them
  at once (`revalidateTag`) and every instance shares the result. Static
  files (logos, fonts, scripts) are served from Vercel's CDN.
- **Background work.** Emails and realtime pings run after the response;
  longer work runs in the cron routes, in batches that are safe to repeat.
- **At ten times today's load:** move the database to a larger Supabase
  compute size and add a read replica for analytics and exports; raise the
  pooler's pool size; move the heaviest reports to scheduled summaries;
  keep the apps as they are (they already scale out). Change only when the
  numbers on Settings (scheduled jobs, database space) or Supabase's
  reports say so.

## Adding a module

The order that keeps the security and audit rules intact:

1. **Schema.** Add the models to `packages/database/prisma/schema.prisma`
   with an `organisationId` or `branchId` (or a parent link). Additive
   only. If the push needs SQL first (a backfill, a unique index), add a
   numbered file to `scripts/predeploy/` (the folder is read when it
   exists).
2. **Data inventory.** Declare each table in
   `apps/portal/lib/governance/data-inventory.ts`.
   `tests/data-inventory.test.ts` fails until this is done.
3. **Permissions.** Add the keys to `PERMISSIONS` in
   `apps/portal/lib/authz/catalogue.ts` and grant them to roles with a
   scope. Add allowed and denied cases to `tests/authz.test.ts`.
4. **Rules.** Put the pure rules (statuses, checks, verdicts) in `lib/` with
   no database access, so they can be unit-tested
   (`lib/estimate-billing.ts` is an example).
5. **Server actions.** One file in `apps/portal/lib/actions/`. Each
   exported action: `requireUser()`, `authorize(...)`, fenced reads,
   compare-and-set for status changes, `writeAuditLog` for each change,
   plain error messages.
6. **Pages.** `apps/portal/app/(app)/<module>/`, each guarded with
   `guardPage` / `guardAnyPage`. Reuse `components/ui` (`PageHeader`,
   `SectionCard`, `EmptyState`, `StatusChip`). Check phone width and dark
   mode.
7. **Menu.** Add the module to `lib/modules.ts` as `LIVE` and its menu rule
   to `lib/authz/navigation.ts`.
8. **Notifications and email** through the existing rules
   (`lib/notification-rules.ts`) and templates (`lib/email-templates/`),
   with a WhatsApp message beside every customer email.
9. **Tests.** Unit tests for the pure rules; a Playwright spec in a new file
   under `apps/portal/e2e/` covering the normal path, a refused role and a
   person from another organisation. Seed additions must be safe to run
   twice.
10. **Docs.** Update the module table in the top-level `README.md` and, if a
    rule changed, `ARCHITECTURE_BASELINE.md`.

## Changing the database

- Schema changes are additive once released. `prisma db push` runs without
  `--accept-data-loss`, so a change that would drop a column or table stops
  the deploy.
- A production deploy runs, in order: `scripts/predeploy/*.sql` (when the
  folder exists), the schema push, `scripts/postdeploy/*.sql`
  (`scripts/db-push-if-vercel.js`, `scripts/apply-predeploy-sql.js`). The SQL
  files are numbered and safe to run twice.
- Row-level security is on for every table with no policies, and
  Supabase's public roles have no grants
  (`scripts/postdeploy/0001-rls-default-deny.sql`). The applications connect
  as the owner role through Prisma.
- Anything that reshapes existing data is a reviewed SQL script with a
  backup first.

## Coding rules

- **TypeScript strict.** No `any` without a comment saying why.
- **Every server action authorises first.** `requireUser()` and then
  `authorize(...)` (or a guard listed in `tests/guard-coverage.test.ts`).
  Reads by id check the record (`tests/tenant-coverage.test.ts`). CI fails
  otherwise.
- **Fence every query.** Lists use `reachWhere` / `orgWhere`. Creates stamp
  the organisation and branch from the server.
- **Audit every change** with `writeAuditLog`: a plain-language action, the
  record, and `changes: { field: { from, to } }` for edits. Never passwords
  or tokens.
- **Workflow changes are compare-and-set.** Money and stock totals are
  checked under a row lock.
- **Declare every new table** in the data inventory.
- **Schema changes are additive.** Never `--accept-data-loss`.
- **No hard-coded organisation data.** Names, addresses, phone numbers,
  bank details, URLs and email senders come from the database or
  environment variables.
- **Colours from tokens.** Use `var(--ejo-*)` or `var(--brand-*)`. Tailwind
  needs literal class strings, so never build a class name from a variable.
- **Plain English on screen.** Clear success and error messages; no stack
  traces or library messages. Money as ₦12,345.00, dates as DD/MM/YYYY in
  Africa/Lagos, distances in km. Use `pluralize` and the date helpers in
  `lib/utils`. British spelling ("organisation").
- **Comments say why**, in a sentence or two. History belongs in git.
- **Keep accessible names stable.** Playwright selects buttons, links and
  headings by role and name, so renaming a button can break a test.
