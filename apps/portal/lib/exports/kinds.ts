/**
 * Exports — every list that can be exported, with its columns and its rows
 * (server only, never a 'use server' file: the download route and the
 * export actions call these after checking who is asking).
 *
 * Each kind reads exactly what its list shows: the same filters and search
 * (from the page's address), within the person's own reach (organisation,
 * branch, department — the same fences the list uses), in the same order,
 * in blocks — every matching record, not just the first page. Every row
 * carries the EJO number, the old system's number where there is one,
 * and a link back to the record.
 */
import { prisma, type Prisma } from '@ejo/database';
import { allows, branchWithinReach, myOrganisationId, orgWhere, reachWhere } from '@/lib/authz/server';
import type { PermissionKey } from '@/lib/authz/catalogue';
import { portalBaseUrl } from '@/lib/portal-url';
import { getCrmHub, type CrmHubParams } from '@/lib/actions/crm';
import { getAuditLogPage } from '@/lib/actions/audit-logs';
import { listUsersForAdmin } from '@/lib/actions/users-admin';
import { getInventoryAnalytics } from '@/lib/actions/inventory-analytics';
import { getStoreBranchId } from '@/lib/actions/store';
import { getJobCardOutcomes } from '@/lib/actions/visit-outcomes';
import { matchesOutcomeFilter, parseOutcomeFilter } from '@/lib/visit-outcome';
import { parseSourceFilter, sourceWhere } from '@/lib/source-filter';
import { importIdsFor } from '@/lib/source-filter-server';
import type { ExportColumn } from './format';

export type Params = Record<string, string | undefined>;
type Ctx = { userId: string; organisationId: string | null };
export type Block<R> = { rows: R[]; next: string };

// Each list's row is its own query's shape; the registry holds them side by side.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExportKind<R = any> = {
  key: string;
  /** "Customers" (sheet and file). */
  label: string;
  /** May open this list: any of these permissions. */
  view: PermissionKey[];
  /** Contact details or payments: needs dataexchange.export.sensitive too. */
  sensitive: boolean;
  /** The list page (for "Back to …" and the About sheet). */
  page: string;
  /** What the file holds, when it is not simply every matching record (the About sheet says so). */
  note?: string;
  columns: ExportColumn<R>[];
  /**
   * The rows, in blocks, as the list shows them. `from` resumes after a
   * block already written (a large export comes in parts); each block says
   * where the next one starts.
   */
  rows: (ctx: Ctx, p: Params, from: string | null) => AsyncIterable<Block<R>>;
};

// Rows read per query. EXPORT_BLOCK_ROWS is for the end-to-end tests only (tiny blocks, so a few rows make several parts).
const BLOCK = Math.max(1, Math.trunc(Number(process.env.EXPORT_BLOCK_ROWS)) || 2000);
const base = () => portalBaseUrl().replace(/\/$/, '');
const link = (path: string) => `${base()}${path}`;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const words = (s: string | null | undefined) => (s ? s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');

/** Keyset reading in the list's own order (with the id as tie-breaker), a block at a time, from a record already written. */
async function* blocks<R extends { id: string }>(read: (cursor: string | null) => Promise<R[]>, from: string | null): AsyncGenerator<Block<R>> {
  let cursor: string | null = from && from !== 'end' ? from : null;
  if (from === 'end') return;
  for (;;) {
    // One row more than a block: whether anything follows is known, so a list never ends on an empty part.
    const got = await read(cursor);
    if (!got.length) return;
    const more = got.length > BLOCK;
    const rows = more ? got.slice(0, BLOCK) : got;
    cursor = rows[rows.length - 1]!.id;
    yield { rows, next: more ? cursor : 'end' };
    if (!more) return;
  }
}
/** A list already worked out in full (the page computes it the same way), a block at a time from a position. */
function* slices<R>(all: R[], from: string | null): Generator<Block<R>> {
  for (let i = from === 'end' ? all.length : Number(from ?? 0) || 0; i < all.length; i += BLOCK) yield { rows: all.slice(i, i + BLOCK), next: i + BLOCK >= all.length ? 'end' : String(i + BLOCK) };
}
const page = (cursor: string | null): { cursor?: { id: string }; skip?: number; take: number } => (cursor ? { cursor: { id: cursor }, skip: 1, take: BLOCK + 1 } : { take: BLOCK + 1 });

async function importNumbers(ids: (string | null)[]): Promise<Map<string, string>> {
  const u = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!u.length) return new Map();
  return new Map((await prisma.importJob.findMany({ where: { id: { in: u } }, select: { id: true, number: true } })).map((j) => [j.id, j.number]));
}

// ── Customers ─────────────────────────────────────────────────────────

