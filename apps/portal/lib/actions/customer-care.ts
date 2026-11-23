'use server';

import { prisma, type Prisma } from '@ejo/database';
import { whatsAppShareUrlFor } from '@ejo/utils/whatsapp';
import { allows, authorize, getPrincipal, jobCardReach, myOrganisationId, orgWhere, reachWhere, NOT_AVAILABLE } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { openTicket, queueById, supportEvent } from '@/lib/support/server';
import { ticketReachWhere } from '@/lib/support-rules';
import { ensureJobRating } from '@/lib/customer-care/server';
import {
  callbackMessage, COMPLAINT_SEVERITY, complaintCategoryLabel, followUpBucket, FOLLOW_UP_REASONS, isComplaintCategory, isComplaintChannel, isFollowUpReason,
  lagosDay, MANUAL_FOLLOW_UP_REASONS, nextTry, parseBirthday, ratingMessage, RATING_WORDS, type FollowUpReason, type FollowUpStatus,
} from '@/lib/customer-care/rules';

/**
 * Customer care: the callback list (FollowUp), complaints (Support centre
 * tickets of kind COMPLAINT) and "How did we do?" ratings. Callbacks need
 * crm.manage (Front Desk, the Owner); complaints need support.tickets.manage;
 * the overview and ratings need crm.view. Everything is fenced to the
 * person's organisation and, for branch-scoped people, their branch.
 */

class CareError extends Error {}

const CALLBACKS = 'crm.manage' as const;
const COMPLAINTS = 'support.tickets.manage' as const;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{20,40}$/.test(v);
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

async function org(): Promise<string> {
  const id = await myOrganisationId();
  if (!id) throw new CareError('Your account is not linked to an organisation yet. Ask the Owner.');
  return id;
}

/** Records with a branch: the person's reach; organisation-wide ones (a birthday call) are everyone's in the organisation. */
async function branchFence(key: 'crm.view' | 'crm.manage'): Promise<Prisma.FollowUpWhereInput> {
  const reach = await reachWhere(key, { lens: false });
  return reach.branchId ? { OR: [{ branchId: reach.branchId }, { branchId: null }] } : {};
}

async function workshopName(organisationId: string): Promise<string> {
  return (await prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true } }))?.name ?? 'the workshop';
}

const vehicleText = (v: { make: string | null; model: string | null; plateNumber: string | null } | null) =>
  v ? `${[v.make, v.model].filter(Boolean).join(' ') || 'vehicle'}${v.plateNumber ? ` (${v.plateNumber})` : ''}` : null;

// ─────────────────────────────────────────────────────────── overview

export type CareOverview = { callbacksToday: number; callbacksOverdue: number; openComplaints: number; ratings30: number; average30: number | null; lowRatings30: number };

export async function getCareOverview(): Promise<CareOverview> {
  await authorize('crm.view', undefined, 'getCareOverview');
  const organisationId = await org();
  const now = new Date();
  const fence = await branchFence('crm.view');
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const endOfToday = new Date(Date.parse(`${lagosDay(now)}T23:00:00Z`)); // 00:00 Lagos tomorrow
  const startOfToday = new Date(endOfToday.getTime() - 86_400_000);
  const [overdue, today, complaints, ratings] = await Promise.all([
    prisma.followUp.count({ where: { AND: [fence, { organisationId, status: 'OPEN', dueAt: { lt: startOfToday } }] } }),
    prisma.followUp.count({ where: { AND: [fence, { organisationId, status: 'OPEN', dueAt: { gte: startOfToday, lt: endOfToday } }] } }),
    (await allows(COMPLAINTS)) ? prisma.supportTicket.count({ where: { AND: [ticketReachWhere(await reachWhere(COMPLAINTS), organisationId) as Prisma.SupportTicketWhereInput, { kind: 'COMPLAINT', status: { in: ['OPEN', 'WAITING_ON_CUSTOMER', 'ON_HOLD'] } }] } }) : Promise.resolve(0),
    prisma.jobRating.findMany({ where: { organisationId, respondedAt: { gte: since }, score: { not: null } }, select: { score: true } }),
  ]);
  const scores = ratings.map((r) => r.score!);
  return {
    callbacksToday: today, callbacksOverdue: overdue, openComplaints: complaints, ratings30: scores.length,
    average30: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    lowRatings30: scores.filter((s) => s <= 3).length,
  };
}

