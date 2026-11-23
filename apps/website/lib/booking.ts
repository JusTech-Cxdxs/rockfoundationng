/**
 * Booking a workshop visit from the website (server only): the days with a
 * place left for a kind of visit, and the booking itself, under the same
 * capacity lock as front desk's (one place can never be taken twice). The
 * rules are shared with the staff portal (@ejo/utils/appointments).
 */
import { prisma, type Prisma } from '@ejo/database';
import {
  appointmentSettings, bookingWhen, JOB_TYPE_WORDS, lagosDayOf, LIVE_STATUSES, openDaysFrom, slotProblem, addDays,
  type AppointmentSettings, type BookableJobType,
} from '@ejo/utils/appointments';

export class BookingProblem extends Error {}

/** The booking rules and the days with places left for this kind of visit. */
export async function bookingDays(organisationId: string, jobType: BookableJobType, now: Date = new Date()): Promise<{ settings: AppointmentSettings; days: { day: string; when: string; left: number }[] }> {
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { appointmentSettings: true } });
  const settings = appointmentSettings(org?.appointmentSettings);
  const today = lagosDayOf(now);
  const counts = await prisma.appointment.groupBy({
    by: ['day'],
    where: { organisationId, jobType, status: { in: [...LIVE_STATUSES] }, day: { gte: today, lte: addDays(today, settings.maxDaysAhead) } },
    _count: { _all: true },
  });
  const booked = Object.fromEntries(counts.map((c) => [c.day, c._count._all]));
  return { settings, days: openDaysFrom(settings, jobType, now, booked).map((d) => ({ ...d, when: bookingWhen(d.day) })) };
}

async function nextNumber(tx: Prisma.TransactionClient): Promise<string> {
  // The same numbering as front desk's bookings (APT-YYYY-NNNNNN, Lagos year).
  const year = new Date(Date.now() + 3_600_000).getUTCFullYear();
  const prefix = `APT-${year}-`;
  const latest = await tx.appointment.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  const n = latest ? Number(latest.number.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(n + 1).padStart(6, '0')}`;
}

export type WebsiteBooking = {
  organisationId: string; jobType: BookableJobType; day: string; slot: string; name: string; phone: string; whatsappPhone: string | null; email: string | null;
  vehicleText: string | null; plateNumber: string | null; note: string | null; customerId: string | null; vehicleId: string | null;
};

/** Books the visit (waiting for front desk to confirm). Throws BookingProblem with the reason. */
export async function bookVisit(b: WebsiteBooking, now: Date = new Date()): Promise<{ number: string; when: string }> {
  // One person cannot hold more than three open bookings (a stray script, or a double tap, cannot fill the diary).
  const open = await prisma.appointment.count({ where: { organisationId: b.organisationId, phone: b.phone, status: { in: ['REQUESTED', 'CONFIRMED'] }, day: { gte: lagosDayOf(now) } } });
  if (open >= 3) throw new BookingProblem('You already have bookings with us. Please call us to change them.');
  for (let attempt = 1; ; attempt += 1) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "organisations" WHERE id = ${b.organisationId} FOR UPDATE`;
        const org = await tx.organisation.findUnique({ where: { id: b.organisationId }, select: { appointmentSettings: true } });
        const s = appointmentSettings(org?.appointmentSettings);
        const problem = slotProblem(s, b.jobType, b.day, b.slot, now);
        if (problem) throw new BookingProblem(problem);
        const taken = await tx.appointment.count({ where: { organisationId: b.organisationId, day: b.day, jobType: b.jobType, status: { in: [...LIVE_STATUSES] } } });
        if (taken >= s.capacity[b.jobType]) throw new BookingProblem(`${bookingWhen(b.day)} has just filled up for ${JOB_TYPE_WORDS[b.jobType].toLowerCase()}. Please choose another day.`);
        return tx.appointment.create({
          data: {
            number: await nextNumber(tx), organisationId: b.organisationId, jobType: b.jobType, day: b.day, slot: b.slot, name: b.name, phone: b.phone,
            whatsappPhone: b.whatsappPhone, email: b.email, vehicleText: b.vehicleText, plateNumber: b.plateNumber, note: b.note,
            customerId: b.customerId, vehicleId: b.vehicleId, source: b.customerId ? 'PORTAL' : 'WEBSITE',
          },
          select: { number: true, day: true, slot: true },
        });
      });
      return { number: created.number, when: bookingWhen(created.day, created.slot) };
    } catch (err) {
      if (attempt < 4 && err && typeof err === 'object' && (err as { code?: string }).code === 'P2002') continue;
      throw err;
    }
  }
}

export type MyBooking = { id: string; number: string; when: string; visit: string; status: string; vehicle: string | null };

/** A signed-in customer's own bookings from today on (their id from the session, never from the address). */
export async function myBookings(customerId: string, now: Date = new Date()): Promise<MyBooking[]> {
  const rows = await prisma.appointment.findMany({
    where: { customerId, day: { gte: lagosDayOf(now) }, status: { in: ['REQUESTED', 'CONFIRMED'] } },
    orderBy: [{ day: 'asc' }, { slot: 'asc' }], take: 10,
    select: { id: true, number: true, day: true, slot: true, jobType: true, status: true, vehicleText: true, vehicle: { select: { make: true, model: true, plateNumber: true } } },
  });
  return rows.map((r) => ({
    id: r.id, number: r.number, when: bookingWhen(r.day, r.slot), visit: JOB_TYPE_WORDS[r.jobType as BookableJobType], status: r.status,
    vehicle: r.vehicle ? [r.vehicle.make, r.vehicle.model, r.vehicle.plateNumber ? `(${r.vehicle.plateNumber})` : null].filter(Boolean).join(' ') : r.vehicleText,
  }));
}