type CustomerRow = Awaited<ReturnType<typeof getCrmHub>>['rows'][number] & { imp: string | null; companyName: string | null; taxId: string | null };
const customers: ExportKind<CustomerRow> = {
  key: 'customers', label: 'Customers', view: ['crm.view'], sensitive: true, page: '/crm',
  columns: [
    { header: 'Customer number', type: 'code', width: 16, get: (r) => r.externalId },
    { header: 'Name', type: 'text', width: 28, get: (r) => r.fullName },
    { header: 'Type', type: 'text', width: 12, get: (r) => (r.customerType === 'ORGANIZATION' ? 'Organisation' : 'Individual') },
    { header: 'Company name', type: 'text', width: 24, get: (r) => r.companyName },
    { header: 'Phone', type: 'code', width: 16, get: (r) => r.phone },
    { header: 'Second phone', type: 'code', width: 16, get: (r) => r.altPhone },
    { header: 'Email', type: 'text', width: 26, get: (r) => r.email },
    { header: 'Address', type: 'text', width: 30, get: (r) => r.address },
    { header: 'Tax ID', type: 'code', width: 14, get: (r) => r.taxId },
    { header: 'Tags', type: 'text', width: 16, get: (r) => r.tags.join(', ') },
    { header: 'Customer since', type: 'day', width: 12, get: (r) => r.customerSince ?? null },
    { header: 'Entered EJO', type: 'date', width: 12, get: (r) => r.createdAt },
    { header: 'Source', type: 'text', width: 12, get: (r) => (r.importJobId ? 'Imported' : 'Created in EJO') },
    { header: 'Import', type: 'code', width: 16, get: (r) => r.imp },
    { header: 'Vehicles', type: 'int', width: 9, get: (r) => r.vehicles },
    { header: 'Open jobs', type: 'int', width: 9, get: (r) => r.openJobs },
    { header: 'Lifetime spend', type: 'money', width: 14, get: (r) => r.netPaid },
    { header: 'Spend this year', type: 'money', width: 14, get: (r) => r.netYear },
    { header: 'Currency', type: 'text', width: 8, get: () => 'NGN' },
    { header: 'Last visit', type: 'date', width: 12, get: (r) => r.lastVisit },
    { header: 'Customer portal', type: 'bool', width: 10, get: (r) => r.hasPortalAccount && r.isActive },
    { header: 'EJO record', type: 'code', width: 14, get: (r) => r.id },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/crm/customers/${r.id}`) },
  ],
  async *rows(_ctx, p, from) {
    const hub = await getCrmHub(p as CrmHubParams, { all: true });
    const imp = await importNumbers(hub.rows.map((r) => r.importJobId));
    // The company record (name, tax ID) a block at a time, so a long list never asks for every customer at once.
    for (const block of slices(hub.rows, from)) {
      const companies = new Map((await prisma.customerCompany.findMany({ where: { customerId: { in: block.rows.map((r) => r.id) } }, select: { customerId: true, companyName: true, taxId: true } })).map((c) => [c.customerId, c]));
      yield { next: block.next, rows: block.rows.map((r) => ({ ...r, imp: r.importJobId ? imp.get(r.importJobId) ?? null : null, companyName: companies.get(r.id)?.companyName ?? null, taxId: companies.get(r.id)?.taxId ?? null })) };
    }
  },
};

// ── Vehicles ──────────────────────────────────────────────────────────

const vehicles: ExportKind = {
  key: 'vehicles', label: 'Vehicles', view: ['workshop.view'], sensitive: false, page: '/workshop/vehicles',
  columns: [
    { header: 'Customer number', type: 'code', width: 16, get: (r) => r.customer?.externalId },
    { header: 'Plate', type: 'code', width: 12, get: (r) => r.plateNumber },
    { header: 'Chassis number (VIN)', type: 'code', width: 20, get: (r) => r.chassisNumber },
    { header: 'Vehicle number', type: 'code', width: 14, get: (r) => r.externalId },
    { header: 'Engine number', type: 'code', width: 14, get: (r) => r.engineNumber },
    { header: 'Engine type', type: 'text', width: 10, get: (r) => r.engineType },
    { header: 'Make', type: 'text', width: 10, get: (r) => r.make },
    { header: 'Model', type: 'text', width: 12, get: (r) => r.model },
    { header: 'Year', type: 'int', width: 6, get: (r) => r.year },
    { header: 'Category', type: 'text', width: 11, get: (r) => (r.vehicleType === 'COMMERCIAL' ? 'Commercial' : r.vehicleType === 'PASSENGER' ? 'Passenger' : '') },
    { header: 'Mileage (km)', type: 'int', width: 10, get: (r) => r.mileage },
    { header: 'Customer name', type: 'text', width: 24, get: (r) => r.customer?.fullName },
    { header: 'Entered EJO', type: 'date', width: 12, get: (r) => r.createdAt },
    { header: 'Source', type: 'text', width: 12, get: (r) => (r.importJobId ? 'Imported' : 'Created in EJO') },
    { header: 'Import', type: 'code', width: 16, get: (r) => r.imp },
    { header: 'EJO record', type: 'code', width: 14, get: (r) => r.id },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/workshop/vehicles/${r.id}/edit`) },
  ],
  async *rows(ctx, p, from) {
    const q = p.q?.trim();
    const type = p.type === 'PASSENGER' || p.type === 'COMMERCIAL' ? p.type : undefined;
    const fence = await orgWhere();
    const sf = parseSourceFilter(p);
    const where: Prisma.CustomerVehicleWhereInput = {
      customer: fence, ...(sourceWhere(sf, await importIdsFor(fence.organisationId ?? ctx.organisationId, sf)) as Prisma.CustomerVehicleWhereInput),
      ...(type ? { vehicleType: type } : {}),
      ...(q ? { OR: [{ plateNumber: { contains: q, mode: 'insensitive' } }, { chassisNumber: { contains: q, mode: 'insensitive' } }, { make: { contains: q, mode: 'insensitive' } }, { model: { contains: q, mode: 'insensitive' } }, { externalId: { in: [q, q.replace(/^0+(?=\w)/, '')] } }] } : {}),
    };
    for await (const { rows: b, next } of blocks((c) => prisma.customerVehicle.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...page(c), include: { customer: { select: { fullName: true, externalId: true } } } }), from)) {
      const imp = await importNumbers(b.map((r) => r.importJobId));
      yield { next, rows: b.map((r) => ({ ...r, imp: r.importJobId ? imp.get(r.importJobId) ?? null : null })) };
    }
  },
};

