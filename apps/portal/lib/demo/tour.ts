/**
 * The demo role tour: for every demo sign-in (./people.ts), what they see
 * first, three clicks that show their job, and what they must NOT be able to
 * do — plus the 15-minute order for showing the directors. Pure data.
 *
 * Only D'Phoenix Autocare's screens: the Job Card (repairs and services),
 * estimates, invoices and receipts, the Service Tracker, customers and fleet
 * accounts, Security, Scheduling, Support and Data Exchange. Nothing of the
 * Store, Warranty, the assembly plant or SAP (all off in this edition).
 *
 * docs/DPHOENIX_DEMO.md is generated from this file and ./people.ts
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
  // ── Headquarters ──
  admin: { firstView: 'The dashboard, the set-up tiles and the day’s audit activity.', clicks: [L('Users and roles', '/users'), L('Billing & tax: VAT, the deposit, the discount limit', '/organisation'), L('The audit trail', '/audit-logs')], mustNot: [] },
  md: { firstView: 'The daily brief: job cards open, money in, fleet invoices overdue, vehicles due for service.', clicks: [L('Business analytics', '/analytics'), L('Job Cards: every status today', '/workshop/job-cards'), L('Customers and fleet accounts', '/crm')], mustNot: [NO_USERS, NO_SETTINGS] },
  'it.admin': { firstView: 'The IT control room: health, scheduled jobs, sign-in attempts.', clicks: [L('IT control room', '/it'), L('Users', '/users'), L('Data Exchange: the Zoho and Excel imports', '/data-exchange')], mustNot: [NO_JOBS, NO_ANALYTICS] },
  'care.lead': { firstView: 'The Support centre: open requests, complaints, due times.', clicks: [L('Support centre', '/crm/support'), L('Support analytics', '/crm/support/analytics'), L('Customers', '/crm')], mustNot: [NO_USERS, NO_STRUCTURE] },
  broadcaster: { firstView: 'Broadcasts: what is running, to whom, and who has read it.', clicks: [L('Broadcasts', '/notifications/broadcasts'), L('New broadcast', '/notifications/broadcasts/new'), L('Broadcast analytics', '/notifications/broadcasts/analytics')], mustNot: [NO_JOBS, NO_USERS] },
  scheduling: { firstView: 'Today’s appointments and the rooms.', clicks: [L('Schedule', '/schedule'), L('Meeting rooms', '/schedule/rooms'), L('Calendar', '/schedule/calendar')], mustNot: [NO_JOBS, NO_USERS] },
  calendar: { firstView: 'Their own calendar — and nothing of the workshop.', clicks: [L('My schedule', '/schedule'), L('Calendar', '/schedule/calendar'), L('My profile', '/profile')], mustNot: [NO_JOBS, NO_ANALYTICS, NO_USERS] },

  // ── Victoria Island Workshop ──
  manager: { firstView: 'Approvals waiting: estimates (and a discount above 10%), closings, cancellations, exit passes.', clicks: [L('Approvals', '/approvals'), L('Job Cards: every status today', '/workshop/job-cards'), L('The Service Tracker: due and overdue', '/workshop/service-tracker')], mustNot: [NO_USERS, NO_SETTINGS] },
  'supervisor.cars': { firstView: 'The cars and SUVs bay: job cards to accept, assign and check.', clicks: [L('Job Cards', '/workshop/job-cards'), L('Vehicles', '/workshop/vehicles'), L('Road tests', '/security/road-tests')], mustNot: [NO_USERS, NO_IMPORTS, NO_STRUCTURE] },
  'supervisor.fleet': { firstView: 'The fleet bays: the companies’ pickups, buses and vans.', clicks: [L('Job Cards', '/workshop/job-cards'), L('Customers and fleet accounts', '/workshop/customers'), L('The Service Tracker', '/workshop/service-tracker')], mustNot: [NO_USERS, NO_IMPORTS, NO_STRUCTURE] },
  'tech.1': { firstView: 'Their own jobs only, with what to do next on each.', clicks: [L('My job cards', '/workshop/job-cards'), L('Vehicles', '/workshop/vehicles'), L('My profile', '/profile')], mustNot: [NO_USERS, NO_AUDIT, NO_IMPORTS] },
  'tech.2': { firstView: 'A diagnostics job in rework after the road test; an estimate to write.', clicks: [L('My job cards', '/workshop/job-cards'), L('Road tests', '/security/road-tests'), L('My profile', '/profile')], mustNot: [NO_USERS, NO_AUDIT, NO_IMPORTS] },
  'tech.3': { firstView: 'Fleet maintenance: a service in progress, a repair waiting for parts.', clicks: [L('My job cards', '/workshop/job-cards'), L('Exit passes', '/security/exit-passes'), L('My profile', '/profile')], mustNot: [NO_USERS, NO_AUDIT, NO_IMPORTS] },
  frontdesk: { firstView: 'Today’s check-ins, estimates to send, vehicles ready for collection, visitors expected.', clicks: [L('Customers', '/workshop/customers'), L('The Service Tracker: remind by email or WhatsApp', '/workshop/service-tracker'), L('My visitors', '/security/my-visitors')], mustNot: [NO_USERS, NO_AUDIT, NO_ORGANISATION] },
  finance: { firstView: 'Money: deposits and balances, invoices and receipts, the fleet accounts on credit.', clicks: [L('Job Cards and their invoices', '/workshop/job-cards'), L('Refunds', '/workshop/refunds'), L('Business figures', '/analytics')], mustNot: [NO_USERS, NO_SETTINGS] },
  cso: { firstView: 'The Security desk: overdue items first.', clicks: [L('Overdue', '/security/overdue'), L('Incidents', '/security/incidents'), L('On the premises', '/security/on-premises')], mustNot: [NO_USERS, NO_REFUNDS, NO_IMPORTS] },
  gate: { firstView: 'The gate: who is expected, who is in, what is going out.', clicks: [L('The register', '/security/register'), L('Visitors', '/security/visitors'), L('Vehicles inside', '/security/vehicles-inside')], mustNot: [NO_USERS, NO_REFUNDS, NO_IMPORTS] },
  care: { firstView: 'The workshop’s Support centre: the complaint about a scratch, a question about an estimate.', clicks: [L('Support centre', '/crm/support'), L('Customers', '/crm'), L('New request', '/crm/support/new')], mustNot: [NO_USERS, NO_IMPORTS] },
  'dept.head': { firstView: 'Exit passes waiting for the head of department.', clicks: [L('Exit passes', '/security/exit-passes'), L('Approvals', '/approvals'), L('My profile', '/profile')], mustNot: [NO_USERS, NO_IMPORTS] },
};

/** The tour stop for a demo sign-in. */
export const tourFor = (email: string): TourStop | undefined => TOUR[email.replace(`@${DEMO_DOMAIN}`, '')];

