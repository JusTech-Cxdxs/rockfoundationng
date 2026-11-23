'use server';

import { prisma, type Prisma } from '@ejo/database';
import { allows, authorize, myOrganisationId, orgWhere, reachWhere, seeJobCard, NOT_AVAILABLE } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { writeAuditLog, getWorkshopBranchId } from '@/lib/workshop-core';
import { claimed, retryOnNumberClash } from '@/lib/integrity-core';
import { highestSequence } from '@/lib/recycle-bin/numbers';
import { lagosYear } from '@/lib/utils/format-date';
import { checkClaim, checkRecovered, claimNext, comebackCandidates, comebackRate, guaranteeText, type ClaimStatus } from '@/lib/money/warranty';
import { jobTypeLabel } from '@/lib/workshop/job-types';

/**
 * The workshop's warranty (Phase 5): comebacks offered when a vehicle returns
 * under a running guarantee, claims back to suppliers for faulty parts, and
 * the warranty report (the Owner).
 */

export class WarrantyError extends Error {}
const ID = /^[a-z0-9]{20,40}$/;

export type ComebackOption = { id: string; jobNumber: string; jobType: string; checkedOutAt: Date | null; guarantee: string };

/** The vehicle's earlier jobs whose guarantee still runs: what "Under warranty (comeback)" may point to when opening a Job Card. */
export async function listComebackOptions(vehicleId: string, mileage?: number | null): Promise<ComebackOption[]> {
  await requireUser();
  await authorize('workshop.job_card.create', undefined, 'listComebackOptions');
  if (!ID.test(vehicleId)) return [];
  const jobs = await prisma.jobCard.findMany({
    where: { vehicleId, status: 'CHECKED_OUT', customer: await orgWhere(), OR: [{ warrantyUntil: { gte: new Date() } }, { warrantyUntilKm: { not: null } }] },
    orderBy: { checkedOutAt: 'desc' }, take: 20,
    select: { id: true, jobNumber: true, jobType: true, checkedOutAt: true, warrantyUntil: true, warrantyUntilKm: true, status: true },
  });
  return comebackCandidates(jobs, new Date(), mileage ?? null).map((j) => ({ id: j.id, jobNumber: j.jobNumber, jobType: jobTypeLabel(j.jobType), checkedOutAt: j.checkedOutAt, guarantee: guaranteeText(j) ?? '' }));
}

async function nextClaimNumber(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = `SC-${lagosYear()}-`;
  const latest = await tx.supplierClaim.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  return `${prefix}${String(highestSequence(prefix, [latest?.number]) + 1).padStart(6, '0')}`;
}

/** Records a faulty part to claim back from its supplier (Accounts, the Owner). */
export async function addSupplierClaim(input: { supplierId: string | null; supplierName: string; jobNumber: string | null; partName: string; partNumber: string | null; quantity: string; amountClaimed: string; fault: string }): Promise<{ id: string; number: string }> {
  const me = await requireUser();
  await authorize('workshop.warranty.claims', undefined, 'addSupplierClaim');
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new WarrantyError(NOT_AVAILABLE);
  const supplier = input.supplierId && ID.test(input.supplierId) ? await prisma.supplier.findFirst({ where: { id: input.supplierId, organisationId }, select: { id: true, name: true } }) : null;
  const c = checkClaim({ ...input, supplierName: supplier?.name ?? input.supplierName });
  if (typeof c === 'string') throw new WarrantyError(c);
  // The Job Card the part was fitted on, inside the organisation and the person's reach.
  const jobNumber = (input.jobNumber ?? '').trim().toUpperCase();
  const job = jobNumber ? await prisma.jobCard.findFirst({ where: { jobNumber, customer: { organisationId } }, select: { id: true, branchId: true } }) : null;
  if (jobNumber && !job) throw new WarrantyError(`No Job Card ${jobNumber} was found.`);
  if (job) await seeJobCard(job.id, 'addSupplierClaim');
  const branchId = job?.branchId ?? (await getWorkshopBranchId());
  const created = await retryOnNumberClash('number', () => prisma.$transaction(async (tx) => {
    const number = await nextClaimNumber(tx);
    return tx.supplierClaim.create({
      data: {
        number, organisationId, branchId, supplierId: supplier?.id ?? null, supplierName: c.supplierName, jobCardId: job?.id ?? null,
        partName: c.partName, partNumber: (input.partNumber ?? '').trim().slice(0, 60) || null, quantity: c.quantity, amountClaimed: c.amountClaimed, fault: c.fault, createdById: me.id,
      },
      select: { id: true, number: true },
    });
  }));
  await writeAuditLog({ userId: me.id, action: 'warranty.claim_added', entityType: 'SupplierClaim', entityId: created.id, organisationId, metadata: { number: created.number, supplier: c.supplierName, part: c.partName, amountClaimed: c.amountClaimed } });
  return created;
}

