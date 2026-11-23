# The Rock Foundation Automobile demo: sign in as anyone

The demo is a working copy of the Ota workshop that anyone can be shown
without touching a real customer: its own organisation,
**Rock Foundation Automobile (Demo)** (`rock-foundation-demo`), with its own Ota workshop,
kept apart from the real organisation (`rock-foundation`), which never
receives a demo record. Marked *Sample data*. It has a person for every
role (the Owner, business-wide, and the people of the **Ota Workshop**,
with every optional role switched on) plus two customer-portal sign-ins. Pick a row, sign in, and
the portal shows that person's own view: their menu, their dashboard and
nothing else.

Each row says what that person sees first, **three clicks** that show
their job, and what they **must not** be able to do — try it: the portal
answers *Access denied*. Every demo person is named by their role; no real
person's name is used anywhere in the demo.

*Generated from `apps/portal/lib/demo/people.ts` and `lib/demo/tour.ts`
by `npm run demo:tour-doc`. A test fails if this file and those two ever
differ, and checks every "must not" and every click against the
authorization catalogue; `e2e/demo-tour.spec.ts` signs in as every person
and proves each one in the browser.*

## Switching the demo on

The demo is made only when the platform owner asks for it — never by a
normal deploy:

1. **On the hosting (Vercel):** set `DEMO_STAFF_PASSWORD` (8 characters or
   more) under Settings → Environment Variables → Production, and redeploy.
   The production build makes the demo organisation, its people and
   sign-ins (`scripts/db-push-if-vercel.js`, right after the schema), and
   the first time only, the workshop's seven months of records
   (`npm run demo:ensure`). A later deploy leaves what people did in the
   demo alone.
2. **From the portal:** the platform team (the Platform Administrator) opens
   the **demo console**: *Make the demo organisation*,
   then *Load / refresh the demo now*, or *Remove the demo records*. Typed
   words confirm each step; every step is audited.
