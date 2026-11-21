# Rock Foundation Automobile: workshop system (EJO)

The front desk, customer care, workshop and parts store system for
**Rock Foundation Automobile Investment Ltd** (RC 1772429), 1, Heal The World
Avenue, Opp. Gateway Hotel, Ota, Ogun State. Built on EJO, the JusTech
platform, with Enyo, its assistant.

Staff run the business in the **staff portal**. Customers and fleet companies
follow their vehicles, estimates, invoices and payments in the **customer
portal**. **QuickBooks stays the accounting system**: EJO handles the
customer, the vehicle and the work, and hands QuickBooks the figures.

- **Set it up:** [docs/SETUP.md](docs/SETUP.md): Supabase, Vercel, the first
  sign-in, email, your domain, and bringing in customers, vehicles and parts
  from Excel or QuickBooks.
- **Show it:** [docs/DEMO.md](docs/DEMO.md): the demo organisation, who to
  sign in as, and a 15-minute tour for the GMD and the board.
- **Everything else:** [docs/README.md](docs/README.md), the index.

## What is in it

| Module | What it does |
|---|---|
| Workshop | One Job Card for service and repair: check-in with mileage, inspection, the estimate, the customer's approval by link, portal or phone, deposits, parts, quality check, invoice, receipt and check-out. The service tracker and service-due reminders |
| Customers | Individuals and fleet companies, their vehicles and full history, notes, tags, credit with a due date, customer-portal access, and the Support centre for requests and complaints |
| Parts store | The parts catalogue, stock, goods received from suppliers, parts requests issued to Job Cards, pricing and reorder alerts, and stock analytics |
| Money | Estimates and invoices with VAT (7.5% by default, fixed once an estimate is approved), discounts with an approval limit, deposits, payments and receipts, refunds, credit |
| Gate | Vehicles in the compound, vehicles leaving, gate passes with a QR code |
| Customer portal | `apps/website`: vehicles, live job status, estimates to approve, invoices, payments, support requests |
| Data Exchange | Excel and CSV in and out: staff, customers, vehicles, suppliers, parts, opening stock, invoice and job history, open Job Cards on the day you go live, and every list out to Excel |
| Also on | WhatsApp buttons with the document link beside every customer email, notifications, reminders, scheduled jobs with a log, audit trail, recycle bin, integrity watch, business analytics, and Enyo (answers from the records each person may see) |

Modules are switched in `apps/portal/lib/modules.ts`. A module that is off is
off the menu, the dashboard, search, Enyo and the customer portal, and its
permissions are refused on the server.

## Roles

| Role | Always on? | In short |
|---|---|---|
| Owner / GMD | Yes | Sees and approves everything; the only role that sees cost prices, margins and profit |
| Front Desk / Customer Care | Yes | Receives vehicles and customers, opens Job Cards, estimates, invoices, payments, messages, complaints and follow-ups |
| Workshop Supervisor / Service Advisor | Optional | Assigns technicians, inspects, checks estimates, quality check |
| Technician | Optional | Their own jobs only |
| Store Keeper | Optional | Parts, stock, goods received, issuing parts to jobs; selling prices only |
| Accounts | Optional | Payments, refunds, statements and exports |
| Security | Optional | The gate |

The Owner switches the optional roles on in **Settings → Roles**. While one is
off, Front Desk covers its steps. Details:
[docs/ROLES_AND_ACCESS.md](docs/ROLES_AND_ACCESS.md). Every page and every
server action checks the permission on the server.

## Repository layout

```
apps/portal         staff portal (Next.js 15): pages, server actions, unit and browser tests
apps/website        customer portal (Next.js 15): /customer-portal, estimate approval links, support, privacy, terms
packages/database   Prisma schema, shared client, audit journal, seed
packages/enyo       Enyo's shared core (Anthropic Claude by default)
packages/ui         shared components
packages/types      shared types
packages/utils      shared helpers (money, WhatsApp links, approval links, service cycle)
packages/config     design token fallbacks
scripts/            deploy scripts and the post-deploy SQL (scripts/postdeploy/)
docs/               documentation (index: docs/README.md)
```

How it is built: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Running it locally

Needs Node.js 24, npm and a PostgreSQL 16 database of your own.

```bash
npm install                       # also generates the Prisma client
cp .env.example .env              # fill in your own values; never commit .env
npm run build --workspace=packages/database

# Create the tables in YOUR development database (never production)
npx prisma db push --schema=packages/database/prisma/schema.prisma

# Rock Foundation Automobile, the Ota workshop, the roles and the platform administrator
npm run seed --workspace=packages/database

npm run dev:portal                # http://localhost:3001 (staff portal)
npm run dev:website               # http://localhost:3000 (customer portal)
```

Point the `SMTP_*` settings at a local mail catcher such as Mailpit so no
email reaches a real inbox. `npm run demo:reset` loads the invented demo
records into their own organisation (see [docs/DEMO.md](docs/DEMO.md)).

Checks before every push (the same as CI):

```bash
npm run lint && npm run typecheck
npm run test --workspace=apps/portal
npm run test --workspace=packages/database
npm run test --workspace=packages/enyo
npm run test --workspace=apps/website
npm run build
```

Browser tests: [docs/TESTING_PROGRAMME.md](docs/TESTING_PROGRAMME.md). Every
environment variable and what it does: [.env.example](.env.example) and
[docs/OPERATIONS_CHECKLIST.md](docs/OPERATIONS_CHECKLIST.md).

## Hosting

- **Vercel** for the two apps (staff portal and customer portal), region
  Frankfurt (`fra1`).
- **Supabase Pro** for PostgreSQL, with daily backups (point-in-time recovery
  is a paid add-on).
- **Cloudflare R2** for an optional nightly backup copy (planned, Phase 9).
- Later on subdomains of rockfoundationng.com, for example
  `portal.rockfoundationng.com` and `my.rockfoundationng.com`.

## Build phases

1. Foundation: the workshop edition rebranded to Rock Foundation (colours,
   Roboto, logos, business details), everything unused removed, the roles
   and optional-role switches, settings, CI.
2. Customers, vehicles and customer care: complaints, follow-ups and ratings
   (planned).
3. Job cards with job types (service, repair, diagnostics, spraying, car
   wash), the workshop flow and PDFs (planned).
4. Parts store: counter sales, stock counts and the parts history of every
   vehicle (planned).
5. Money: statements, credit notes, the Approvals page and the workshop
   warranty (planned).
6. WhatsApp first: every message, with automatic WhatsApp ready but off
   (planned).
7. QuickBooks Desktop export and guide, QuickBooks Online connection (off by
   default), Excel import and export (planned).
8. Customer portal, fleet pages and reports, dashboards, gate, appointments,
   Enyo (planned).
9. Demo data, browser tests for every role, security tests, deploy notes
   (planned).

Later upgrades, not in this build: payroll and HR, vehicle sales, more
branches (Alagbado, Accra).

## Ownership and licence

Proprietary software of JusTech (Just Technologies), Lagos. The repository is
private and grants no licence; use, copying or deployment needs JusTech's
written permission. Data stored by a deployment belongs to Rock Foundation
Automobile and is handled under the Nigeria Data Protection Act 2023.

Powered by EJO · JusTech
