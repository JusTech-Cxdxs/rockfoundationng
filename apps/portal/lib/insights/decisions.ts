import 'server-only';
/**
 * The decision log, read from the records themselves (decisions-core.ts has
 * the rules): who asked, which step, which role decided, when, approved or
 * sent back and why. Organisation-fenced; branch-fenced when `branchIds` is
 * given; capped per step.
 */
import { prisma } from '@ejo/database';
import type { DecisionRow } from './decisions-core';

/** The newest decisions of each step (ordered, so a cap never samples at random). */
const CAP = 10_000;

export async function decisionLog(o: { organisationId: string; since: Date; branchIds?: string[] | null }): Promise<DecisionRow[]> {
  const branch = { businessUnit: { organisationId: o.organisationId }, ...(o.branchIds ? { id: { in: o.branchIds } } : {}) };
  const inOrg = { branch };
  const since = o.since;
  const [prs, jobs, cancels, estimates, returns] = await Promise.all([
    prisma.partRequestSlip.findMany({
      where: { ...inOrg, OR: [{ hodApprovedAt: { gte: since } }, { storeApprovedAt: { gte: since } }, { rejectedAt: { gte: since } }] },
      orderBy: { updatedAt: 'desc' }, take: CAP, select: { id: true, branchId: true, createdAt: true, requestedById: true, hodApprovedAt: true, hodApprovedById: true, storeApprovedAt: true, storeApprovedById: true, rejectedAt: true, rejectedById: true, rejectionStage: true, rejectionReason: true, _count: { select: { lines: true } } },
    }),
    prisma.jobCard.findMany({ where: { ...inOrg, approvedAt: { gte: since }, approvalStatus: { in: ['APPROVED', 'REJECTED'] } }, orderBy: { approvedAt: 'desc' }, take: CAP, select: { id: true, branchId: true, createdAt: true, createdById: true, approvedAt: true, approvedById: true, approvalStatus: true, rejectionReason: true } }),
    prisma.cancellationRequest.findMany({ where: { jobCard: inOrg, decidedAt: { gte: since }, status: { in: ['APPROVED', 'DECLINED'] } }, orderBy: { decidedAt: 'desc' }, take: CAP, select: { id: true, requestedAt: true, requestedById: true, decidedAt: true, decidedById: true, status: true, decisionNotes: true, jobCard: { select: { branchId: true } } } }),
    prisma.estimate.findMany({ where: { jobCard: inOrg, managerApprovedAt: { gte: since } }, orderBy: { managerApprovedAt: 'desc' }, take: CAP, select: { id: true, submittedAt: true, approvedAt: true, createdById: true, managerApprovedAt: true, managerApprovedById: true, jobCard: { select: { branchId: true } }, _count: { select: { lineItems: true } } } }),
    prisma.auditLog.findMany({ where: { organisationId: o.organisationId, action: 'estimate.returned_for_changes', createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: CAP, select: { id: true, userId: true, entityId: true, createdAt: true, metadata: true } }),
  ]);
  // Estimates sent back: the Job Card's estimate (requester and lines).
  const returnedJobIds = [...new Set(returns.map((r) => r.entityId).filter((x): x is string => Boolean(x)))];
  const returnedEstimates = returnedJobIds.length
    ? await prisma.estimate.findMany({ where: { jobCardId: { in: returnedJobIds }, jobCard: inOrg }, select: { jobCardId: true, createdById: true, submittedAt: true, jobCard: { select: { branchId: true } }, _count: { select: { lineItems: true } } } })
    : [];
  const estimateOf = new Map(returnedEstimates.map((e) => [e.jobCardId, e]));

  const rows: DecisionRow[] = [];
  const add = (r: Omit<DecisionRow, 'requesterRole' | 'deciderRole'> & { requester: string | null; decider: string | null }) => rows.push({ ...r, requesterRole: r.requester, deciderRole: r.decider });
  for (const s of prs) {
    if (s.hodApprovedAt && s.hodApprovedAt >= since) add({ id: `prs_hod:${s.id}`, step: 'prs_hod', rejected: false, at: s.hodApprovedAt, arrivedAt: s.createdAt, amount: 0, lines: s._count.lines, requester: s.requestedById, decider: s.hodApprovedById, reason: null, branchId: s.branchId });
    if (s.storeApprovedAt && s.storeApprovedAt >= since) add({ id: `prs_store:${s.id}`, step: 'prs_store', rejected: false, at: s.storeApprovedAt, arrivedAt: s.hodApprovedAt, amount: 0, lines: s._count.lines, requester: s.requestedById, decider: s.storeApprovedById, reason: null, branchId: s.branchId });
    if (s.rejectedAt && s.rejectedAt >= since) {
      const store = s.rejectionStage === 'STORE';
      add({ id: `prs_${store ? 'store' : 'hod'}:${s.id}`, step: store ? 'prs_store' : 'prs_hod', rejected: true, at: s.rejectedAt, arrivedAt: store ? s.hodApprovedAt : s.createdAt, amount: 0, lines: s._count.lines, requester: s.requestedById, decider: s.rejectedById, reason: s.rejectionReason, branchId: s.branchId });
    }
  }
  for (const j of jobs) add({ id: `jc:${j.id}`, step: 'job_card_approval', rejected: j.approvalStatus === 'REJECTED', at: j.approvedAt!, arrivedAt: j.createdAt, amount: 0, lines: 0, requester: j.createdById, decider: j.approvedById, reason: j.rejectionReason, branchId: j.branchId });
  for (const c of cancels) add({ id: `cancel:${c.id}`, step: 'job_cancellation', rejected: c.status === 'DECLINED', at: c.decidedAt!, arrivedAt: c.requestedAt, amount: 0, lines: 0, requester: c.requestedById, decider: c.decidedById, reason: c.decisionNotes, branchId: c.jobCard.branchId });
  for (const e of estimates) add({ id: `est:${e.id}:${e.managerApprovedAt!.getTime()}`, step: 'estimate_manager', rejected: false, at: e.managerApprovedAt!, arrivedAt: e.approvedAt ?? e.submittedAt, amount: 0, lines: e._count.lineItems, requester: e.createdById, decider: e.managerApprovedById, reason: null, branchId: e.jobCard.branchId });
  for (const r of returns) {
    const e = r.entityId ? estimateOf.get(r.entityId) : undefined;
    if (!e) continue;
    const reason = r.metadata && typeof r.metadata === 'object' && typeof (r.metadata as { reason?: unknown }).reason === 'string' ? String((r.metadata as { reason: string }).reason) : null;
    add({ id: `est-return:${r.id}`, step: 'estimate_manager', rejected: true, at: r.createdAt, arrivedAt: e.submittedAt, amount: 0, lines: e._count.lineItems, requester: e.createdById, decider: r.userId, reason, branchId: e.jobCard.branchId });
  }
  if (o.branchIds) for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i]!.branchId && !o.branchIds.includes(rows[i]!.branchId!)) rows.splice(i, 1);

  // People → their main role (the first by name), so nothing about the person goes further than their role.
  const people = [...new Set(rows.flatMap((r) => [r.requesterRole, r.deciderRole]).filter((x): x is string => Boolean(x)))];
  const roleOf = new Map<string, string>();
  for (let i = 0; i < people.length; i += 1000) {
    const batch = await prisma.userRole.findMany({ where: { userId: { in: people.slice(i, i + 1000) } }, orderBy: { role: { slug: 'asc' } }, select: { userId: true, role: { select: { slug: true, isSuperAdmin: true } } } });
    for (const b of batch) if (!roleOf.has(b.userId) && !b.role.isSuperAdmin) roleOf.set(b.userId, b.role.slug);
  }
  for (const r of rows) {
    r.requesterRole = r.requesterRole ? roleOf.get(r.requesterRole) ?? null : null;
    r.deciderRole = r.deciderRole ? roleOf.get(r.deciderRole) ?? null : null;
  }
  return rows.sort((a, b) => a.at.getTime() - b.at.getTime());
}
