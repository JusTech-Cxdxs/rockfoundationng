'use server';

import { allows, reachWhere, jobCardReach } from '@/lib/authz/server';
import { prisma } from '@ejo/database';
import { requireUser, currentUserIsMasterAdmin, listEligibleManagersForBranch } from './workshop';
import { listEligibleStoreManagersForBranch, listEligibleStoreOfficersForBranch } from './store';
import { moduleIsOn } from '@/lib/modules';

export type WorkflowAction = { id: string; title: string; detail: string; url: string; createdAt: Date };

/**
 * Every workflow step that is waiting on THIS person, across Job Cards,
 * estimates, store matching and parts requests. Each item is
 * derived from the record's live state, so it stays on the dashboard (and
 * marquee) until the step is done — and disappears the moment it is.
 * Who may act follows the same rule the action itself enforces (supervisor,
 * manager, store staff, creator). One parallel round.
 */
export async function getWorkflowActionItems(): Promise<WorkflowAction[]> {
  const user = await requireUser();
  const isMaster = await currentUserIsMasterAdmin();
  // Queried for this person (their jobs, their organisation's branches), not
  // "the newest N platform-wide, then filtered", which drops items on a busy day.
  const T = 300;
  const reach = await jobCardReach({ lens: false });
  // Parts requests belong to a branch (no assignment fields): the branch reach.
  const reachOfBranch = await reachWhere('workshop.job_card.view', { lens: false });
  const me = (field: 'supervisorId' | 'createdById') => (isMaster ? {} : { [field]: user.id });
  const jc = { select: { id: true, jobNumber: true, branchId: true, supervisorId: true, createdById: true } } as const;
  // Store matching and parts requests only where the Store is on (lib/modules.ts).
  const storeOn = moduleIsOn('inventory');
  // Credit notes waiting for the Owner (Money → Credit notes).
  const decidesCredit = await allows('money.credit_note.approve');
  const reachOfCredit = decidesCredit ? await reachWhere('money.credit_note.approve', { lens: false }) : null;
  const [estSubmitted, estApproved, estToNotify, estMatching, prs, jcClosed, jcCompleted, creditNotes] = await Promise.all([
    prisma.estimate.findMany({ where: { status: 'SUBMITTED', jobCard: { ...reach, ...me('supervisorId') } }, take: T, select: { updatedAt: true, jobCard: jc } }),
    prisma.estimate.findMany({ where: { status: 'APPROVED', jobCard: reach }, take: T, select: { updatedAt: true, jobCard: jc } }),
    prisma.estimate.findMany({ where: { status: 'MANAGER_APPROVED', customerNotifiedAt: null, jobCard: { status: { notIn: ['CHECKED_OUT', 'CANCELLED'] }, ...reach, ...me('createdById') } }, take: T, select: { managerApprovedAt: true, jobCard: jc } }),
    storeOn ? prisma.estimate.findMany({ where: { matchingRequestedAt: { not: null }, lineItems: { some: { type: 'STORE_PART', matchedPartId: null } }, jobCard: { status: { notIn: ['CHECKED_OUT', 'CANCELLED'] }, ...reach } }, take: T, select: { matchingRequestedAt: true, jobCard: jc } }) : [],
    storeOn ? prisma.partRequestSlip.findMany({ where: { status: { in: ['PENDING_HOD_APPROVAL', 'PENDING_STORE_APPROVAL', 'APPROVED'] }, ...reachOfBranch }, take: T, select: { id: true, referenceNumber: true, status: true, branchId: true, updatedAt: true } }) : [],
    prisma.jobCard.findMany({ where: { status: 'CLOSED', ...reach, ...me('createdById') }, take: T, select: { id: true, jobNumber: true, createdById: true, updatedAt: true } }),
    prisma.jobCard.findMany({ where: { status: 'COMPLETED', ...reach, ...me('supervisorId') }, take: T, select: { id: true, jobNumber: true, supervisorId: true, updatedAt: true } }),
    reachOfCredit ? prisma.creditNote.findMany({ where: { status: 'PENDING', ...reachOfCredit }, take: T, select: { id: true, amount: true, requestedAt: true, invoice: { select: { invoiceNumber: true } } } }) : [],
  ]);

  // Who counts as manager / store for each branch involved.
  const branches = [...new Set([...estApproved.map((e) => e.jobCard.branchId), ...estMatching.map((e) => e.jobCard.branchId), ...prs.map((p) => p.branchId)])];
  const roleOf = new Map<string, { manager: boolean; store: boolean }>();
  await Promise.all(branches.map(async (b) => {
    const [m, sm, so] = await Promise.all([
      listEligibleManagersForBranch(b).catch(() => ({ supervisors: [] as { id: string }[] })),
      // Who is store staff is asked only where the Store is on.
      storeOn ? listEligibleStoreManagersForBranch(b).catch(() => ({ staff: [] as { id: string }[] })) : { staff: [] as { id: string }[] },
      storeOn ? listEligibleStoreOfficersForBranch(b).catch(() => ({ staff: [] as { id: string }[] })) : { staff: [] as { id: string }[] },
    ]);
    const has = (xs: { id: string }[]) => xs.some((x) => x.id === user.id);
    roleOf.set(b, { manager: isMaster || has(m.supervisors), store: isMaster || has([...(sm.staff ?? []), ...(so.staff ?? [])]) });
  }));
  const can = (b: string, r: 'manager' | 'store') => roleOf.get(b)?.[r] ?? isMaster;
  const mine = (id: string | null) => id === user.id || (isMaster && !id);
  const out: WorkflowAction[] = [];
  const jcUrl = (id: string, a: string) => `/workshop/job-cards/${id}#${a}`;
  const at = (d: Date | null | undefined) => (d ? new Date(d) : new Date());

  for (const e of estSubmitted) if (e.jobCard.supervisorId === user.id || isMaster) out.push({ id: `est-sub-${e.jobCard.id}`, title: `Approve the estimate — ${e.jobCard.jobNumber}`, detail: 'Submitted for your validation as Supervisor.', url: jcUrl(e.jobCard.id, 'estimate'), createdAt: at(e.updatedAt) });
  for (const e of estApproved) if (can(e.jobCard.branchId, 'manager')) out.push({ id: `est-mgr-${e.jobCard.id}`, title: `Final approval of the estimate — ${e.jobCard.jobNumber}`, detail: 'Validated by the Supervisor — needs the Owner.', url: jcUrl(e.jobCard.id, 'estimate'), createdAt: at(e.updatedAt) });
  for (const e of estToNotify) if (mine(e.jobCard.createdById)) out.push({ id: `est-ntf-${e.jobCard.id}`, title: `Notify the customer — ${e.jobCard.jobNumber}`, detail: 'The estimate is fully approved — send it to the customer.', url: jcUrl(e.jobCard.id, 'estimate'), createdAt: at(e.managerApprovedAt) });
  for (const e of estMatching) if (can(e.jobCard.branchId, 'store')) out.push({ id: `est-match-${e.jobCard.id}`, title: `Match the store parts — ${e.jobCard.jobNumber}`, detail: 'Store matching was requested and some parts are not matched yet.', url: `/inventory/estimate-matching/${e.jobCard.id}`, createdAt: at(e.matchingRequestedAt) });
  for (const p of prs) {
    const url = `/workshop/parts-requests/${p.id}`;
    if (p.status === 'PENDING_HOD_APPROVAL' && can(p.branchId, 'manager')) out.push({ id: `prs-hod-${p.id}`, title: `Approve the parts request — ${p.referenceNumber}`, detail: 'Waiting on the Workshop Supervisor.', url, createdAt: at(p.updatedAt) });
    if (p.status === 'PENDING_STORE_APPROVAL' && can(p.branchId, 'store')) out.push({ id: `prs-store-${p.id}`, title: `Approve and reserve — ${p.referenceNumber}`, detail: 'Supervisor approved — the Store can approve and reserve the parts.', url, createdAt: at(p.updatedAt) });
    if (p.status === 'APPROVED' && can(p.branchId, 'store')) out.push({ id: `prs-rel-${p.id}`, title: `Release the parts — ${p.referenceNumber}`, detail: 'Approved and reserved — hand the parts over.', url, createdAt: at(p.updatedAt) });
  }
  for (const j of jcCompleted) if (j.supervisorId === user.id || isMaster) out.push({ id: `jc-ready-${j.id}`, title: `Mark ready for collection — ${j.jobNumber}`, detail: 'The work is completed.', url: jcUrl(j.id, 'status'), createdAt: at(j.updatedAt) });
  for (const j of jcClosed) if (mine(j.createdById)) out.push({ id: `jc-out-${j.id}`, title: `Check the vehicle out — ${j.jobNumber}`, detail: 'Closed by the Owner — release the vehicle to the customer.', url: jcUrl(j.id, 'status'), createdAt: at(j.updatedAt) });
  for (const c of creditNotes) out.push({ id: `cn-${c.id}`, title: `Approve the credit note — ${c.invoice.invoiceNumber}`, detail: `₦${Number(c.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })} off what the customer owes.`, url: '/money/credit-notes?show=pending', createdAt: at(c.requestedAt) });
  return out;
}