// ── The Store: parts, stock (with its value), suppliers, goods receipts ─

const parts: ExportKind = {
  key: 'parts', label: 'Parts', view: ['store.view'], sensitive: false, page: '/inventory/parts',
  columns: [
    { header: 'Part number', type: 'code', width: 16, get: (r) => r.partNumber },
    { header: 'Description', type: 'text', width: 32, get: (r) => r.name },
    { header: 'Category', type: 'text', width: 14, get: (r) => r.category },
    { header: 'Base unit', type: 'text', width: 9, get: (r) => r.baseUnitOfMeasure },
    { header: 'Tracking', type: 'text', width: 9, get: (r) => words(r.trackingType) },
    { header: 'Batch managed', type: 'bool', width: 8, get: (r) => r.trackingType === 'BATCH' },
    { header: 'Barcode', type: 'code', width: 14, get: (r) => r.barcode },
    { header: 'Selling price', type: 'money', width: 12, get: (r) => n(r.sellingPrice) },
    { header: 'Currency', type: 'text', width: 8, get: () => 'NGN' },
    { header: 'Reorder point', type: 'number', width: 10, get: (r) => n(r.reorderPoint) },
    { header: 'Safety stock', type: 'number', width: 10, get: (r) => n(r.safetyStock) },
    { header: 'On hand', type: 'number', width: 9, get: (r) => n(r.stock?.quantityOnHand) ?? 0 },
    { header: 'Number in the old system', type: 'code', width: 16, get: (r) => r.externalId },
    { header: 'Entered EJO', type: 'date', width: 12, get: (r) => r.createdAt },
    { header: 'Source', type: 'text', width: 12, get: (r) => (r.importJobId ? 'Imported' : 'Created in EJO') },
    { header: 'Import', type: 'code', width: 16, get: (r) => r.imp },
    { header: 'EJO record', type: 'code', width: 14, get: (r) => r.id },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/inventory/parts/${r.id}`) },
  ],
  async *rows(ctx, p, from) {
    const branchId = await branchWithinReach('store.view', await getStoreBranchId());
    const q = p.q?.trim();
    const sf = parseSourceFilter(p);
    const where: Prisma.PartWhereInput = {
      branchId, isActive: true, ...(sourceWhere(sf, await importIdsFor(ctx.organisationId, sf)) as Prisma.PartWhereInput),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { partNumber: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }, { barcode: { equals: q } }] } : {}),
    };
    for await (const { rows: b, next } of blocks((c) => prisma.part.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...page(c), include: { stock: true } }), from)) {
      const imp = await importNumbers(b.map((r) => r.importJobId));
      yield { next, rows: b.map((r) => ({ ...r, imp: r.importJobId ? imp.get(r.importJobId) ?? null : null })) };
    }
  },
};

type StockRow = Awaited<ReturnType<typeof getInventoryAnalytics>>['rows'][number];
const stock: ExportKind<StockRow> = {
  key: 'stock', label: 'Stock and value', view: ['analytics.inventory.view'], sensitive: false, page: '/inventory/analytics',
  columns: [
    { header: 'Part number', type: 'code', width: 16, get: (r) => r.partNumber },
    { header: 'Description', type: 'text', width: 30, get: (r) => r.name },
    { header: 'Category', type: 'text', width: 14, get: (r) => r.category },
    { header: 'Unit', type: 'text', width: 8, get: (r) => r.unit },
    { header: 'On hand', type: 'number', width: 9, get: (r) => r.onHand },
    { header: 'Reserved', type: 'number', width: 9, get: (r) => r.reserved },
    { header: 'Available', type: 'number', width: 9, get: (r) => r.available },
    { header: 'Stock value (FIFO cost)', type: 'money', width: 14, get: (r) => r.stockValue },
    { header: 'Average cost', type: 'money', width: 12, get: (r) => r.avgCost },
    { header: 'Last cost', type: 'money', width: 12, get: (r) => r.lastCost },
    { header: 'Currency', type: 'text', width: 8, get: () => 'NGN' },
    { header: 'Status', type: 'text', width: 14, get: (r) => words(r.status) },
    { header: 'ABC', type: 'text', width: 5, get: (r) => r.abc },
    { header: 'Days of cover', type: 'int', width: 9, get: (r) => r.daysOfCover },
    { header: 'Suggested order', type: 'number', width: 10, get: (r) => r.suggestedOrderQty },
    { header: 'Last movement', type: 'date', width: 12, get: (r) => r.lastMovement },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/inventory/parts/${r.id}`) },
  ],
  async *rows(_ctx, p, from) {
    // The same choices as the page: lead time 1–180 days (14), service level 90–99% (95%).
    const lead = Math.min(180, Math.max(1, Number(p.lead) || 14));
    const service = ['0.9', '0.95', '0.975', '0.99'].includes(p.service ?? '') ? Number(p.service) : 0.95;
    const a = await getInventoryAnalytics(await getStoreBranchId(), { leadTimeDays: lead, serviceLevel: service });
    yield* slices(a.rows, from);
  },
};

