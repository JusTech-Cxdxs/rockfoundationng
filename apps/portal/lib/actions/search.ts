'use server';

import { prisma, type Prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { navigationFor } from '@/lib/authz/navigation';
import { firstReach, getBranchView, getPrincipal, myOrganisationId, orgWhere, reachWhere } from '@/lib/authz/server';
import { ticketReachWhere } from '@/lib/support-rules';
import { decide, STORE_COST_PERMISSIONS, type PermissionKey } from '@/lib/authz/catalogue';
import { groupRank, MODULE_PREFIXES, numberFilters, oldNumberQuery, planSearch, referenceUrl, withoutPrefixes, type RefPrefix, type SearchPlan } from '@/lib/search-plan';
import { isChassisLike, normaliseVin, vehiclePagePath } from '@/lib/vin';
import { fenceStaffHelp } from '@/lib/support/reach';
import { moduleIsOn } from '@/lib/modules';

export type SearchHit = { label: string; sub?: string; href: string };
/** prefix: the reference prefix of this kind of record (shown next to the group name). */
export type SearchGroup = { group: string; prefix?: string; hits: SearchHit[] };

/** List pages, found by name. The reference prefix is part of the name, so "VX" also finds the Vehicle exits page.
 * `module`: a page of a module that can be switched off, offered only where it is on (lib/modules.ts). */
const MORE_PAGES: (SearchHit & { needs?: PermissionKey[]; module?: string })[] = [
  { label: 'Job Cards (JC)', href: '/workshop/job-cards', needs: ['workshop.view'] },
  { label: 'Vehicles', href: '/workshop/vehicles', needs: ['workshop.view'] },
  { label: 'Customers', href: '/workshop/customers', needs: ['workshop.view'] },
  { label: 'In custody', href: '/workshop/custody', needs: ['workshop.view'] },
  { label: 'Parts', href: '/inventory/parts', needs: ['store.view'], module: 'inventory' },
  { label: 'Goods receipts (GRN)', href: '/inventory/goods-receipts', needs: STORE_COST_PERMISSIONS, module: 'inventory' },
  { label: 'Inventory analytics', href: '/inventory/analytics', needs: ['analytics.inventory.view'], module: 'inventory' },
  { label: 'Parts requests (PRS)', href: '/workshop/parts-requests', needs: ['workshop.view'], module: 'inventory' },
  { label: 'Vehicle exits (VX)', href: '/security/vehicles', needs: ['security.view'] },
  { label: 'Notification Center', href: '/notifications' },
  { label: 'Data Exchange — imports (IMP)', href: '/data-exchange', needs: ['dataexchange.import.run', 'dataexchange.import.approve'] },
  { label: 'Broadcasts (BC)', href: '/notifications/broadcasts', needs: ['notifications.broadcast.send'] },
  { label: 'Support centre (SUP)', href: '/crm/support', needs: ['support.tickets.manage'] },
];

type Text = { startsWith?: string; contains?: string; mode?: 'insensitive' };
type Where = Record<string, unknown>;
/** "customer.fullName" + filter → { customer: { fullName: filter } }; "people.some.name" works the same way. */
const at = (path: string, f: Text): Where => path.split('.').reduceRight<unknown>((inner, key) => ({ [key]: inner }), f) as Where;

/** What one table can be searched by. */
type Fields = {
  /** Reference-number columns, by prefix. */
  numbers?: [RefPrefix, string][];
  /** Names and descriptions. */
  text?: string[];
  /** Plates, part numbers, chassis, staff numbers: also matched without dashes or spaces. */
  codes?: string[];
  /** Phone numbers: matched only when a number is typed. */
  phones?: string[];
};

/** The OR list for one table under this plan; empty = the table cannot match, so it is not asked. */
function conditions(plan: SearchPlan, f: Fields): Where[] {
  const out: Where[] = [];
  for (const [prefix, column] of f.numbers ?? []) for (const nf of numberFilters(plan, prefix)) out.push({ [column]: nf });
  const m = (field: string, value = plan.q) => at(field, plan.short ? { startsWith: value, mode: 'insensitive' } : { contains: value, mode: 'insensitive' });
  if (plan.textScope === 'all') for (const field of f.text ?? []) out.push(m(field));
  if (plan.textScope !== 'none') {
    for (const field of f.codes ?? []) for (const form of plan.codeForms) out.push(m(field, form));
    for (const field of f.phones ?? []) for (const p of plan.phones) out.push(at(field, { contains: p }));
  }
  return out;
}

/**
 * The header's master search: every module at once, grouped, each hit a
 * direct link to the record. The query is planned first (lib/search-plan.ts)
 * so only the tables that could hold an answer are asked: "VX" asks the
 * vehicle exits (and names), "000012" asks every reference number, "Ada"
 * asks names. Each is a small query of at most 5 rows, all in parallel.
 *
 * A record type is searched only for people who may open its page, with the
 * same branch and organisation reach as that page; each page still checks
 * again when opened. Search never shows more than the pages would.
 */
export async function globalSearch(raw: string): Promise<SearchGroup[]> {
  const user = await requireUser();
  // The records and pages of a module that is switched off are not searched (lib/modules.ts).
  const storeOn = moduleIsOn('inventory');
  const off = MODULE_PREFIXES.filter((e) => !moduleIsOn(e.module)).flatMap((e) => e.prefixes);
  const plan = withoutPrefixes(planSearch(typeof raw === 'string' ? raw : ''), off);
  if (plan.kind === 'empty') return [];
  const { take } = plan;
  const principal = await getPrincipal();
  const allowed = (key: PermissionKey) => decide(principal, key).allowed;
  const any = (keys: PermissionKey[]) => keys.some(allowed);
  const lower = plan.q.toLowerCase();
  const pages: SearchHit[] = [
    ...navigationFor(principal, await getBranchView().catch(() => ({}))).filter((x) => x.status === 'LIVE' && x.name.toLowerCase().includes(lower)).map((x) => ({ label: x.name, sub: 'Module', href: x.href })),
    // Someone who can open Customers (CRM) goes straight there, not through the old workshop address.
    ...MORE_PAGES.filter((x) => (!x.module || moduleIsOn(x.module)) && x.label.toLowerCase().includes(lower) && (!x.needs || any(x.needs))).map(({ label, href }) => ({ label, sub: 'Page', href: href === '/workshop/customers' && allowed('crm.view') ? '/crm' : href })),
  ].filter((x, i, all) => all.findIndex((y) => y.href === x.href) === i).slice(0, 6);

  // Reach, per module: the same filters the lists and record pages use. null = may not open this type.
  const reachAny = async (keys: PermissionKey[]): Promise<Where | null> => {
    const open = keys.filter(allowed);
    if (!open.length) return null;
    const reaches = await Promise.all(open.map((k) => reachWhere(k, { lens: false })));
    return reaches.some((r) => r.branchId === undefined) ? {} : { OR: reaches };
  };
  const canWorkshop = allowed('workshop.view');
  const [jobReach, storeReach, securityReach, prsReach, grnReach] = await Promise.all([
    canWorkshop ? reachAny(['workshop.job_card.view']) : null,
    storeOn ? reachAny(['store.view']) : null,
    reachAny(['security.view']),
    canWorkshop && storeOn ? reachAny(['workshop.job_card.view', 'store.view']) : null,
    storeOn && any(STORE_COST_PERMISSIONS) ? firstReach(STORE_COST_PERMISSIONS) : null,
  ]);
  const [mineOrg] = await Promise.all([orgWhere()]);
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { organisationId: true } });
  // Staff: same organisation; the platform team is never listed to organisations.
  const staffReach = { ...(me?.organisationId ? { organisationId: me.organisationId } : {}), ...(principal.isSuperAdmin ? {} : { roles: { none: { role: { isSuperAdmin: true } } } }) };
  const sameOrg = { organisationId: me?.organisationId ?? '__none__' };
  const canCustomers = canWorkshop || allowed('crm.view');
  const canStructure = allowed('admin.structure.manage');
  // Support tickets: the inbox's own fence (organisation + branch reach; website enquiries are the organisation's).
  const supportReach: Where | null = allowed('support.tickets.manage') ? (await fenceStaffHelp(ticketReachWhere(await reachWhere('support.tickets.manage', { lens: false }), await myOrganisationId()))) : null;

  // At most 4 lookups at once: one search never takes every database connection from the pages around it.
  let running = 0;
  const waiting: (() => void)[] = [];
  const slot = async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (running >= 4) await new Promise<void>((r) => waiting.push(r));
    running += 1;
    try { return await fn(); } finally { running -= 1; waiting.shift()?.(); }
  };

  /** Runs one table's search when the person may open it and the query can match it. */
  function find<T>(reach: Where | null | false, fields: Fields, run: (where: Where) => Promise<T[]>): Promise<T[]> {
    if (!reach) return Promise.resolve([]);
    const or = conditions(plan, fields);
    if (!or.length) return Promise.resolve([]);
    return slot(() => run({ AND: [reach, { OR: or }] })).catch(() => [] as T[]);
  }
  const W = <T,>(w: Where) => w as T;
  const newest = { createdAt: 'desc' } as const;

  const [jcs, prs, grns, refunds, invoices, receipts, exits, broadcasts, tickets, imports, exportJobs, vehicles, customers, parts, branches, departments, staff] = await Promise.all([
    find(jobReach, { numbers: [['JC', 'jobNumber']], text: ['customer.fullName'], codes: ['vehicle.plateNumber'], phones: ['customer.phone'] },
      (w) => prisma.jobCard.findMany({ where: W<Prisma.JobCardWhereInput>(w), take, orderBy: newest, select: { id: true, branchId: true, jobNumber: true, status: true, customer: { select: { fullName: true } }, vehicle: { select: { plateNumber: true } } } })),
    find(prsReach, { numbers: [['PRS', 'referenceNumber']] },
      (w) => prisma.partRequestSlip.findMany({ where: W<Prisma.PartRequestSlipWhereInput>(w), take, orderBy: newest, select: { id: true, branchId: true, referenceNumber: true, status: true, jobCard: { select: { jobNumber: true } } } })),
    find(grnReach, { numbers: [['GRN', 'referenceNumber']], text: ['supplierName'] },
      (w) => prisma.goodsReceipt.findMany({ where: W<Prisma.GoodsReceiptWhereInput>(w), take, orderBy: { receivedAt: 'desc' }, select: { id: true, referenceNumber: true, supplierName: true } })),
    // Refunds, invoices and receipts: within reach of their Job Card's branch, like the Job Card itself.
    find(jobReach && { jobCard: jobReach }, { numbers: [['RF', 'referenceNumber']], text: ['paidToName'] },
      (w) => prisma.refund.findMany({ where: W<Prisma.RefundWhereInput>(w), take, orderBy: { recordedAt: 'desc' }, select: { referenceNumber: true, paidToName: true, jobCard: { select: { id: true, jobNumber: true, branchId: true } } } })),
    find(jobReach, { numbers: [['INV', 'invoiceNumber']] },
      (w) => prisma.invoice.findMany({ where: W<Prisma.InvoiceWhereInput>(w), take, orderBy: { issuedAt: 'desc' }, select: { invoiceNumber: true, branchId: true, customer: { select: { fullName: true } }, jobCard: { select: { id: true, jobNumber: true } } } })),
    find(jobReach && { jobCard: jobReach }, { numbers: [['RCT', 'receiptNumber']] },
      (w) => prisma.payment.findMany({ where: W<Prisma.PaymentWhereInput>(w), take, orderBy: { recordedAt: 'desc' }, select: { receiptNumber: true, amount: true, jobCard: { select: { id: true, jobNumber: true, branchId: true } } } })),
    find(securityReach, { numbers: [['VX', 'exitNumber']], text: ['driverName'], codes: ['vehicle.plateNumber'] },
      (w) => prisma.vehicleGateExit.findMany({ where: W<Prisma.VehicleGateExitWhereInput>(w), take, orderBy: newest, select: { id: true, branchId: true, exitNumber: true, vehicle: { select: { make: true, model: true, plateNumber: true } } } })),
    find(allowed('notifications.broadcast.send') && sameOrg, { numbers: [['BC', 'broadcastNumber']], text: ['title'] },
      (w) => prisma.broadcast.findMany({ where: W<Prisma.BroadcastWhereInput>(w), take, orderBy: newest, select: { id: true, broadcastNumber: true, title: true } })),
    find(supportReach, { numbers: [['SUP', 'number']], text: ['contactName', 'subject'], phones: ['contactPhone'] },
      (w) => prisma.supportTicket.findMany({ where: W<Prisma.SupportTicketWhereInput>(w), take, orderBy: newest, select: { id: true, number: true, contactName: true, status: true } })),
    // Imports (Data Exchange): the people who prepare or approve them, in their own organisation.
    find((allowed('dataexchange.import.run') || allowed('dataexchange.import.approve')) && sameOrg, { numbers: [['IMP', 'number']], text: ['fileName'] },
      (w) => prisma.importJob.findMany({ where: W<Prisma.ImportJobWhereInput>(w), take, orderBy: newest, select: { id: true, number: true, fileName: true, status: true } })),
    // Exports (Data Exchange): those who export lists, in their own organisation — their own, or everyone's for those who read the audit trail.
    find(allowed('dataexchange.export.run') && { ...sameOrg, ...(allowed('audit.view') ? {} : { createdById: user.id }) }, { numbers: [['EXP', 'number']], text: ['summary'] },
      (w) => prisma.exportJob.findMany({ where: W<Prisma.ExportJobWhereInput>(w), take, orderBy: newest, select: { id: true, number: true, kind: true, format: true } })),
    find(canWorkshop && { customer: mineOrg }, { text: ['make', 'model'], codes: ['plateNumber', 'chassisNumber', 'engineNumber'] },
      (w) => prisma.customerVehicle.findMany({ where: W<Prisma.CustomerVehicleWhereInput>(w), take, select: { id: true, make: true, model: true, plateNumber: true, chassisNumber: true, customer: { select: { fullName: true } } } })),
    find(canCustomers && mineOrg, { text: ['fullName', 'email'], phones: ['phone', 'altPhone'] },
      (w) => prisma.customer.findMany({ where: W<Prisma.CustomerWhereInput>(w), take, select: { id: true, fullName: true, phone: true } })),
    find(storeReach, { text: ['name'], codes: ['partNumber', 'barcode'] },
      (w) => prisma.part.findMany({ where: W<Prisma.PartWhereInput>(w), take, select: { id: true, branchId: true, partNumber: true, name: true } })),
    find(canStructure && (mineOrg.organisationId ? { businessUnit: mineOrg } : {}), { text: ['name'] },
      (w) => prisma.branch.findMany({ where: W<Prisma.BranchWhereInput>(w), take, select: { id: true, name: true } })),
    find(canStructure && (mineOrg.organisationId ? { branch: { businessUnit: mineOrg } } : {}), { text: ['name'] },
      (w) => prisma.department.findMany({ where: W<Prisma.DepartmentWhereInput>(w), take, select: { id: true, name: true, branchId: true, branch: { select: { name: true } } } })),
    find(allowed('admin.users.manage') && staffReach, { text: ['fullName', 'email'], codes: ['employeeId'], phones: ['phone'] },
      (w) => prisma.user.findMany({ where: W<Prisma.UserWhereInput>(w), take, select: { id: true, fullName: true, email: true } })),
  ]);

  // A second check per record, with its branch: the same decision its page makes (a
  // department-scoped approver reaches their own branch only, though the query fence is wider).
  const opens = (keys: PermissionKey[], branchId: string | null | undefined) => keys.some((k) => decide(principal, k, { branchId: branchId ?? null }).allowed);
  const JOB: PermissionKey[] = ['workshop.job_card.view'];
  const SEC: PermissionKey[] = ['security.view'];
  const words = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const dot = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined;
  const canCrm = allowed('crm.view');
  const ref = (prefix: RefPrefix, group: string, hits: SearchHit[]): SearchGroup => ({ group, prefix, hits });
  const groups: SearchGroup[] = [
    { group: 'Pages', hits: pages },
    ref('JC', 'Job Cards', jcs.filter((r) => opens(JOB, r.branchId)).map((r) => ({ label: r.jobNumber, sub: dot(r.customer.fullName, r.vehicle?.plateNumber, words(r.status)), href: referenceUrl('JC', r.id) }))),
    ref('PRS', 'Parts requests', prs.filter((r) => opens(['workshop.job_card.view', 'store.view'], r.branchId)).map((r) => ({ label: r.referenceNumber, sub: dot(r.jobCard?.jobNumber, words(r.status)), href: referenceUrl('PRS', r.id) }))),
    ref('GRN', 'Goods receipts', grns.map((r) => ({ label: r.referenceNumber, sub: r.supplierName, href: referenceUrl('GRN', r.id) }))),
    // A refund opens on its Job Card.
    ref('RF', 'Refunds', refunds.flatMap((r) => (r.jobCard && opens(JOB, r.jobCard.branchId) ? [{ label: r.referenceNumber, sub: dot(`On ${r.jobCard.jobNumber}`, r.paidToName), href: referenceUrl('JC', r.jobCard.id) }] : []))),
    ref('INV', 'Invoices', invoices.filter((r) => opens(JOB, r.branchId)).map((r) => ({ label: r.invoiceNumber, sub: dot(`On ${r.jobCard.jobNumber}`, r.customer.fullName), href: referenceUrl('JC', r.jobCard.id) }))),
    ref('RCT', 'Receipts', receipts.flatMap((r) => (r.receiptNumber && r.jobCard && opens(JOB, r.jobCard.branchId) ? [{ label: r.receiptNumber, sub: dot(`On ${r.jobCard.jobNumber}`, `₦${Number(r.amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`), href: referenceUrl('JC', r.jobCard.id) }] : []))),
    ref('VX', 'Vehicle exits', exits.filter((r) => opens(SEC, r.branchId)).map((r) => ({ label: r.exitNumber, sub: dot([r.vehicle?.make, r.vehicle?.model].filter(Boolean).join(' '), r.vehicle?.plateNumber), href: referenceUrl('VX', r.id) }))),
    ref('BC', 'Broadcasts', broadcasts.map((r) => ({ label: r.broadcastNumber, sub: r.title, href: referenceUrl('BC', r.id) }))),
    ref('SUP', 'Support tickets', tickets.map((r) => ({ label: r.number, sub: dot(r.contactName, words(r.status)), href: referenceUrl('SUP', r.id) }))),
    ref('IMP', 'Imports', imports.map((r) => ({ label: r.number, sub: dot(r.fileName, words(r.status)), href: referenceUrl('IMP', r.id) }))),
    ref('EXP', 'Exports', exportJobs.map((r) => ({ label: r.number, sub: dot(words(r.kind.replace(/-/g, ' ')), r.format.toUpperCase()), href: referenceUrl('EXP', r.id) }))),
    // A vehicle with a VIN opens its one page (its whole history); one without opens its workshop record.
    { group: 'Vehicles', hits: vehicles.map((r) => ({ label: [r.make, r.model].filter(Boolean).join(' ') || 'Vehicle', sub: dot(r.plateNumber, r.chassisNumber, r.customer?.fullName), href: r.chassisNumber && isChassisLike(r.chassisNumber) ? vehiclePagePath(r.chassisNumber) : `/workshop/vehicles/${r.id}/edit` })) },
    // The customer's 360° page (CRM), or the Workshop customer list for people without the CRM.
    { group: 'Customers', hits: customers.map((r) => ({ label: r.fullName, sub: r.phone ?? undefined, href: canCrm ? `/crm/customers/${r.id}` : `/workshop/customers?q=${encodeURIComponent(r.fullName)}` })) },
    { group: 'Parts', hits: parts.filter((r) => opens(['store.view'], r.branchId)).map((r) => ({ label: r.partNumber ?? r.name, sub: r.partNumber ? r.name : undefined, href: `/inventory/parts/${r.id}` })) },
    { group: 'Branches', hits: branches.map((r) => ({ label: r.name, href: `/branches/${r.id}` })) },
    // Departments are edited on their branch's page.
    { group: 'Departments', hits: departments.map((r) => ({ label: r.name, sub: r.branch?.name, href: `/branches/${r.branchId}` })) },
    { group: 'Staff', hits: staff.map((r) => ({ label: r.fullName, sub: r.email, href: `/users?q=${encodeURIComponent(r.email)}` })) },
  ];
  // Numbers the old system (QuickBooks or a spreadsheet) gave records: every match, labelled with its kind and year.
  // Only a bare prefix ("JC") or a complete EJO reference (JC-2026-000031) skips them.
  const oldFits = plan.kind !== 'prefix' && !(plan.kind === 'reference' && plan.textScope === 'none');
  const old = !oldFits ? [] : await oldNumberHits(plan.q, { mineOrg, sameOrg, canWorkshop, canCrm, canCustomers, storeReach, canSuppliers: storeOn && allowed('store.view'), canUsers: allowed('admin.users.manage'), opens });
  if (old.length) groups.splice(1, 0, { group: OLD_GROUP, hits: old });
  // A VIN typed or scanned (a handheld scanner types it): that vehicle first.
  const vin = plan.kind === 'reference' || plan.kind === 'prefix' ? [] : await vinHits(plan.q, mineOrg, any(['workshop.view', 'security.view', 'crm.view']));
  if (vin.length) groups.splice(1, 0, { group: 'Vehicle (VIN)', hits: vin });
  return groups
    .map((g, i) => ({ g, i, rank: g.group === 'Vehicle (VIN)' ? -60 : g.group === OLD_GROUP ? -50 : groupRank(plan, g.group) }))
    .filter(({ g }) => g.hits.length > 0)
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(({ g }) => g);
}