/** The 15-minute order for the directors: who to sign in as, what to show, in that order. */
export const DIRECTOR_TOUR: { minute: string; as: string; show: string; href: string }[] = [
  { minute: '0–2', as: 'md', show: 'The daily brief: job cards open today, money in this week, fleet invoices past their due date, vehicles due for service.', href: '/dashboard' },
  { minute: '2–4', as: 'frontdesk', show: 'A fleet pickup checked in this morning: the company on 30-day credit, the vehicle’s history, the Job Card opened as a service.', href: '/workshop/customers' },
  { minute: '4–6', as: 'tech.3', show: 'Only their jobs. Open one: the diagnosis and the estimate — labour, parts bought outside and sundries, in naira.', href: '/workshop/job-cards' },
  { minute: '6–8', as: 'manager', show: 'Approvals in one place: an estimate with a discount above 10% (the Manager’s final word, VAT fixed), a closing, an exit pass.', href: '/approvals' },
  { minute: '8–9', as: 'frontdesk', show: 'The estimate sent to the customer by link (or WhatsApp); the answer by link, in the portal or by phone; the deposit for a private customer.', href: '/workshop/job-cards' },
  { minute: '9–10', as: 'finance', show: 'A finished job: the invoice with VAT, the receipt for each payment, a fleet invoice on credit and one past its due date.', href: '/workshop/job-cards' },
  { minute: '10–12', as: 'manager', show: 'The Service Tracker: who is due, who is overdue, the reminders already sent — by email or WhatsApp.', href: '/workshop/service-tracker' },
  { minute: '12–13', as: 'cso', show: 'Security: the visitor three hours past their time, the exit pass not back yet — what used to be a paper register.', href: '/security/overdue' },
  { minute: '13–14', as: 'customer.individual', show: 'The customer portal: the estimate waiting for approval, last month’s invoice and receipt, the next service due.', href: '/customer-portal' },
  { minute: '14–15', as: 'admin', show: 'Control: every action in the audit trail, nothing deleted for good (the Recycle bin), each role only where it belongs.', href: '/audit-logs' },
];
