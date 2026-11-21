/**
 * Data Exchange — SAP history (v-A3). Server only (never a 'use server'
 * file): lib/actions/data-exchange.ts checks who is asking, locks the import
 * and calls these inside its transactions.
 *
 *  • Invoice history: SAP invoices from before EJO 100, each linked to its
 *    customer (by SAP customer number, then phone) and, when its VIN is a
 *    vehicle in the system, to that vehicle. Read-only; counted in the
 *    customer's spend and last visit and in the CRM and Headquarters
 *    analytics, always labelled "from SAP, before EJO".
 *  • Job and service history (P4): SAP service orders / old job cards from
 *    before EJO, each linked to its customer (by SAP number, phone, email —
 *    or the owner of the vehicle named by VIN or plate) and to the vehicle;
 *    counted as a visit, shown on the customer and the vehicle, and the
 *    anchor of the vehicle's next-service clock until EJO completes a
 *    service of its own.
 *
 * Each invoice and job number is loaded once. Undo voids exactly what the import loaded (voidedAt) — never a
 * delete — and loading the same file again restores the voided rows.
 */
import { prisma, type Prisma } from '@ejo/database';
import { featureOn } from '@/lib/modules';
import { checkInvoiceRow, checkJobRow, invoiceRange, type JobValues } from './check-history';
import type { Issue } from './check';
import type { EntityKey, Mapping } from './fields';
import { findCustomers } from './lookup-server';
import { newId, writeLoadResults, type LoadRow, type Result, type RowUpdate } from './rows-server';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
export type HistoryEntity = Extract<EntityKey, 'invoices' | 'jobs'>;
export const isHistoryEntity = (e: string): e is HistoryEntity => e === 'invoices' || e === 'jobs';

export type HistoryJob = { id: string; number: string; organisationId: string; branchId: string | null; sourceSystem: string; createdById: string };

const src = (s: string) => (s === 'LEGACY' ? 'LEGACY' : 'SAP');
const dayDate = (d: string) => new Date(`${d}T00:00:00.000Z`);

// ── Lookups ───────────────────────────────────────────────────────────

/** The numbering range an invoice row belongs to: SAP's, or the old system's (each with company code and year when the file gives either). */
const rangeOf = (job: HistoryJob, v: { source: string }) => invoiceRange(src(job.sourceSystem), v.source);
const invKey = (range: string, number: string) => `${range}|${number.toUpperCase()}`;

type KnownInvoice = { id: string; voided: boolean; importJobId: string | null; fiscalYear: number | null; companyCode: string | null };

/** Invoices already in the history (voided ones too: a reload restores them). */
async function findInvoices(db: Db, organisationId: string, numbers: string[]) {
  if (!numbers.length) return new Map<string, KnownInvoice>();
  const rows = await db.historicalInvoice.findMany({ where: { organisationId, invoiceNumber: { in: [...new Set(numbers)] } }, select: { id: true, invoiceNumber: true, externalSource: true, voidedAt: true, importJobId: true, fiscalYear: true, companyCode: true } });
  return new Map(rows.map((r) => [invKey(r.externalSource, r.invoiceNumber), { id: r.id, voided: Boolean(r.voidedAt), importJobId: r.importJobId, fiscalYear: r.fiscalYear, companyCode: r.companyCode }]));
}

/**
 * The invoice already in the history for this row. An old system's invoice loaded before its file's year
 * counted is stored under plain "LEGACY": it is the same invoice when its year and company code agree.
 */
function knownInvoice(existing: Map<string, KnownInvoice>, job: HistoryJob, v: { source: string; invoiceNumber: string; fiscalYear: number; companyCode: string | null }): KnownInvoice | undefined {
  const range = rangeOf(job, v);
  const hit = existing.get(invKey(range, v.invoiceNumber));
  if (hit || range === 'LEGACY' || !range.startsWith('LEGACY/')) return hit;
  const old = existing.get(invKey('LEGACY', v.invoiceNumber));
  return old && old.fiscalYear === v.fiscalYear && (old.companyCode ?? null) === (v.companyCode ?? null) ? old : undefined;
}