3. **From a terminal:** `npm run demo:people` (the organisation and the
   sign-ins), `npm run demo:reset` (everything again as of now),
   `npm run demo:reset -- --remove` (the records out), `npm run demo:pulse`
   (today's working day).

`DEMO_ORG_SLUG` names a different demo organisation (default
`rock-foundation-demo`). The real organisation, or any organisation that
already holds its own customers or job cards, is refused. To switch the
demo off: *Not a demo* on the console (its sign-ins are switched off on the
spot), then take `DEMO_STAFF_PASSWORD` out of the environment.

## The 15-minute tour for the directors

Sign in as each person in turn (every address ends with
`@demo.rockfoundation.example.com`; the customer at the customer portal's sign-in page).

| Minutes | Sign in as | Open | Show |
|---|---|---|---|
| 0–2 | `gmd` | `/dashboard` | The owner dashboard: vehicles in the workshop, revenue invoiced against collected, what customers owe, stock value and low stock. |
| 2–4 | `frontdesk` | `/workshop/customers` | A fleet vehicle checked in this morning: the company on 30-day credit, the vehicle’s history, the Job Card opened as a service. |
| 4–6 | `tech.1` | `/workshop/job-cards` | Only their jobs. Open one: the diagnosis and the estimate: labour, parts from the store and sundries, in naira. |
| 6–8 | `gmd` | `/approvals` | Approvals in one place: an estimate with a discount above 10% (the Owner’s final word, VAT fixed) and a cancellation. |
| 8–9 | `frontdesk` | `/workshop/job-cards` | The estimate sent to the customer on WhatsApp with its link; the answer by link, in the portal or by phone; the deposit for a private customer. |
| 9–10 | `store` | `/inventory/parts` | The parts store: a part issued to the job card, low stock and the reorder list. |
| 10–11 | `accounts` | `/workshop/job-cards` | A finished job: the invoice with VAT, the receipt for each payment, a fleet invoice on credit and one past its due date. |
| 11–12 | `frontdesk` | `/workshop/service-tracker` | The Service Tracker: who is due, who is overdue, the reminders already sent on WhatsApp or by email. |
| 12–13 | `gate` | `/security` | The gate: the released vehicle leaves against its gate pass; the vehicles still in the compound. |
| 13–14 | `customer.individual` | `/customer-portal` | The customer portal: the estimate waiting for approval, last month’s invoice and receipt, the next service due. |
| 14–15 | `gmd` | `/audit-logs` | Control: every action in the audit trail, nothing deleted for good (the Recycle bin), each role only where it belongs. |

## The password

There is **one password for every demo sign-in**, and it is never written
down anywhere in the code or the documentation. It is whatever
`DEMO_STAFF_PASSWORD` is set to in the hosting environment, 8 characters
or more; the customer-portal sign-ins use `DEMO_CUSTOMER_PASSWORD` when
that is set and the staff password otherwise.

- **Not set:** no demo sign-ins exist at all. From a terminal:
  `npm run demo:people`.
- **Already made:** a later build changes nothing — not a password, not an
  account an administrator switched off. To set every demo password again
  (for example after a presentation), set `RESET_DEMO_PASSWORDS=yes` for
  one deploy and remove it; everyone signed in as a demo person is signed
  out.
- **Only the demo organisation** gets demo people: the one marked
  `isDemo` in `organisations`. A demo person found in any other
  organisation is switched off on the next run — never deleted.
- Every address ends with `@demo.rockfoundation.example.com`, a reserved name that is never
  routed: nothing is ever emailed to a demo person, and no real colleague
  can collide with one. Company contacts use example.com addresses. Phone
  numbers are on the 0800 000 range. Employee numbers start with `DEMO-`.
- Every run is audited (`demo.people_loaded`, with counts).

## The people

### The whole business (no branch)

| Sign in as | Role · employee no. | First view | Three clicks | Must not |
|---|---|---|---|---|
| `gmd@demo.rockfoundation.example.com` — Owner (Demo) | Group Managing Director · DEMO-BIZ-001 | The owner dashboard: vehicles in the workshop, revenue invoiced against collected, what customers owe, stock value and low stock, approvals waiting. | 1. Approvals (`/approvals`)<br>2. Business analytics (`/analytics`)<br>3. Roles in use (`/roles`) | Sees everything read-only; opens no job and approves no money (no page to refuse). |

### Ota Workshop

| Sign in as | Role · employee no. | First view | Three clicks | Must not |
|---|---|---|---|---|
| `frontdesk@demo.rockfoundation.example.com` — Front Desk (Demo) | Front Desk and Customer Care Officer · DEMO-OTA-001 | Today’s work: vehicles checked in, estimates to send, vehicles ready for collection, complaints to follow up. | 1. Customers (`/workshop/customers`)<br>2. Job Cards (`/workshop/job-cards`)<br>3. The Service Tracker: remind by WhatsApp or email (`/workshop/service-tracker`) | manage users (`/users`)<br>read the audit trail (`/audit-logs`)<br>change billing & tax and the organisation’s details (`/organisation`) |
| `advisor@demo.rockfoundation.example.com` — Service Advisor (Demo) | Workshop Supervisor and Service Advisor · workshop · DEMO-OTA-002 | Job cards to assign, inspect, check and pass through the quality check. | 1. Job Cards (`/workshop/job-cards`)<br>2. Vehicles (`/workshop/vehicles`)<br>3. Vehicles in custody (`/workshop/custody`) | manage users (`/users`)<br>bring records in (Data Exchange) (`/data-exchange`)<br>change the organisation’s structure (`/structure`) |
| `tech.1@demo.rockfoundation.example.com` — Technician 1 (Demo) | Technician, Mechanical · mechanical · DEMO-OTA-003 | Their own jobs only, with what to do next on each. | 1. My job cards (`/workshop/job-cards`)<br>2. Vehicles (`/workshop/vehicles`)<br>3. My profile (`/profile`) | manage users (`/users`)<br>read the audit trail (`/audit-logs`)<br>bring records in (Data Exchange) (`/data-exchange`) |
| `tech.2@demo.rockfoundation.example.com` — Technician 2 (Demo) | Technician, Electrical and Diagnostics · electrical · DEMO-OTA-004 | A diagnostics job waiting for parts; an estimate to write. | 1. My job cards (`/workshop/job-cards`)<br>2. Parts requests (`/workshop/parts-requests`)<br>3. My profile (`/profile`) | manage users (`/users`)<br>read the audit trail (`/audit-logs`)<br>bring records in (Data Exchange) (`/data-exchange`) |
| `tech.3@demo.rockfoundation.example.com` — Technician 3 (Demo) | Technician, Body and Spraying · body-spray · DEMO-OTA-005 | Spraying in the booth: the panels and colour on the job card. | 1. My job cards (`/workshop/job-cards`)<br>2. Vehicles (`/workshop/vehicles`)<br>3. My profile (`/profile`) | manage users (`/users`)<br>read the audit trail (`/audit-logs`)<br>bring records in (Data Exchange) (`/data-exchange`) |
| `store@demo.rockfoundation.example.com` — Store Keeper (Demo) | Store Keeper · store · DEMO-OTA-006 | The parts store: low stock, parts requests to issue, goods received. | 1. Parts (`/inventory/parts`)<br>2. Parts requests (`/workshop/parts-requests`)<br>3. Goods received (`/inventory/goods-receipts`) | manage users (`/users`)<br>open business analytics (`/analytics`)<br>bring records in (Data Exchange) (`/data-exchange`) |
| `accounts@demo.rockfoundation.example.com` — Accounts (Demo) | Accountant · DEMO-OTA-007 | Money: deposits and balances, invoices and receipts, the fleet accounts on credit. | 1. Job Cards and their invoices (`/workshop/job-cards`)<br>2. Refunds (`/workshop/refunds`)<br>3. Customers and fleet accounts (`/crm`) | manage users (`/users`)<br>change settings (`/settings`) |
| `gate@demo.rockfoundation.example.com` — Security (Demo) | Security, Main Gate · DEMO-OTA-008 | The gate: vehicles in the compound and vehicles released to leave. | 1. The gate (`/security`)<br>2. Vehicles inside (`/security/vehicles-inside`)<br>3. Vehicles (`/security/vehicles`) | manage users (`/users`)<br>see refunds (`/workshop/refunds`)<br>bring records in (Data Exchange) (`/data-exchange`) |

### Customer portal

| Sign in as | Who | What to show |
|---|---|---|
| `customer.individual@demo.rockfoundation.example.com` | Adaeze Okonkwo | Her Toyota Corolla: the estimate waiting for her approval in the portal, the invoice and receipt for last month’s service, the next service due. |
| `customer.fleet@demo.rockfoundation.example.com` | Bolaji Haulage Services (fleet, on credit) | A fleet of Hilux, Hiace and Sienna vehicles on 30-day credit: the job cards open today, an invoice past its due date, the vehicles due for service. |

## What each scenario shows

- **Fleets on credit.** Invented fleet companies, each with a contact on the
  account, credit terms approved by the Owner and a handful of vehicles.
  They pay no deposit; their vehicles leave once the invoice is issued, and
  the invoice is due on the issue date plus their terms. Some are paid,
  some not yet due, and a few are **past their due date**.
- **Private customers.** Individuals with their own cars. They pay a
  deposit before work starts and the balance on collection.
- **Service and repair, one Job Card.** Job Cards in every status today:
  checked in, waiting for the customer, in progress, waiting for parts,
  quality check, ready for collection, checked out and cancelled.
- **Estimates in naira.** Labour, parts from the store, parts bought outside
  and sundries, VAT at 7.5% fixed when the Owner approves, and discounts
  above the limit approved by the Owner.
- **The customer's answer.** By the secure link (sent on WhatsApp or by
  email), in the customer portal, or by phone (taken down by Front Desk).
- **Invoices and receipts.** Every finished Job Card has its invoice and
  every payment its receipt.
- **The Service Tracker.** Vehicles due for service soon and overdue, with
  the reminders already sent; *Send on WhatsApp* or by email for the rest.
- **The gate and Support.** Vehicles released and leaving through the gate,
  support requests and a complaint.

## Every day after

The demo does not go stale: each Lagos day adds its own working day —
check-ins this morning (repairs and a service), yesterday's estimates
written and approved and waiting for the Owner, and new support requests.
`DEMO_DAILY_ACTIVITY=off` stops it. The platform team reloads the whole
story from the **demo console**, or from a terminal with
`npm run demo:reset`.