const suppliers: ExportKind = {
  key: 'suppliers', label: 'Suppliers', view: ['store.view'], sensitive: false, page: '/inventory/suppliers',
  columns: [
    { header: 'Supplier number (old system)', type: 'code', width: 14, get: (r) => r.externalId },
    { header: 'Name', type: 'text', width: 30, get: (r) => r.name },
    { header: 'Contact person', type: 'text', width: 18, get: (r) => r.contactName },
    { header: 'Phone', type: 'code', width: 16, get: (r) => r.phone },
    { header: 'Email', type: 'text', width: 24, get: (r) => r.email },
    { header: 'Address', type: 'text', width: 28, get: (r) => r.address },
    { header: 'Tax ID', type: 'code', width: 12, get: (r) => r.taxId },
    { header: 'Active', type: 'bool', width: 7, get: (r) => r.isActive },
    { header: 'Entered EJO', type: 'date', width: 12, get: (r) => r.createdAt },
    { header: 'Source', type: 'text', width: 12, get: (r) => (r.importJobId ? 'Imported' : 'Created in EJO') },
    { header: 'EJO record', type: 'code', width: 14, get: (r) => r.id },
  ],
  async *rows(ctx, p, from) {
    const organisationId = ctx.organisationId ?? '__none__';
    const q = String(p.q ?? '').trim().slice(0, 80);
    const sf = parseSourceFilter(p);
    const where: Prisma.SupplierWhereInput = { organisationId, ...(sourceWhere(sf, await importIdsFor(organisationId, sf)) as Prisma.SupplierWhereInput), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { externalId: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) };
    yield* blocks((c) => prisma.supplier.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...page(c) }), from);
  },
};

const goodsReceipts: ExportKind = {
  key: 'goods-receipts', label: 'Goods receipt lines', view: ['store.view'], sensitive: false, page: '/inventory/goods-receipts',
  columns: [
    { header: 'Goods receipt', type: 'code', width: 16, get: (r) => r.goodsReceipt.referenceNumber },
    { header: 'Received', type: 'datetime', width: 16, get: (r) => r.goodsReceipt.receivedAt },
    { header: 'Supplier', type: 'text', width: 24, get: (r) => r.goodsReceipt.supplierName },
    { header: 'Supplier number (old system)', type: 'code', width: 14, get: (r) => r.goodsReceipt.supplier?.externalId },
    { header: 'Opening balance', type: 'bool', width: 9, get: (r) => r.goodsReceipt.isOpeningBalance },
    { header: 'Part number', type: 'code', width: 16, get: (r) => r.part.partNumber },
    { header: 'Description', type: 'text', width: 28, get: (r) => r.part.name },
    { header: 'Quantity (base unit)', type: 'number', width: 10, get: (r) => n(r.quantityInBaseUnit) },
    { header: 'Base unit', type: 'text', width: 9, get: (r) => r.part.baseUnitOfMeasure },
    { header: 'Unit cost', type: 'money', width: 12, get: (r) => n(r.unitCost) },
    { header: 'Line cost', type: 'money', width: 13, get: (r) => n(r.totalCost) },
    { header: 'Currency', type: 'text', width: 8, get: () => 'NGN' },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/inventory/goods-receipts/${r.goodsReceipt.id}`) },
  ],
  async *rows(_ctx, p, from) {
    const branchId = await getStoreBranchId();
    const q = p.q?.trim();
    const where: Prisma.GoodsReceiptLineWhereInput = { goodsReceipt: { branchId, ...(q ? { OR: [{ referenceNumber: { contains: q, mode: 'insensitive' } }, { supplierName: { contains: q, mode: 'insensitive' } }] } : {}) } };
    yield* blocks((c) => prisma.goodsReceiptLine.findMany({ where, orderBy: [{ goodsReceipt: { receivedAt: 'desc' } }, { id: 'asc' }], ...page(c), include: { part: { select: { partNumber: true, name: true, baseUnitOfMeasure: true } }, goodsReceipt: { select: { id: true, referenceNumber: true, receivedAt: true, supplierName: true, isOpeningBalance: true, supplier: { select: { externalId: true } } } } } }), from);
  },
};

// ── Workshop: Job Cards ──────────────────────────

const jobSearch = (q: string | undefined): Prisma.JobCardWhereInput => (q ? { OR: [{ jobNumber: { contains: q, mode: 'insensitive' } }, { customer: { fullName: { contains: q, mode: 'insensitive' } } }, { vehicle: { plateNumber: { contains: q, mode: 'insensitive' } } }, { vehicle: { chassisNumber: { contains: q, mode: 'insensitive' } } }, { assignedTechnician: { fullName: { contains: q, mode: 'insensitive' } } }] } : {});
const jobCards: ExportKind = {
  key: 'job-cards', label: 'Job Cards', view: ['workshop.job_card.view'], sensitive: false, page: '/workshop/job-cards',
  columns: [
    { header: 'Job Card', type: 'code', width: 16, get: (r) => r.jobNumber },
    { header: 'Status', type: 'text', width: 16, get: (r) => words(r.status) },
    { header: 'Outcome', type: 'text', width: 14, get: (r) => r.outcome },
    { header: 'Opened', type: 'datetime', width: 16, get: (r) => r.createdAt },
    { header: 'Completed', type: 'datetime', width: 16, get: (r) => r.completedAt },
    { header: 'Checked out', type: 'datetime', width: 16, get: (r) => r.checkedOutAt },
    { header: 'Branch', type: 'text', width: 14, get: (r) => r.branch?.name },
    { header: 'Customer', type: 'text', width: 24, get: (r) => r.customer?.fullName },
    { header: 'Customer number', type: 'code', width: 14, get: (r) => r.customer?.externalId },
    { header: 'Plate', type: 'code', width: 12, get: (r) => r.vehicle?.plateNumber },
    { header: 'Chassis number (VIN)', type: 'code', width: 20, get: (r) => r.vehicle?.chassisNumber },
    { header: 'Vehicle', type: 'text', width: 16, get: (r) => [r.vehicle?.make, r.vehicle?.model].filter(Boolean).join(' ') },
    { header: 'Technician', type: 'text', width: 18, get: (r) => r.assignedTechnician?.fullName },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/workshop/job-cards/${r.id}`) },
  ],
  async *rows(_ctx, p, from) {
    const reach = await reachWhere('workshop.job_card.view');
    const type = p.type === 'PASSENGER' || p.type === 'COMMERCIAL' ? p.type : undefined;
    const outcome = parseOutcomeFilter(p.outcome);
    const where: Prisma.JobCardWhereInput = { AND: [reach as Prisma.JobCardWhereInput, jobSearch(p.q?.trim()), type ? { vehicle: { vehicleType: type } } : {}] };
    for await (const { rows: b, next } of blocks((c) => prisma.jobCard.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...page(c), include: { branch: { select: { name: true } }, customer: { select: { fullName: true, externalId: true } }, vehicle: { select: { plateNumber: true, chassisNumber: true, make: true, model: true } }, assignedTechnician: { select: { fullName: true } } } }), from)) {
      const out = await getJobCardOutcomes(b.map((r) => r.id));
      const rows = b.map((r) => ({ ...r, outcome: out[r.id] ? words(out[r.id]!.outcome) : null, _o: out[r.id] }));
      yield { next, rows: outcome ? rows.filter((r) => r._o && matchesOutcomeFilter(outcome, r._o.outcome, r._o.refund)) : rows };
    }
  },
};