/** The organisation's vehicles with these chassis numbers (as stored: capitals, no spaces). */
async function findVehiclesByVin(db: Db, organisationId: string, vins: string[]) {
  if (!vins.length) return new Map<string, { id: string; customerId: string }>();
  const rows = await db.customerVehicle.findMany({ where: { chassisNumber: { in: vins }, customer: { organisationId } }, select: { id: true, chassisNumber: true, customerId: true } });
  return new Map(rows.map((r) => [String(r.chassisNumber).toUpperCase(), { id: r.id, customerId: r.customerId }]));
}

/** Past jobs already in the history (voided ones too: a reload restores them), by numbering range and number. */
async function findJobs(db: Db, organisationId: string, numbers: string[]) {
  if (!numbers.length) return new Map<string, { id: string; voided: boolean; importJobId: string | null }>();
  const rows = await db.historicalJob.findMany({ where: { organisationId, jobNumber: { in: [...new Set(numbers)] } }, select: { id: true, jobNumber: true, externalSource: true, voidedAt: true, importJobId: true } });
  return new Map(rows.map((r) => [invKey(r.externalSource, r.jobNumber), { id: r.id, voided: Boolean(r.voidedAt), importJobId: r.importJobId }]));
}

/** The organisation's vehicles with these plates (compared without spaces or dashes). */
async function findVehiclesByPlate(db: Db, organisationId: string, plates: string[]) {
  if (!plates.length) return new Map<string, { id: string; customerId: string }>();
  const rows = await db.$queryRaw<{ id: string; customerId: string; k: string }[]>`
    SELECT v.id, v."customerId", upper(regexp_replace(coalesce(v."plateNumber", ''), '[\s-]', '', 'g')) AS k FROM customer_vehicles v JOIN customers c ON c.id = v."customerId"
     WHERE c."organisationId" = ${organisationId} AND upper(regexp_replace(coalesce(v."plateNumber", ''), '[\s-]', '', 'g')) = ANY(${[...new Set(plates)]}::text[])`;
  return new Map(rows.map((r) => [r.k, { id: r.id, customerId: r.customerId }]));
}

type JobLookups = { cust: Awaited<ReturnType<typeof findCustomers>>; existing: Awaited<ReturnType<typeof findJobs>>; byVin: Awaited<ReturnType<typeof findVehiclesByVin>>; byPlate: Awaited<ReturnType<typeof findVehiclesByPlate>>; branch: { name: string; sapPlant: string | null } | null };

async function jobLookups(db: Db, job: HistoryJob, checked: { c: ReturnType<typeof checkJobRow> }[]): Promise<JobLookups> {
  const vals = checked.map((x) => x.c.values).filter((v): v is JobValues => Boolean(v));
  const [cust, existing, byVin, byPlate, branch] = await Promise.all([
    findCustomers(db, job.organisationId, src(job.sourceSystem), {
      ext: vals.map((v) => v.customer.externalId?.toUpperCase()).filter((v): v is string => Boolean(v)),
      email: vals.map((v) => v.customer.email).filter((v): v is string => Boolean(v)),
      phone: vals.map((v) => v.customer.phone).filter((v): v is string => Boolean(v)),
    }),
    findJobs(db, job.organisationId, vals.map((v) => v.jobNumber)),
    findVehiclesByVin(db, job.organisationId, vals.map((v) => v.vinKey).filter((v): v is string => Boolean(v))),
    findVehiclesByPlate(db, job.organisationId, vals.map((v) => v.plateKey).filter((v): v is string => Boolean(v))),
    job.branchId ? db.branch.findUnique({ where: { id: job.branchId }, select: { name: true, sapPlant: true } }) : null,
  ]);
  return { cust, existing, byVin, byPlate, branch };
}

