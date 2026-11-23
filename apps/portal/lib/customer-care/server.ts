/**
 * Customer care on the server (not callable from the browser): the rating a
 * job gets when its vehicle is collected, the daily run that fills the
 * callback list (birthdays, service due, after the job), and turning a low
 * "How did we do?" into a complaint and a call. Every part is idempotent:
 * dedupe keys and "only where missing" checks mean a second run adds nothing.
 */
import { prisma } from '@ejo/database';
import { logFailure } from '@/lib/log';
import { sendEmail } from '@/lib/email';
import { portalBaseUrl, websiteBaseUrl } from '@/lib/portal-url';
import { renderCustomerRatingRequestEmail } from '@/lib/email-templates/customer-rating-request';
import { defaultQueue, openTicket } from '@/lib/support/server';
import { loadServiceTracking } from '@/lib/vehicle-service-cycle';
import { afterJobDueAt, dedupe, isBirthdayOn, isLowRating, lagosAt, lagosDay, ratingToken, RATING_LINK_DAYS, RATING_WORDS } from './rules';
import { whatsAppToCustomer } from '@/lib/whatsapp/send';
import { jobRecord } from '@/lib/whatsapp/words';

/** The secret the rating links are signed with (shared by the portal and the customer website). */
export function ratingSecret(): string {
  return process.env.BETTER_AUTH_SECRET ?? '';
}

/** The customer's "How did we do?" link for a rating, or null when the website address is not set. */
export function ratingLink(ratingId: string): string | null {
  const site = websiteBaseUrl();
  const secret = ratingSecret();
  return site && secret ? `${site}/rate/${ratingToken(ratingId, secret)}` : null;
}

const vehicleText = (v: { make: string | null; model: string | null; plateNumber: string | null }) =>
  `${[v.make, v.model].filter(Boolean).join(' ') || 'vehicle'}${v.plateNumber ? ` (${v.plateNumber})` : ''}`;

/** The Job Card's rating, made the first time it is needed. Null when the job has no customer to ask. */
export async function ensureJobRating(jobCardId: string): Promise<{ id: string; link: string | null } | null> {
  const existing = await prisma.jobRating.findUnique({ where: { jobCardId }, select: { id: true } });
  if (existing) return { id: existing.id, link: ratingLink(existing.id) };
  const job = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { customerId: true, customer: { select: { organisationId: true } } } });
  if (!job) return null;
  const row = await prisma.jobRating.upsert({
    where: { jobCardId },
    create: { jobCardId, customerId: job.customerId, organisationId: job.customer.organisationId, expiresAt: new Date(Date.now() + RATING_LINK_DAYS * 86_400_000) },
    update: {},
    select: { id: true },
  });
  return { id: row.id, link: ratingLink(row.id) };
}

/**
 * When a vehicle is collected (Job Card checked out): its rating, the "How did
 * we do?" email (when the customer has an email and wants updates) and the
 * after-the-job call two days later. Never throws: collection must not fail
 * because a message could not be sent.
 */
export async function onJobCheckedOut(jobCardId: string): Promise<void> {
  try {
    const job = await prisma.jobCard.findUnique({
      where: { id: jobCardId },
      select: {
        id: true, jobNumber: true, branchId: true, checkedOutAt: true, customerId: true, vehicleId: true, createdById: true,
        branch: { select: { name: true } },
        customer: { select: { fullName: true, email: true, notifyByEmail: true, organisationId: true, organisation: { select: { name: true } } } },
        vehicle: { select: { make: true, model: true, plateNumber: true } },
      },
    });
    if (!job) return;
    const rating = await ensureJobRating(job.id);
    const collected = job.checkedOutAt ?? new Date();
    await prisma.followUp.upsert({
      where: { dedupeKey: dedupe.afterJob(job.id) },
      create: {
        organisationId: job.customer.organisationId, branchId: job.branchId, customerId: job.customerId, vehicleId: job.vehicleId, jobCardId: job.id,
        reason: 'AFTER_JOB', dueAt: afterJobDueAt(collected), assignedToId: job.createdById, dedupeKey: dedupe.afterJob(job.id),
        note: `Ask how the ${vehicleText(job.vehicle)} is doing after job ${job.jobNumber}.`,
      },
      update: {},
    });
    // "How did we do?" on WhatsApp too, when the customer agreed to it (whether or not they have an email).
    if (rating?.link) {
      await whatsAppToCustomer({ customerId: job.customerId, key: 'rating_request', related: { type: 'JobCard', id: job.id }, values: { vehicle: vehicleText(job.vehicle), record: jobRecord(job.jobNumber), link: rating.link } });
    }
    if (rating?.link && job.customer.email && job.customer.notifyByEmail) {
      const html = renderCustomerRatingRequestEmail({
        customerName: job.customer.fullName, jobNumber: job.jobNumber, vehicleDescription: vehicleText(job.vehicle), ratingUrl: rating.link,
        logoUrl: `${websiteBaseUrl() || portalBaseUrl()}/brand/emblem.png`, companyName: job.customer.organisation.name, branchName: job.branch?.name ?? '',
      });
      await sendEmail(job.customer.email, `How did we do? ${job.jobNumber}`, html, undefined, { observer: false });
    }
  } catch (err) {
    logFailure('Customer care after collection failed', jobCardId, err);
  }
}

/**
 * Low ratings answered since the last run: each opens a complaint (Support
 * centre, kind COMPLAINT, channel RATING, high priority) and a call for front
 * desk today. Returns how many were handled.
 */
