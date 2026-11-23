/**
 * The Rock Foundation Automobile demo organisation's people (one sign-in for
 * every role, business-wide and at the Ota Workshop) and its two
 * customer-portal sign-ins. Pure data: no database, no secrets.
 *
 *   • Every address ends with @demo.rockfoundation.example.com, an example
 *     domain that is never routed, so a demo account can never be mistaken
 *     for, or collide with, a real colleague, and nothing is ever emailed to it.
 *   • A demo person's name is their role ("Front Desk (Demo)", "Technician 1
 *     (Demo)"): no real person's name is used anywhere in the demo. Employee
 *     numbers say what they are: DEMO-BIZ-001, DEMO-OTA-001, never the
 *     ORG-BRANCH-NNNN numbers the portal issues to real staff.
 *   • Business-wide people (the Owner) have no branch on their profile: that
 *     is what makes them organisation-wide in the authorization catalogue.
 *   • Every optional role is switched on in the demo, so each has a person.
 *
 * The passwords come only from the environment (lib/demo/people-load.ts).
 * The demo guide and the tests read this list, so the tour and the accounts
 * can never drift apart.
 */

export const DEMO_DOMAIN = 'demo.rockfoundation.example.com';

/** Where a demo person works: the whole business (no branch) or the Ota Workshop. */
export type DemoBranch = 'BIZ' | 'OTA';

export type DemoStaff = {
  /** The sign-in: local part @demo.rockfoundation.example.com. */
  email: string;
  /** An address this person used to have; a load renames that account instead of making a second one. */
  previousEmail?: string;
  /** The role name the person is shown by (never a real name). */
  name: string;
  /** The employee number, fixed: DEMO-BIZ-001 … */
  employeeId: string;
  /** The role slug (lib/authz/catalogue ROLE_LABELS). */
  role: string;
  /** A second hat the same person wears. */
  alsoRoles?: string[];
  jobTitle: string;
  branch: DemoBranch;
  /** The department slug on that branch (packages/database/prisma/seed.ts); null = none. */
  dept: string | null;
  /** The sign-in of the person they report to. */
  reportsTo?: string;
  /** For the role tour: what to show when signed in as this person. */
  show: string;
};

const at = (local: string) => `${local}@${DEMO_DOMAIN}`;
const id = (branch: DemoBranch, n: number) => `DEMO-${branch}-${String(n).padStart(3, '0')}`;

/** The same minimum as the sign-in itself (Better Auth minPasswordLength in lib/auth.ts). */
export const DEMO_PASSWORD_MIN = 8;