/** The customer and vehicle a job row points at, by the SAP customer number, phone or email, or through the vehicle's owner; and whether its Branch cell names the import's branch. */
function resolveJob(v: JobValues, L: JobLookups, job: HistoryJob): { owner: string | null; vehicle: { id: string; customerId: string } | null; branchProblem: string | null; branchNote: string | null; vehicleNote: string | null } {
  const vehicle = (v.vinKey && L.byVin.get(v.vinKey)) || (v.plateKey && L.byPlate.get(v.plateKey)) || null;
  const byEmail = v.customer.email ? L.cust.email.get(v.customer.email) : undefined;
  const owner = (v.customer.externalId && L.cust.ext.get(v.customer.externalId.toUpperCase())) || (v.customer.phone && L.cust.phone.get(v.customer.phone.slice(-10))) || (byEmail && byEmail.sameOrg ? byEmail.id : null) || vehicle?.customerId || null;
  let branchProblem: string | null = null;
  let branchNote: string | null = null;
  if (v.branch && L.branch) {
    const k = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
    const plantCode = /^\d{1,4}$/.test(v.branch.trim());
    if (plantCode && !L.branch.sapPlant) branchNote = (featureOn('sap') ? `SAP plant ${v.branch.trim()} could not be checked against ${L.branch.name}: the branch has no SAP plant code yet (set it under Branches).` : `Branch “${v.branch.trim()}” could not be checked against ${L.branch.name}: it is a number, not the branch’s name.`);
    else {
      const ok = k(v.branch) === k(L.branch.name) || (L.branch.sapPlant ? v.branch.trim().replace(/^0+/, '') === L.branch.sapPlant.replace(/^0+/, '') : false) || k(L.branch.name).includes(k(v.branch));
      if (!ok) branchProblem = `This row is for the branch “${v.branch}”, but this import loads into ${L.branch.name}. Import it into its own branch.`;
    }
  }
  let vehicleNote: string | null = null;
  if ((v.vinKey || v.plateKey) && !vehicle) vehicleNote = 'The vehicle is not in EJO yet, so the job is kept on the customer only (it links to the vehicle once the vehicles file is loaded and this file loaded again).';
  else if (vehicle && owner && vehicle.customerId !== owner) vehicleNote = 'The vehicle now belongs to another customer; the job stays with this customer and on the vehicle’s history.';
  return { owner, vehicle, branchProblem, branchNote, vehicleNote };
}


function invoiceCustomers(db: Db, job: HistoryJob, checked: { c: ReturnType<typeof checkInvoiceRow> }[]) {
  return findCustomers(db, job.organisationId, src(job.sourceSystem), {
    ext: checked.map((x) => x.c.values?.customer.externalId?.toUpperCase()).filter((v): v is string => Boolean(v)),
    email: [],
    phone: checked.map((x) => x.c.values?.customer.phone).filter((v): v is string => Boolean(v)),
    name: checked.map((x) => x.c.values?.customer.name).filter((v): v is string => Boolean(v)),
  });
}

/** Whose invoice: by number, then phone, then (only when neither is given) a name exactly one customer has. */
function invoiceOwner(cust: Awaited<ReturnType<typeof invoiceCustomers>>, v: { customer: { externalId: string | null; phone: string | null; name?: string | null } }): string | null {
  return (v.customer.externalId && cust.ext.get(v.customer.externalId.toUpperCase())) || (v.customer.phone && cust.phone.get(v.customer.phone.slice(-10))) || (!v.customer.externalId && !v.customer.phone && v.customer.name ? cust.name.get(v.customer.name.trim().toLowerCase()) ?? null : null) || null;
}

// ── Check (nothing live changes) ──────────────────────────────────────

