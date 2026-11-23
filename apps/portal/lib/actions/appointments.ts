'use server';

/**
 * Workshop bookings for front desk: the day's list, booking for a caller,
 * confirming, moving and cancelling, the settings (Owner), and the link that
 * opens the Job Card when the vehicle arrives. Every read and write is fenced
 * to the person's organisation; every change is in the audit trail and
 * tells the customer (WhatsApp first, email beside it).
 */
import { prisma, type Prisma } from '@ejo/database';
import {
  appointmentSettings, bookingMessage, bookingWhen, isBookableJobType, isOpenBooking, JOB_TYPE_WORDS, lagosDayOf, LIVE_STATUSES, normalisePhone, addDays,
  BOOKABLE_JOB_TYPES, type AppointmentSettings, type BookableJobType,
} from '@ejo/utils/appointments';
import { whatsAppShareUrlFor } from '@ejo/utils/whatsapp';
import { allows, authorize, myOrganisationId, NOT_AVAILABLE } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { BookingError, claimPlace, createBooking, settingsFor, tellCustomer } from '@/lib/appointments/server';

const VIEW = 'workshop.appointment.view' as const;
const MANAGE = 'workshop.appointment.manage' as const;
const ID = /^[a-z0-9]{20,40}$/;
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

async function org(): Promise<string> {
  const id = await myOrganisationId();
  if (!id) throw new BookingError(NOT_AVAILABLE);
  return id;
}

export type AppointmentRow = {
  id: string; number: string; status: string; source: string; jobType: BookableJobType; visit: string; day: string; slot: string; when: string;
  name: string; phone: string; email: string | null; vehicle: string | null; note: string | null;
  customer: { id: string; name: string } | null; jobCard: { id: string; number: string } | null;
  confirmedAt: Date | null; reminderSentAt: Date | null; createdAt: Date; whatsAppUrl: string | null; open: boolean;
};

const ROW_SELECT = {
  id: true, number: true, status: true, source: true, jobType: true, day: true, slot: true, name: true, phone: true, whatsappPhone: true, email: true,
  vehicleText: true, plateNumber: true, note: true, confirmedAt: true, reminderSentAt: true, createdAt: true,
  customer: { select: { id: true, fullName: true } }, vehicle: { select: { make: true, model: true, plateNumber: true } }, jobCard: { select: { id: true, jobNumber: true } },
} satisfies Prisma.AppointmentSelect;
type Raw = Prisma.AppointmentGetPayload<{ select: typeof ROW_SELECT }>;

function toRow(a: Raw, workshop: string, phone: string | null): AppointmentRow {
  const jobType = a.jobType as BookableJobType;
  const vehicle = a.vehicle ? [a.vehicle.make, a.vehicle.model].filter(Boolean).join(' ') + (a.vehicle.plateNumber ? ` (${a.vehicle.plateNumber})` : '') : [a.vehicleText, a.plateNumber ? `(${a.plateNumber})` : null].filter(Boolean).join(' ') || null;
  const kind = a.status === 'CANCELLED' ? 'CANCELLED' : a.status === 'CONFIRMED' ? 'CONFIRMED' : null;
  const text = kind ? bookingMessage(kind, { name: a.name.split(' ')[0] ?? a.name, number: a.number, jobType, day: a.day, slot: a.slot, workshop, phone }) : null;
  return {
    id: a.id, number: a.number, status: a.status, source: a.source, jobType, visit: JOB_TYPE_WORDS[jobType], day: a.day, slot: a.slot, when: bookingWhen(a.day, a.slot),
    name: a.name, phone: a.phone, email: a.email, vehicle, note: a.note,
    customer: a.customer ? { id: a.customer.id, name: a.customer.fullName } : null, jobCard: a.jobCard ? { id: a.jobCard.id, number: a.jobCard.jobNumber } : null,
    confirmedAt: a.confirmedAt, reminderSentAt: a.reminderSentAt, createdAt: a.createdAt, open: isOpenBooking(a.status),
    whatsAppUrl: text ? whatsAppShareUrlFor([a.whatsappPhone, a.phone], text) : null,
  };
}

export type AppointmentDay = { day: string; when: string; rows: AppointmentRow[]; booked: Record<BookableJobType, number>; settings: AppointmentSettings; canManage: boolean; waiting: number };