/** Moves a claim on: sent to the supplier, settled (with what came back) or refused (with why). */
export async function updateSupplierClaim(id: string, toRaw: string, input: { amountRecovered?: string; outcome?: string }): Promise<void> {
  const me = await requireUser();
  await authorize('workshop.warranty.claims', undefined, 'updateSupplierClaim');
  if (!ID.test(id)) throw new WarrantyError(NOT_AVAILABLE);
  const claim = await prisma.supplierClaim.findFirst({ where: { AND: [{ id }, await orgWhere()] }, select: { id: true, status: true, amountClaimed: true, number: true, organisationId: true } });
  if (!claim) throw new WarrantyError(NOT_AVAILABLE);
  const to = toRaw as ClaimStatus;
  if (!claimNext(claim.status).includes(to)) throw new WarrantyError('This claim has already moved on — refresh the page.');
  const outcome = String(input.outcome ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
  let recovered: number | null = null;
  if (to === 'SETTLED') {
    const r = checkRecovered(input.amountRecovered, Number(claim.amountClaimed));
    if (typeof r === 'string') throw new WarrantyError(r);
    recovered = r;
  }
  if (to === 'REJECTED' && outcome.length < 3) throw new WarrantyError('Say why the supplier refused the claim.');
  const now = new Date();
  claimed(await prisma.supplierClaim.updateMany({
    where: { id: claim.id, status: claim.status },
    data: { status: to, ...(to === 'SUBMITTED' ? { submittedAt: now } : { closedAt: now, outcome: outcome || null }), ...(recovered !== null ? { amountRecovered: recovered } : {}) },
  }), 'Someone else updated this claim a moment ago — refresh the page.');
  await writeAuditLog({ userId: me.id, action: 'warranty.claim_updated', entityType: 'SupplierClaim', entityId: claim.id, organisationId: claim.organisationId, metadata: { number: claim.number, from: claim.status, to, ...(recovered !== null ? { amountRecovered: recovered } : {}), ...(outcome ? { outcome } : {}) } });
}

export type ClaimRow = { id: string; number: string; status: string; supplierName: string; partName: string; partNumber: string | null; quantity: number; amountClaimed: number; amountRecovered: number | null; fault: string; outcome: string | null; jobCardId: string | null; jobNumber: string | null; createdAt: Date; createdBy: string };

export async function listSupplierClaims(show: 'open' | 'all' = 'open', only?: string): Promise<{ rows: ClaimRow[]; canManage: boolean; suppliers: { id: string; name: string }[] }> {
  await requireUser();
  const canManage = await allows('workshop.warranty.claims');
  if (!canManage) await authorize('workshop.warranty.report', undefined, 'listSupplierClaims');
  const organisationId = await myOrganisationId();
  const reach = (await reachWhere(canManage ? 'workshop.warranty.claims' : 'workshop.warranty.report', { lens: false })) as Prisma.SupplierClaimWhereInput;
  const [rows, suppliers] = await Promise.all([
    prisma.supplierClaim.findMany({
      where: { AND: [await orgWhere(), reach, show === 'open' ? { status: { in: ['OPEN', 'SUBMITTED'] } } : {}, only && ID.test(only) ? { id: only } : {}] }, orderBy: { createdAt: 'desc' }, take: 300,
      select: { id: true, number: true, status: true, supplierName: true, partName: true, partNumber: true, quantity: true, amountClaimed: true, amountRecovered: true, fault: true, outcome: true, jobCardId: true, createdAt: true, jobCard: { select: { jobNumber: true } }, createdBy: { select: { fullName: true } } },
    }),
    organisationId ? prisma.supplier.findMany({ where: { organisationId, isActive: true }, orderBy: { name: 'asc' }, take: 500, select: { id: true, name: true } }) : [],
  ]);
  return {
    canManage, suppliers,
    rows: rows.map((r) => ({ id: r.id, number: r.number, status: r.status, supplierName: r.supplierName, partName: r.partName, partNumber: r.partNumber, quantity: r.quantity, amountClaimed: Number(r.amountClaimed), amountRecovered: r.amountRecovered === null ? null : Number(r.amountRecovered), fault: r.fault, outcome: r.outcome, jobCardId: r.jobCardId, jobNumber: r.jobCard?.jobNumber ?? null, createdAt: r.createdAt, createdBy: r.createdBy.fullName })),
  };
}

export type WarrantyReport = {
  from: Date; to: Date;
  finished: number; comebacks: number; rate: number | null;
  byJobType: { label: string; finished: number; comebacks: number; rate: number | null }[];
  byTechnician: { name: string; finished: number; comebacks: number; rate: number | null }[];
  warrantyCost: number; goodwillCost: number; warrantyJobs: number;
  claims: { open: number; openAmount: number; recovered: number; claimedInPeriod: number };
  recent: { id: string; jobNumber: string; of: string; ofId: string; jobType: string; technician: string | null; createdAt: Date }[];
};

/** The warranty report for a period (default: the last 90 days): comebacks, what warranty work cost and claims to suppliers. The Owner. */
export async function getWarrantyReport(days = 90): Promise<WarrantyReport> {
  await requireUser();
  await authorize('workshop.warranty.report', undefined, 'getWarrantyReport');
  const to = new Date();
  const from = new Date(+to - Math.min(Math.max(days, 7), 730) * 86_400_000);
  const reach = (await reachWhere('workshop.warranty.report', { lens: false })) as Prisma.JobCardWhereInput;
  const org = await orgWhere();
  const fence: Prisma.JobCardWhereInput = { AND: [reach, { customer: org }] };
  const [finishedJobs, comebackJobs, lines, claims] = await Promise.all([
    prisma.jobCard.findMany({ where: { AND: [fence, { status: 'CHECKED_OUT', checkedOutAt: { gte: from, lte: to } }] }, take: 5000, select: { id: true, jobType: true, assignedTechnician: { select: { fullName: true } } } }),
    prisma.jobCard.findMany({ where: { AND: [fence, { comebackOfId: { not: null }, createdAt: { gte: from, lte: to } }] }, orderBy: { createdAt: 'desc' }, take: 2000, select: { id: true, jobNumber: true, createdAt: true, comebackOf: { select: { id: true, jobNumber: true, jobType: true, assignedTechnician: { select: { fullName: true } } } } } }),
    prisma.estimateLineItem.findMany({ where: { billTo: { in: ['WARRANTY', 'GOODWILL'] }, estimate: { jobCard: { AND: [fence, { createdAt: { gte: from, lte: to } }, { status: { not: 'CANCELLED' } }] } } }, take: 10_000, select: { billTo: true, amount: true, estimate: { select: { jobCardId: true } } } }),
    prisma.supplierClaim.findMany({ where: { AND: [org, { OR: [{ status: { in: ['OPEN', 'SUBMITTED'] } }, { createdAt: { gte: from } }, { closedAt: { gte: from } }] }] }, take: 5000, select: { status: true, amountClaimed: true, amountRecovered: true, createdAt: true, closedAt: true } }),
  ]);
  const group = <K extends string>(keyOf: (x: { jobType: string; technician: string | null }) => K) => {
    const m = new Map<K, { finished: number; comebacks: number }>();
    for (const j of finishedJobs) { const k = keyOf({ jobType: j.jobType, technician: j.assignedTechnician?.fullName ?? null }); const e = m.get(k) ?? { finished: 0, comebacks: 0 }; e.finished += 1; m.set(k, e); }
    for (const c of comebackJobs) { if (!c.comebackOf) continue; const k = keyOf({ jobType: c.comebackOf.jobType, technician: c.comebackOf.assignedTechnician?.fullName ?? null }); const e = m.get(k) ?? { finished: 0, comebacks: 0 }; e.comebacks += 1; m.set(k, e); }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v, rate: comebackRate(v.comebacks, v.finished) })).sort((a, b) => b.comebacks - a.comebacks || b.finished - a.finished);
  };
  const sum = (xs: { amount: unknown }[]) => Math.round(xs.reduce((s, x) => s + Number(x.amount ?? 0), 0) * 100) / 100;
  const openClaims = claims.filter((c) => c.status === 'OPEN' || c.status === 'SUBMITTED');
  return {
    from, to,
    finished: finishedJobs.length, comebacks: comebackJobs.length, rate: comebackRate(comebackJobs.length, finishedJobs.length),
    byJobType: group((x) => x.jobType).map((g) => ({ label: jobTypeLabel(g.key), finished: g.finished, comebacks: g.comebacks, rate: g.rate })),
    byTechnician: group((x) => x.technician ?? 'Not assigned').map((g) => ({ name: g.key, finished: g.finished, comebacks: g.comebacks, rate: g.rate })),
    warrantyCost: sum(lines.filter((l) => l.billTo === 'WARRANTY')), goodwillCost: sum(lines.filter((l) => l.billTo === 'GOODWILL')),
    warrantyJobs: new Set(lines.filter((l) => l.billTo === 'WARRANTY').map((l) => l.estimate.jobCardId)).size,
    claims: {
      open: openClaims.length, openAmount: sum(openClaims.map((c) => ({ amount: c.amountClaimed }))),
      recovered: sum(claims.filter((c) => c.status === 'SETTLED' && c.closedAt && +c.closedAt >= +from).map((c) => ({ amount: c.amountRecovered }))),
      claimedInPeriod: sum(claims.filter((c) => +c.createdAt >= +from).map((c) => ({ amount: c.amountClaimed }))),
    },
    recent: comebackJobs.slice(0, 20).map((c) => ({ id: c.id, jobNumber: c.jobNumber, of: c.comebackOf?.jobNumber ?? '', ofId: c.comebackOf?.id ?? '', jobType: jobTypeLabel(c.comebackOf?.jobType), technician: c.comebackOf?.assignedTechnician?.fullName ?? null, createdAt: c.createdAt })),
  };
}
