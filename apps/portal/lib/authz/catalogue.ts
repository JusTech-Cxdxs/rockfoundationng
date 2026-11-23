/**
 * EJO Authorization Catalogue (Rock Foundation Automobile edition).
 *
 * The one definition of what can be done in EJO, and the default grants per
 * role. Model: User → Role → Permission → Scope → Record → State → Action.
 *
 *  • Permissions are defined here, in reviewed code: a permission needs code
 *    that enforces it. Organisations can add grants in the database
 *    (RolePermission), but only for permissions defined here.
 *  • Scope says which records: ALL · BRANCH · DEPARTMENT · ASSIGNED · OWN.
 *  • `decide()` is a pure function used everywhere (pages, actions, search,
 *    exports, notifications, realtime, analytics), tested with allowed and
 *    denied cases.
 *  • State rules (who may move a record to its next stage) stay in each
 *    workflow action, which checks the current status atomically.
 *
 * Roles: the Owner / GMD and Front Desk are always on. Workshop Supervisor,
 * Technician, Store Keeper, Accounts and Security are optional, switched on in
 * Settings; while one is off its holders get nothing from it and Front Desk
 * covers its steps (OPTIONAL_ROLE_COVER), with the Owner able to do anything.
 */
export type Scope = 'ALL' | 'BRANCH' | 'DEPARTMENT' | 'ASSIGNED' | 'OWN';
const RANK: Record<Scope, number> = { OWN: 1, ASSIGNED: 2, DEPARTMENT: 3, BRANCH: 4, ALL: 5 };