export async function checkHistoryRows(entity: HistoryEntity, job: HistoryJob, mapping: Mapping, rows: { id: string; cells: Prisma.JsonValue }[]): Promise<RowUpdate[]> {
  const out: RowUpdate[] = [];
  if (entity === 'invoices') {
    const checked = rows.map((r) => ({ r, c: checkInvoiceRow(r.cells as unknown[], mapping) }));
    const [cust, existing, vehicles] = await Promise.all([
      invoiceCustomers(prisma, job, checked),
      findInvoices(prisma, job.organisationId, checked.map((x) => x.c.values?.invoiceNumber).filter((v): v is string => Boolean(v))),
      findVehiclesByVin(prisma, job.organisationId, checked.map((x) => x.c.values?.vinKey).filter((v): v is string => Boolean(v))),
    ]);
    for (const { r, c } of checked) {
      const issues: Issue[] = [...c.issues];
      let status: string = c.status;
      let matchedId: string | null = null;
      let matchedBy: string | null = null;
      const v = c.values;
      if (v && status !== 'REJECTED') {
        const owner = invoiceOwner(cust, v);
        if (!owner) { issues.push({ field: 'customer', level: 'error', message: 'The customer was not found. Import the customers file first, or check the customer number.' }); status = 'REJECTED'; }
        else {
          const veh = v.vinKey ? vehicles.get(v.vinKey) : undefined;
          if (v.vinKey && !veh) { issues.push({ field: 'vin', level: 'warning', message: 'The vehicle is not in the system yet, so the invoice is kept on the customer only (it links to the vehicle once the vehicle is imported and the file loaded again).' }); }
          else if (veh && veh.customerId !== owner) { issues.push({ field: 'vin', level: 'warning', message: 'The vehicle now belongs to another customer; the invoice stays with this customer and on the vehicle’s history.' }); }
          const hit = knownInvoice(existing, job, v);
          if (hit && !hit.voided && hit.importJobId !== job.id) { matchedId = hit.id; matchedBy = 'inv'; issues.push({ field: 'invoiceNumber', level: 'warning', message: 'Already in the history (loaded before); left as it is.' }); }
          if (status === 'GOOD' && issues.length) status = 'WARNING';
        }
      }
      out.push({ id: r.id, status, issues, matchedId, matchedBy, keys: c.keys });
    }
    return out;
  }
  if (entity === 'jobs') {
    const checked = rows.map((r) => ({ r, c: checkJobRow(r.cells as unknown[], mapping) }));
    const L = await jobLookups(prisma, job, checked);
    for (const { r, c } of checked) {
      const issues: Issue[] = [...c.issues];
      let status: string = c.status;
      let matchedId: string | null = null;
      let matchedBy: string | null = null;
      const v = c.values;
      if (v && status !== 'REJECTED') {
        const { owner, branchProblem, branchNote, vehicleNote } = resolveJob(v, L, job);
        if (branchNote) issues.push({ field: 'branch', level: 'warning', message: branchNote });
        if (branchProblem) { issues.push({ field: 'branch', level: 'error', message: branchProblem }); status = 'REJECTED'; }
        else if (!owner) { issues.push({ field: 'customer', level: 'error', message: 'The customer was not found. Import the customers file first (and the vehicles file, when the job names only the vehicle), or check the customer number.' }); status = 'REJECTED'; }
        else {
          if (vehicleNote) issues.push({ field: 'vin', level: 'warning', message: vehicleNote });
          const hit = L.existing.get(invKey(src(job.sourceSystem), v.jobNumber));
          if (hit && !hit.voided && hit.importJobId !== job.id) { matchedId = hit.id; matchedBy = 'job'; issues.push({ field: 'jobNumber', level: 'warning', message: 'Already in the history (loaded before); left as it is.' }); }
          if (status === 'GOOD' && issues.length) status = 'WARNING';
        }
      }
      out.push({ id: r.id, status, issues, matchedId, matchedBy, keys: c.keys });
    }
    return out;
  }
  return out;
}

/** Invoice history: how many invoices and how much will load (shown in the check, reconciled after loading). */
export async function invoiceTotalsOfRows(jobId: string, mapping: Mapping, statuses: string[]): Promise<{ lines: number; quantity: number; value: number; from: string | null; to: string | null }> {
  let after = 0; let lines = 0; let value = 0; let from: string | null = null; let to: string | null = null;
  for (;;) {
    const rows = await prisma.importRow.findMany({ where: { jobId, status: { in: statuses }, matchedBy: null, rowNumber: { gt: after } }, orderBy: { rowNumber: 'asc' }, take: 5000, select: { rowNumber: true, cells: true } });
    for (const r of rows) {
      const v = checkInvoiceRow(r.cells as unknown[], mapping).values;
      if (!v) continue;
      lines += 1; value += v.amount;
      if (!from || v.invoiceDate < from) from = v.invoiceDate;
      if (!to || v.invoiceDate > to) to = v.invoiceDate;
    }
    if (rows.length < 5000) break;
    after = rows[rows.length - 1]!.rowNumber;
  }
  return { lines, quantity: 0, value: Math.round(value * 100) / 100, from, to };
}

/** What an invoice-history import actually holds now (its loaded, not voided, invoices). */
export async function invoiceTotalsLoaded(jobId: string): Promise<{ lines: number; quantity: number; value: number }> {
  const agg = await prisma.historicalInvoice.aggregate({ where: { importJobId: jobId, voidedAt: null }, _sum: { amount: true }, _count: { _all: true } });
  return { lines: agg._count._all, quantity: 0, value: Math.round(Number(agg._sum.amount ?? 0) * 100) / 100 };
}