// ─────────────────────────────────────────────────────────── callbacks

export type CallbackRow = {
  id: string; reason: FollowUpReason; reasonLabel: string; note: string | null; dueAt: Date; bucket: 'overdue' | 'today' | 'upcoming'; status: FollowUpStatus;
  outcome: string | null; attempts: number; doneAt: Date | null;
  customer: { id: string; name: string; phone: string | null; preferred: string };
  vehicle: string | null; job: { id: string; number: string } | null; ticketId: string | null;
  assignedTo: string | null; mine: boolean; whatsAppUrl: string | null; callUrl: string | null;
};

export async function listCallbacks(input: { show?: string } = {}): Promise<{ overdue: CallbackRow[]; today: CallbackRow[]; upcoming: CallbackRow[]; closed: CallbackRow[]; show: 'open' | 'mine' | 'closed' }> {
  await authorize(CALLBACKS, undefined, 'listCallbacks');
  const me = await requireUser();
  const organisationId = await org();
  const show = input.show === 'mine' || input.show === 'closed' ? input.show : 'open';
  const fence = await branchFence(CALLBACKS);
  const where: Prisma.FollowUpWhereInput = {
    AND: [fence, { organisationId }, show === 'closed' ? { status: { not: 'OPEN' } } : { status: 'OPEN' }, show === 'mine' ? { assignedToId: me.id } : {}],
  };
  const rows = await prisma.followUp.findMany({
    where,
    orderBy: show === 'closed' ? [{ updatedAt: 'desc' }] : [{ dueAt: 'asc' }],
    take: show === 'closed' ? 60 : 300,
    select: {
      id: true, reason: true, note: true, dueAt: true, status: true, outcome: true, attempts: true, doneAt: true, ticketId: true, vehicleId: true, assignedToId: true,
      customer: { select: { id: true, fullName: true, phone: true, altPhone: true, whatsappPhone: true, preferredContact: true, customerType: true } },
      jobCard: { select: { id: true, jobNumber: true } },
      assignedTo: { select: { fullName: true } },
    },
  });
  const vehicleIds = [...new Set(rows.map((r) => r.vehicleId).filter((v): v is string => Boolean(v)))];
  const vehicles = vehicleIds.length ? await prisma.customerVehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, make: true, model: true, plateNumber: true } }) : [];
  const vmap = new Map(vehicles.map((v) => [v.id, vehicleText(v)]));
  const workshop = await workshopName(organisationId);
  const now = new Date();
  const out = rows.map((r): CallbackRow => {
    const vehicle = r.vehicleId ? vmap.get(r.vehicleId) ?? null : null;
    const reason = r.reason as FollowUpReason;
    const organisation = r.customer.customerType !== 'INDIVIDUAL';
    const phone = r.customer.phone ?? r.customer.altPhone ?? null;
    return {
      id: r.id, reason, reasonLabel: FOLLOW_UP_REASONS[reason], note: r.note, dueAt: r.dueAt, bucket: followUpBucket(r.dueAt, now), status: r.status as FollowUpStatus,
      outcome: r.outcome, attempts: r.attempts, doneAt: r.doneAt,
      customer: { id: r.customer.id, name: r.customer.fullName, phone, preferred: r.customer.preferredContact },
      vehicle, job: r.jobCard ? { id: r.jobCard.id, number: r.jobCard.jobNumber } : null, ticketId: r.ticketId,
      assignedTo: r.assignedTo?.fullName ?? null, mine: r.assignedToId === me.id,
      whatsAppUrl: whatsAppShareUrlFor([r.customer.whatsappPhone, r.customer.phone, r.customer.altPhone], callbackMessage({ reason, customerName: r.customer.fullName, organisation, workshop, vehicle })),
      callUrl: phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null,
    };
  });
  if (show === 'closed') return { overdue: [], today: [], upcoming: [], closed: out, show };
  return { overdue: out.filter((r) => r.bucket === 'overdue'), today: out.filter((r) => r.bucket === 'today'), upcoming: out.filter((r) => r.bucket === 'upcoming'), closed: [], show };
}