export const PERMISSIONS = {
  // Administration
  'admin.organisation.manage': { module: 'Administration', label: 'Manage the business details, billing, VAT and deposits' },
  'admin.structure.manage': { module: 'Administration', label: 'Manage the workshop, its departments and teams' },
  'admin.users.manage': { module: 'Administration', label: 'Manage staff and give them roles' },
  'admin.roles.manage': { module: 'Administration', label: 'Manage roles and switch the optional roles on or off' },
  'admin.settings.manage': { module: 'Administration', label: 'Manage settings, branding, messages and modules' },
  'audit.view': { module: 'Administration', label: 'View the full audit trail' },
  'admin.recycle_bin.manage': { module: 'Administration', label: 'Open the Recycle bin, restore records deleted by mistake, and delete such records' },
  'enyo.manage': { module: 'Administration', label: 'Manage Enyo (AI): switch features on or off and approve what it learns' },
  'dataexchange.import.run': { module: 'Data Exchange', label: 'Bring records in from Excel, CSV or QuickBooks files: upload a file, match its columns and check it (loading it needs a second person’s approval)' },
  'dataexchange.import.approve': { module: 'Data Exchange', label: 'Approve an import someone else prepared, load it, send it back, and undo a finished import' },
  'dataexchange.export.run': { module: 'Data Exchange', label: 'Export the lists they can open to Excel or CSV (what they see, with their filters; every export is recorded)' },
  'dataexchange.export.sensitive': { module: 'Data Exchange', label: 'Export files with customers’ contact details or payments' },
  'integrity.review': { module: 'Administration', label: 'Review integrity alerts (unusual money, parts, gate and sign-in activity), never alerts about themselves' },
  // Analytics
  'analytics.business.view': { module: 'Analytics', label: 'View Business Analytics (revenue, cost, profit, cash)' },
  'analytics.inventory.view': { module: 'Analytics', label: 'View Inventory Analytics (stock value, fast and slow movers)' },
  // Workshop
  'workshop.view': { module: 'Workshop', label: 'Open the Workshop' },
  'workshop.job_card.view': { module: 'Workshop', label: 'View Job Cards' },
  'workshop.job_card.create': { module: 'Workshop', label: 'Receive vehicles and open Job Cards (front desk)' },
  'workshop.customer.manage': { module: 'Workshop', label: 'Register customers and vehicles (front desk)' },
  'workshop.job.supervise': { module: 'Workshop', label: 'Accept or turn down supervising a job, as its assigned supervisor' },
  'workshop.estimate.approve': { module: 'Workshop', label: 'Check and approve estimates before the Owner, as the job’s supervisor' },
  'workshop.estimate.final_approve': { module: 'Workshop', label: 'Give final approval to estimates and discounts above the limit (Owner)' },
  'workshop.close.approve': { module: 'Workshop', label: 'Approve closing and cancelling jobs (Owner)' },
  'workshop.customer.notify': { module: 'Workshop', label: 'Send customers their estimates, updates and reminders (front desk)' },
  'workshop.technician.assign': { module: 'Workshop', label: 'Assign technicians to jobs' },
  'workshop.inspection.perform': { module: 'Workshop', label: 'Carry out vehicle inspections' },
  'workshop.estimate.edit': { module: 'Workshop', label: 'Prepare and submit estimates' },
  'workshop.job.work': { module: 'Workshop', label: 'Accept and carry out work' },
  'workshop.close.request': { module: 'Workshop', label: 'Ask for a job to be closed or cancelled' },
  'store.prs.approve_hod': { module: 'Workshop', label: 'Parts requests: first approval, before the store' },
  'workshop.payment.record': { module: 'Money', label: 'Record payments and issue receipts' },
  'workshop.refund.record': { module: 'Money', label: 'Record refunds' },
  'money.credit_note.request': { module: 'Money', label: 'Ask for a credit note on an invoice (an overcharge, goodwill, a part returned)' },
  'money.credit_note.approve': { module: 'Money', label: 'Approve or decline credit notes (Owner)' },
  'money.statement.view': { module: 'Money', label: 'See what customers owe: statements and ageing' },
  'money.quickbooks.export': { module: 'Money', label: 'Export sales, payments, credit notes and refunds to QuickBooks, and set the QuickBooks account names' },
  'workshop.warranty.claims': { module: 'Workshop', label: 'Record faulty parts and claim them back from suppliers' },
  'workshop.warranty.report': { module: 'Workshop', label: 'See the warranty report: comebacks, warranty cost and supplier claims' },
  // Customers (CRM)
  'crm.view': { module: 'Customers', label: 'See customers, their pages, spend and history' },
  'crm.manage': { module: 'Customers', label: 'Edit customers, their contacts, addresses, notes, tags and portal access' },
  'support.tickets.manage': { module: 'Customers', label: 'Work the Support centre: answer customers’ requests and complaints' },
  'support.manage': { module: 'Customers', label: 'Set up the Support centre: teams and their email addresses, who works them, opening hours, targets and how Enyo answers' },
  // Store
  'store.view': { module: 'Store', label: 'Open the Store: parts, stock and parts requests (selling prices only)' },
  'store.parts.manage': { module: 'Store', label: 'Manage parts, selling prices, stock levels and reorder levels' },
  'store.cost.view': { module: 'Store', label: 'See cost prices, margins, stock value and profit (Owner only by default)' },
  'store.matching': { module: 'Store', label: 'Match estimate parts to items in stock' },
  'sourcing.request': { module: 'Store', label: 'Raise parts requests on jobs' },
  'store.grn.record': { module: 'Store', label: 'Record goods received from suppliers' },
  'store.prs.release': { module: 'Store', label: 'Parts requests: approve, reserve and issue parts to the job' },
  'store.counter.sell': { module: 'Store', label: 'Sell parts over the counter (no Job Card) and take the payment' },
  'store.stock.count': { module: 'Store', label: 'Count the stock and send the differences for approval' },
  'store.stock.approve': { module: 'Store', label: 'Approve or reject stock count differences (Owner)' },
  // Gate
  'security.view': { module: 'Gate', label: 'Open the gate desk: vehicles in the compound and the gate log' },
  'security.gate.operate': { module: 'Gate', label: 'Let vehicles in and out and check gate passes' },
  // Notifications
  'notifications.broadcast.send': { module: 'Notifications', label: 'Send notices to staff and customers' },
} as const;
export type PermissionKey = keyof typeof PERMISSIONS;
const ALL_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

/** Everyone signed in: nothing beyond what their roles give. */
const BASELINE: Partial<Record<PermissionKey, Scope>> = {};

const B = 'BRANCH' as const;
const A = 'ALL' as const;
/** Assignment-based: only on the job where they are the assigned supervisor or technician. */
const MINE = 'ASSIGNED' as const;
/** Read-only view of the workshop, in their branch. */
const VIEW_WORKSHOP = { 'workshop.view': B, 'workshop.job_card.view': B } as const;

/** The roles that are always on, and the ones the Owner switches on in Settings → Roles. */
export const CORE_ROLES = ['owner', 'front-desk'] as const;
export const OPTIONAL_ROLES = ['workshop-supervisor', 'technician', 'store-keeper', 'accounts', 'security'] as const;
export type OptionalRole = (typeof OPTIONAL_ROLES)[number];
export const isOptionalRole = (slug: string): slug is OptionalRole => (OPTIONAL_ROLES as readonly string[]).includes(slug);

