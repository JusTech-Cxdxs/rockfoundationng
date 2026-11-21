/**
 * The D'Phoenix Autocare demo organisation's people — one sign-in for every
 * role at Headquarters and at the Victoria Island Workshop — and its two
 * customer-portal sign-ins. Pure data: no database, no secrets.
 *
 *   • Every address ends with @demo.dphoenix.example (a reserved name that is
 *     never routed), so a demo account can never be mistaken for, or collide
 *     with, a real colleague, and nothing is ever emailed to it.
 *   • A demo person's name is their role ("Front Desk", "Technician 1"): no
 *     real person's name is used anywhere in the demo. Employee numbers say
 *     what they are: DEMO-HQ-001, DEMO-VI-001 — never the ORG-BRANCH-NNNN
 *     numbers the portal issues to real staff.
 *   • Headquarters people have no branch on their profile: that is what makes
 *     them organisation-wide in the authorization catalogue (lib/authz).
 *   • No Store, Warranty or assembly-plant people: those modules are off in
 *     this edition (lib/modules.ts).
 *
 * The passwords come only from the environment (lib/demo/people-load.ts).
 * docs/DPHOENIX_DEMO.md and the tests read this list, so the tour and the
 * accounts can never drift apart.
 */

export const DEMO_DOMAIN = 'demo.dphoenix.example';

/** Where a demo person works: Headquarters (no branch) or the Victoria Island Workshop. */
export type DemoBranch = 'HQ' | 'VI';

