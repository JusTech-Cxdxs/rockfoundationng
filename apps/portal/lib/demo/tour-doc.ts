/**
 * Writes docs/DEMO.md from the demo people (./people.ts) and the
 * role tour (./tour.ts), so the document can never drift from the accounts
 * or from what the catalogue allows: `npm run demo:tour-doc` writes it and
 * tests/demo-tour.test.ts fails when it is out of date. Pure.
 */
import { DEMO_CUSTOMERS, DEMO_STAFF, DEMO_DOMAIN, type DemoBranch } from './people';
import { DIRECTOR_TOUR, tourFor, type TourLink } from './tour';
import { DEMO_ORG_NAME, DEMO_ORG_SLUG, REAL_ORG_SLUG } from './organisation';

const PLACE: Record<DemoBranch, string> = { BIZ: 'The whole business (no branch)', OTA: 'Ota Workshop' };
const cell = (s: string) => s.replace(/\|/g, '\\|');
const links = (xs: TourLink[]) => xs.map((x) => `${cell(x.label)} (\`${x.href}\`)`).join('<br>');
const numbered = (xs: TourLink[]) => xs.map((x, i) => `${i + 1}. ${cell(x.label)} (\`${x.href}\`)`).join('<br>');

export function renderTourDoc(): string {
  const out: string[] = [];
  out.push(`# The Rock Foundation Automobile demo: sign in as anyone

The demo is a working copy of the Ota workshop that anyone can be shown
without touching a real customer: its own organisation,
**${DEMO_ORG_NAME}** (\`${DEMO_ORG_SLUG}\`), with its own Ota workshop,
kept apart from the real organisation (\`${REAL_ORG_SLUG}\`), which never
receives a demo record. Marked *Sample data*. It has a person for every
role (the Owner, business-wide, and the people of the **Ota Workshop**,
with every optional role switched on) plus two customer-portal sign-ins. Pick a row, sign in, and
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
   the first time only, the workshop's four months of records
   (\`npm run demo:ensure\`). A later deploy leaves what people did in the
   demo alone.
2. **From the portal:** the platform team (the Platform Administrator) opens
   the **demo console**: *Make the demo organisation*,
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
  for (const b of ['BIZ', 'OTA'] as const) {
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
\`DEMO_DAILY_ACTIVITY=off\` stops it. The platform team reloads the whole
story from the **demo console**, or from a terminal with
\`npm run demo:reset\`.
`);
  return out.join('\n');
}