// ── History from before EJO, imports and exports ──────────────────────

const historyInvoices: ExportKind = {
  key: 'history-invoices', label: 'Invoice history (before EJO)', view: ['crm.view'], sensitive: true, page: '/crm',
  columns: [
    { header: 'Invoice number', type: 'code', width: 14, get: (r) => r.invoiceNumber },
    { header: 'Document type', type: 'code', width: 8, get: (r) => r.documentType },
    { header: 'Invoice date', type: 'day', width: 12, get: (r) => r.invoiceDate },
    { header: 'Customer name', type: 'text', width: 24, get: (r) => r.customerName },
    { header: 'Customer number', type: 'code', width: 14, get: (r) => r.customerExt },
    { header: 'Chassis number (VIN)', type: 'code', width: 20, get: (r) => r.vin },
    { header: 'Amount (incl. tax)', type: 'money', width: 13, get: (r) => n(r.amount) },
    { header: 'Currency', type: 'text', width: 8, get: () => 'NGN' },
    { header: 'Description', type: 'text', width: 30, get: (r) => r.description },
    { header: 'Import', type: 'code', width: 16, get: (r) => r.imp },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/crm/customers/${r.customerId}?tab=jobs`) },
  ],
  async *rows(ctx, p, from) {
    const reach = await reachWhere('crm.view', { lens: false });
    const branchId = typeof reach.branchId === 'string' ? reach.branchId : null;
    const year = /^\d{4}$/.test(String(p.year)) ? Number(p.year) : null;
    const where: Prisma.HistoricalInvoiceWhereInput = { organisationId: ctx.organisationId ?? '__none__', voidedAt: null, ...(branchId ? { branchId } : {}), ...(year ? { invoiceDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } : {}), ...(p.customerId ? { customerId: p.customerId } : {}) };
    for await (const { rows: b, next } of blocks((c) => prisma.historicalInvoice.findMany({ where, orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }], ...page(c) }), from)) {
      const [names, imp] = await Promise.all([
        prisma.customer.findMany({ where: { id: { in: [...new Set(b.map((r) => r.customerId))] } }, select: { id: true, fullName: true, externalId: true } }).then((x) => new Map(x.map((c) => [c.id, c]))),
        importNumbers(b.map((r) => r.importJobId)),
      ]);
      yield { next, rows: b.map((r) => ({ ...r, customerName: names.get(r.customerId)?.fullName ?? null, customerExt: names.get(r.customerId)?.externalId ?? null, imp: r.importJobId ? imp.get(r.importJobId) ?? null : null })) };
    }
  },
};

/**
 * Invoices issued in EJO (one per Job Card, figures frozen at issue): what
 * was charged, the VAT, what has been paid since and what is still owed —
 * with the due date for an organisation on credit. Filters: q (invoice or
 * Job Card number, customer), owing=yes (still owed), overdue=yes (owed and
 * past its due date). Payments are money, so the file is sensitive. Its
 * columns read straight back in as invoice history.
 */
const invoiceSearch = (q: string | undefined): Prisma.InvoiceWhereInput => (q ? { OR: [{ invoiceNumber: { contains: q, mode: 'insensitive' } }, { jobCard: { jobNumber: { contains: q, mode: 'insensitive' } } }, { customer: { fullName: { contains: q, mode: 'insensitive' } } }, { customer: { customerCompany: { companyName: { contains: q, mode: 'insensitive' } } } }] } : {});
const invoices: ExportKind = {
  key: 'invoices', label: 'Invoices', view: ['workshop.job_card.view'], sensitive: true, page: '/workshop/job-cards',
  note: 'Every invoice issued in EJO within your reach, newest first, with what has been paid towards it on the day of the export.',
  columns: [
    { header: 'Invoice number', type: 'code', width: 16, get: (r) => r.invoiceNumber },
    { header: 'Invoice date', type: 'day', width: 12, get: (r) => r.issuedAt },
    { header: 'Due date', type: 'day', width: 12, get: (r) => r.dueDate },
    { header: 'Status', type: 'text', width: 10, get: (r) => r.state },
    { header: 'Job Card', type: 'code', width: 16, get: (r) => r.jobCard?.jobNumber },
    { header: 'Branch', type: 'text', width: 14, get: (r) => r.branch?.name },
    { header: 'Customer name', type: 'text', width: 24, get: (r) => r.customer?.customerCompany?.companyName ?? r.customer?.fullName },
    { header: 'Customer number', type: 'code', width: 14, get: (r) => r.customer?.externalId },
    { header: 'Plate', type: 'code', width: 12, get: (r) => r.jobCard?.vehicle?.plateNumber },
    { header: 'Chassis number (VIN)', type: 'code', width: 20, get: (r) => r.jobCard?.vehicle?.chassisNumber },
    { header: 'Vehicle', type: 'text', width: 16, get: (r) => [r.jobCard?.vehicle?.make, r.jobCard?.vehicle?.model].filter(Boolean).join(' ') },
    { header: 'Subtotal', type: 'money', width: 13, get: (r) => n(r.subtotal) },
    { header: 'Discount', type: 'money', width: 12, get: (r) => n(r.discountAmount) },
    { header: 'VAT rate (%)', type: 'number', width: 8, get: (r) => n(r.vatRate) },
    { header: 'VAT charged', type: 'money', width: 12, get: (r) => n(r.vatAmount) },
    { header: 'Total', type: 'money', width: 13, get: (r) => n(r.total) },
    { header: 'Paid', type: 'money', width: 13, get: (r) => r.paid },
    { header: 'Balance', type: 'money', width: 13, get: (r) => r.balance },
    { header: 'Currency', type: 'text', width: 8, get: () => 'NGN' },
    { header: 'Issued by', type: 'text', width: 18, get: (r) => r.issuedBy?.fullName },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/workshop/job-cards/${r.jobCardId}`) },
  ],
  async *rows(ctx, p, from) {
    const reach = await reachWhere('workshop.job_card.view');
    const where: Prisma.InvoiceWhereInput = { AND: [{ organisationId: ctx.organisationId ?? '__none__' }, reach as Prisma.InvoiceWhereInput, invoiceSearch(p.q?.trim())] };
    const owingOnly = p.owing === 'yes' || p.overdue === 'yes';
    const now = Date.now();
    for await (const { rows: b, next } of blocks((c) => prisma.invoice.findMany({
      where, orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }], ...page(c),
      include: {
        branch: { select: { name: true } }, issuedBy: { select: { fullName: true } },
        customer: { select: { fullName: true, externalId: true, customerCompany: { select: { companyName: true } } } },
        jobCard: { select: { jobNumber: true, vehicle: { select: { plateNumber: true, chassisNumber: true, make: true, model: true } }, payments: { select: { amount: true } }, refunds: { select: { amount: true } } } },
      },
    }), from)) {
      const rows = b.map((r) => {
        const paid = Math.max(0, Math.round((r.jobCard.payments.reduce((x, y) => x + Number(y.amount), 0) - r.jobCard.refunds.reduce((x, y) => x + Number(y.amount), 0)) * 100) / 100);
        const balance = Math.max(0, Math.round((Number(r.total) - paid) * 100) / 100);
        const overdue = balance > 0 && r.dueDate !== null && r.dueDate.getTime() < now;
        return { ...r, paid, balance, overdue, state: balance <= 0 ? 'Paid' : overdue ? 'Overdue' : 'Owing' };
      });
      yield { next, rows: owingOnly ? rows.filter((r) => r.balance > 0 && (p.overdue !== 'yes' || r.overdue)) : rows };
    }
  },
};

