/**
 * Workshop bookings: which days and time slots are open, how many vehicles
 * of each kind of visit the workshop takes a day, when a booking may be made
 * or moved, and when its reminder goes out. Pure (no database), shared by the
 * customer site (booking) and the staff portal (confirming, moving,
 * reminders). Days are Lagos calendar days, "YYYY-MM-DD"; slots their start
 * time, "08:00".
 */

export const BOOKABLE_JOB_TYPES = ['SERVICE', 'REPAIR', 'SERVICE_AND_REPAIR', 'DIAGNOSTICS', 'SPRAYING', 'CAR_WASH'] as const;
export type BookableJobType = (typeof BOOKABLE_JOB_TYPES)[number];

export const JOB_TYPE_WORDS: Record<BookableJobType, string> = {
  SERVICE: 'Service',
  REPAIR: 'Repair',
  SERVICE_AND_REPAIR: 'Service and repair',
  DIAGNOSTICS: 'Diagnostics',
  SPRAYING: 'Spraying',
  CAR_WASH: 'Car wash',
};

export type AppointmentSettings = {
  /** ISO weekdays the workshop takes bookings: 1 = Monday … 7 = Sunday. */
  openDays: number[];
  /** Slot start times, "HH:MM", in Lagos time. */
  slots: string[];
  /** Vehicles a day, per kind of visit (0: not booked online). */
  capacity: Record<BookableJobType, number>;
  /** How far ahead a booking may be made, in days. */
  maxDaysAhead: number;
  /** Same-day bookings close this many hours before a slot starts. */
  minHoursNotice: number;
};

export const DEFAULT_APPOINTMENT_SETTINGS: AppointmentSettings = {
  openDays: [1, 2, 3, 4, 5, 6],
  slots: ['08:00', '10:00', '12:00', '14:00'],
  capacity: { SERVICE: 8, REPAIR: 6, SERVICE_AND_REPAIR: 4, DIAGNOSTICS: 6, SPRAYING: 2, CAR_WASH: 12 },
  maxDaysAhead: 30,
  minHoursNotice: 2,
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const isBookableJobType = (v: unknown): v is BookableJobType => typeof v === 'string' && (BOOKABLE_JOB_TYPES as readonly string[]).includes(v);

/** The saved settings, checked; anything missing or malformed falls back to the default. */
export function appointmentSettings(raw: unknown): AppointmentSettings {
  const d = DEFAULT_APPOINTMENT_SETTINGS;
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const days = Array.isArray(o.openDays) ? [...new Set(o.openDays.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 7))].sort() : null;
  const slots = Array.isArray(o.slots) ? [...new Set(o.slots.filter((s): s is string => typeof s === 'string' && HHMM.test(s)))].sort() : null;
  const cap = o.capacity && typeof o.capacity === 'object' ? (o.capacity as Record<string, unknown>) : {};
  const capacity = Object.fromEntries(BOOKABLE_JOB_TYPES.map((t) => {
    const n = cap[t];
    return [t, Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 200 ? (n as number) : d.capacity[t]];
  })) as Record<BookableJobType, number>;
  const ahead = Number.isInteger(o.maxDaysAhead) && (o.maxDaysAhead as number) >= 1 && (o.maxDaysAhead as number) <= 90 ? (o.maxDaysAhead as number) : d.maxDaysAhead;
  const notice = Number.isInteger(o.minHoursNotice) && (o.minHoursNotice as number) >= 0 && (o.minHoursNotice as number) <= 48 ? (o.minHoursNotice as number) : d.minHoursNotice;
  return { openDays: days?.length ? days : d.openDays, slots: slots?.length ? slots : d.slots, capacity, maxDaysAhead: ahead, minHoursNotice: notice };
}

/** The Lagos calendar day of an instant, "YYYY-MM-DD" (Lagos is UTC+1 all year). */
export function lagosDayOf(d: Date): string {
  return new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10);
}

/** The instant a Lagos day and "HH:MM" start. */
export function lagosInstant(day: string, hhmm: string): Date {
  return new Date(`${day}T${hhmm}:00+01:00`);
}

