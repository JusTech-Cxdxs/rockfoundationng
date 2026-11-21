/**
 * The demo role tour: for every demo sign-in (./people.ts), what they see
 * first, three clicks that show their job, and what they must NOT be able to
 * do — plus the 15-minute order for showing the directors. Pure data.
 *
 * Rock Foundation Automobile's screens: the Job Card (service and repair),
 * estimates, invoices and receipts, the Service Tracker, customers and fleet
 * accounts, the parts store, the gate, Support and Data Exchange.
 *
 * docs/DEMO.md is generated from this file and ./people.ts
 * (`npm run demo:tour-doc`); tests/demo-tour.test.ts checks every promise
 * here against the authorization catalogue (a "must not" page is refused by
 * the catalogue, a click on a protected page is granted), and
 * e2e/demo-tour.spec.ts signs in as each person and proves it in the browser.
 */
import { DEMO_DOMAIN } from './people';

export type TourLink = { label: string; href: string };
export type TourStop = { firstView: string; clicks: [TourLink, TourLink, TourLink]; mustNot: TourLink[] };

const L = (label: string, href: string): TourLink => ({ label, href });

// Must-not links are protected pages (lib/authz/page-areas.ts) the person's roles do not open.
const NO_USERS = L('manage users', '/users');
const NO_SETTINGS = L('change settings', '/settings');
const NO_AUDIT = L('read the audit trail', '/audit-logs');
const NO_JOBS = L('open the job cards', '/workshop/job-cards');
const NO_ANALYTICS = L('open business analytics', '/analytics');
const NO_STRUCTURE = L('change the organisation’s structure', '/structure');
const NO_IMPORTS = L('bring records in (Data Exchange)', '/data-exchange');
const NO_ORGANISATION = L('change billing & tax and the organisation’s details', '/organisation');
const NO_REFUNDS = L('see refunds', '/workshop/refunds');

export const TOUR: Record<string, TourStop> = {
  // ── The whole business ──
  gmd: { firstView: 'The owner dashboard: vehicles in the workshop, revenue invoiced against collected, what customers owe, stock value and low stock, approvals waiting.', clicks: [L('Approvals', '/approvals'), L('Business analytics', '/analytics'), L('Roles in use', '/roles')], mustNot: [] },

  // ── Ota Workshop ──
  frontdesk: { firstView: 'Today’s work: vehicles checked in, estimates to send, vehicles ready for collection, complaints to follow up.', clicks: [L('Customers', '/workshop/customers'), L('Job Cards', '/workshop/job-cards'), L('The Service Tracker: remind by WhatsApp or email', '/workshop/service-tracker')], mustNot: [NO_USERS, NO_AUDIT, NO_ORGANISATION] },
  advisor: { firstView: 'Job cards to assign, inspect, check and pass through the quality check.', clicks: [L('Job Cards', '/workshop/job-cards'), L('Vehicles', '/workshop/vehicles'), L('Vehicles in custody', '/workshop/custody')], mustNot: [NO_USERS, NO_IMPORTS, NO_STRUCTURE] },
  'tech.1': { firstView: 'Their own jobs only, with what to do next on each.', clicks: [L('My job cards', '/workshop/job-cards'), L('Vehicles', '/workshop/vehicles'), L('My profile', '/profile')], mustNot: [NO_USERS, NO_AUDIT, NO_IMPORTS] },
  'tech.2': { firstView: 'A diagnostics job waiting for parts; an estimate to write.', clicks: [L('My job cards', '/workshop/job-cards'), L('Parts requests', '/workshop/parts-requests'), L('My profile', '/profile')], mustNot: [NO_USERS, NO_AUDIT, NO_IMPORTS] },
  'tech.3': { firstView: 'Spraying in the booth: the panels and colour on the job card.', clicks: [L('My job cards', '/workshop/job-cards'), L('Vehicles', '/workshop/vehicles'), L('My profile', '/profile')], mustNot: [NO_USERS, NO_AUDIT, NO_IMPORTS] },
  store: { firstView: 'The parts store: low stock, parts requests to issue, goods received.', clicks: [L('Parts', '/inventory/parts'), L('Parts requests', '/workshop/parts-requests'), L('Goods received', '/inventory/goods-receipts')], mustNot: [NO_USERS, NO_ANALYTICS, NO_IMPORTS] },
  accounts: { firstView: 'Money: deposits and balances, invoices and receipts, the fleet accounts on credit.', clicks: [L('Job Cards and their invoices', '/workshop/job-cards'), L('Refunds', '/workshop/refunds'), L('Customers and fleet accounts', '/crm')], mustNot: [NO_USERS, NO_SETTINGS] },
  gate: { firstView: 'The gate: vehicles in the compound and vehicles released to leave.', clicks: [L('The gate', '/security'), L('Vehicles inside', '/security/vehicles-inside'), L('Vehicles', '/security/vehicles')], mustNot: [NO_USERS, NO_REFUNDS, NO_IMPORTS] },
};

/** The tour stop for a demo sign-in. */
export const tourFor = (email: string): TourStop | undefined => TOUR[email.replace(`@${DEMO_DOMAIN}`, '')];

/** The 15-minute order for the directors: who to sign in as, what to show, in that order. */
export const DIRECTOR_TOUR: { minute: string; as: string; show: string; href: string }[] = [
  { minute: '0–2', as: 'gmd', show: 'The owner dashboard: vehicles in the workshop, revenue invoiced against collected, what customers owe, stock value and low stock.', href: '/dashboard' },
  { minute: '2–4', as: 'frontdesk', show: 'A fleet vehicle checked in this morning: the company on 30-day credit, the vehicle’s history, the Job Card opened as a service.', href: '/workshop/customers' },
  { minute: '4–6', as: 'tech.1', show: 'Only their jobs. Open one: the diagnosis and the estimate: labour, parts from the store and sundries, in naira.', href: '/workshop/job-cards' },
  { minute: '6–8', as: 'gmd', show: 'Approvals in one place: an estimate with a discount above 10% (the Owner’s final word, VAT fixed) and a cancellation.', href: '/approvals' },
  { minute: '8–9', as: 'frontdesk', show: 'The estimate sent to the customer on WhatsApp with its link; the answer by link, in the portal or by phone; the deposit for a private customer.', href: '/workshop/job-cards' },
  { minute: '9–10', as: 'store', show: 'The parts store: a part issued to the job card, low stock and the reorder list.', href: '/inventory/parts' },
  { minute: '10–11', as: 'accounts', show: 'A finished job: the invoice with VAT, the receipt for each payment, a fleet invoice on credit and one past its due date.', href: '/workshop/job-cards' },
  { minute: '11–12', as: 'frontdesk', show: 'The Service Tracker: who is due, who is overdue, the reminders already sent on WhatsApp or by email.', href: '/workshop/service-tracker' },
  { minute: '12–13', as: 'gate', show: 'The gate: the released vehicle leaves against its gate pass; the vehicles still in the compound.', href: '/security' },
  { minute: '13–14', as: 'customer.individual', show: 'The customer portal: the estimate waiting for approval, last month’s invoice and receipt, the next service due.', href: '/customer-portal' },
  { minute: '14–15', as: 'gmd', show: 'Control: every action in the audit trail, nothing deleted for good (the Recycle bin), each role only where it belongs.', href: '/audit-logs' },
];