// Numbers are fixed per person and never move: a later addition takes the next free number of its branch.
export const DEMO_STAFF: readonly DemoStaff[] = [
  // ── The whole business: no branch ───────────────────────────────────────
  { email: at('gmd'), name: 'Owner (Demo)', employeeId: id('BIZ', 1), role: 'owner', jobTitle: 'Group Managing Director', branch: 'BIZ', dept: null, show: 'Everything: the owner dashboard (vehicles in the workshop, revenue invoiced against collected, what customers owe, stock value and low stock, ratings), every approval waiting, cost prices and profit, settings and roles.' },

  // ── Ota Workshop ────────────────────────────────────────────────────────
  { email: at('frontdesk'), name: 'Front Desk (Demo)', employeeId: id('OTA', 1), role: 'front-desk', jobTitle: 'Front Desk and Customer Care Officer', branch: 'OTA', dept: null, reportsTo: at('gmd'), show: 'Today’s work: receiving vehicles and customers, opening job cards, estimates and invoices, payments, WhatsApp messages, complaints and follow-ups.' },
  { email: at('advisor'), name: 'Service Advisor (Demo)', employeeId: id('OTA', 2), role: 'workshop-supervisor', jobTitle: 'Workshop Supervisor and Service Advisor', branch: 'OTA', dept: 'workshop', reportsTo: at('gmd'), show: 'Assigning technicians, the inspection, checking the estimate before the Owner, and the quality check before a vehicle is ready.' },
  { email: at('tech.1'), name: 'Technician 1 (Demo)', employeeId: id('OTA', 3), role: 'technician', jobTitle: 'Technician, Mechanical', branch: 'OTA', dept: 'mechanical', reportsTo: at('advisor'), show: 'Only the jobs assigned to them: inspect, record the work and raise parts requests. Sees nobody else’s work.' },
  { email: at('tech.2'), name: 'Technician 2 (Demo)', employeeId: id('OTA', 4), role: 'technician', jobTitle: 'Technician, Electrical and Diagnostics', branch: 'OTA', dept: 'electrical', reportsTo: at('advisor'), show: 'Diagnostics and electrical work: a job waiting for parts, an estimate to write.' },
  { email: at('tech.3'), name: 'Technician 3 (Demo)', employeeId: id('OTA', 5), role: 'technician', jobTitle: 'Technician, Body and Spraying', branch: 'OTA', dept: 'body-spray', reportsTo: at('advisor'), show: 'Spraying in the booth: panels and colour on the job card.' },
  { email: at('store'), name: 'Store Keeper (Demo)', employeeId: id('OTA', 6), role: 'store-keeper', jobTitle: 'Store Keeper', branch: 'OTA', dept: 'store', reportsTo: at('gmd'), show: 'Parts and stock, goods received (without their cost), issuing parts to job cards, counter sales, stock counts for the Owner to approve, and the parts store report. Selling prices only.' },
  { email: at('accounts'), name: 'Accounts (Demo)', employeeId: id('OTA', 7), role: 'accounts', jobTitle: 'Accountant', branch: 'OTA', dept: null, reportsTo: at('gmd'), show: 'Payments and receipts, fleet accounts on credit and what they owe, statements and the QuickBooks export.' },
  { email: at('gate'), name: 'Security (Demo)', employeeId: id('OTA', 8), role: 'security', jobTitle: 'Security, Main Gate', branch: 'OTA', dept: null, reportsTo: at('gmd'), show: 'The gate: vehicles in the compound, and letting a released vehicle out against its gate pass.' },
];

export type DemoCustomerKind = 'INDIVIDUAL' | 'FLEET';

export type DemoCustomer = {
  email: string;
  kind: DemoCustomerKind;
  /** The individual's invented name, or the company's contact on the account. */
  name: string;
  /** Set for a company (a fleet). */
  company?: string;
  phone: string;
  address: string;
  show: string;
};

/**
 * Customer-portal sign-ins. The customers themselves are created with the
 * sign-ins (so the portal can be shown before the workshop demo is loaded);
 * their vehicles, job cards, estimates and invoices come with the workshop
 * demo, which finds them by these addresses.
 */
export const DEMO_CUSTOMERS: readonly DemoCustomer[] = [
  { email: at('customer.individual'), kind: 'INDIVIDUAL', name: 'Adaeze Okonkwo', phone: '0800 000 0101', address: '14 Example Close, Sango Ota, Ogun State', show: 'Her Toyota Corolla: the estimate waiting for her approval in the portal, the invoice and receipt for last month’s service, the next service due.' },
  { email: at('customer.fleet'), kind: 'FLEET', name: 'Bolaji Haulage Services', company: 'Bolaji Haulage Services Ltd', phone: '0800 000 0102', address: '3 Example Industrial Layout, Agbara, Ogun State', show: 'A fleet of Hilux, Hiace and Sienna vehicles on 30-day credit: the job cards open today, an invoice past its due date, the vehicles due for service.' },
];

export const isDemoEmail = (email: string | null | undefined): boolean => String(email ?? '').toLowerCase().endsWith(`@${DEMO_DOMAIN}`);

/** The person for a role, or the first in a branch holding it (the tour and the tests). */
export function demoPerson(role: string, branch?: DemoBranch): DemoStaff {
  const p = DEMO_STAFF.find((s) => s.role === role && (!branch || s.branch === branch)) ?? DEMO_STAFF.find((s) => s.role === role);
  if (!p) throw new Error(`No demo person holds the role ${role}.`);
  return p;
}