/** Job cards from before EJO: in the job card history layout, as the import reads them. */
const historyJobs: ExportKind = {
  key: 'history-jobs', label: 'Job card history (before EJO)', view: ['crm.view', 'workshop.job_card.view'], sensitive: true, page: '/crm',
  columns: [
    { header: 'Job number', type: 'code', width: 12, get: (r) => r.jobNumber },
    { header: 'Service', type: 'text', width: 8, get: (r) => (r.kind === 'SERVICE' ? 'Yes' : 'No') },
    { header: 'Status', type: 'text', width: 10, get: (r) => (r.status === 'CANCELLED' ? 'Cancelled' : 'Closed') },
    { header: 'Opened on', type: 'day', width: 12, get: (r) => r.openedAt },
    { header: 'Completed on', type: 'day', width: 12, get: (r) => r.completedAt },
    { header: 'Customer name', type: 'text', width: 24, get: (r) => r.customerName },
    { header: 'Customer number', type: 'code', width: 14, get: (r) => r.customerExt },
    { header: 'Chassis number (VIN)', type: 'code', width: 20, get: (r) => r.vin },
    { header: 'Plate', type: 'code', width: 12, get: (r) => r.plateNumber },
    { header: 'Mileage (km)', type: 'int', width: 10, get: (r) => r.mileage },
    { header: 'Complaint / work requested', type: 'text', width: 36, get: (r) => r.description },
    { header: 'Work done', type: 'text', width: 36, get: (r) => r.workDone },
    { header: 'Labour', type: 'money', width: 12, get: (r) => (r.labourAmount === null ? null : n(r.labourAmount)) },
    { header: 'Parts', type: 'money', width: 12, get: (r) => (r.partsAmount === null ? null : n(r.partsAmount)) },
    { header: 'Total (₦)', type: 'money', width: 12, get: (r) => (r.totalAmount === null ? null : n(r.totalAmount)) },
    { header: 'Invoice number', type: 'code', width: 12, get: (r) => r.invoiceNumber },
    { header: 'Branch', type: 'text', width: 16, get: (r) => r.branchName },
    { header: 'Import', type: 'code', width: 16, get: (r) => r.imp },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(r.vehicleId ? `/workshop/vehicles/${r.vehicleId}/edit` : `/crm/customers/${r.customerId}?tab=jobs`) },
  ],
  async *rows(ctx, p, from) {
    const reach = await reachWhere('workshop.job_card.view', { lens: false });
    const branchId = typeof reach.branchId === 'string' ? reach.branchId : null;
    const where: Prisma.HistoricalJobWhereInput = { organisationId: ctx.organisationId ?? '__none__', voidedAt: null, ...(branchId ? { branchId } : {}), ...(p.customerId ? { customerId: p.customerId } : {}), ...(p.vehicleId ? { vehicleId: p.vehicleId } : {}) };
    for await (const { rows: b, next } of blocks((c) => prisma.historicalJob.findMany({ where, orderBy: [{ openedAt: 'desc' }, { id: 'desc' }], ...page(c) }), from)) {
      const [names, branches, imp] = await Promise.all([
        prisma.customer.findMany({ where: { id: { in: [...new Set(b.map((r) => r.customerId))] } }, select: { id: true, fullName: true, externalId: true } }).then((x) => new Map(x.map((c) => [c.id, c]))),
        prisma.branch.findMany({ where: { id: { in: [...new Set(b.map((r) => r.branchId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true } }).then((x) => new Map(x.map((c) => [c.id, c.name]))),
        importNumbers(b.map((r) => r.importJobId)),
      ]);
      yield { next, rows: b.map((r) => ({ ...r, customerName: names.get(r.customerId)?.fullName ?? null, customerExt: names.get(r.customerId)?.externalId ?? null, branchName: r.branchId ? branches.get(r.branchId) ?? null : null, imp: r.importJobId ? imp.get(r.importJobId) ?? null : null })) };
    }
  },
};

const imports: ExportKind = {
  key: 'imports', label: 'Imports', view: ['dataexchange.import.run', 'dataexchange.import.approve'], sensitive: false, page: '/data-exchange',
  columns: [
    { header: 'Import', type: 'code', width: 16, get: (r) => r.number },
    { header: 'What', type: 'text', width: 16, get: (r) => r.entity },
    { header: 'File', type: 'text', width: 30, get: (r) => r.fileName },
    { header: 'Status', type: 'text', width: 12, get: (r) => words(r.status) },
    { header: 'Rows in the file', type: 'int', width: 10, get: (r) => r.fileRows },
    { header: 'Added', type: 'int', width: 9, get: (r) => r.createdRows },
    { header: 'Filled in', type: 'int', width: 9, get: (r) => r.updatedRows },
    { header: 'Not added', type: 'int', width: 9, get: (r) => r.skippedRows },
    { header: 'Rejected', type: 'int', width: 9, get: (r) => r.rejectedRows + r.duplicateRows },
    { header: 'Started', type: 'datetime', width: 16, get: (r) => r.createdAt },
    { header: 'Loaded', type: 'datetime', width: 16, get: (r) => r.completedAt },
    { header: 'Prepared by', type: 'text', width: 18, get: (r) => r.createdBy?.fullName },
    { header: 'Approved by', type: 'text', width: 18, get: (r) => r.approvedBy?.fullName },
    { header: 'Link', type: 'link', width: 40, get: (r) => link(`/data-exchange/imports/${r.id}`) },
  ],
  async *rows(ctx, _p, from) {
    yield* blocks((c) => prisma.importJob.findMany({ where: { organisationId: ctx.organisationId ?? '__none__' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...page(c), include: { createdBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } } } }), from);
  },
};

const exportsHistory: ExportKind = {
  key: 'exports', label: 'Exports', view: ['dataexchange.export.run'], sensitive: false, page: '/data-exchange/exports',
  columns: [
    { header: 'Export', type: 'code', width: 16, get: (r) => r.number },
    { header: 'List', type: 'text', width: 18, get: (r) => r.kind },
    { header: 'Format', type: 'text', width: 7, get: (r) => r.format.toUpperCase() },
    { header: 'Filters', type: 'text', width: 40, get: (r) => r.summary },
    { header: 'Contact details or payments', type: 'bool', width: 10, get: (r) => r.sensitive },
    { header: 'Rows', type: 'int', width: 9, get: (r) => r.rowCount },
    { header: 'Size (bytes)', type: 'int', width: 11, get: (r) => r.bytes },
    { header: 'Exported by', type: 'text', width: 18, get: (r) => r.by },
    { header: 'Exported', type: 'datetime', width: 16, get: (r) => r.createdAt },
    { header: 'Downloads', type: 'int', width: 9, get: (r) => r._count.downloads },
  ],
  async *rows(ctx, p, from) {
    const all = await allows('audit.view');
    for await (const { rows: b, next } of blocks((c) => prisma.exportJob.findMany({ where: { organisationId: ctx.organisationId ?? '__none__', ...(all ? {} : { createdById: ctx.userId }) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...page(c), include: { _count: { select: { downloads: true } } } }), from)) {
      const names = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(b.map((r) => r.createdById))] } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
      yield { next, rows: b.map((r) => ({ ...r, by: names.get(r.createdById) ?? null })) };
    }
  },
};

// ── Administration: people and roles (never passwords), the audit trail ─

type UserExportRow = Awaited<ReturnType<typeof listUsersForAdmin>>['users'][number];
const users: ExportKind<UserExportRow> = {
  // The Users page's own reading (listUsersForAdmin): the administrator's organisation or branch,
  // the platform team never listed to organisations, the same search and filters. Never a password or token.
  key: 'users', label: 'People and roles', view: ['admin.users.manage'], sensitive: false, page: '/users',
  columns: [
    { header: 'Name', type: 'text', width: 24, get: (r) => r.fullName },
    { header: 'Email', type: 'text', width: 28, get: (r) => r.email },
    { header: 'Employee ID', type: 'code', width: 12, get: (r) => r.employeeId },
    { header: 'Branch', type: 'text', width: 16, get: (r) => r.branch },
    { header: 'Department', type: 'text', width: 16, get: (r) => r.department },
    { header: 'Roles', type: 'text', width: 30, get: (r) => r.roles.map((x) => x.name).join(', ') },
    { header: 'Active', type: 'bool', width: 7, get: (r) => r.isActive },
  ],
  async *rows(_ctx, p, from) {
    const { users: all } = await listUsersForAdmin(p.q, { status: p.show, branchId: p.branch, roleId: p.role, all: true });
    yield* slices(all, from);
  },
};

type AuditExportRow = Awaited<ReturnType<typeof getAuditLogPage>>['rows'][number];
const audit: ExportKind<AuditExportRow> = {
  // The audit page's own reading (getAuditLogPage): its tabs, search, person and dates, its
  // fences (organisation, integrity reviewers, the branch lens) and its names ("Platform support").
  // Sign-in addresses are personal data: this list needs the sensitive-export permission too.
  key: 'audit-log', label: 'Audit trail', view: ['audit.view'], sensitive: true, page: '/audit-logs',
  columns: [
    { header: 'When', type: 'datetime', width: 16, get: (r) => r.at },
    { header: 'Who', type: 'text', width: 26, get: (r) => r.who },
    { header: 'Kind', type: 'text', width: 12, get: (r) => r.kind },
    { header: 'What happened', type: 'text', width: 40, get: (r) => r.title },
    { header: 'Details', type: 'text', width: 40, get: (r) => r.detail },
    { header: 'Area', type: 'text', width: 14, get: (r) => r.area },
    { header: 'Records', type: 'text', width: 30, get: (r) => r.records.map((x) => x.label).join('; ') },
    { header: 'Changes', type: 'text', width: 50, get: (r) => r.changes.map((c) => `${c.field}: ${c.before} → ${c.after}`).join('; ').slice(0, 4000) },
    { header: 'Sign-in address', type: 'code', width: 15, get: (r) => r.ip },
    { header: 'Link', type: 'link', width: 40, get: (r) => (r.records[0]?.url ? link(r.records[0].url) : null) },
  ],
  async *rows(_ctx, p, from) {
    if (from === 'end') return;
    let cursor: string | undefined = from ?? undefined;
    for (;;) {
      const pg = await getAuditLogPage({ kind: p.kind, q: p.q, userId: p.userId, from: p.from, to: p.to, cursor });
      cursor = pg.nextCursor ?? undefined;
      yield { rows: pg.rows, next: cursor ?? 'end' };
      if (!cursor) return;
    }
  },
};

export const EXPORT_KINDS: Record<string, ExportKind> = Object.fromEntries(
  [customers, vehicles, parts, stock, suppliers, goodsReceipts, jobCards, invoices, historyInvoices, historyJobs, imports, exportsHistory, users, audit].map((k) => [k.key, k]),
);

/** May this person export this list (open it, export, and — for contact details or payments — export those)? */
export async function mayExport(kind: ExportKind): Promise<boolean> {
  if (!(await allows('dataexchange.export.run'))) return false;
  if (kind.sensitive && !(await allows('dataexchange.export.sensitive'))) return false;
  for (const v of kind.view) if (await allows(v)) return true;
  return false;
}

export async function exportOrganisation(): Promise<string | null> {
  return (await orgWhere()).organisationId ?? (await myOrganisationId());
}