/** A Lagos day plus n days. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** ISO weekday of a Lagos day: 1 = Monday … 7 = Sunday. */
export function weekdayOf(day: string): number {
  const w = new Date(`${day}T00:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

/** "Tuesday 24/11/2026" for a Lagos day; with a slot, "Tuesday 24/11/2026, 10:00". */
export function bookingWhen(day: string, slot?: string): string {
  const names = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const [y, m, d] = day.split('-');
  return `${names[weekdayOf(day)]} ${d}/${m}/${y}${slot ? `, ${slot}` : ''}`;
}

/** Why a day and slot cannot be booked for this kind of visit (null: it can, capacity apart). */
export function slotProblem(s: AppointmentSettings, jobType: BookableJobType, day: string, slot: string, now: Date): string | null {
  if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return 'Choose a day.';
  if (!s.slots.includes(slot)) return 'Choose one of the times shown.';
  if (s.capacity[jobType] <= 0) return 'This kind of visit is not booked online. Please call us.';
  if (!s.openDays.includes(weekdayOf(day))) return 'We do not take bookings on that day.';
  const today = lagosDayOf(now);
  if (day < today) return 'That day has passed.';
  if (day > addDays(today, s.maxDaysAhead)) return `Bookings open up to ${s.maxDaysAhead} days ahead.`;
  if (lagosInstant(day, slot).getTime() - now.getTime() < s.minHoursNotice * 3_600_000) return 'That time is too soon. Choose a later time or another day.';
  return null;
}

/** Places left on a day for a kind of visit, given how many live bookings it already has. */
export function placesLeft(s: AppointmentSettings, jobType: BookableJobType, booked: number): number {
  return Math.max(0, s.capacity[jobType] - booked);
}

/** The days a customer may choose from, from today, with places left for this kind of visit. */
export function openDaysFrom(s: AppointmentSettings, jobType: BookableJobType, now: Date, bookedByDay: Record<string, number>): { day: string; left: number }[] {
  const today = lagosDayOf(now);
  const out: { day: string; left: number }[] = [];
  for (let i = 0; i <= s.maxDaysAhead; i += 1) {
    const day = addDays(today, i);
    if (!s.openDays.includes(weekdayOf(day))) continue;
    // A day counts only while at least one of its slots is still far enough ahead.
    if (!s.slots.some((slot) => slotProblem(s, jobType, day, slot, now) === null)) continue;
    out.push({ day, left: placesLeft(s, jobType, bookedByDay[day] ?? 0) });
  }
  return out;
}

/** Bookings that still take a place (a cancelled or missed one frees it). */
export const LIVE_STATUSES = ['REQUESTED', 'CONFIRMED', 'ARRIVED'] as const;

/** Whether a booking can still be confirmed, moved or cancelled. */
export const isOpenBooking = (status: string): boolean => status === 'REQUESTED' || status === 'CONFIRMED';

/**
 * The day-before reminder: due from 10:00 Lagos the day before, for a
 * confirmed booking that has not had one, while the slot is still ahead.
 * A booking made after that time (for tomorrow) is reminded at once.
 */
export function reminderDue(a: { status: string; day: string; slot: string; reminderSentAt: Date | null }, now: Date): boolean {
  if (a.status !== 'CONFIRMED' || a.reminderSentAt) return false;
  const from = lagosInstant(addDays(a.day, -1), '10:00');
  return now.getTime() >= from.getTime() && now.getTime() < lagosInstant(a.day, a.slot).getTime();
}

/** A booking whose day has passed without the vehicle coming in. */
export function isNoShow(a: { status: string; day: string }, now: Date): boolean {
  return isOpenBooking(a.status) && a.day < lagosDayOf(now);
}

/** Nigerian mobile numbers to one form: 0803 304 9194 → 08033049194; +234… kept as digits with the leading 0. */
export function normalisePhone(raw: string): string | null {
  const digits = String(raw ?? '').replace(/[^\d+]/g, '');
  const d = digits.startsWith('+234') ? `0${digits.slice(4)}` : digits.startsWith('234') && digits.length === 13 ? `0${digits.slice(3)}` : digits.replace(/\+/g, '');
  return /^0[789][01]\d{8}$/.test(d) ? d : /^\d{10,15}$/.test(d) ? d : null;
}

/** The customer's message on WhatsApp for a confirmed or reminded booking. */
export function bookingMessage(kind: 'CONFIRMED' | 'REMINDER' | 'MOVED' | 'CANCELLED', o: { name: string; number: string; jobType: BookableJobType; day: string; slot: string; workshop: string; phone: string | null }): string {
  const when = bookingWhen(o.day, o.slot);
  const what = JOB_TYPE_WORDS[o.jobType].toLowerCase();
  const call = o.phone ? ` If you need to change it, call us on ${o.phone}.` : '';
  switch (kind) {
    case 'CONFIRMED': return `Hello ${o.name}, your ${what} booking ${o.number} at ${o.workshop} is confirmed for ${when}. Please come with your vehicle a few minutes early.${call}`;
    case 'REMINDER': return `Hello ${o.name}, a reminder of your ${what} booking ${o.number} at ${o.workshop} tomorrow, ${when}. We look forward to seeing you.${call}`;
    case 'MOVED': return `Hello ${o.name}, your ${what} booking ${o.number} at ${o.workshop} is now for ${when}.${call}`;
    case 'CANCELLED': return `Hello ${o.name}, your ${what} booking ${o.number} at ${o.workshop} for ${when} is cancelled.${call}`;
  }
}