// ── Load ──────────────────────────────────────────────────────────────

export async function loadHistoryRows(tx: Tx, entity: HistoryEntity, job: HistoryJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  return entity === 'invoices' ? loadInvoices(tx, job, mapping, rows) : loadJobs(tx, job, mapping, rows);
}

/** How many past jobs will load, over which dates (shown in the check, for reconciling with SAP). */
export async function jobTotalsOfRows(jobId: string, mapping: Mapping, statuses: string[]): Promise<{ lines: number; quantity: number; value: number; from: string | null; to: string | null }> {
  let after = 0; let lines = 0; let value = 0; let from: string | null = null; let to: string | null = null;
  for (;;) {
    const rows = await prisma.importRow.findMany({ where: { jobId, status: { in: statuses }, matchedBy: null, rowNumber: { gt: after } }, orderBy: { rowNumber: 'asc' }, take: 5000, select: { rowNumber: true, cells: true } });
    for (const r of rows) {
      const v = checkJobRow(r.cells as unknown[], mapping).values;
      if (!v) continue;
      lines += 1; value += v.totalAmount ?? 0;
      if (!from || v.openedAt < from) from = v.openedAt;
      if (!to || v.openedAt > to) to = v.openedAt;
    }
    if (rows.length < 5000) break;
    after = rows[rows.length - 1]!.rowNumber;
  }
  return { lines, quantity: 0, value: Math.round(value * 100) / 100, from, to };
}

async function loadJobs(tx: Tx, job: HistoryJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkJobRow(r.cells as unknown[], mapping) }));
  // Matched again now: a customer or vehicle may have been added since the check.
  const L = await jobLookups(tx, job, checked);
  const range = src(job.sourceSystem);
  const results: Result[] = [];
  const creates: Prisma.HistoricalJobCreateManyInput[] = [];
  const createRow = new Map<string, string>();
  const restore: { rowId: string; id: string }[] = [];
  const seen = new Set<string>();
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const { owner, vehicle, branchProblem } = resolveJob(v, L, job);
    if (branchProblem) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: branchProblem }); continue; }
    if (!owner) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'The customer is no longer in the system; not loaded.' }); continue; }
    const k = invKey(range, v.jobNumber);
    const hit = L.existing.get(k);
    if (hit && !hit.voided) { results.push({ id: r.id, status: 'SKIPPED', resultId: hit.id, note: 'Already in the history; left as it is.' }); continue; }
    if (hit && hit.voided) { restore.push({ rowId: r.id, id: hit.id }); continue; }
    if (seen.has(k)) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'The same job number appears earlier in the file; loaded once.' }); continue; }
    seen.add(k);
    const id = newId();
    createRow.set(id, r.id);
    creates.push({
      id, organisationId: job.organisationId, branchId: job.branchId, customerId: owner, vehicleId: vehicle?.id ?? null,
      vin: v.vin, vinKey: v.vinKey, plateNumber: v.plate, kind: v.kind, jobNumber: v.jobNumber, notificationNumber: v.notificationNumber, invoiceNumber: v.invoiceNumber, equipmentNumber: v.equipmentNumber, orderType: v.orderType,
      openedAt: dayDate(v.openedAt), completedAt: v.completedAt ? dayDate(v.completedAt) : null, mileage: v.mileage, description: v.description, workDone: v.workDone, technician: v.technician, workCentre: v.workCentre,
      labourAmount: v.labourAmount, partsAmount: v.partsAmount, totalAmount: v.totalAmount, status: v.status, externalSource: range, importJobId: job.id,
    });
  }
  if (creates.length) {
    await tx.historicalJob.createMany({ data: creates, skipDuplicates: true });
    const made = new Set((await tx.historicalJob.findMany({ where: { id: { in: creates.map((x) => x.id!) } }, select: { id: true } })).map((x) => x.id));
    for (const c of creates) results.push(made.has(c.id!) ? { id: createRow.get(c.id!)!, status: 'CREATED', resultId: c.id! } : { id: createRow.get(c.id!)!, status: 'SKIPPED', resultId: null, note: 'The same job was loaded meanwhile; not loaded twice.' });
  }
  if (restore.length) {
    await tx.historicalJob.updateMany({ where: { id: { in: restore.map((x) => x.id) }, voidedAt: { not: null } }, data: { voidedAt: null, importJobId: job.id } });
    for (const x of restore) results.push({ id: x.rowId, status: 'CREATED', resultId: x.id, note: 'Restored: it had been loaded before by an import that was undone.' });
  }
  await writeLoadResults(tx, rows, results);
}