/**
 * Default grants per role. Organisations can ADD grants on the Roles page;
 * these defaults are reviewed code.
 */
export const ROLE_GRANTS: Record<string, Partial<Record<PermissionKey, Scope>>> = {
  // The Owner / GMD sees and approves everything, and is the only role that
  // sees cost prices, margins and profit.
  owner: Object.fromEntries(ALL_KEYS.map((k) => [k, A])) as Record<PermissionKey, Scope>,
  // Front Desk / Customer Care: receives vehicles and customers, opens Job
  // Cards, prepares estimates and invoices, takes payments, sends messages,
  // and looks after complaints, follow-ups and appointments.
  'front-desk': {
    ...VIEW_WORKSHOP, 'workshop.job_card.create': B, 'workshop.customer.manage': B, 'workshop.customer.notify': B, 'workshop.close.request': B,
    'workshop.estimate.edit': B, 'workshop.payment.record': B, 'money.credit_note.request': B, 'money.statement.view': B,
    'crm.view': B, 'crm.manage': B, 'support.tickets.manage': B, 'store.view': B, 'store.counter.sell': B,
    'dataexchange.import.run': B, 'dataexchange.export.run': B,
  },
  // Workshop Supervisor / Service Advisor: assigns technicians, inspects,
  // checks the estimate before the Owner, and does the quality check.
  'workshop-supervisor': {
    ...VIEW_WORKSHOP, 'store.view': B, 'crm.view': B,
    'workshop.job.supervise': B, 'workshop.technician.assign': B, 'workshop.estimate.edit': B, 'workshop.estimate.approve': B,
    'workshop.inspection.perform': B, 'workshop.job.work': B, 'workshop.close.request': B, 'sourcing.request': B, 'store.prs.approve_hod': B,
  },
  // Technician: their own jobs only.
  technician: {
    'workshop.view': B, 'workshop.job_card.view': MINE, 'store.view': B,
    'workshop.job.work': MINE, 'workshop.estimate.edit': MINE, 'workshop.inspection.perform': MINE, 'sourcing.request': MINE,
  },
  // Store Keeper: parts, stock, goods received, issuing parts to jobs and counter sales. Selling prices, not costs.
  'store-keeper': {
    'store.view': B, ...VIEW_WORKSHOP, 'store.matching': B, 'store.parts.manage': B, 'store.grn.record': B, 'store.prs.release': B,
    'store.counter.sell': B, 'store.stock.count': B,
    'dataexchange.export.run': B,
  },
  // Accounts: payments, refunds, statements and the QuickBooks export.
  accounts: {
    ...VIEW_WORKSHOP, 'store.view': B, 'crm.view': B,
    'workshop.payment.record': B, 'workshop.refund.record': B, 'money.credit_note.request': B, 'money.statement.view': B, 'workshop.warranty.claims': B,
    'money.quickbooks.export': B, 'dataexchange.export.run': B, 'dataexchange.export.sensitive': B,
  },
  // Security: the gate.
  security: { 'security.view': B, 'security.gate.operate': B },
};

/**
 * What Front Desk takes over while an optional role is switched off, so every
 * step of the workshop still has someone to do it (the Owner can do anything
 * anyway).
 */
export const OPTIONAL_ROLE_COVER: Record<OptionalRole, Partial<Record<PermissionKey, Scope>>> = {
  'workshop-supervisor': { 'workshop.job.supervise': B, 'workshop.technician.assign': B, 'workshop.estimate.approve': B, 'workshop.inspection.perform': B, 'sourcing.request': B },
  technician: { 'workshop.job.work': B, 'workshop.inspection.perform': B, 'sourcing.request': B },
  'store-keeper': { 'store.matching': B, 'store.parts.manage': B, 'store.grn.record': B, 'store.prs.release': B, 'store.stock.count': B },
  accounts: { 'workshop.refund.record': B, 'dataexchange.export.sensitive': B, 'workshop.warranty.claims': B },
  security: { 'security.view': B, 'security.gate.operate': B },
};

/**
 * The roles that count for a person, given which optional roles the
 * organisation has switched on, and the grants Front Desk gains for the ones
 * that are off. Pure.
 */