/** One day's bookings (default today, Lagos), with places taken per kind of visit, and how many are waiting to be confirmed on any day. */
export async function getAppointmentDay(dayRaw?: string): Promise<AppointmentDay> {
  await authorize(VIEW, undefined, 'getAppointmentDay');
  const organisationId = await org();
  const day = dayRaw && /^\d{4}-\d{2}-\d{2}$/.test(dayRaw) ? dayRaw : lagosDayOf(new Date());
  const [o, list, waiting, canManage] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true, hotlines: true, appointmentSettings: true } }),
    prisma.appointment.findMany({ where: { organisationId, day }, orderBy: [{ slot: 'asc' }, { createdAt: 'asc' }], take: 300, select: ROW_SELECT }),
    prisma.appointment.count({ where: { organisationId, status: 'REQUESTED', day: { gte: lagosDayOf(new Date()) } } }),
    allows(MANAGE),
  ]);
  const booked = Object.fromEntries(BOOKABLE_JOB_TYPES.map((t) => [t, list.filter((a) => a.jobType === t && (LIVE_STATUSES as readonly string[]).includes(a.status)).length])) as Record<BookableJobType, number>;
  return { day, when: bookingWhen(day), rows: list.map((a) => toRow(a, o?.name ?? 'the workshop', o?.hotlines[0] ?? null)), booked, settings: appointmentSettings(o?.appointmentSettings), canManage, waiting };
}

/** Bookings waiting for front desk to confirm, soonest first. */
export async function listWaitingAppointments(): Promise<AppointmentRow[]> {
  await authorize(VIEW, undefined, 'listWaitingAppointments');
  const organisationId = await org();
  const [o, list] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true, hotlines: true } }),
    prisma.appointment.findMany({ where: { organisationId, status: 'REQUESTED', day: { gte: lagosDayOf(new Date()) } }, orderBy: [{ day: 'asc' }, { slot: 'asc' }], take: 100, select: ROW_SELECT }),
  ]);
  return list.map((a) => toRow(a, o?.name ?? 'the workshop', o?.hotlines[0] ?? null));
}

async function openBooking(id: string, organisationId: string) {
  const a = ID.test(id) ? await prisma.appointment.findFirst({ where: { id, organisationId }, select: { id: true, number: true, status: true, organisationId: true, customerId: true, jobType: true, day: true, slot: true, name: true, email: true } }) : null;
  if (!a) throw new BookingError(NOT_AVAILABLE);
  if (!isOpenBooking(a.status)) throw new BookingError('This booking is already closed. Refresh the page.');
  return { ...a, jobType: a.jobType as BookableJobType };
}

/** Front desk confirms a booking; the customer is told. */
export async function confirmAppointment(id: string): Promise<{ whatsapp: string; email: boolean }> {
  await authorize(MANAGE, undefined, 'confirmAppointment');
  const me = await requireUser();
  const organisationId = await org();
  const a = await openBooking(id, organisationId);
  if (a.status === 'CONFIRMED') throw new BookingError('This booking is already confirmed.');
  const done = await prisma.appointment.updateMany({ where: { id: a.id, organisationId, status: 'REQUESTED' }, data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedById: me.id } });
  if (!done.count) throw new BookingError('Someone else changed this booking a moment ago. Refresh the page.');
  await writeAuditLog({ userId: me.id, action: 'appointment.confirmed', entityType: 'Appointment', entityId: a.id, organisationId, metadata: { number: a.number, day: a.day, slot: a.slot } });
  return tellCustomer('CONFIRMED', a);
}

/** Moves a booking to another day or time (a place must be left there); it stays confirmed or becomes confirmed, and the customer is told. */
export async function rescheduleAppointment(id: string, dayRaw: string, slotRaw: string): Promise<void> {
  await authorize(MANAGE, undefined, 'rescheduleAppointment');
  const me = await requireUser();
  const organisationId = await org();
  const a = await openBooking(id, organisationId);
  const day = clean(dayRaw, 10);
  const slot = clean(slotRaw, 5);
  if (day === a.day && slot === a.slot) throw new BookingError('Choose a different day or time.');
  await prisma.$transaction(async (tx) => {
    await claimPlace(tx, organisationId, a.jobType, day, slot, new Date(), a.id);
    const moved = await tx.appointment.updateMany({
      where: { id: a.id, organisationId, status: { in: ['REQUESTED', 'CONFIRMED'] } },
      data: { day, slot, status: 'CONFIRMED', confirmedAt: new Date(), confirmedById: me.id, rescheduledAt: new Date(), rescheduledCount: { increment: 1 }, reminderSentAt: null },
    });
    if (!moved.count) throw new BookingError('Someone else changed this booking a moment ago. Refresh the page.');
  });
  await writeAuditLog({ userId: me.id, action: 'appointment.rescheduled', entityType: 'Appointment', entityId: a.id, organisationId, metadata: { number: a.number, from: `${a.day} ${a.slot}`, to: `${day} ${slot}` } });
  await tellCustomer('MOVED', { ...a, day, slot });
}

/** Cancels a booking with the reason; its place is freed and the customer is told. */
export async function cancelAppointment(id: string, reasonRaw: string): Promise<void> {
  await authorize(MANAGE, undefined, 'cancelAppointment');
  const me = await requireUser();
  const organisationId = await org();
  const a = await openBooking(id, organisationId);
  const reason = clean(reasonRaw, 300);
  if (reason.length < 2) throw new BookingError('Say why the booking is cancelled.');
  const done = await prisma.appointment.updateMany({ where: { id: a.id, organisationId, status: { in: ['REQUESTED', 'CONFIRMED'] } }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: 'STAFF', cancelReason: reason } });
  if (!done.count) throw new BookingError('Someone else changed this booking a moment ago. Refresh the page.');
  await writeAuditLog({ userId: me.id, action: 'appointment.cancelled', entityType: 'Appointment', entityId: a.id, organisationId, metadata: { number: a.number, reason } });
  await tellCustomer('CANCELLED', a);
}

