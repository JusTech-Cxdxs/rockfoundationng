/** The organisation the seed creates (packages/database/prisma/seed.ts): every fixture hangs off it. */
export const ORGANISATION_SLUG = 'rock-foundation';
/** Its display name, as the workflows set it (E2E_ORG_NAME, else NEXT_PUBLIC_ORGANISATION_NAME). */
export const ORGANISATION_NAME = process.env.E2E_ORG_NAME || process.env.NEXT_PUBLIC_ORGANISATION_NAME || 'Rock Foundation Automobile';

/** The test accounts (throwaway test database only). */
export const E2E_PASSWORD = 'E2e-Test-Pass-2026!';
export const MASTER = { email: 'master@e2e.test', password: 'E2e-Master-Pass-2026!' };
/** The demo people's sign-in (lib/demo/people.ts) in CI: the workflow runs `npm run demo:people` with DEMO_STAFF_PASSWORD set to this. */
export const DEMO_E2E_PASSWORD = 'Demo-E2e-Pass-2026!';

export type Person = { email: string; name: string; role: string; dept?: string; extraRoles?: string[] };

/** The optional roles (lib/authz/catalogue.ts OPTIONAL_ROLES): the e2e seed switches all of them on for the test organisation. */
export const OPTIONAL_ROLES = ['workshop-supervisor', 'technician', 'store-keeper', 'accounts', 'security'] as const;

/** One account per role (the FIRST person with a role is the one `who(role)` returns). Invented names, by role. */
export const PEOPLE: readonly Person[] = [
  { email: 'owner@e2e.test', name: 'Owner Test', role: 'owner' },
  { email: 'frontdesk@e2e.test', name: 'Front Desk Test', role: 'front-desk' },
  { email: 'supervisor@e2e.test', name: 'Supervisor Test', role: 'workshop-supervisor', dept: 'workshop-passenger' },
  { email: 'tech@e2e.test', name: 'Technician Test', role: 'technician', dept: 'workshop-passenger' },
  { email: 'store@e2e.test', name: 'Store Keeper Test', role: 'store-keeper', dept: 'store' },
  { email: 'accounts@e2e.test', name: 'Accounts Test', role: 'accounts' },
  { email: 'security@e2e.test', name: 'Security Test', role: 'security' },
  // Holds BOTH Workshop Supervisor and Owner: for the segregation-of-duties
  // checks (approves as supervisor, so may not also give the Owner's final approval).
  { email: 'supervisorowner@e2e.test', name: 'Supervisor Owner Test', role: 'workshop-supervisor', dept: 'workshop-passenger', extraRoles: ['owner'] },
  // Only for user-administration tests (given roles / switched off during the run).
  { email: 'switchable@e2e.test', name: 'Switchable Test', role: 'accounts' },
];
/** Only for the forgot-password test (its password changes during the run). */
export const RESET: Person = { email: 'reset@e2e.test', name: 'Reset Test', role: 'technician', dept: 'workshop-passenger' };
export const SUPERMANAGER = PEOPLE.find((p) => p.email === 'supervisorowner@e2e.test')!;
export const SWITCHABLE = PEOPLE.find((p) => p.email === 'switchable@e2e.test')!;
export const OTHER_ORG_ADMIN = { email: 'other-owner@e2e.test', name: 'Other Organisation Owner' };
/** The workshop branch the seed creates (packages/database/prisma/seed.ts): where everyone above works. */
export const WORKSHOP_BRANCH = 'Ota Workshop';
/** A technician in a SECOND branch of the same organisation: for the branch fences. */
export const OTHER_BRANCH_TECH: Person = { email: 'otherbranch@e2e.test', name: 'Other Branch Technician', role: 'technician' };
export const SECOND_BRANCH = 'E2E Second Branch';
export const who = (role: string): Person => {
  const p = PEOPLE.find((x) => x.role === role);
  if (!p) throw new Error(`No seeded person for role ${role}`);
  return p;
};

/** Customers. */
export const CUSTOMER = { email: 'customer@e2e.test', name: 'Ada Customer' };
/** Customers who use the customer portal (known passwords). */
export const PORTAL_CUSTOMER = { email: 'portal-customer@e2e.test', name: 'Kemi Portal', password: 'Portal-Pass-2026!', plate: 'E2E-PORTAL-1' };
export const OTHER_PORTAL_CUSTOMER = { email: 'portal-other@e2e.test', name: 'Lanre Otherportal', password: 'Portal-Other-2026!', plate: 'E2E-PORTAL-2' };
/** Changes their own password (forgot password, change password) — nobody else signs in as them. */
export const PASSWORD_CUSTOMER = { email: 'portal-password@e2e.test', name: 'Tobi Passwordchange', password: 'Portal-Pwd-2026!', plate: 'E2E-PORTAL-3' };
/** Has their portal access switched off and on again by the front desk (CRM spec). */
export const SWITCH_CUSTOMER = { email: 'portal-switch@e2e.test', name: 'Funmi Switchoff', password: 'Portal-Switch-2026!', plate: 'E2E-PORTAL-4' };
/** Every customer with a portal password, seeded with a vehicle each. */
export const PORTAL_CUSTOMERS = [PORTAL_CUSTOMER, OTHER_PORTAL_CUSTOMER, PASSWORD_CUSTOMER, SWITCH_CUSTOMER] as const;

/** Store data seeded for the workflow specs (each spec uses its own part, so stock numbers never collide). */
export const SEED_PARTS = {
  /** Job Card lifecycle. */
  brakePads: { type: 'E2E Brake Pads', name: 'E2E Brake Pad Set', number: 'E2ES-001', price: 15000, stock: 100 },
  /** Cancellation — reserved, then returned when the Job Card is cancelled. */
  oilFilter: { type: 'E2E Oil Filter', name: 'E2E Oil Filter Unit', number: 'E2ES-002', price: 4000, stock: 40 },
} as const;
export const SEED_CATEGORY = { name: 'E2E Seed Parts', code: 'E2ES' };
