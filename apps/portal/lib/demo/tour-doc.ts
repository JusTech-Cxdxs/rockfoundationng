/**
 * Writes docs/DPHOENIX_DEMO.md from the demo people (./people.ts) and the
 * role tour (./tour.ts), so the document can never drift from the accounts
 * or from what the catalogue allows: `npm run demo:tour-doc` writes it and
 * tests/demo-tour.test.ts fails when it is out of date. Pure.
 */
import { DEMO_CUSTOMERS, DEMO_STAFF, DEMO_DOMAIN, type DemoBranch } from './people';
import { DIRECTOR_TOUR, tourFor, type TourLink } from './tour';
import { DEMO_ORG_NAME, DEMO_ORG_SLUG, REAL_ORG_SLUG } from './organisation';

const PLACE: Record<DemoBranch, string> = { HQ: 'Headquarters (organisation-wide, no branch)', VI: 'Victoria Island Workshop' };
const cell = (s: string) => s.replace(/\|/g, '\\|');
const links = (xs: TourLink[]) => xs.map((x) => `${cell(x.label)} (\`${x.href}\`)`).join('<br>');
const numbered = (xs: TourLink[]) => xs.map((x, i) => `${i + 1}. ${cell(x.label)} (\`${x.href}\`)`).join('<br>');