/** A Lagos local date-time from a form ("2026-11-24T10:30") as an instant. */
function lagosLocal(v: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`) - 3_600_000);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type AddCallbackInput = { customerId: string; reason: string; dueAt: string; note?: string; jobCardId?: string; assignedToId?: string };

export async function addCallback(input: AddCallbackInput): Promise<{ id: string }> {
  await authorize(CALLBACKS, undefined, 'addCallback');
  const me = await requireUser();
  const organisationId = await org();
  if (!isId(input.customerId)) throw new CareError('Choose the customer to call.');
  if (!isFollowUpReason(input.reason) || !MANUAL_FOLLOW_UP_REASONS.includes(input.reason)) throw new CareError('Choose why the call is needed.');
  const dueAt = lagosLocal(input.dueAt);
  if (!dueAt) throw new CareError('Choose the day and time to call.');
  if (dueAt.getTime() < Date.now() - 86_400_000) throw new CareError('That time has already passed.');
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, organisationId }, select: { id: true } });
  if (!customer) throw new CareError(NOT_AVAILABLE);
  const job = input.jobCardId && isId(input.jobCardId) ? await prisma.jobCard.findFirst({ where: { id: input.jobCardId, customerId: customer.id }, select: { id: true, vehicleId: true, branchId: true } }) : null;
  const assignee = input.assignedToId && isId(input.assignedToId) ? await prisma.user.findFirst({ where: { id: input.assignedToId, organisationId, isActive: true }, select: { id: true } }) : null;
  const p = await getPrincipal();
  const row = await prisma.followUp.create({
    data: {
      organisationId, branchId: job?.branchId ?? p.branchId ?? null, customerId: customer.id, vehicleId: job?.vehicleId ?? null, jobCardId: job?.id ?? null,
      reason: input.reason, dueAt, note: clean(input.note, 500) || null, assignedToId: assignee?.id ?? me.id, createdById: me.id,
    },
    select: { id: true },
  });
  await writeAuditLog({ userId: me.id, action: 'customer_care.callback_added', entityType: 'FollowUp', entityId: row.id, organisationId, metadata: { reason: input.reason, dueAt: dueAt.toISOString() } });
  return row;
}

async function openCallback(id: string) {
  const organisationId = await org();
  const fence = await branchFence(CALLBACKS);
  const row = isId(id) ? await prisma.followUp.findFirst({ where: { AND: [fence, { id, organisationId }] }, select: { id: true, status: true, attempts: true, organisationId: true } }) : null;
  if (!row) throw new CareError(NOT_AVAILABLE);
  if (row.status !== 'OPEN') throw new CareError('This call was already closed. Refresh the page.');
  return row;
}

export async function completeCallback(id: string, outcomeRaw: string): Promise<void> {
  await authorize(CALLBACKS, undefined, 'completeCallback');
  const me = await requireUser();
  const row = await openCallback(id);
  const outcome = clean(outcomeRaw, 500);
  if (outcome.length < 2) throw new CareError('Write in a few words what came of the call.');
  // Compare-and-set: two people closing the same call, only the first counts.
  const done = await prisma.followUp.updateMany({ where: { id: row.id, status: 'OPEN' }, data: { status: 'DONE', outcome, doneAt: new Date(), doneById: me.id } });
  if (!done.count) throw new CareError('This call was already closed. Refresh the page.');
  await writeAuditLog({ userId: me.id, action: 'customer_care.callback_done', entityType: 'FollowUp', entityId: row.id, organisationId: row.organisationId, metadata: { outcome } });
}

export async function callbackNoAnswer(id: string): Promise<{ closed: boolean }> {
  await authorize(CALLBACKS, undefined, 'callbackNoAnswer');
  const me = await requireUser();
  const row = await openCallback(id);
  const next = nextTry(new Date(), row.attempts);
  const changed = await prisma.followUp.updateMany({
    where: { id: row.id, status: 'OPEN', attempts: row.attempts },
    data: next.closeAsNoAnswer
      ? { status: 'NO_ANSWER', attempts: { increment: 1 }, doneAt: new Date(), doneById: me.id, outcome: 'No answer after several tries.' }
      : { attempts: { increment: 1 }, dueAt: next.dueAt },
  });
  if (!changed.count) throw new CareError('Someone else updated this call a moment ago. Refresh the page.');
  await writeAuditLog({ userId: me.id, action: 'customer_care.callback_no_answer', entityType: 'FollowUp', entityId: row.id, organisationId: row.organisationId, metadata: { attempt: row.attempts + 1, closed: next.closeAsNoAnswer } });
  return { closed: next.closeAsNoAnswer };
}

export async function cancelCallback(id: string, reasonRaw: string): Promise<void> {
  await authorize(CALLBACKS, undefined, 'cancelCallback');
  const me = await requireUser();
  const row = await openCallback(id);
  const reason = clean(reasonRaw, 300);
  if (reason.length < 2) throw new CareError('Say why the call is no longer needed.');
  const done = await prisma.followUp.updateMany({ where: { id: row.id, status: 'OPEN' }, data: { status: 'CANCELLED', outcome: reason, doneAt: new Date(), doneById: me.id } });
  if (!done.count) throw new CareError('This call was already closed. Refresh the page.');
  await writeAuditLog({ userId: me.id, action: 'customer_care.callback_cancelled', entityType: 'FollowUp', entityId: row.id, organisationId: row.organisationId, metadata: { reason } });
}

// ─────────────────────────────────────────────────────────── complaints

export type ComplaintRow = {
  id: string; number: string; status: string; priority: string; category: string; subject: string; channel: string; createdAt: Date; resolvedAt: Date | null;
  customer: { id: string | null; name: string }; job: { id: string; number: string } | null; assignedTo: string | null;
};

export async function listComplaints(input: { show?: string; category?: string } = {}): Promise<{ rows: ComplaintRow[]; show: 'open' | 'resolved' | 'all'; byCategory: { key: string; label: string; count: number }[] }> {
  await authorize(COMPLAINTS, undefined, 'listComplaints');
  const organisationId = await org();
  const show = input.show === 'resolved' || input.show === 'all' ? input.show : 'open';
  const reach = ticketReachWhere(await reachWhere(COMPLAINTS), organisationId) as Prisma.SupportTicketWhereInput;
  const status: Prisma.SupportTicketWhereInput = show === 'open' ? { status: { in: ['OPEN', 'WAITING_ON_CUSTOMER', 'ON_HOLD'] } } : show === 'resolved' ? { status: { in: ['RESOLVED', 'CLOSED'] } } : {};
  const category: Prisma.SupportTicketWhereInput = isComplaintCategory(input.category) ? { complaintCategory: input.category } : {};
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [rows, groups] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { AND: [reach, { kind: 'COMPLAINT' }, status, category] },
      orderBy: show === 'open' ? [{ createdAt: 'asc' }] : [{ updatedAt: 'desc' }],
      take: 200,
      select: { id: true, number: true, status: true, priority: true, complaintCategory: true, subject: true, channel: true, createdAt: true, resolvedAt: true, customerId: true, contactName: true, jobCardId: true, assignedToId: true },
    }),
    prisma.supportTicket.groupBy({ by: ['complaintCategory'], where: { AND: [reach, { kind: 'COMPLAINT', createdAt: { gte: since } }] }, _count: { _all: true } }),
  ]);
  const jobIds = [...new Set(rows.map((r) => r.jobCardId).filter((x): x is string => Boolean(x)))];
  const userIds = [...new Set(rows.map((r) => r.assignedToId).filter((x): x is string => Boolean(x)))];
  const [jobs, users] = await Promise.all([
    jobIds.length ? prisma.jobCard.findMany({ where: { id: { in: jobIds } }, select: { id: true, jobNumber: true } }) : [],
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [],
  ]);
  const jmap = new Map(jobs.map((j) => [j.id, j.jobNumber]));
  const umap = new Map(users.map((u) => [u.id, u.fullName]));
  return {
    show,
    byCategory: groups.map((g) => ({ key: g.complaintCategory ?? 'OTHER', label: complaintCategoryLabel(g.complaintCategory), count: g._count._all })).sort((a, b) => b.count - a.count),
    rows: rows.map((r) => ({
      id: r.id, number: r.number, status: r.status, priority: r.priority, category: complaintCategoryLabel(r.complaintCategory), subject: r.subject, channel: r.channel,
      createdAt: r.createdAt, resolvedAt: r.resolvedAt, customer: { id: r.customerId, name: r.contactName },
      job: r.jobCardId && jmap.has(r.jobCardId) ? { id: r.jobCardId, number: jmap.get(r.jobCardId)! } : null,
      assignedTo: r.assignedToId ? umap.get(r.assignedToId) ?? 'A colleague' : null,
    })),
  };
}

export type LogComplaintInput = { customerId: string; channel: string; category: string; severity: string; details: string; jobCardId?: string };

/** Front desk logs a complaint: it becomes a Support centre ticket of kind COMPLAINT, with its owner and response targets. */
export async function logComplaint(input: LogComplaintInput): Promise<{ id: string; number: string }> {
  await authorize(COMPLAINTS, undefined, 'logComplaint');
  const me = await requireUser();
  const organisationId = await org();
  if (!isId(input.customerId)) throw new CareError('Choose the customer the complaint is from.');
  if (!isComplaintChannel(input.channel)) throw new CareError('Choose how the complaint came in.');
  if (!isComplaintCategory(input.category)) throw new CareError('Choose what the complaint is about.');
  const priority = COMPLAINT_SEVERITY.some((s) => s.key === input.severity) ? input.severity as 'NORMAL' | 'HIGH' | 'URGENT' : 'NORMAL';
  const details = String(input.details ?? '').trim().slice(0, 4000);
  if (details.length < 5) throw new CareError('Write what the customer said, in their words where you can.');
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, organisationId }, select: { id: true, fullName: true, email: true, phone: true } });
  if (!customer) throw new CareError(NOT_AVAILABLE);
  const job = input.jobCardId && isId(input.jobCardId)
    ? await prisma.jobCard.findFirst({ where: { id: input.jobCardId, customerId: customer.id }, select: { id: true, jobNumber: true, vehicleId: true, branchId: true } })
    : null;
  const queue = await queueById(organisationId, null);
  const p = await getPrincipal();
  const subject = `${complaintCategoryLabel(input.category)}${job ? ` (${job.jobNumber})` : ''}`;
  const ticket = await openTicket({
    organisationId, channel: input.channel, queue, branchId: job?.branchId ?? p.branchId ?? null, customerId: customer.id,
    contactName: customer.fullName, contactEmail: customer.email, contactPhone: customer.phone, subject, summary: details.slice(0, 400), priority, verified: true,
    kind: 'COMPLAINT', complaintCategory: input.category, jobCardId: job?.id ?? null, vehicleId: job?.vehicleId ?? null,
  });
  await prisma.supportReply.create({ data: { ticketId: ticket.id, fromCustomer: true, kind: 'CUSTOMER', visibility: 'PUBLIC', body: details } });
  await prisma.supportReply.create({ data: { ticketId: ticket.id, authorUserId: me.id, kind: 'NOTE', visibility: 'INTERNAL', body: `Complaint logged by a colleague (${input.channel.toLowerCase().replace('_', ' ')}).` } });
  await supportEvent({ organisationId, ticketId: ticket.id, userId: me.id, action: 'support.complaint_logged', metadata: { number: ticket.number, category: input.category, priority, jobCardId: job?.id ?? null } });
  return { id: ticket.id, number: ticket.number };
}

// ─────────────────────────────────────────────────────────── ratings

export type RatingsSummary = {
  average: number | null; answered: number; sent: number; distribution: { score: number; label: string; count: number }[];
  recent: { id: string; score: number; label: string; comment: string | null; respondedAt: Date; customer: { id: string; name: string }; job: { id: string; number: string }; complaint: string | null }[];
};

export async function getRatings(): Promise<RatingsSummary> {
  await authorize('crm.view', undefined, 'getRatings');
  const organisationId = await org();
  const since = new Date(Date.now() - 90 * 86_400_000);
  const reach = await reachWhere('crm.view', { lens: false });
  const jobFence: Prisma.JobRatingWhereInput = reach.branchId ? { jobCard: { branchId: reach.branchId } } : {};
  const [sent, answered] = await Promise.all([
    prisma.jobRating.count({ where: { AND: [jobFence, { organisationId, sentAt: { gte: since } }] } }),
    prisma.jobRating.findMany({
      where: { AND: [jobFence, { organisationId, respondedAt: { gte: since }, score: { not: null } }] },
      orderBy: { respondedAt: 'desc' },
      take: 500,
      select: { id: true, score: true, comment: true, respondedAt: true, ticketId: true, customer: { select: { id: true, fullName: true } }, jobCard: { select: { id: true, jobNumber: true } } },
    }),
  ]);
  const scores = answered.map((a) => a.score!);
  const tickets = answered.filter((a) => a.ticketId).map((a) => a.ticketId!);
  const numbers = tickets.length ? new Map((await prisma.supportTicket.findMany({ where: { id: { in: tickets } }, select: { id: true, number: true } })).map((t) => [t.id, t.number])) : new Map<string, string>();
  return {
    sent, answered: answered.length,
    average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    distribution: [5, 4, 3, 2, 1].map((score) => ({ score, label: RATING_WORDS[score]!, count: scores.filter((s) => s === score).length })),
    recent: answered.slice(0, 40).map((a) => ({
      id: a.id, score: a.score!, label: RATING_WORDS[a.score!]!, comment: a.comment, respondedAt: a.respondedAt!, customer: { id: a.customer.id, name: a.customer.fullName },
      job: { id: a.jobCard.id, number: a.jobCard.jobNumber }, complaint: a.ticketId ? numbers.get(a.ticketId) ?? null : null,
    })),
  };
}

/** The Job Card's "How did we do?": its state and the WhatsApp link to send it (front desk). */
export async function getJobCardRating(jobCardId: string): Promise<{ score: number | null; label: string | null; comment: string | null; respondedAt: Date | null; whatsAppUrl: string | null; link: string | null } | null> {
  await authorize('workshop.customer.notify', undefined, 'getJobCardRating');
  const organisationId = await org();
  if (!isId(jobCardId)) return null;
  const job = await prisma.jobCard.findFirst({
    // Only a Job Card this person may see (branch, assignment), inside their organisation.
    where: { AND: [await jobCardReach(), { id: jobCardId, customer: { organisationId }, status: 'CHECKED_OUT' }] },
    select: { id: true, jobNumber: true, customer: { select: { fullName: true, customerType: true, phone: true, altPhone: true, whatsappPhone: true } }, vehicle: { select: { make: true, model: true, plateNumber: true } } },
  });
  if (!job) return null;
  const rating = await ensureJobRating(job.id);
  if (!rating) return null;
  const row = await prisma.jobRating.findUnique({ where: { id: rating.id }, select: { score: true, comment: true, respondedAt: true } });
  const text = rating.link ? ratingMessage({ customerName: job.customer.fullName, organisation: job.customer.customerType !== 'INDIVIDUAL', vehicle: vehicleText(job.vehicle) ?? 'vehicle', jobNumber: job.jobNumber, link: rating.link, workshop: await workshopName(organisationId) }) : null;
  return {
    score: row?.score ?? null, label: row?.score ? RATING_WORDS[row.score] ?? null : null, comment: row?.comment ?? null, respondedAt: row?.respondedAt ?? null, link: rating.link,
    whatsAppUrl: text ? whatsAppShareUrlFor([job.customer.whatsappPhone, job.customer.phone, job.customer.altPhone], text) : null,
  };
}

// ─────────────────────────────────────────────────────────── customer's care details

export async function setCustomerCareDetails(customerId: string, input: { preferredContact: string; whatsappPhone: string; birthday: string }): Promise<void> {
  await authorize('crm.manage', undefined, 'setCustomerCareDetails');
  const me = await requireUser();
  const organisationId = await org();
  if (!isId(customerId)) throw new CareError(NOT_AVAILABLE);
  const preferred = ['WHATSAPP', 'PHONE', 'EMAIL'].includes(input.preferredContact) ? input.preferredContact as 'WHATSAPP' | 'PHONE' | 'EMAIL' : null;
  if (!preferred) throw new CareError('Choose how the customer prefers to be reached.');
  const whatsapp = String(input.whatsappPhone ?? '').replace(/[^\d+ ]/g, '').trim().slice(0, 30) || null;
  if (whatsapp && whatsapp.replace(/\D/g, '').length < 10) throw new CareError('That WhatsApp number looks too short.');
  const birthday = parseBirthday(String(input.birthday ?? ''));
  if (typeof birthday === 'string') throw new CareError(birthday);
  const customer = await prisma.customer.findFirst({ where: { AND: [await orgWhere(), { id: customerId, organisationId }] }, select: { id: true, email: true } });
  if (!customer) throw new CareError(NOT_AVAILABLE);
  if (preferred === 'EMAIL' && !customer.email) throw new CareError('This customer has no email address. Add one first, or choose WhatsApp or phone.');
  await prisma.customer.update({ where: { id: customer.id }, data: { preferredContact: preferred, whatsappPhone: whatsapp, birthDay: birthday?.day ?? null, birthMonth: birthday?.month ?? null } });
  await writeAuditLog({ userId: me.id, action: 'customer.care_details_updated', entityType: 'Customer', entityId: customer.id, organisationId, metadata: { preferredContact: preferred, whatsappSet: Boolean(whatsapp), birthdaySet: Boolean(birthday) } });
}

// ─────────────────────────────────────────────────────────── one customer's care

export type CustomerCare = {
  preferredContact: 'WHATSAPP' | 'PHONE' | 'EMAIL'; whatsappPhone: string | null; birthday: string | null; hasEmail: boolean;
  openCallbacks: { id: string; reason: string; dueAt: Date }[];
  complaints: { id: string; number: string; category: string; status: string; createdAt: Date }[];
  ratings: { score: number; label: string; jobNumber: string; respondedAt: Date }[];
  canManage: boolean; canComplaints: boolean;
};

export async function getCustomerCare(customerId: string): Promise<CustomerCare | null> {
  await authorize('crm.view', undefined, 'getCustomerCare');
  const organisationId = await org();
  if (!isId(customerId)) return null;
  const c = await prisma.customer.findFirst({ where: { id: customerId, organisationId }, select: { id: true, preferredContact: true, whatsappPhone: true, birthDay: true, birthMonth: true, email: true } });
  if (!c) return null;
  const [canManage, canComplaints] = await Promise.all([allows('crm.manage'), allows(COMPLAINTS)]);
  const [callbacks, complaints, ratings] = await Promise.all([
    prisma.followUp.findMany({ where: { customerId: c.id, organisationId, status: 'OPEN' }, orderBy: { dueAt: 'asc' }, take: 5, select: { id: true, reason: true, dueAt: true } }),
    canComplaints ? prisma.supportTicket.findMany({ where: { AND: [ticketReachWhere(await reachWhere(COMPLAINTS), organisationId) as Prisma.SupportTicketWhereInput, { customerId: c.id, kind: 'COMPLAINT' }] }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, number: true, complaintCategory: true, status: true, createdAt: true } }) : Promise.resolve([]),
    prisma.jobRating.findMany({ where: { customerId: c.id, organisationId, score: { not: null } }, orderBy: { respondedAt: 'desc' }, take: 5, select: { score: true, respondedAt: true, jobCard: { select: { jobNumber: true } } } }),
  ]);
  return {
    preferredContact: c.preferredContact as CustomerCare['preferredContact'], whatsappPhone: c.whatsappPhone,
    birthday: c.birthDay && c.birthMonth ? `${String(c.birthDay).padStart(2, '0')}/${String(c.birthMonth).padStart(2, '0')}` : null, hasEmail: Boolean(c.email),
    openCallbacks: callbacks.map((f) => ({ id: f.id, reason: FOLLOW_UP_REASONS[f.reason as FollowUpReason], dueAt: f.dueAt })),
    complaints: complaints.map((t) => ({ id: t.id, number: t.number, category: complaintCategoryLabel(t.complaintCategory), status: t.status, createdAt: t.createdAt })),
    ratings: ratings.map((r) => ({ score: r.score!, label: RATING_WORDS[r.score!]!, jobNumber: r.jobCard.jobNumber, respondedAt: r.respondedAt! })),
    canManage, canComplaints,
  };
}