export async function handleLowRatings(now: Date = new Date()): Promise<number> {
  const due = await prisma.jobRating.findMany({
    where: { respondedAt: { not: null }, ticketId: null, score: { lte: 3 } },
    take: 50,
    select: {
      id: true, score: true, comment: true, organisationId: true, customerId: true, jobCardId: true,
      customer: { select: { fullName: true, email: true, phone: true } },
      jobCard: { select: { jobNumber: true, branchId: true, vehicleId: true, createdById: true, vehicle: { select: { make: true, model: true, plateNumber: true } } } },
    },
  });
  let handled = 0;
  for (const r of due) {
    if (!isLowRating(r.score)) continue;
    try {
      const queue = await defaultQueue(r.organisationId);
      const words = RATING_WORDS[r.score!] ?? `${r.score}/5`;
      const summary = `Rated job ${r.jobCard.jobNumber} ${r.score}/5 (${words}).${r.comment ? ` They wrote: “${r.comment}”` : ' No comment given.'}`;
      const ticket = await openTicket({
        organisationId: r.organisationId, channel: 'RATING', queue, branchId: r.jobCard.branchId, customerId: r.customerId,
        contactName: r.customer.fullName, contactEmail: r.customer.email, contactPhone: r.customer.phone,
        subject: `Low rating on ${r.jobCard.jobNumber}: ${words}`, summary, priority: r.score! <= 2 ? 'URGENT' : 'HIGH', verified: true,
        kind: 'COMPLAINT', complaintCategory: 'OTHER', jobCardId: r.jobCardId, vehicleId: r.jobCard.vehicleId,
      });
      await prisma.supportReply.create({ data: { ticketId: ticket.id, fromCustomer: true, kind: 'CUSTOMER', visibility: 'PUBLIC', body: summary } });
      await prisma.followUp.upsert({
        where: { dedupeKey: dedupe.lowRating(r.id) },
        create: {
          organisationId: r.organisationId, branchId: r.jobCard.branchId, customerId: r.customerId, vehicleId: r.jobCard.vehicleId, jobCardId: r.jobCardId, ticketId: ticket.id,
          reason: 'LOW_RATING', dueAt: now, assignedToId: ticket.assignedToId ?? r.jobCard.createdById, dedupeKey: dedupe.lowRating(r.id),
          note: `${words} rating for ${vehicleText(r.jobCard.vehicle)}. Call to understand and put it right (complaint ${ticket.number}).`,
        },
        update: {},
      });
      // Claimed last: a failure above leaves the rating for the next run.
      await prisma.jobRating.update({ where: { id: r.id }, data: { ticketId: ticket.id } });
      handled++;
    } catch (err) {
      logFailure('Low rating could not open a complaint', r.id, err);
    }
  }
  return handled;
}

/** Birthdays today and services due within a week: calls on the callback list (once each). */
export async function fillCallbackList(now: Date = new Date()): Promise<{ birthdays: number; serviceDue: number }> {
  const today = lagosDay(now);
  const year = today.slice(0, 4);
  const at10 = lagosAt(today, 10);
  let birthdays = 0;
  let serviceDue = 0;

  const withBirthdays = await prisma.customer.findMany({
    where: { isActive: true, birthDay: { not: null }, birthMonth: { not: null } },
    select: { id: true, organisationId: true, fullName: true, birthDay: true, birthMonth: true },
    take: 5000,
  });
  for (const c of withBirthdays) {
    if (!isBirthdayOn(c.birthDay!, c.birthMonth!, today)) continue;
    const made = await prisma.followUp.upsert({
      where: { dedupeKey: dedupe.birthday(c.id, year) },
      create: { organisationId: c.organisationId, customerId: c.id, reason: 'BIRTHDAY', dueAt: at10, dedupeKey: dedupe.birthday(c.id, year), note: `Wish ${c.fullName} a happy birthday.` },
      update: {},
      select: { createdAt: true },
    });
    if (made.createdAt.getTime() >= now.getTime() - 60_000) birthdays++;
  }

  const workshops = await prisma.branch.findMany({ where: { isActive: true, type: 'WORKSHOP' }, select: { id: true, businessUnit: { select: { organisationId: true } } } });
  for (const b of workshops) {
    const tracked = await loadServiceTracking({ branchId: b.id }).catch((err) => { logFailure('Service tracking for callbacks failed', b.id, err); return []; });
    for (const v of tracked) {
      if (v.lapsed || v.inWorkshop || v.attendedAt || !v.customerId) continue;
      const soon = (v.daysRemaining !== null && v.daysRemaining <= 7) || (v.kmRemaining !== null && v.kmRemaining <= 500);
      if (!soon) continue;
      const dueDay = v.nextServiceDueDate ? lagosDay(v.nextServiceDueDate) : today;
      const made = await prisma.followUp.upsert({
        where: { dedupeKey: dedupe.serviceDue(v.vehicleId, dueDay) },
        create: {
          organisationId: b.businessUnit.organisationId, branchId: b.id, customerId: v.customerId, vehicleId: v.vehicleId, reason: 'SERVICE_DUE', dueAt: at10,
          dedupeKey: dedupe.serviceDue(v.vehicleId, dueDay), note: `${v.vehicleDescription} is due for service${v.nextServiceDueDate ? ` by ${dueDay.split('-').reverse().join('/')}` : ''}. Offer a booking.`,
        },
        update: {},
        select: { createdAt: true },
      });
      if (made.createdAt.getTime() >= now.getTime() - 60_000) serviceDue++;
    }
  }
  return { birthdays, serviceDue };
}
