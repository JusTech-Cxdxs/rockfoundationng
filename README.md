# EJO 100 — D'Phoenix Autocare edition

EJO 100 set up for **D'Phoenix Autocare**, an auto workshop in Victoria Island, Lagos, that also
maintains fleets for client companies. Staff run the workshop in the staff portal; customers
follow their own vehicles, estimates, invoices and payments in the customer portal.

- **Set it up:** [docs/DPHOENIX_SETUP.md](docs/DPHOENIX_SETUP.md) — Supabase, Vercel, the first
  sign-in, billing, email, your domain, and bringing in the Zoho and Excel records, step by step.
- **Show it:** [docs/DPHOENIX_DEMO.md](docs/DPHOENIX_DEMO.md) — the demo organisation, who to sign
  in as, and a 15-minute tour.
- **Everything else:** [docs/README.md](docs/README.md), the index of every document.

## What is in this edition

| On | What it does |
|---|---|
| Workshop | One Job Card for repairs and services: check-in, inspection, the estimate and the customer's approval (link, portal or phone), deposits, parts priced on the estimate, quality check, invoice, receipt, check-out |
| Customers | People and fleet companies, their vehicles and history; companies on credit with a due date; customer portal access |
| Customer portal | `apps/website`: vehicles, services, estimates to approve, invoices, payments, support requests |
| Data Exchange | Excel and CSV in and out: staff, customers, vehicles, invoice history, job card history and the work in the workshop on the day you go live — Zoho exports map themselves — and every list out to Excel |
| Also on | Security gate, scheduling and reminders, business analytics and headquarters figures, the support centre, notifications, audit trail, recycle bin, and Enyo (answers from the records each person may see) |

### The switches

Parts of the platform that this workshop does not use stay in the code, switched off, so they can
be switched on later without new work:

- **Modules** — `apps/portal/lib/modules.ts`, `platformModules`: Inventory (the parts Store),
  Warranty and the Assembly plant are `DISABLED`. Off means off the menu, the dashboard, search,
  Enyo and the customer portal; their addresses answer "not found".
- **Features** — `apps/portal/lib/modules.ts`, `EDITION_FEATURES`: the SAP link, outside-purchase
  approvals, the roadmap, news, speak-up, data-request pages and the separate Vehicle Service flow
  are `false`.
- **The customer portal's copy** — `apps/website/lib/edition.ts` must say the same about the
  modules; a test fails if the two disagree.

## Repository layout

```
apps/portal      staff portal (Next.js): pages, server actions, tests, browser tests
apps/website     customer portal (Next.js): /customer-portal, estimate approval links, support, privacy, terms
apps/api         NestJS API (platform team only)
packages/database  Prisma schema, shared client, audit journal, seed
packages/enyo    Enyo's shared core
packages/ui, types, utils, config   shared components, types, helpers, design tokens
ml/              Python package that trains Enyo's prediction models
scripts/         deploy scripts and reviewed SQL (predeploy/, postdeploy/)
docs/            documentation (index: docs/README.md)
```

How it is built: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Running it locally

Needs Node.js 24, npm and a PostgreSQL 16 database of your own.

```bash
npm install                       # also generates the Prisma client
cp .env.example .env              # fill in your own values; never commit .env

# Create the tables in YOUR development database (never production)
npx prisma db push --schema=packages/database/prisma/schema.prisma

# First organisation, roles and the platform administrator
npm run seed --workspace=packages/database

npm run dev:portal                # http://localhost:3001
npm run dev:website               # http://localhost:3000 (opens the customer portal sign-in)
```

Point the `SMTP_*` settings at a local mail catcher such as Mailpit so no email reaches a real
inbox. `npm run demo:reset` loads the invented demo records into their own organisation.

Checks before a pull request:

```bash
npm run lint && npm run typecheck
npm run test --workspace=apps/portal
npm run test --workspace=apps/website
```

The environment variables for each application, and what each one does, are in
[docs/OPERATIONS_CHECKLIST.md](docs/OPERATIONS_CHECKLIST.md) §1.

## Ownership and licence

Proprietary software. The repository is private and its contents grant no licence; use, copying
or deployment needs the written permission of the platform owner. Data stored by a deployment
belongs to the organisation it is about and is handled under the Nigeria Data Protection Act
2023.