/** Front desk books for a caller or walk-in: confirmed at once. A registered customer and vehicle when chosen, else the name and phone. */
export async function bookForCustomer(input: { customerId?: string; vehicleId?: string; name?: string; phone?: string; jobType: string; day: string; slot: string; note?: string }): Promise<{ id: string; number: string }> {
  await authorize(MANAGE, undefined, 'bookForCustomer');
  const me = await requireUser();
  const organisationId = await org();
  if (!isBookableJobType(input.jobType)) throw new BookingError('Choose what the visit is for.');
  const customer = input.customerId && ID.test(input.customerId)
    ? await prisma.customer.findFirst({ where: { id: input.customerId, organisationId }, select: { id: true, fullName: true, phone: true, whatsappPhone: true, email: true } })
    : null;
  if (input.customerId && !customer) throw new BookingError(NOT_AVAILABLE);
  const vehicle = customer && input.vehicleId && ID.test(input.vehicleId) ? await prisma.customerVehicle.findFirst({ where: { id: input.vehicleId, customerId: customer.id }, select: { id: true } }) : null;
  const name = customer?.fullName ?? clean(input.name, 120);
  const phone = normalisePhone(customer?.phone ?? input.phone ?? '');
  if (name.length < 2) throw new BookingError('Enter the customer’s name, or choose them.');
  if (!phone) throw new BookingError('Enter a mobile number we can call, e.g. 0803 304 9194.');
  const b = await createBooking({
    organisationId, customerId: customer?.id ?? null, vehicleId: vehicle?.id ?? null, jobType: input.jobType, day: clean(input.day, 10), slot: clean(input.slot, 5),
    name, phone, whatsappPhone: customer?.whatsappPhone ?? null, email: customer?.email ?? null, note: clean(input.note, 500) || null, source: 'STAFF', createdById: me.id, confirmedById: me.id,
  });
  await writeAuditLog({ userId: me.id, action: 'appointment.booked', entityType: 'Appointment', entityId: b.id, organisationId, metadata: { number: b.number, day: input.day, slot: input.slot, jobType: input.jobType, source: 'STAFF' } });
  const full = await prisma.appointment.findUniqueOrThrow({ where: { id: b.id }, select: { id: true, number: true, organisationId: true, customerId: true, jobType: true, day: true, slot: true, name: true, email: true } });
  await tellCustomer('CONFIRMED', { ...full, jobType: full.jobType as BookableJobType });
  return b;
}

/** Settings → Appointments (the Owner): days open, slots and the vehicles a day per kind of visit. */
export async function saveAppointmentSettings(input: { openDays: number[]; slots: string[]; capacity: Record<string, number>; maxDaysAhead: number; minHoursNotice: number }): Promise<AppointmentSettings> {
  await authorize('admin.organisation.manage', undefined, 'saveAppointmentSettings');
  const me = await requireUser();
  const organisationId = await org();
  const s = appointmentSettings(input);
  if (!input.slots.length || !s.slots.length) throw new BookingError('Keep at least one time slot, as HH:MM (e.g. 08:00).');
  if (!input.openDays.length) throw new BookingError('Choose at least one day the workshop takes bookings.');
  await prisma.organisation.update({ where: { id: organisationId }, data: { appointmentSettings: s as unknown as Prisma.InputJsonValue } });
  await writeAuditLog({ userId: me.id, action: 'appointment.settings_updated', entityType: 'Organisation', entityId: organisationId, organisationId, metadata: { openDays: s.openDays, slots: s.slots, capacity: s.capacity, maxDaysAhead: s.maxDaysAhead, minHoursNotice: s.minHoursNotice } });
  return s;
}

/** The settings as saved (or the defaults), for the settings page. */
export async function getAppointmentSettings(): Promise<AppointmentSettings> {
  await authorize(VIEW, undefined, 'getAppointmentSettings');
  return settingsFor(await org());
}

/** Bookings for the next days, for the front desk's week view: day → live bookings. */
export async function upcomingCounts(days = 7): Promise<{ day: string; when: string; count: number }[]> {
  await authorize(VIEW, undefined, 'upcomingCounts');
  const organisationId = await org();
  const today = lagosDayOf(new Date());
  const last = addDays(today, days - 1);
  const rows = await prisma.appointment.groupBy({ by: ['day'], where: { organisationId, day: { gte: today, lte: last }, status: { in: [...LIVE_STATUSES] } }, _count: { _all: true } });
  const by = new Map(rows.map((r) => [r.day, r._count._all]));
  return Array.from({ length: days }, (_, i) => addDays(today, i)).map((day) => ({ day, when: bookingWhen(day), count: by.get(day) ?? 0 }));
}