export type DemoStaff = {
  /** The sign-in: local part @demo.dphoenix.example. */
  email: string;
  /** An address this person used to have; a load renames that account instead of making a second one. */
  previousEmail?: string;
  /** The role name the person is shown by (never a real name). */
  name: string;
  /** The employee number, fixed: DEMO-HQ-001 … */
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
  // ── Headquarters: organisation-wide, no branch ──────────────────────────
  { email: at('admin'), name: 'Administrator', employeeId: id('HQ', 1), role: 'administrator', jobTitle: 'Organisation Administrator', branch: 'HQ', dept: null, show: 'Everything, read-only, and the set-up: Structure, Users and Roles, Settings, Billing & tax, Data Exchange, the Recycle bin and the audit trail. Opens no job, approves no money.' },
  { email: at('md'), name: 'Managing Director', employeeId: id('HQ', 2), role: 'executive', jobTitle: 'Managing Director', branch: 'HQ', dept: null, show: 'The daily brief, every module and all analytics read-only: job cards open, money in, fleet invoices overdue, vehicles due for service. Broadcasts. Approves only what is escalated.' },
  { email: at('it.admin'), name: 'IT Administrator', employeeId: id('HQ', 3), role: 'it-administrator', jobTitle: 'IT Administrator', branch: 'HQ', dept: null, reportsTo: at('md'), show: 'Users and Roles, Settings, system health, the audit trail and error log, Data Exchange imports (Zoho and Excel) and exports. No business transaction.' },
  { email: at('care.lead'), name: 'Customer Care Lead', employeeId: id('HQ', 4), role: 'customer-care-lead', jobTitle: 'Customer Care Lead', branch: 'HQ', dept: null, reportsTo: at('md'), show: 'The Support centre: requests, complaints, hand-overs and the numbers; customer records.' },
  { email: at('broadcaster'), name: 'Broadcaster', employeeId: id('HQ', 5), role: 'broadcaster', jobTitle: 'Communications Officer', branch: 'HQ', dept: null, reportsTo: at('md'), show: 'Broadcasts: a notice to all staff, to the workshop, or to customers. Nothing else.' },
  { email: at('scheduling'), name: 'Scheduling Admin', employeeId: id('HQ', 6), role: 'scheduling-admin', jobTitle: 'Scheduling Administrator', branch: 'HQ', dept: null, reportsTo: at('md'), show: 'Meeting rooms and appointments; books on anyone’s calendar; the appointment digest.' },
  { email: at('calendar'), name: 'Calendar User', employeeId: id('HQ', 7), role: 'calendar-user', jobTitle: 'Personal Assistant to the Managing Director', branch: 'HQ', dept: null, reportsTo: at('md'), show: 'Their own calendar and appointments — and nothing of the workshop: the plainest proof of least privilege.' },

  // ── Victoria Island Workshop ────────────────────────────────────────────
  { email: at('manager'), name: 'Workshop Manager', employeeId: id('VI', 1), role: 'workshop-manager', jobTitle: 'Workshop Manager', branch: 'VI', dept: null, reportsTo: at('md'), show: 'Approvals: estimates (final word, discounts above the limit), closing and cancelling jobs, credit terms for fleet customers, exit passes, road tests. The Service Tracker and the workshop’s figures.' },
  { email: at('supervisor.cars'), name: 'Supervisor — Cars', employeeId: id('VI', 2), role: 'workshop-supervisor', jobTitle: 'Workshop Supervisor, Cars and SUVs', branch: 'VI', dept: 'workshop-passenger', reportsTo: at('manager'), show: 'The cars and SUVs bay: accept the job card, assign the technician, check the estimate, mark it ready for collection.' },
  { email: at('supervisor.fleet'), name: 'Supervisor — Fleet', employeeId: id('VI', 3), role: 'workshop-supervisor', jobTitle: 'Workshop Supervisor, Fleet and Commercial Vehicles', branch: 'VI', dept: 'workshop-commercial', reportsTo: at('manager'), show: 'The fleet bays: Hiace buses, Hilux and Ranger pickups, the Sprinter; fleet services due and the companies’ job cards.' },
  { email: at('tech.1'), name: 'Technician 1', employeeId: id('VI', 4), role: 'technician', jobTitle: 'Technician, Cars and SUVs', branch: 'VI', dept: 'workshop-passenger', reportsTo: at('supervisor.cars'), show: 'The jobs assigned to them: accept, inspect, write the estimate (labour, parts bought outside, sundries). Sees nobody else’s work queue.' },
  { email: at('tech.2'), name: 'Technician 2', employeeId: id('VI', 5), role: 'technician', jobTitle: 'Technician, Diagnostics', branch: 'VI', dept: 'workshop-passenger', reportsTo: at('supervisor.cars'), show: 'Diagnostics and repairs on cars and SUVs: a job in rework after the road test, an estimate to write.' },
  { email: at('tech.3'), name: 'Technician 3', employeeId: id('VI', 6), role: 'technician', jobTitle: 'Technician, Fleet Maintenance', branch: 'VI', dept: 'workshop-commercial', reportsTo: at('supervisor.fleet'), show: 'Fleet maintenance: a Hiace service in progress, a Land Cruiser repair waiting for parts.' },
  { email: at('frontdesk'), name: 'Front Desk', employeeId: id('VI', 7), role: 'receptionist', jobTitle: 'Front Desk Officer', branch: 'VI', dept: null, reportsTo: at('manager'), show: 'Customers and vehicles, opening a Job Card (repair or service), sending the estimate by link or taking the customer’s answer by phone, service reminders by email or WhatsApp, visitors expected.' },
  { email: at('finance'), name: 'Finance Officer', employeeId: id('VI', 8), role: 'finance-officer', jobTitle: 'Finance Officer', branch: 'VI', dept: null, reportsTo: at('manager'), show: 'Payments and receipts, invoices, the fleet accounts on credit and what they owe, a refund after a cancellation.' },
  { email: at('cso'), name: 'Chief Security Officer', employeeId: id('VI', 9), role: 'chief-security-officer', jobTitle: 'Chief Security Officer', branch: 'VI', dept: null, reportsTo: at('manager'), show: 'The Security desk: visitors, vehicles leaving, exit passes, road tests, the overdue item on the list, incidents.' },
  { email: at('gate'), name: 'Security Officer — Gate', employeeId: id('VI', 10), role: 'security-officer', jobTitle: 'Security Officer, Main Gate', branch: 'VI', dept: null, reportsTo: at('cso'), show: 'The gate: sign a visitor in, a vehicle out once it is released, a road test back in.' },
  { email: at('care'), name: 'Customer Care', employeeId: id('VI', 11), role: 'customer-care', jobTitle: 'Customer Care Officer', branch: 'VI', dept: null, reportsTo: at('care.lead'), show: 'The workshop’s Support centre: open requests, the complaint, the customer’s jobs and invoices to answer from.' },
  { email: at('dept.head'), name: 'Head of Department — Fleet', employeeId: id('VI', 12), role: 'department-head', jobTitle: 'Head of Department, Fleet Maintenance', branch: 'VI', dept: 'workshop-commercial', reportsTo: at('manager'), show: 'Authorises the department’s exit passes before the Manager approves them — and nothing else.' },
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
  { email: at('customer.individual'), kind: 'INDIVIDUAL', name: 'Tolani Bamgbose', phone: '0800 000 0101', address: '7 Ajose Adeogun Street, Victoria Island, Lagos', show: 'Their Toyota Camry: the estimate waiting for their approval in the portal, the invoice and receipt for last month’s service, the next service due.' },
  { email: at('customer.fleet'), kind: 'FLEET', name: 'SEEPCO', company: 'SEEPCO', phone: '0800 000 0102', address: 'Plot 12, Adeola Odeku Street, Victoria Island, Lagos', show: 'A fleet of Hilux, Land Cruiser and Hiace vehicles on 30-day credit terms: the job cards open today, an invoice past its due date, the vehicles due for service.' },
];

export const isDemoEmail = (email: string | null | undefined): boolean => String(email ?? '').toLowerCase().endsWith(`@${DEMO_DOMAIN}`);

/** The person for a role, or the first in a branch holding it (the tour and the tests). */
export function demoPerson(role: string, branch?: DemoBranch): DemoStaff {
  const p = DEMO_STAFF.find((s) => s.role === role && (!branch || s.branch === branch)) ?? DEMO_STAFF.find((s) => s.role === role);
  if (!p) throw new Error(`No demo person holds the role ${role}.`);
  return p;
}
