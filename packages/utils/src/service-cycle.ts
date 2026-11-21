/**
 * The next-service maths, shared by the staff portal and the customer
 * portal so both always show the same due point. Pure: no database, no
 * framework.
 */

export type NextServiceDue = { dueOdometer: number | null; dueDate: Date | null };

/**
 * Next service due by distance or date, whichever comes first.
 * Called once, when the Primary Service (engine oil, in practice) is
 * confirmed done on a visit; other work on the same visit never moves it.
 *
 * Either bound is null when the organisation has not configured that interval.
 */
export function calculateNextServiceDue(
  primaryServiceMileage: number | null,
  primaryServiceDate: Date,
  intervalKm: number | null,
  intervalDays: number | null,
): NextServiceDue {
  const dueOdometer = intervalKm !== null && primaryServiceMileage !== null ? primaryServiceMileage + intervalKm : null;
  let dueDate: Date | null = null;
  if (intervalDays !== null) {
    const candidate = new Date(primaryServiceDate);
    candidate.setDate(candidate.getDate() + intervalDays);
    dueDate = candidate;
  }
  return { dueOdometer, dueDate };
}

/** Lagos is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** Saturday or Sunday by the calendar in Lagos — not UTC, so a late
 * Friday night in UTC is never mistaken for Saturday. */
export function isLagosWeekend(date: Date): boolean {
  const day = new Date(date.getTime() + LAGOS_OFFSET_MS).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * The same moment if it falls on a working day (Mon–Fri, Lagos), otherwise
 * the following Monday at the same time, so reminders and due dates land
 * on days the team is in.
 */
export function onOrAfterWorkingDay(date: Date): Date {
  const d = new Date(date.getTime());
  while (isLagosWeekend(d)) d.setTime(d.getTime() + 24 * 60 * 60 * 1000);
  return d;
}

/** Where the interval comes from: the vehicle's own (manufacturer) interval, else the organisation's default. */
export type ServiceIntervalSource = {
  vehicle: { serviceIntervalKm: number | null; serviceIntervalDays: number | null };
  organisation: { primaryServiceIntervalKm: number | null; primaryServiceIntervalDays: number | null };
};

/** The anchor + prediction one completed visit establishes. */
export function serviceCycleFrom(odometer: number | null, completedAt: Date, source: ServiceIntervalSource) {
  // The vehicle's own interval, when set, overrides the organisation default.
  const intervalKm = source.vehicle.serviceIntervalKm ?? source.organisation.primaryServiceIntervalKm;
  const intervalDays = source.vehicle.serviceIntervalDays ?? source.organisation.primaryServiceIntervalDays;
  const next = calculateNextServiceDue(odometer, completedAt, intervalKm, intervalDays);
  return {
    primaryServiceMileage: odometer,
    primaryServiceDate: completedAt,
    nextServiceDueOdometer: next.dueOdometer,
    // A weekend due date rolls to the Monday.
    nextServiceDueDate: next.dueDate ? onOrAfterWorkingDay(next.dueDate) : null,
  };
}
