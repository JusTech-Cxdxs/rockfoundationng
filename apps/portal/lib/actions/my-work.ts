'use server';

import { prisma } from '@ejo/database';
import { allows, getPrincipal, myOrganisationId, reachWhere, jobCardReach } from '@/lib/authz/server';
import { ticketReachWhere } from '@/lib/support-rules';
import { requireUser } from './workshop';
import { lagosYmd } from '@/lib/nigeria-calendar';
import { fenceStaffHelp } from '@/lib/support/reach';
import { isOffPermission } from '@/lib/edition';

/**
 * The personal side of the dashboard: the jobs this person is working on,
 * a few steps that only they can take, and their own numbers for the month.
 * Every query is either about the viewer's own records (indexed on the
 * person's id) or a count fenced to their reach — never a scan of the
 * whole business.
 */

export type MyWorkItem = { id: string; title: string; detail: string; url: string; createdAt: Date };
export type MyJob = { kind: 'JC'; id: string; number: string; status: string; as: 'Technician' | 'Supervisor'; vehicle: string; url: string; updatedAt: Date };
export type MyNumber = { label: string; value: number; hint: string; href?: string; icon: string; suffix?: string; decimals?: number; tone?: 'brand' | 'warning' | 'success' | 'neutral' };

const JC_OPEN = ['CHECKED_IN', 'IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'AWAITING_CUSTOMER_APPROVAL'] as const;

function monthStart(): Date {
  return new Date(`${lagosYmd(new Date()).slice(0, 7)}-01T00:00:00+01:00`);
}

/** Steps waiting on this person that the other lists do not cover: support
 * requests, assigning a technician to a job they supervise, and their own
 * reminders that are due. */
export async function getMyWorkItems(): Promise<MyWorkItem[]> {
  const user = await requireUser();
  const work = await jobCardReach({ lens: false });
  const [jcs, reminders] = await Promise.all([
    prisma.jobCard.findMany({ where: { ...work, supervisorId: user.id, approvalStatus: 'APPROVED', assignedTechnicianId: null, status: { in: [...JC_OPEN] } }, take: 20, select: { id: true, jobNumber: true, updatedAt: true } }),
    // My own reminders that are due: delivered by the 10-minute job, or past due and not yet delivered.
    prisma.reminder.findMany({ where: { ownerId: user.id, OR: [{ status: 'SENT' }, { status: 'PENDING', dueAt: { lte: new Date() } }] }, orderBy: { dueAt: 'asc' }, take: 20, select: { id: true, title: true, recordRef: true, dueAt: true } }),
  ]);
  const support = await supportItems(user.id).catch(() => [] as MyWorkItem[]);
  return [
    ...support,
    ...jcs.map((j: (typeof jcs)[number]) => ({ id: `my-assign-${j.id}`, title: `Assign a technician — ${j.jobNumber}`, detail: 'You are supervising this job and nobody is working on it yet.', url: `/workshop/job-cards/${j.id}`, createdAt: j.updatedAt })),
    ...reminders.map((r: (typeof reminders)[number]) => ({ id: `my-reminder-${r.id}`, title: `Reminder — ${r.title}`, detail: `${r.recordRef ? `About ${r.recordRef}. ` : ''}Mark it done or snooze it.`, url: `/reminders?focus=${r.id}#r-${r.id}`, createdAt: r.dueAt })),
  ];
}

/**
 * Support tickets (hand-overs from Enyo) waiting on the team: those assigned
 * to this person, and new ones nobody has taken yet, within the inbox's own
 * fence. Ids start with "support-" (the menu counts them).
 */
async function supportItems(userId: string): Promise<MyWorkItem[]> {
  if (!(await allows('support.tickets.manage'))) return [];
  const fence = (await fenceStaffHelp(ticketReachWhere(await reachWhere('support.tickets.manage', { lens: false }), await myOrganisationId())));
  // New, unowned requests are the support department's work: the teams this
  // person works in, and Front Desk, which is customer care (or the platform
  // team). The Owner, who may LOOK at the Support centre, is not asked to answer it.
  const p = await getPrincipal();
  const care = p.isSuperAdmin || p.roleSlugs.includes('front-desk');
  const myQueues = (await prisma.supportQueueMember.findMany({ where: { userId }, select: { queueId: true } }).catch(() => [])).map((q) => q.queueId);
  const unowned = care ? [{ assignedToId: null }] : myQueues.length ? [{ assignedToId: null, queueId: { in: myQueues } }] : [];
  const rows = await prisma.supportTicket.findMany({
    where: { AND: [fence, { status: 'OPEN' }, { OR: [{ assignedToId: userId }, ...unowned] }] },
    orderBy: { createdAt: 'asc' },
    take: 15,
    select: { id: true, number: true, contactName: true, subject: true, assignedToId: true, createdAt: true, updatedAt: true, priority: true, firstResponseAt: true, dueFirstResponseAt: true },
  });
  const now = Date.now();
  return rows.map((t: (typeof rows)[number]) => ({
    id: `support-${t.id}`,
    title: `${t.priority === 'URGENT' ? 'Urgent: ' : ''}${!t.firstResponseAt && t.dueFirstResponseAt && t.dueFirstResponseAt.getTime() < now ? 'Late — ' : ''}${t.assignedToId ? `Customer waiting for your reply — ${t.number}` : `New support request — ${t.number}`}`,
    detail: `${t.contactName}: ${t.subject}`.slice(0, 160),
    url: `/crm/support/${t.id}`,
    createdAt: t.assignedToId ? t.updatedAt : t.createdAt,
  }));
}

/** Open jobs where this person is the technician or the supervisor. */
export async function getMyJobs(): Promise<MyJob[]> {
  const user = await requireUser();
  const work = await jobCardReach({ lens: false });
  const veh = { select: { plateNumber: true, make: true, model: true } } as const;
  const jcs = await prisma.jobCard.findMany({ where: { ...work, status: { in: [...JC_OPEN, 'COMPLETED', 'READY_FOR_COLLECTION'] }, OR: [{ assignedTechnicianId: user.id }, { supervisorId: user.id }] }, orderBy: { updatedAt: 'desc' }, take: 12, select: { id: true, jobNumber: true, status: true, supervisorId: true, updatedAt: true, vehicle: veh } });
  type V = { plateNumber: string | null; make: string | null; model: string | null } | null;
  const car = (v: V) => [v?.plateNumber, [v?.make, v?.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  return jcs.map((j: (typeof jcs)[number]) => ({ kind: 'JC' as const, id: j.id, number: j.jobNumber, status: j.status, as: j.supervisorId === user.id ? 'Supervisor' as const : 'Technician' as const, vehicle: car(j.vehicle), url: `/workshop/job-cards/${j.id}`, updatedAt: j.updatedAt }));
}

/** This month's numbers for the work this person does — only the tiles for
 * permissions they hold, each a cheap count. */
export async function getMyNumbers(): Promise<MyNumber[]> {
  const user = await requireUser();
  const since = monthStart();
  // A permission of a module that is switched off (the Store) shows no tile and runs no count.
  const on = (k: Parameters<typeof allows>[0]) => (isOffPermission(k) ? Promise.resolve(false) : allows(k));
  const [canWork, canSupervise, canSource, frontDesk, closes, release, payments, gate] = await Promise.all([
    on('workshop.job.work'), on('workshop.job.supervise'), on('sourcing.request'), on('workshop.job_card.create'), on('workshop.close.approve'),
    on('store.prs.release'), on('workshop.payment.record'), on('security.gate.operate'),
  ]);
  const [work, jobs, store] = await Promise.all([reachWhere('workshop.job_card.view', { lens: false }), jobCardReach({ lens: false }), reachWhere('store.view', { lens: false })]);
  const n = (p: Promise<number>) => p.catch(() => 0);
  const out: MyNumber[] = [];

  if (canWork) {
    const done = await prisma.jobCard.findMany({ where: { ...jobs, assignedTechnicianId: user.id, completedAt: { gte: since } }, take: 500, select: { workStartedAt: true, completedAt: true } });
    const timed = done.filter((d: { workStartedAt: Date | null; completedAt: Date | null }) => d.workStartedAt && d.completedAt && d.completedAt > d.workStartedAt);
    const hours = timed.length ? timed.reduce((s: number, d: { workStartedAt: Date | null; completedAt: Date | null }) => s + (d.completedAt!.getTime() - d.workStartedAt!.getTime()), 0) / timed.length / 3600000 : 0;
    const open = await n(prisma.jobCard.count({ where: { ...jobs, assignedTechnicianId: user.id, status: { in: [...JC_OPEN] } } }));
    out.push({ label: 'My jobs in progress', value: open, hint: 'Assigned to you, not yet completed', icon: 'wrench' });
    out.push({ label: 'Completed this month', value: done.length, hint: 'Jobs you finished', icon: 'check-circle', tone: 'success' });
    out.push({ label: 'Average time per job', value: Math.round(hours * 10) / 10, decimals: 1, suffix: ' h', hint: timed.length ? `From start to completed, ${timed.length === 1 ? '1 job' : `${timed.length} jobs`} this month` : 'No timed jobs yet this month', icon: 'clock' });
  }
  if (canSupervise) {
    const sup = await n(prisma.jobCard.count({ where: { ...jobs, supervisorId: user.id, status: { in: [...JC_OPEN, 'COMPLETED'] } } }));
    out.push({ label: 'Jobs I supervise', value: sup, hint: 'Open jobs you are responsible for', icon: 'users' });
  }
  if (canSource) {
    const prs = await n(prisma.partRequestSlip.count({ where: { ...work, requestedById: user.id, status: { in: ['PENDING_HOD_APPROVAL', 'PENDING_STORE_APPROVAL', 'APPROVED'] } } }));
    out.push({ label: 'My parts requests open', value: prs, hint: 'Waiting for approval or release', href: '/workshop/parts-requests', icon: 'package', tone: prs ? 'warning' : 'neutral' });
  }
  if (frontDesk) {
    const [ready, opened] = await Promise.all([
      n(prisma.jobCard.count({ where: { ...jobs, status: 'READY_FOR_COLLECTION' } })),
      n(prisma.jobCard.count({ where: { ...jobs, createdById: user.id, createdAt: { gte: since } } })),
    ]);
    out.push({ label: 'Ready for collection', value: ready, hint: 'Vehicles waiting for their customers', href: '/workshop/custody', icon: 'car', tone: ready ? 'warning' : 'neutral' });
    out.push({ label: 'Opened by me this month', value: opened, hint: 'Job Cards', icon: 'clipboard' });
  }
  if (closes) {
    const [inWork, closed] = await Promise.all([
      n(prisma.jobCard.count({ where: { ...jobs, status: { in: [...JC_OPEN] } } })),
      n(prisma.jobCard.count({ where: { ...jobs, closedAt: { gte: since } } })),
    ]);
    out.push({ label: 'Jobs in the workshop', value: inWork, hint: 'Job Cards being worked on', href: '/workshop/custody', icon: 'garage' });
    out.push({ label: 'Closed this month', value: closed, hint: 'Job Cards', icon: 'check-circle', tone: 'success' });
  }
  if (release) {
    const [toRelease, low] = await Promise.all([
      n(prisma.partRequestSlip.count({ where: { ...store, status: { in: ['PENDING_STORE_APPROVAL', 'APPROVED'] } } })),
      n(prisma.part.findMany({ where: { ...store, isActive: true, reorderPoint: { not: null } }, take: 2000, select: { reorderPoint: true, stock: { select: { quantityOnHand: true } } } })
        .then((ps: { reorderPoint: unknown; stock: { quantityOnHand: unknown } | null }[]) => ps.filter((p) => Number(p.stock?.quantityOnHand ?? 0) <= Number(p.reorderPoint)).length)),
    ]);
    out.push({ label: 'Parts requests for the Store', value: toRelease, hint: 'To approve and reserve, or to hand over', href: '/workshop/parts-requests', icon: 'package', tone: toRelease ? 'warning' : 'neutral' });
    out.push({ label: 'Parts at or below reorder point', value: low, hint: 'Time to reorder', href: '/inventory/parts', icon: 'boxes', tone: low ? 'warning' : 'neutral' });
  }
  if (payments) {
    const recorded = await n(prisma.payment.count({ where: { recordedById: user.id, recordedAt: { gte: since }, jobCard: work } }));
    out.push({ label: 'Payments I recorded this month', value: recorded, hint: 'On Job Cards', icon: 'money' });
  }
  if (gate) {
    const waiting = await n(prisma.jobCard.count({ where: { ...jobs, status: 'READY_FOR_COLLECTION' } }));
    out.push({ label: 'Vehicles ready to leave', value: waiting, hint: 'Ready for collection, not yet through the gate', href: '/security/vehicles-inside', icon: 'car' });
  }
  if (out.length === 0) {
    // Everyone has their own reminders — the one number that is always theirs.
    const due = await n(prisma.reminder.count({ where: { ownerId: user.id, status: { in: ['PENDING', 'SENT'] } } }));
    out.push({ label: 'My reminders', value: due, hint: 'Waiting or due', href: '/reminders', icon: 'bell' });
  }
  return out;
}