async function loadInvoices(tx: Tx, job: HistoryJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkInvoiceRow(r.cells as unknown[], mapping) }));
  // Matched again now: a customer or vehicle may have been added since the check.
  const [cust, existing, vehicles] = await Promise.all([
    invoiceCustomers(tx, job, checked),
    findInvoices(tx, job.organisationId, checked.map((x) => x.c.values?.invoiceNumber).filter((v): v is string => Boolean(v))),
    findVehiclesByVin(tx, job.organisationId, checked.map((x) => x.c.values?.vinKey).filter((v): v is string => Boolean(v))),
  ]);
  const results: Result[] = [];
  const creates: Prisma.HistoricalInvoiceCreateManyInput[] = [];
  const createRow = new Map<string, string>();
  const restore: { rowId: string; id: string }[] = [];
  const seen = new Set<string>();
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const owner = invoiceOwner(cust, v);
    if (!owner) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'The customer is no longer in the system; not loaded.' }); continue; }
    const k = invKey(rangeOf(job, v), v.invoiceNumber);
    const hit = knownInvoice(existing, job, v);
    if (hit && !hit.voided) { results.push({ id: r.id, status: 'SKIPPED', resultId: hit.id, note: 'Already in the history; left as it is.' }); continue; }
    if (hit && hit.voided) { restore.push({ rowId: r.id, id: hit.id }); continue; }
    if (seen.has(k)) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'The same invoice number appears earlier in the file; loaded once.' }); continue; }
    seen.add(k);
    const id = newId();
    createRow.set(id, r.id);
    creates.push({
      id, organisationId: job.organisationId, branchId: job.branchId, customerId: owner, vehicleId: v.vinKey ? vehicles.get(v.vinKey)?.id ?? null : null,
      vin: v.vin, vinKey: v.vinKey, invoiceNumber: v.invoiceNumber, invoiceDate: dayDate(v.invoiceDate), amount: v.amount,
      documentType: v.documentType, description: v.description, externalSource: rangeOf(job, v), companyCode: v.companyCode, fiscalYear: v.fiscalYear, importJobId: job.id,
    });
  }
  if (creates.length) {
    await tx.historicalInvoice.createMany({ data: creates, skipDuplicates: true });
    const made = new Set((await tx.historicalInvoice.findMany({ where: { id: { in: creates.map((x) => x.id!) } }, select: { id: true } })).map((x) => x.id));
    for (const c of creates) results.push(made.has(c.id!) ? { id: createRow.get(c.id!)!, status: 'CREATED', resultId: c.id! } : { id: createRow.get(c.id!)!, status: 'SKIPPED', resultId: null, note: 'The same invoice was loaded meanwhile; not loaded twice.' });
  }
  if (restore.length) {
    // An earlier import of this invoice was undone: the same row comes back (never a second copy), now belonging to this import.
    await tx.historicalInvoice.updateMany({ where: { id: { in: restore.map((x) => x.id) }, voidedAt: { not: null } }, data: { voidedAt: null, importJobId: job.id } });
    for (const x of restore) results.push({ id: x.rowId, status: 'CREATED', resultId: x.id, note: 'Restored: it had been loaded before by an import that was undone.' });
  }
  await writeLoadResults(tx, rows, results);
}


// ── Undo: void, never delete ──────────────────────────────────────────

/** Voids what this import loaded (kept, and restored if the file is loaded again), then marks its rows undone. Returns 0 when finished. */
export async function voidHistoryBatch(tx: Tx, entity: HistoryEntity, jobId: string, at = new Date()): Promise<number> {
  if (entity === 'invoices') await tx.historicalInvoice.updateMany({ where: { importJobId: jobId, voidedAt: null }, data: { voidedAt: at } });
  else await tx.historicalJob.updateMany({ where: { importJobId: jobId, voidedAt: null }, data: { voidedAt: at } });
  await tx.importRow.updateMany({ where: { jobId, status: { in: ['CREATED', 'UPDATED'] } }, data: { status: 'UNDONE' } });
  return 0;
}