export function renderTourDoc(): string {
  const out: string[] = [];
  out.push(`# The D'Phoenix Autocare demo — sign in as anyone

The demo is a working copy of the Victoria Island workshop that anyone can
be shown without touching a real customer: its own organisation,
**${DEMO_ORG_NAME}** (\`${DEMO_ORG_SLUG}\`), with its own Victoria Island
workshop, kept apart from the real organisation (\`${REAL_ORG_SLUG}\`),
which never receives a demo record. It has a person for every role —
**Headquarters** (organisation-wide, no branch) and the **Victoria Island
Workshop** — plus two customer-portal sign-ins. Pick a row, sign in, and
the portal shows that person's own view: their menu, their dashboard and
nothing else.

Each row says what that person sees first, **three clicks** that show
their job, and what they **must not** be able to do — try it: the portal
answers *Access denied*. Every demo person is named by their role; no real
person's name is used anywhere in the demo.

*Generated from \`apps/portal/lib/demo/people.ts\` and \`lib/demo/tour.ts\`
by \`npm run demo:tour-doc\`. A test fails if this file and those two ever
differ, and checks every "must not" and every click against the
authorization catalogue; \`e2e/demo-tour.spec.ts\` signs in as every person
and proves each one in the browser.*

## Switching the demo on

The demo is made only when the platform owner asks for it — never by a
normal deploy:

1. **On the hosting (Vercel):** set \`DEMO_STAFF_PASSWORD\` (8 characters or
   more) under Settings → Environment Variables → Production, and redeploy.
   The production build makes the demo organisation, its people and
   sign-ins (\`scripts/db-push-if-vercel.js\`, right after the schema), and
   the first time only, the workshop's seven months of records
   (\`npm run demo:ensure\`). A later deploy leaves what people did in the
   demo alone.
2. **From the portal:** the platform team (the Platform Administrator) opens
   **IT control room → Demo organisation**: *Make the demo organisation*,
   then *Load / refresh the demo now*, or *Remove the demo records*. Typed
   words confirm each step; every step is audited.
3. **From a terminal:** \`npm run demo:people\` (the organisation and the
   sign-ins), \`npm run demo:reset\` (everything again as of now),
   \`npm run demo:reset -- --remove\` (the records out), \`npm run demo:pulse\`
   (today's working day).

\`DEMO_ORG_SLUG\` names a different demo organisation (default
\`${DEMO_ORG_SLUG}\`). The real organisation, or any organisation that
already holds its own customers or job cards, is refused. To switch the
demo off: *Not a demo* on the console (its sign-ins are switched off on the
spot), then take \`DEMO_STAFF_PASSWORD\` out of the environment.

## The 15-minute tour for the directors

Sign in as each person in turn (every address ends with
\`@${DEMO_DOMAIN}\`; the customer at the customer portal's sign-in page).

| Minutes | Sign in as | Open | Show |
|---|---|---|---|`);
  for (const s of DIRECTOR_TOUR) out.push(`| ${s.minute} | \`${s.as}\` | \`${s.href}\` | ${cell(s.show)} |`);
  out.push(`
## The password

There is **one password for every demo sign-in**, and it is never written
down anywhere in the code or the documentation. It is whatever
\`DEMO_STAFF_PASSWORD\` is set to in the hosting environment, 8 characters
or more; the customer-portal sign-ins use \`DEMO_CUSTOMER_PASSWORD\` when
that is set and the staff password otherwise.

- **Not set:** no demo sign-ins exist at all. From a terminal:
  \`npm run demo:people\`.
- **Already made:** a later build changes nothing — not a password, not an
  account an administrator switched off. To set every demo password again
  (for example after a presentation), set \`RESET_DEMO_PASSWORDS=yes\` for
  one deploy and remove it; everyone signed in as a demo person is signed
  out.
- **Only the demo organisation** gets demo people: the one marked
  \`isDemo\` in \`organisations\`. A demo person found in any other
  organisation is switched off on the next run — never deleted.
- Every address ends with \`@${DEMO_DOMAIN}\`, a reserved name that is never
  routed: nothing is ever emailed to a demo person, and no real colleague
  can collide with one. Company contacts use example.com addresses. Phone
  numbers are on the 0800 000 range. Employee numbers start with \`DEMO-\`.
- Every run is audited (\`demo.people_loaded\`, with counts).

## The people`);
  for (const b of ['HQ', 'VI'] as const) {
    out.push(`\n### ${PLACE[b]}\n\n| Sign in as | Role · employee no. | First view | Three clicks | Must not |\n|---|---|---|---|---|`);
    for (const s of DEMO_STAFF.filter((x) => x.branch === b)) {
      const t = tourFor(s.email)!;
      const role = `${cell(s.jobTitle)}${s.alsoRoles?.length ? ` (also ${s.alsoRoles.join(', ')})` : ''}${s.dept ? ` · ${s.dept}` : ''} · ${s.employeeId}`;
      const mustNot = t.mustNot.length ? links(t.mustNot) : 'Sees everything read-only; opens no job and approves no money (no page to refuse).';
      out.push(`| \`${s.email}\` — ${cell(s.name)} | ${role} | ${cell(t.firstView)} | ${numbered(t.clicks)} | ${mustNot} |`);
    }
  }
  out.push(`\n### Customer portal\n\n| Sign in as | Who | What to show |\n|---|---|---|`);
  for (const c of DEMO_CUSTOMERS) out.push(`| \`${c.email}\` | ${cell(c.name)}${c.company ? ' (fleet, on credit)' : ''} | ${cell(c.show)} |`);
  out.push(`
## What each scenario shows

- **Fleets on credit.** Six organisation customers — SEEPCO, RCL Africa,
  Nairda Limited, Desicon Engineering, Dori Construction and Inspiration FM
  — each with a Fleet Manager on the account, credit terms approved by
  Finance (15 to 45 days) and a handful of vehicles: Toyota Hilux, Hiace,
  Land Cruiser and Corolla, Ford Ranger, Nissan Patrol, Mitsubishi L200,
  Hyundai H-100 and a Mercedes-Benz Sprinter. They pay no deposit; their
  vehicles leave once the invoice is issued, and the invoice is due on the
  issue date plus their terms. Most are paid by transfer; some are not yet
  due; a few are **past their due date** (Customers → the company's page,
  and the dashboard).
- **Private customers.** A dozen individuals with their own cars (Camry,
  RX 350, Highlander, C300, Venza, Accord, Sienna, ES 350, RAV4 and more,
  2006 to date). They pay a 50% deposit before work starts and the balance
  on collection.
- **Repairs and services, one Job Card.** Seven months of Job Cards, about
  half of them services (Service ticked), in every status today: checked
  in, waiting for the customer, in progress, waiting for parts bought
  outside, quality check (one sent back for rework after its road test),
  completed, ready for collection, closed, checked out and cancelled (one
  with its deposit refunded).
- **Estimates in naira.** Labour, parts bought outside and sundries at
  Victoria Island prices, VAT at 7.5% fixed when the Manager approves, 10%
  off labour for some fleets, a few whole-estimate discounts (above 10%,
  approved by the Manager).
- **The customer's answer.** By the secure link (sent by email or
  WhatsApp), in the customer portal, by phone (taken down by the Front
  Desk) or by paying the deposit at the counter — and one estimate the
  customer declined, asking for a cheaper option.
- **Invoices and receipts.** Every finished Job Card has its invoice (the
  number, VAT, any discount, what was paid when it was issued) and every
  payment its receipt (RCT-…).
- **The Service Tracker.** Vehicles due for service soon and overdue (by
  date or by kilometres), with the reminders already sent; *Send reminder*
  by email or *Send on WhatsApp* for the rest.
- **Security, Scheduling, Support.** Visitors (one past their time today),
  exit passes (one out and overdue, one waiting for the head of
  department), road tests, incidents, parts deliveries at the gate, the
  morning meeting, broadcasts and support requests, including a complaint.
- **Data Exchange.** The cut-over imports — the Zoho Books contacts and
  invoices, the workshop's own vehicles register and past jobs, the staff
  list — and exports made since.

Nothing of the Store, Warranty, the assembly plant or SAP: those are off in
this edition.

## Every day after

The demo does not go stale: each Lagos day adds its own working day —
check-ins this morning (repairs and a service), yesterday's estimates
written and approved and waiting for the Manager, a service booked for
tomorrow, visitors, the morning meeting, new support requests.
\`DEMO_DAILY_ACTIVITY=off\` stops it. The platform team reloads the whole
story from **IT control room → Demo organisation**, or from a terminal with
\`npm run demo:reset\`.
`);
  return out.join('\n');
}
