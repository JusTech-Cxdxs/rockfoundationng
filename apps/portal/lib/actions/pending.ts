'use server';

import { masterAdminsFor } from '@/lib/master-fallback';
import { prisma } from '@ejo/database';
import { getPrincipal } from '@/lib/authz/server';
import { nameWithRole } from '@/lib/authz/catalogue';
import { requireUser, listEligibleManagersForBranch } from './workshop';
import { moduleIsOn } from '@/lib/modules';

/**
 * "Waiting on others": everything this person asked for that is still with
 * someone else — a Job Card waiting for its supervisor, an estimate for the
 * supervisor or the Manager, a parts request for the Manager or the Store, a
 * close or cancel request, a help request. Each names who it is waiting on
 * (name and role) and since when. The person's own records only; nothing
 * about anyone else's.
 */
export type PendingItem = { id: string; area: string; number: string; title: string; waitingOn: string; since: Date; url: string };

const JC_CLOSED = ['CLOSED', 'CHECKED_OUT', 'CANCELLED'] as const;

export async function getMyPending(): Promise<PendingItem[]> {
  const me = await requireUser();
  const p = await getPrincipal();
  const mine = me.id;
  // Parts requests only while the Store is on (lib/modules.ts).
  const storeOn = moduleIsOn('inventory');
  const [jcs, ests, prs, closes, cancels, help] = await Promise.all([
    prisma.jobCard.findMany({ where: { createdById: mine, approvalStatus: 'PENDING', status: { notIn: [...JC_CLOSED] } }, take: 30, select: { id: true, jobNumber: true, createdAt: true, branchId: true, supervisor: { select: { id: true, fullName: true } } } }),
    prisma.estimate.findMany({ where: { createdById: mine, status: { in: ['SUBMITTED', 'APPROVED'] }, jobCard: { status: { notIn: [...JC_CLOSED] } } }, take: 30, select: { status: true, submittedAt: true, approvedAt: true, updatedAt: true, jobCard: { select: { id: true, jobNumber: true, branchId: true, supervisor: { select: { id: true, fullName: true } } } } } }),
    storeOn ? prisma.partRequestSlip.findMany({ where: { requestedById: mine, status: { in: ['PENDING_HOD_APPROVAL', 'PENDING_STORE_APPROVAL', 'APPROVED'] } }, take: 30, select: { id: true, referenceNumber: true, status: true, branchId: true, createdAt: true, hodApprovedAt: true, storeApprovedAt: true } }) : [],
    prisma.closeRequest.findMany({ where: { requestedById: mine, status: 'PENDING' }, take: 20, select: { requestedAt: true, jobCard: { select: { id: true, jobNumber: true, branchId: true } } } }),
    prisma.cancellationRequest.findMany({ where: { requestedById: mine, status: 'PENDING' }, take: 20, select: { requestedAt: true, jobCard: { select: { id: true, jobNumber: true, branchId: true } } } }),
    p.organisationId ? prisma.supportTicket.findMany({ where: { organisationId: p.organisationId, requesterUserId: mine, status: { in: ['OPEN', 'WAITING_ON_CUSTOMER', 'ON_HOLD'] } }, take: 20, select: { id: true, number: true, subject: true, status: true, createdAt: true, assignedToId: true } }).catch(() => []) : [],
  ]);

  // Who is "the Manager" or "Finance" in each branch, by name and role (once per branch).
  const managers = new Map<string, string>();
  const names = (list: { id?: string; fullName: string }[], role: string, fallback: string) => {
    const xs = list.filter((x) => x.id !== mine).slice(0, 2).map((x) => `${x.fullName} (${role})`);
    return xs.length ? xs.join(' or ') : fallback;
  };
  const managerOf = async (branchId: string) => {
    if (!managers.has(branchId)) {
      const m = await listEligibleManagersForBranch(branchId).catch(() => ({ supervisors: [] as { id: string; fullName: string }[], usingFallback: true }));
      // No Manager in the branch yet (the fallback list is not Managers): say "the Manager", not someone else's name.
      const real = m.usingFallback ? [] : (m.supervisors as { id: string; fullName: string }[]).filter((x) => x.id !== mine);
      // No (other) Manager in the branch: it goes above, as the approvals do.
      managers.set(branchId, real.length ? names(real, 'Manager', 'the Manager') : await aboveMe());
    }
    return managers.get(branchId)!;
  };

  let above: string | null = null;
  const aboveMe = async () => {
    if (above === null) {
      const execs = p.organisationId ? await prisma.user.findMany({ where: { organisationId: p.organisationId, isActive: true, id: { not: mine }, roles: { some: { role: { slug: 'executive' } } } }, take: 2, select: { fullName: true } }) : [];
      // Executives, else administrators.
      const admins = execs.length || !p.organisationId ? [] : await prisma.user.findMany({ where: { organisationId: p.organisationId, isActive: true, id: { not: mine }, roles: { some: { role: { slug: 'administrator' } } } }, take: 2, select: { fullName: true } });
      // Nobody above yet: the Platform Administrator stands in (lib/master-fallback.ts) — named, so the person knows who has it.
      const masters = execs.length || admins.length ? [] : (await masterAdminsFor(p.organisationId)).filter((x) => x.id !== mine).slice(0, 2);
      above = execs.length ? execs.map((e) => `${e.fullName} (Executive)`).join(' or ') : admins.length ? admins.map((e) => `${e.fullName} (Administrator)`).join(' or ') : masters.length ? masters.map((e) => `${e.fullName} (Master administrator)`).join(' or ') : 'the Executive';
    }
    return above;
  };
  const sup = (s: { id: string; fullName: string } | null) => (s ? (s.id === mine ? nameWithRole('', ['workshop-supervisor'], { isMe: true }) : `${s.fullName} (Supervisor)`) : 'a supervisor to be chosen');

  const helpers = new Map((help.length ? await prisma.user.findMany({ where: { id: { in: help.map((h) => h.assignedToId).filter((x): x is string => !!x) } }, select: { id: true, fullName: true } }) : []).map((u) => [u.id, u.fullName]));
  const out: PendingItem[] = [];
  for (const j of jcs) out.push({ id: `jc-${j.id}`, area: 'Workshop', number: j.jobNumber, title: 'Job Card waiting to be accepted', waitingOn: sup(j.supervisor), since: j.createdAt, url: `/workshop/job-cards/${j.id}` });
  for (const e of ests) out.push(e.status === 'SUBMITTED'
    ? { id: `est-${e.jobCard.id}`, area: 'Workshop', number: e.jobCard.jobNumber, title: 'Estimate waiting for the supervisor’s check', waitingOn: sup(e.jobCard.supervisor), since: e.submittedAt ?? e.updatedAt, url: `/workshop/job-cards/${e.jobCard.id}` }
    : { id: `est-${e.jobCard.id}`, area: 'Workshop', number: e.jobCard.jobNumber, title: 'Estimate waiting for final approval', waitingOn: await managerOf(e.jobCard.branchId), since: e.approvedAt ?? e.updatedAt, url: `/workshop/job-cards/${e.jobCard.id}` });
  for (const s of prs) out.push({
    id: `prs-${s.id}`, area: 'Store', number: s.referenceNumber,
    title: s.status === 'PENDING_HOD_APPROVAL' ? 'Parts request waiting for the Manager' : s.status === 'PENDING_STORE_APPROVAL' ? 'Parts request waiting for the Store' : 'Parts approved — waiting to be released',
    waitingOn: s.status === 'PENDING_HOD_APPROVAL' ? await managerOf(s.branchId) : 'the Store (Store Manager or Store Officer)',
    since: s.storeApprovedAt ?? s.hodApprovedAt ?? s.createdAt, url: `/workshop/parts-requests/${s.id}`,
  });
  for (const c of closes) out.push({ id: `close-${c.jobCard.id}`, area: 'Workshop', number: c.jobCard.jobNumber, title: 'Close request waiting for approval', waitingOn: await managerOf(c.jobCard.branchId), since: c.requestedAt, url: `/workshop/job-cards/${c.jobCard.id}` });
  for (const c of cancels) out.push({ id: `cancel-${c.jobCard.id}`, area: 'Workshop', number: c.jobCard.jobNumber, title: 'Cancellation request waiting for approval', waitingOn: await managerOf(c.jobCard.branchId), since: c.requestedAt, url: `/workshop/job-cards/${c.jobCard.id}` });
  for (const h of help) out.push({ id: `help-${h.id}`, area: 'Help', number: h.number, title: h.subject.slice(0, 80) || 'Help request', waitingOn: h.status === 'WAITING_ON_CUSTOMER' ? 'you — support asked you for more information' : h.assignedToId && helpers.get(h.assignedToId) ? `${helpers.get(h.assignedToId)} (Support)` : 'the support team', since: h.createdAt, url: `/support/help/${h.id}` });
  return out.sort((a, b) => a.since.getTime() - b.since.getTime());
}