export function effectiveRoles(roleSlugs: string[], enabledOptional: readonly string[]): { roleSlugs: string[]; cover: Partial<Record<PermissionKey, Scope>> } {
  const on = new Set(enabledOptional);
  const kept = roleSlugs.filter((r) => !isOptionalRole(r) || on.has(r));
  const cover: Partial<Record<PermissionKey, Scope>> = {};
  if (kept.includes('front-desk')) for (const r of OPTIONAL_ROLES) if (!on.has(r)) Object.assign(cover, OPTIONAL_ROLE_COVER[r]);
  return { roleSlugs: kept, cover };
}

/** Steps only the platform team may take — never grantable to organisation roles. */
export const PLATFORM_ONLY: string[] = [
  'Permanently remove items from the Recycle bin before their time runs out',
  "Change a job's supervisor after it has been set",
  'Override a Job Card status directly',
];

/** orgBranchIds: the branches of the person's OWN organisation — the tenant
 * fence. No scope (not even ALL) reaches a record in another organisation's
 * branch. Absent for the platform team (and for an account not yet placed
 * in an organisation, which sees nothing of substance anyway). */
export type Principal = { userId: string; isSuperAdmin: boolean; roleSlugs: string[]; branchId: string | null; departmentId: string | null; organisationId?: string | null; orgBranchIds?: string[]; extraGrants?: Partial<Record<PermissionKey, Scope>>;
  /** The branch lens: an organisation-wide viewer looking at ONE branch for now (lists and analytics). Narrows, never widens; never used to decide a permission. */
  lensBranchId?: string | null };

/** The permissions whose organisation-wide holders get the branch lens (headquarters roles). */
export const LENS_KEYS: PermissionKey[] = ['analytics.business.view', 'workshop.view', 'crm.view', 'store.view', 'security.view', 'admin.users.manage', 'audit.view'];

/** Does this person see the whole organisation in any area, so the branch lens applies? */
export function hasBranchLens(p: Principal): boolean {
  return p.isSuperAdmin || LENS_KEYS.some((k) => scopeFor(p, k) === 'ALL');
}
/** homeBranch: for approvals and money — a branch-scoped person must BELONG to
 * the record's branch (someone with no branch on their profile is refused,
 * not treated as organisation-wide). */
export type RecordContext = { branchId?: string | null; departmentId?: string | null; ownerIds?: (string | null | undefined)[]; assigneeIds?: (string | null | undefined)[]; homeBranch?: boolean };
export type Decision = { allowed: boolean; scope: Scope | null; reason: string };

/** The widest scope this person holds for a permission (null = none). */
export function scopeFor(p: Principal, key: PermissionKey): Scope | null {
  if (p.isSuperAdmin) return 'ALL';
  let best: Scope | null = BASELINE[key] ?? null;
  const consider = (s?: Scope) => { if (s && (!best || RANK[s] > RANK[best])) best = s; };
  for (const slug of p.roleSlugs) consider(ROLE_GRANTS[slug]?.[key]);
  consider(p.extraGrants?.[key]);
  return best;
}

/** Allow or deny, with the reason — the single rule used everywhere. */
export function decide(p: Principal, key: PermissionKey, record?: RecordContext): Decision {
  if (!(key in PERMISSIONS)) return { allowed: false, scope: null, reason: `Unknown permission ${key}` };
  const scope = scopeFor(p, key);
  if (!scope) return { allowed: false, scope: null, reason: 'No role grants this permission' };
  // Tenant fence — before any scope, ALL included.
  if (record?.branchId && !p.isSuperAdmin && p.orgBranchIds && !p.orgBranchIds.includes(record.branchId)) {
    return { allowed: false, scope, reason: 'Outside your organisation' };
  }
  if (!record || scope === 'ALL') return { allowed: true, scope, reason: scope === 'ALL' ? 'Granted for everything' : 'Granted' };
  const me = p.userId;
  const owns = (record.ownerIds ?? []).includes(me);
  const assigned = owns || (record.assigneeIds ?? []).includes(me);
  // A person with no branch on their profile is not limited to one branch (organisation-wide staff).
  const inBranch = record.homeBranch ? Boolean(p.branchId) && (!record.branchId || record.branchId === p.branchId) : !p.branchId || !record.branchId || record.branchId === p.branchId;
  const inDept = !p.departmentId || !record.departmentId ? inBranch : record.departmentId === p.departmentId;
  const ok = scope === 'BRANCH' ? inBranch : scope === 'DEPARTMENT' ? inDept : scope === 'ASSIGNED' ? assigned : owns;
  return ok ? { allowed: true, scope, reason: `Within ${scope.toLowerCase()} scope` } : { allowed: false, scope, reason: `Outside ${scope.toLowerCase()} scope` };
}

