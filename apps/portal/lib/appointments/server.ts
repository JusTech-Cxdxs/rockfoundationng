/**
 * Workshop bookings on the server: numbering, the capacity check under a
 * lock, the customer's messages (WhatsApp first, email beside it) and the
 * scheduled run that sends the day-before reminders and marks missed
 * bookings. The rules themselves are pure (@ejo/utils/appointments).
 */
import { prisma, type Prisma } from '@ejo/database';
import {
  appointmentSettings, bookingWhen, isNoShow, JOB_TYPE_WORDS, LIVE_STATUSES, lagosDayOf, reminderDue, slotProblem,
  type AppointmentSettings, type BookableJobType,
} from '@ejo/utils/appointments';
import { highestSequence } from '@/lib/recycle-bin/numbers';
import { lagosYear } from '@/lib/utils/format-date';
import { whatsAppToCustomer } from '@/lib/whatsapp/send';
import { sendEmail } from '@/lib/email';
import { renderCustomerBookingEmail } from '@/lib/email-templates/customer-booking';
import { websiteBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';

export class BookingError extends Error {}

export async function settingsFor(organisationId: string): Promise<AppointmentSettings> {
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { appointmentSettings: true } });
  return appointmentSettings(org?.appointmentSettings);
}

async function nextNumber(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = `APT-${lagosYear()}-`;
  const latest = await tx.appointment.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  return `${prefix}${String(highestSequence(prefix, [latest?.number]) + 1).padStart(6, '0')}`;
}

/**
 * Checks the day and slot and that a place is left, with the organisation's
 * row locked so two people can never take the last place at once. Throws a
 * BookingError with the reason. `exceptId`: the booking being moved.
 */