/** The group of numbers the old system gave records. */
const OLD_GROUP = 'Old-system numbers';

/** The vehicle with exactly this VIN (or chassis number, 11 characters or more), inside the person's organisation. */
async function vinHits(q: string, mineOrg: Where, mayOpen: boolean): Promise<SearchHit[]> {
  const v = normaliseVin(q);
  if (!mayOpen || v.length < 11 || !isChassisLike(v)) return [];
  const vehicle = await prisma.customerVehicle.findFirst({ where: { chassisNumber: { equals: v, mode: 'insensitive' }, customer: mineOrg as Prisma.CustomerWhereInput }, select: { make: true, model: true, plateNumber: true } }).catch(() => null);
  if (!vehicle) return [];
  return [{ label: `VIN ${v}`, sub: [[vehicle.make, vehicle.model].filter(Boolean).join(' '), vehicle.plateNumber].filter(Boolean).join(' · ') || undefined, href: vehiclePagePath(v) }];
}

/**
 * Records found by a number the old system gave them (customer, vehicle,
 * supplier, item, invoice and job numbers), each labelled "Old system
 * customer 1000123", "Old system invoice 125262 · 2026"…, within the same
 * reach as the other results. Every match is listed; "125262 2026" narrows
 * invoices to one year.
 */
async function oldNumberHits(q: string, ctx: { mineOrg: Where; sameOrg: Where; canWorkshop: boolean; canCrm: boolean; canCustomers: boolean; storeReach: Where | null; canSuppliers: boolean; canUsers: boolean; opens: (keys: PermissionKey[], branchId: string | null | undefined) => boolean }): Promise<SearchHit[]> {
  const n = oldNumberQuery(q);
  if (!n) return [];
  const ext = { in: n.forms };
  const label = 'Old system';
  const take = 6;
  const [customers, vehicles, suppliers, parts, invoices, pastJobs, openJobs, people] = await Promise.all([
    ctx.canCustomers ? prisma.customer.findMany({ where: { AND: [ctx.mineOrg as Prisma.CustomerWhereInput, { externalId: ext }] }, take, select: { id: true, fullName: true, externalId: true } }).catch(() => []) : [],
    ctx.canWorkshop ? prisma.customerVehicle.findMany({ where: { customer: ctx.mineOrg as Prisma.CustomerWhereInput, externalId: ext }, take, select: { id: true, make: true, model: true, plateNumber: true, externalId: true } }).catch(() => []) : [],
    ctx.canSuppliers ? prisma.supplier.findMany({ where: { ...(ctx.sameOrg as Prisma.SupplierWhereInput), externalId: ext }, take, select: { id: true, name: true, externalId: true } }).catch(() => []) : [],
    ctx.storeReach ? prisma.part.findMany({ where: { AND: [ctx.storeReach as Prisma.PartWhereInput, { externalId: ext }] }, take, select: { id: true, branchId: true, name: true, partNumber: true, externalId: true, branch: { select: { name: true } } } }).catch(() => []) : [],
    ctx.canCrm ? prisma.historicalInvoice.findMany({
      where: { ...(ctx.sameOrg as Prisma.HistoricalInvoiceWhereInput), voidedAt: null, invoiceNumber: ext, ...(n.year ? { fiscalYear: n.year } : {}) },
      orderBy: [{ fiscalYear: 'desc' }, { invoiceDate: 'desc' }], take: 10,
      select: { id: true, invoiceNumber: true, fiscalYear: true, invoiceDate: true, amount: true, customerId: true },
    }).catch(() => []) : [],
    // Job cards from the old system, by their number.
    ctx.canWorkshop || ctx.canCrm ? prisma.historicalJob.findMany({
      where: { ...(ctx.sameOrg as Prisma.HistoricalJobWhereInput), voidedAt: null, jobNumber: ext },
      orderBy: [{ openedAt: 'desc' }], take: 10,
      select: { id: true, jobNumber: true, kind: true, openedAt: true, completedAt: true, mileage: true, description: true, totalAmount: true, customerId: true, vehicleId: true },
    }).catch(() => []) : [],
    // Open job cards brought in on the go-live day: found by their old number; they open as EJO job cards.
    ctx.canWorkshop ? prisma.jobCard.findMany({
      where: { customer: ctx.mineOrg as Prisma.CustomerWhereInput, externalId: ext },
      orderBy: { createdAt: 'desc' }, take: 10,
      select: { id: true, jobNumber: true, externalId: true, status: true, branchId: true, vehicle: { select: { plateNumber: true, make: true, model: true } } },
    }).catch(() => []) : [],
    // Colleagues brought in from the old system, by their staff number — for those who manage people.
    ctx.canUsers ? prisma.user.findMany({ where: { ...(ctx.sameOrg as Prisma.UserWhereInput), externalId: ext }, take, select: { id: true, fullName: true, email: true, employeeId: true, externalId: true } }).catch(() => []) : [],
  ]);
  const names = invoices.length || pastJobs.length ? new Map((await prisma.customer.findMany({ where: { id: { in: [...new Set([...invoices.map((i) => i.customerId), ...pastJobs.map((j) => j.customerId)])] } }, select: { id: true, fullName: true } })).map((c) => [c.id, c.fullName])) : new Map<string, string>();
  const naira = (v: unknown) => `₦${Number(v ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
  const day = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
  const dot = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined;
  return [
    ...customers.map((c) => ({ label: `${label} customer ${c.externalId}`, sub: c.fullName, href: ctx.canCrm ? `/crm/customers/${c.id}` : `/workshop/customers?q=${encodeURIComponent(c.fullName)}` })),
    ...vehicles.map((v) => ({ label: `${label} vehicle ${v.externalId}`, sub: dot([v.make, v.model].filter(Boolean).join(' '), v.plateNumber), href: `/workshop/vehicles/${v.id}/edit` })),
    ...suppliers.map((x) => ({ label: `${label} supplier ${x.externalId}`, sub: x.name, href: `/inventory/suppliers?q=${encodeURIComponent(x.externalId ?? x.name)}` })),
    ...parts.filter((p) => ctx.opens(['store.view'], p.branchId)).map((p) => ({ label: `${label} item ${p.externalId}`, sub: dot(p.partNumber, p.name, p.branch?.name), href: `/inventory/parts/${p.id}` })),
    ...invoices.map((i) => ({
      label: `${label} invoice ${i.invoiceNumber} · ${i.fiscalYear ?? i.invoiceDate.getUTCFullYear()}`,
      sub: dot(names.get(i.customerId), day(i.invoiceDate), naira(i.amount)),
      href: `/crm/customers/${i.customerId}?tab=jobs`,
    })),
    ...openJobs.filter((j) => ctx.opens(['workshop.job_card.view'], j.branchId)).map((j) => ({
      label: `${label} job card ${j.externalId} → ${j.jobNumber}`,
      sub: dot(j.status.toLowerCase().replace(/_/g, ' '), [j.vehicle.make, j.vehicle.model].filter(Boolean).join(' '), j.vehicle.plateNumber),
      href: `/workshop/job-cards/${j.id}`,
    })),
    ...people.map((u) => ({ label: `${label} staff number ${u.externalId}`, sub: dot(u.fullName, u.employeeId), href: `/users?q=${encodeURIComponent(u.email)}` })),
    ...pastJobs.map((j) => ({
      label: `${label} job card ${j.jobNumber}${j.kind === 'SERVICE' ? ' · service' : ''}`,
      sub: dot(names.get(j.customerId), day(j.completedAt ?? j.openedAt), j.mileage !== null ? `${j.mileage.toLocaleString('en-NG')} km` : null, j.totalAmount !== null ? naira(j.totalAmount) : null, j.description),
      href: j.vehicleId && ctx.canWorkshop ? `/workshop/vehicles/${j.vehicleId}/edit#before-ejo` : `/crm/customers/${j.customerId}?tab=jobs`,
    })),
  ];
}