/** Which permission each protected area of the portal needs. */
export const PAGE_PERMISSIONS: Record<string, PermissionKey> = {
  organisation: 'admin.organisation.manage', structure: 'admin.structure.manage', departments: 'admin.structure.manage', teams: 'admin.structure.manage',
  users: 'admin.users.manage', roles: 'admin.roles.manage', permissions: 'admin.roles.manage', settings: 'admin.settings.manage', branding: 'admin.settings.manage',
  'module-registry': 'admin.settings.manage', 'audit-logs': 'audit.view', 'recycle-bin': 'admin.recycle_bin.manage', analytics: 'analytics.business.view', crm: 'crm.view',
  integrity: 'integrity.review',
};

/** How each role is named to people. */
export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner / GMD', 'front-desk': 'Front Desk / Customer Care', 'workshop-supervisor': 'Workshop Supervisor / Service Advisor', technician: 'Technician',
  'store-keeper': 'Store Keeper', accounts: 'Accounts', security: 'Security',
};

/** The role a person is shown with (their most senior one), e.g. "Ada Obi (Front Desk)". */
const ROLE_SENIORITY = ['owner', 'workshop-supervisor', 'accounts', 'front-desk', 'store-keeper', 'technician', 'security'];
export function primaryRoleLabel(slugs: string[], isSuperAdmin = false): string | null {
  if (isSuperAdmin) return 'Platform Administrator';
  const best = ROLE_SENIORITY.find((s) => slugs.includes(s)) ?? slugs[0];
  // The short form ("Owner", "Front Desk"): it is shown inside brackets after a name.
  return best ? ROLE_LABELS[best]?.replace(/\s*\/.*$/, '') ?? null : null;
}
/** The Owner sees the whole business rather than one desk. */
export const isOwnerRole = (slugs: string[]): boolean => slugs.includes('owner');
/** "Name (Role)", or "You (Role)" for the person reading. */
export function nameWithRole(name: string, slugs: string[], opts: { isSuperAdmin?: boolean; isMe?: boolean } = {}): string {
  const role = primaryRoleLabel(slugs, opts.isSuperAdmin);
  const who = opts.isMe ? 'You' : name;
  return role ? `${who} (${role})` : who;
}

/**
 * What each role is for, in plain words — shown on the Roles page so an
 * administrator understands a role before giving it to someone.
 */
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: 'The Owner / GMD. Sees and approves everything: estimates (when set), discounts above the limit, cancellations, credit, release on credit and stock adjustments. The only role that sees cost prices, margins and profit. Always on.',
  'front-desk': 'Front Desk / Customer Care. Receives vehicles and customers, opens Job Cards, prepares estimates and invoices, takes payments, sends WhatsApp and email messages, and handles appointments, complaints and follow-ups. Always on, and covers the steps of any optional role that is switched off.',
  'workshop-supervisor': 'Workshop Supervisor / Service Advisor (optional). Assigns technicians, inspects vehicles, checks estimates before the Owner and does the quality check before a vehicle is ready.',
  technician: 'Technician (optional). Sees and works only on the jobs assigned to them: inspects, records the work and raises parts requests.',
  'store-keeper': 'Store Keeper (optional). Runs the parts store: parts, stock, goods received (without their costs), issuing parts to jobs, counter sales and stock counts. Sees selling prices, not cost prices.',
  accounts: 'Accounts (optional). Records payments and refunds, follows credit and statements, and exports to QuickBooks.',
  security: 'Security (optional). Runs the gate: vehicles in and out of the compound and gate passes.',
};

/** Permissions that DECIDE something (approve, authorise, release, pay) —
 * listed separately on the Roles page and used for the Approvals menu. */
export const APPROVAL_PERMISSIONS: PermissionKey[] = [
  'workshop.job.supervise', 'workshop.estimate.approve', 'workshop.estimate.final_approve', 'workshop.close.approve', 'store.prs.approve_hod', 'store.prs.release',
  'money.credit_note.approve', 'store.stock.approve',
];

/** Pages and figures that show cost prices, margins, stock value and profit: the Owner only by default. */
export const STORE_COST_PERMISSIONS: PermissionKey[] = ['store.cost.view'];

/** How a scope reads to people. */
export const SCOPE_WORDS: Record<Scope, string> = {
  ALL: 'everywhere in the organisation', BRANCH: 'in their branch', DEPARTMENT: 'for their department', ASSIGNED: 'on work assigned to them', OWN: 'their own',
};