export async function claimPlace(tx: Prisma.TransactionClient, organisationId: string, jobType: BookableJobType, day: string, slot: string, now: Date, exceptId?: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "organisations" WHERE id = ${organisationId} FOR UPDATE`;
  const org = await tx.organisation.findUnique({ where: { id: organisationId }, select: { appointmentSettings: true } });
  const s = appointmentSettings(org?.appointmentSettings);
  const problem = slotProblem(s, jobType, day, slot, now);
  if (problem) throw new BookingError(problem);
  const booked = await tx.appointment.count({ where: { organisationId, day, jobType, status: { in: [...LIVE_STATUSES] }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (booked >= s.capacity[jobType]) throw new BookingError(`${bookingWhen(day)} is fully booked for ${JOB_TYPE_WORDS[jobType].toLowerCase()}. Choose another day.`);
}

export type NewBooking = {
  organisationId: string; branchId?: string | null; customerId?: string | null; vehicleId?: string | null;
  jobType: BookableJobType; day: string; slot: string; name: string; phone: string; whatsappPhone?: string | null; email?: string | null;
  vehicleText?: string | null; plateNumber?: string | null; note?: string | null; source: 'WEBSITE' | 'PORTAL' | 'STAFF'; createdById?: string | null;
  /** Front desk booking for a caller: confirmed at once. */
  confirmedById?: string | null;
};

/** Creates the booking under the capacity lock and gives it its number. */
export async function createBooking(b: NewBooking, now: Date = new Date()): Promise<{ id: string; number: string }> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        await claimPlace(tx, b.organisationId, b.jobType, b.day, b.slot, now);
        const number = await nextNumber(tx);
        return tx.appointment.create({
          data: {
            number, organisationId: b.organisationId, branchId: b.branchId ?? null, customerId: b.customerId ?? null, vehicleId: b.vehicleId ?? null,
            jobType: b.jobType, day: b.day, slot: b.slot, name: b.name, phone: b.phone, whatsappPhone: b.whatsappPhone ?? null, email: b.email ?? null,
            vehicleText: b.vehicleText ?? null, plateNumber: b.plateNumber ?? null, note: b.note ?? null, source: b.source, createdById: b.createdById ?? null,
            ...(b.confirmedById ? { status: 'CONFIRMED' as const, confirmedAt: now, confirmedById: b.confirmedById } : {}),
          },
          select: { id: true, number: true },
        });
      });
    } catch (err) {
      // Two bookings numbered at the same moment: the second takes the next number.
      if (attempt < 4 && err && typeof err === 'object' && (err as { code?: string }).code === 'P2002') continue;
      throw err;
    }
  }
}

type BookingForMessage = { id: string; number: string; organisationId: string; customerId: string | null; jobType: BookableJobType; day: string; slot: string; name: string; email: string | null };

/** The customer's message about their booking: WhatsApp (registered customers who agreed) and email. Never throws. */
export async function tellCustomer(kind: 'CONFIRMED' | 'REMINDER' | 'MOVED' | 'CANCELLED', a: BookingForMessage): Promise<{ whatsapp: string; email: boolean }> {
  let whatsapp = 'NOT_SENT';
  let email = false;
  try {
    const org = await prisma.organisation.findUnique({ where: { id: a.organisationId }, select: { name: true, hotlines: true } });
    const visit = `a ${JOB_TYPE_WORDS[a.jobType].toLowerCase()}`;
    const when = bookingWhen(a.day, a.slot);
    if (kind !== 'CANCELLED' && a.customerId) {
      const values = { number: a.number, visit, when };
      const related = { type: 'Appointment', id: a.id };
      const r = kind === 'REMINDER'
        ? await whatsAppToCustomer({ customerId: a.customerId, key: 'booking_reminder', values, related })
        : await whatsAppToCustomer({ customerId: a.customerId, key: 'booking_confirmed', values, related });
      whatsapp = r.status;
    }
    if (a.email) {
      const html = renderCustomerBookingEmail({ kind, customerName: a.name, number: a.number, visit: JOB_TYPE_WORDS[a.jobType], when, companyName: org?.name ?? 'The workshop', phone: org?.hotlines[0] ?? null, logoUrl: `${websiteBaseUrl()}/brand/emblem.png` });
      const subject = kind === 'REMINDER' ? `Reminder: your booking tomorrow — ${a.number}` : kind === 'CANCELLED' ? `Your booking ${a.number} is cancelled` : kind === 'MOVED' ? `Your booking ${a.number} has a new time` : `Your booking ${a.number} is confirmed`;
      await sendEmail(a.email, subject, html, undefined, { observer: false });
      email = true;
    }
  } catch (err) {
    logFailure('Booking message to the customer failed', a.number, kind, err);
  }
  return { whatsapp, email };
}

const MESSAGE_SELECT = { id: true, number: true, organisationId: true, customerId: true, jobType: true, day: true, slot: true, name: true, email: true, status: true, reminderSentAt: true } as const;

/**
 * The scheduled run (every few minutes, /api/cron/reminders): day-before
 * reminders for confirmed bookings, then bookings whose day has passed
 * without the vehicle marked as no-shows. Each reminder is claimed before it
 * is sent, so two runs never send it twice.
 */
export async function runBookingReminders(now: Date = new Date()): Promise<{ reminded: number; noShows: number }> {
  const today = lagosDayOf(now);
  const tomorrow = lagosDayOf(new Date(now.getTime() + 86_400_000));
  const candidates = await prisma.appointment.findMany({ where: { status: 'CONFIRMED', reminderSentAt: null, day: { in: [today, tomorrow] } }, take: 200, select: MESSAGE_SELECT });
  let reminded = 0;
  for (const a of candidates) {
    if (!reminderDue(a, now)) continue;
    const claim = await prisma.appointment.updateMany({ where: { id: a.id, reminderSentAt: null, status: 'CONFIRMED' }, data: { reminderSentAt: now } });
    if (!claim.count) continue;
    await tellCustomer('REMINDER', a as BookingForMessage);
    reminded += 1;
  }
  const stale = await prisma.appointment.findMany({ where: { status: { in: ['REQUESTED', 'CONFIRMED'] }, day: { lt: today } }, take: 500, select: { id: true, status: true, day: true } });
  const missed = stale.filter((a) => isNoShow(a, now)).map((a) => a.id);
  const noShows = missed.length ? (await prisma.appointment.updateMany({ where: { id: { in: missed }, status: { in: ['REQUESTED', 'CONFIRMED'] } }, data: { status: 'NO_SHOW' } })).count : 0;
  return { reminded, noShows };
}
