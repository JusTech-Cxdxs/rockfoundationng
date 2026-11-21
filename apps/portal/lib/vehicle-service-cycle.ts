import { prisma, type Prisma } from '@ejo/database';
import { serviceCycleFrom } from '@ejo/utils';
import { addWorkingDays } from '@/lib/utils/working-days';

/**
 * The next-service clock. A Job Card opened as a service (isService) starts
 * the count once checked out, anchored on its check-in mileage and checkout
 * date. The interval is the vehicle's own (manufacturer) interval when set,
 * otherwise the organisation's default. Vehicles not yet serviced here are
 * tracked from their last service brought in from the old system.
 *
 * Not a 'use server' file: callers (loaders, the cron) authorise first.
 */

type IntervalSource = {
  vehicle: { serviceIntervalKm: number | null; serviceIntervalDays: number | null };
  branch: { businessUnit: { organisation: { primaryServiceIntervalKm: number | null; primaryServiceIntervalDays: number | null } } };
};

/** The anchor + prediction one completed service establishes. The maths is
 * shared with the customer portal (@ejo/utils), so both show the same due point. */
export function computeServiceCycle(odometer: number | null, completedAt: Date, source: IntervalSource) {
  // The vehicle's own interval, when set, overrides the organisation default;
  // a weekend due date rolls to the Monday.
  return serviceCycleFrom(odometer, completedAt, { vehicle: source.vehicle, organisation: source.branch.businessUnit.organisation });
}

/** The open Job Card a vehicle is currently in the workshop on. */
export type WorkshopVisit = { kind: 'JOB_CARD'; id: string; number: string; status: string };

const CYCLE_SOURCE_SELECT = {
  vehicle: { select: { serviceIntervalKm: true, serviceIntervalDays: true } },
  branch: { select: { businessUnit: { select: { organisation: { select: { primaryServiceIntervalKm: true, primaryServiceIntervalDays: true } } } } } },
} as const;

/**
 * Vehicles currently in the workshop (an open Job Card), with the visit.
 * Such vehicles are still tracked and shown, but never sent a "service due"
 * reminder.
 */
export async function workshopVisitsForVehicles(vehicleIds: string[]): Promise<Map<string, WorkshopVisit>> {
  const out = new Map<string, WorkshopVisit>();
  if (vehicleIds.length === 0) return out;
  const jobCards = await prisma.jobCard.findMany({
    where: { vehicleId: { in: vehicleIds }, status: { notIn: ['CLOSED', 'CHECKED_OUT', 'CANCELLED'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, vehicleId: true, jobNumber: true, status: true },
  });
  for (const j of jobCards) if (!out.has(j.vehicleId)) out.set(j.vehicleId, { kind: 'JOB_CARD', id: j.id, number: j.jobNumber, status: j.status });
  return out;
}

export async function vehiclesCurrentlyInWorkshop(vehicleIds: string[]): Promise<Set<string>> {
  return new Set((await workshopVisitsForVehicles(vehicleIds)).keys());
}

// ── One shared due calculation ────────────────────────────────────────
// Used by the vehicle page, custody, the Service Tracker and the
// reminder engine alike, so they can never disagree.

export const DUE_SOON_KM = 1000;
export const DUE_SOON_DAYS = 30;

export type ServiceDueStatus = 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE';

export function serviceDueStatus(nextServiceDueOdometer: number | null, nextServiceDueDate: Date | null, currentMileage: number | null, now: Date = new Date()) {
  const kmRemaining = nextServiceDueOdometer !== null && currentMileage !== null ? nextServiceDueOdometer - currentMileage : null;
  const daysRemaining = nextServiceDueDate !== null ? Math.ceil((new Date(nextServiceDueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const overdue = (kmRemaining !== null && kmRemaining <= 0) || (daysRemaining !== null && daysRemaining <= 0);
  const dueSoon = (kmRemaining !== null && kmRemaining <= DUE_SOON_KM) || (daysRemaining !== null && daysRemaining <= DUE_SOON_DAYS);
  const status: ServiceDueStatus = overdue ? 'OVERDUE' : dueSoon ? 'DUE_SOON' : 'ON_TRACK';
  return { kmRemaining, daysRemaining, status };
}

/** Working days (Mon–Fri) between one service reminder and the next for
 * the same prediction. The "due soon" window opens 30 days (about 22
 * working days) before the due date, so with this spacing the 1st, 2nd
 * and 3rd reminders all land before the vehicle is actually due. */
export const REMINDER_SPACING_WORKING_DAYS = 7;

/**
 * Which reminder is due now for one prediction. Reminders are
 * semi-automatic: this decides when and which stage; a person clicks Send.
 *   Due soon: 1st (friendly) when the vehicle becomes due soon, then 2nd
 *   (follow-up) and 3rd (due), each 7 working days after the last.
 *   Overdue: the overdue reminder (4) straight away, repeatable every 7
 *   working days. If none is due yet, returns when the next one is (always
 *   a working day).
 */
export function nextReminderStage(
  status: ServiceDueStatus,
  lastStage: number | null,
  lastSentAt: Date | null,
  now: Date = new Date(),
): { stage: 1 | 2 | 3 | 4 | null; dueFrom: Date | null } {
  if (status === 'ON_TRACK') return { stage: null, dueFrom: null };
  // Working days (Mon–Fri).
  const gapPassedAt = lastSentAt ? addWorkingDays(new Date(lastSentAt), REMINDER_SPACING_WORKING_DAYS) : null;
  const gapPassed = !gapPassedAt || gapPassedAt <= now;
  if (status === 'OVERDUE') {
    if (lastStage === null || lastStage < 4) return { stage: 4, dueFrom: null };
    return gapPassed ? { stage: 4, dueFrom: null } : { stage: null, dueFrom: gapPassedAt };
  }
  if (lastStage === null) return { stage: 1, dueFrom: null };
  if (!gapPassed) return { stage: null, dueFrom: gapPassedAt };
  return { stage: lastStage === 1 ? 2 : 3, dueFrom: null };
}

/** Overdue by more than this many days = lapsed: no more reminders.
 * Tracking restarts when the vehicle next completes a service. */
export const LAPSED_AFTER_DAYS_OVERDUE = 365;

export type TrackedVehicle = {
  vehicleId: string;
  vehicleType: 'PASSENGER' | 'COMMERCIAL' | null;
  /** Overdue for more than a year — no reminders; listed as Lapsed. */
  lapsed: boolean;
  vehicleDescription: string;
  plateNumber: string | null;
  currentMileage: number | null;
  customerId?: string;
  customerName: string;
  customerEmail: string | null;
  /** The customer's phones, for "Send on WhatsApp" (the first usable one is used). */
  customerPhone: string | null;
  customerAltPhone: string | null;
  /** An organisation (a fleet): the message greets the company, not a first name. */
  customerIsOrganisation: boolean;
  /** The completed service whose prediction is current: a service Job Card (id "jc:<id>"), or a job brought in from the old system (id "hist:<id>"). */
  lastService: { id: string; serviceNumber: string; date: Date | null; mileage: number | null; source: 'EJO' | 'OLD_SYSTEM' };
  nextServiceDueOdometer: number | null;
  nextServiceDueDate: Date | null;
  kmRemaining: number | null;
  daysRemaining: number | null;
  status: ServiceDueStatus;
  /** Staff marked this prediction handled (Attend To). */
  attendedAt: Date | null;
  /** Currently back in the workshop — tracked, but never reminded. */
  inWorkshop: WorkshopVisit | null;
  reminders: { sentThisCycle: number; lastSentAt: Date | null; lastStage: number | null; lastSentByName: string | null };
  /** The reminder a person can send right now (null = none due), or when
   * the next one becomes due. Never set while in the workshop or once
   * attended to. */
  reminderDue: { stage: 1 | 2 | 3 | 4 } | null;
  nextReminderFrom: Date | null;
};

/**
 * Service jobs brought in from the old system, as service anchors for
 * vehicles not yet serviced here: the latest closed one per vehicle, with the
 * interval rules of computeServiceCycle. Shaped like a Job Card anchor so the
 * tracker treats both alike; the id is "hist:<job id>".
 */
async function historyAnchors(scope: { branchId?: string; vehicleId?: string }, skip: Set<string>) {
  const jobs = await prisma.historicalJob.findMany({
    where: {
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(scope.vehicleId ? { vehicleId: scope.vehicleId } : { vehicleId: { not: null } }),
      kind: 'SERVICE', status: 'CLOSED', voidedAt: null,
    },
    orderBy: [{ completedAt: 'desc' }, { openedAt: 'desc' }],
    select: { id: true, vehicleId: true, jobNumber: true, completedAt: true, openedAt: true, mileage: true, attendedAt: true, branchId: true, organisationId: true },
  });
  const latest = new Map<string, (typeof jobs)[number]>();
  for (const j of jobs) if (j.vehicleId && !skip.has(j.vehicleId) && !latest.has(j.vehicleId)) latest.set(j.vehicleId, j);
  if (!latest.size) return [];
  const [vehicles, orgs] = await Promise.all([
    prisma.customerVehicle.findMany({ where: { id: { in: [...latest.keys()] } }, select: { id: true, make: true, model: true, year: true, plateNumber: true, mileage: true, vehicleType: true, serviceIntervalKm: true, serviceIntervalDays: true, customer: { select: { id: true, fullName: true, email: true, phone: true, altPhone: true, customerType: true } } } }),
    prisma.organisation.findMany({ where: { id: { in: [...new Set([...latest.values()].map((j) => j.organisationId))] } }, select: { id: true, primaryServiceIntervalKm: true, primaryServiceIntervalDays: true } }),
  ]);
  const orgOf = new Map(orgs.map((o) => [o.id, o]));
  const out = [];
  for (const [vehicleId, j] of latest) {
    const v = vehicles.find((x) => x.id === vehicleId);
    const org = orgOf.get(j.organisationId);
    if (!v || !org) continue;
    const at = j.completedAt ?? j.openedAt;
    const cycle = computeServiceCycle(j.mileage, at, { vehicle: v, branch: { businessUnit: { organisation: org } } });
    if (cycle.nextServiceDueOdometer === null && cycle.nextServiceDueDate === null) continue;
    out.push({
      id: `hist:${j.id}`, vehicleId, serviceNumber: `${j.jobNumber} (old system)`, attendedAt: j.attendedAt,
      primaryServiceDate: cycle.primaryServiceDate as Date | null, primaryServiceMileage: cycle.primaryServiceMileage, nextServiceDueOdometer: cycle.nextServiceDueOdometer, nextServiceDueDate: cycle.nextServiceDueDate,
      customer: v.customer, vehicle: { make: v.make, model: v.model, year: v.year, plateNumber: v.plateNumber, mileage: v.mileage, vehicleType: v.vehicleType },
    });
  }
  return out;
}

/** The id of a service anchor brought in from the old system: "hist:<id>" → the HistoricalJob id, else null. */
export const historyAnchorId = (serviceId: string): string | null => (serviceId.startsWith('hist:') ? serviceId.slice(5) : null);

/**
 * Job Cards that start the next-service count: opened as a service, checked
 * out (the vehicle left), never an approved cancellation (a hand-back is no
 * service).
 */
export const SERVICE_JOB_CARD_WHERE = {
  isService: true,
  status: { in: ['CHECKED_OUT', 'CLOSED'] },
  checkedOutAt: { not: null },
  cancellationRequests: { none: { status: 'APPROVED' } },
} satisfies Prisma.JobCardWhereInput;

/** The id of a service anchor that is a service Job Card: "jc:<id>" → the JobCard id, else null. */
export const jobCardAnchorId = (serviceId: string): string | null => (serviceId.startsWith('jc:') ? serviceId.slice(3) : null);

/** Where a service anchor is shown: an old-system job on the vehicle's page, a service Job Card on its own page. */
export function serviceAnchorHref(anchor: { vehicleId: string; lastService: { id: string; source: 'EJO' | 'OLD_SYSTEM' } }): string {
  const jc = jobCardAnchorId(anchor.lastService.id);
  return jc ? `/workshop/job-cards/${jc}` : `/workshop/vehicles/${anchor.vehicleId}/edit#before-ejo`;
}

/** The next-service point one service Job Card sets (null when it does not qualify, or no interval is configured). */
export async function serviceJobCardCycle(jobCardId: string) {
  const jc = await prisma.jobCard.findFirst({
    where: { id: jobCardId, ...SERVICE_JOB_CARD_WHERE },
    select: { mileageAtCheckIn: true, checkedOutAt: true, ...CYCLE_SOURCE_SELECT },
  });
  if (!jc?.checkedOutAt) return null;
  const cycle = computeServiceCycle(jc.mileageAtCheckIn, jc.checkedOutAt, jc);
  return cycle.nextServiceDueOdometer === null && cycle.nextServiceDueDate === null ? null : cycle;
}

/**
 * Job Cards opened as a service (SERVICE_JOB_CARD_WHERE), as service anchors:
 * the latest checked-out one per vehicle, anchored on its check-in mileage and
 * checkout date, with the interval rules of computeServiceCycle. The id is
 * "jc:<job card id>" and "attended" is the Job Card's serviceAttendedAt.
 * Fenced by branch, or one vehicle.
 */
async function jobCardAnchors(scope: { branchId?: string; vehicleId?: string }) {
  const cards = await prisma.jobCard.findMany({
    where: {
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(scope.vehicleId ? { vehicleId: scope.vehicleId } : {}),
      ...SERVICE_JOB_CARD_WHERE,
    },
    orderBy: { checkedOutAt: 'desc' },
    select: {
      id: true,
      vehicleId: true,
      jobNumber: true,
      mileageAtCheckIn: true,
      checkedOutAt: true,
      serviceAttendedAt: true,
      customer: { select: { id: true, fullName: true, email: true, phone: true, altPhone: true, customerType: true } },
      vehicle: { select: { make: true, model: true, year: true, plateNumber: true, mileage: true, vehicleType: true, serviceIntervalKm: true, serviceIntervalDays: true } },
      branch: CYCLE_SOURCE_SELECT.branch,
    },
  });
  const out = [];
  const seen = new Set<string>();
  for (const j of cards) {
    if (seen.has(j.vehicleId) || !j.checkedOutAt) continue;
    seen.add(j.vehicleId);
    const cycle = computeServiceCycle(j.mileageAtCheckIn, j.checkedOutAt, j);
    if (cycle.nextServiceDueOdometer === null && cycle.nextServiceDueDate === null) continue;
    const v = j.vehicle;
    out.push({
      id: `jc:${j.id}`, vehicleId: j.vehicleId, serviceNumber: j.jobNumber, attendedAt: j.serviceAttendedAt,
      primaryServiceDate: cycle.primaryServiceDate as Date | null, primaryServiceMileage: cycle.primaryServiceMileage, nextServiceDueOdometer: cycle.nextServiceDueOdometer, nextServiceDueDate: cycle.nextServiceDueDate,
      customer: j.customer, vehicle: { make: v.make, model: v.model, year: v.year, plateNumber: v.plateNumber, mileage: v.mileage, vehicleType: v.vehicleType },
    });
  }
  return out;
}

/** Whether a newer anchor replaces the current one: the later anchor date wins (an undated anchor never replaces a dated one). */
export function laterAnchor(current: { primaryServiceDate: Date | null } | undefined, candidate: { primaryServiceDate: Date | null }): boolean {
  if (!current) return true;
  if (!candidate.primaryServiceDate) return false;
  if (!current.primaryServiceDate) return true;
  return new Date(candidate.primaryServiceDate).getTime() > new Date(current.primaryServiceDate).getTime();
}

/**
 * Every vehicle's CURRENT service prediction (its most recent service Job
 * Card), with its live due status, whether it's back in the workshop, and
 * this cycle's reminder history. Vehicles not yet serviced here are tracked
 * from their last service brought in from the old system.
 */
export async function loadServiceTracking(scope: { branchId?: string; vehicleId?: string } = {}): Promise<TrackedVehicle[]> {
  // Only the latest prediction per vehicle counts.
  const latest = new Map<string, Awaited<ReturnType<typeof jobCardAnchors>>[number]>();
  for (const j of await jobCardAnchors(scope)) if (laterAnchor(latest.get(j.vehicleId), j)) latest.set(j.vehicleId, j);
  for (const h of await historyAnchors(scope, new Set(latest.keys()))) latest.set(h.vehicleId, h);
  const vehicleIds = [...latest.keys()];
  const [visits, logs, reminderAudits] = await Promise.all([
    workshopVisitsForVehicles(vehicleIds),
    vehicleIds.length
      ? prisma.serviceReminderLog.findMany({
          where: { vehicleId: { in: vehicleIds } },
          orderBy: { sentAt: 'desc' },
          select: { vehicleId: true, sentAt: true, reminderNumber: true },
        })
      : Promise.resolve([] as { vehicleId: string; sentAt: Date; reminderNumber: number }[]),
    // Who sent each reminder — by name, from the audit trail.
    vehicleIds.length
      ? prisma.auditLog.findMany({
          where: { action: 'vehicle.service_reminder_sent', entityType: 'CustomerVehicle', entityId: { in: vehicleIds } },
          orderBy: { createdAt: 'desc' },
          select: { entityId: true, userId: true, createdAt: true },
        })
      : Promise.resolve([] as { entityId: string | null; userId: string | null; createdAt: Date }[]),
  ]);
  const senderIds = [...new Set(reminderAudits.map((a: { userId: string | null }) => a.userId).filter((id: string | null): id is string => Boolean(id)))];
  const senders = senderIds.length ? await prisma.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, fullName: true } }) : [];
  const senderName = new Map(senders.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  const now = new Date();
  return [...latest.values()].map((s) => {
    const due = serviceDueStatus(s.nextServiceDueOdometer, s.nextServiceDueDate, s.vehicle.mileage, now);
    // Only reminders for THIS prediction cycle count (same rule as the engine).
    const cycleLogs = logs.filter((l: { vehicleId: string; sentAt: Date }) => l.vehicleId === s.vehicleId && (!s.primaryServiceDate || l.sentAt >= s.primaryServiceDate));
    const lapsed = due.status === 'OVERDUE' && due.daysRemaining !== null && due.daysRemaining <= -LAPSED_AFTER_DAYS_OVERDUE;
    return {
      vehicleId: s.vehicleId,
      vehicleType: (s.vehicle.vehicleType as 'PASSENGER' | 'COMMERCIAL' | null) ?? null,
      lapsed,
      vehicleDescription: [s.vehicle.year, s.vehicle.make, s.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
      plateNumber: s.vehicle.plateNumber,
      currentMileage: s.vehicle.mileage,
      customerId: s.customer.id,
      customerName: s.customer.fullName,
      customerEmail: s.customer.email,
      customerPhone: s.customer.phone ?? null,
      customerAltPhone: s.customer.altPhone ?? null,
      customerIsOrganisation: s.customer.customerType === 'ORGANIZATION',
      lastService: { id: s.id, serviceNumber: s.serviceNumber, date: s.primaryServiceDate, mileage: s.primaryServiceMileage, source: s.id.startsWith('hist:') ? ('OLD_SYSTEM' as const) : ('EJO' as const) },
      nextServiceDueOdometer: s.nextServiceDueOdometer,
      nextServiceDueDate: s.nextServiceDueDate,
      kmRemaining: due.kmRemaining,
      daysRemaining: due.daysRemaining,
      status: due.status,
      attendedAt: s.attendedAt,
      inWorkshop: visits.get(s.vehicleId) ?? null,
      reminders: {
        sentThisCycle: cycleLogs.length,
        lastSentAt: cycleLogs[0]?.sentAt ?? null,
        lastStage: cycleLogs[0]?.reminderNumber ?? null,
        lastSentByName: (() => {
          const last = cycleLogs[0];
          if (!last) return null;
          const audit = reminderAudits.find(
            (a: { entityId: string | null; createdAt: Date }) => a.entityId === s.vehicleId && Math.abs(new Date(a.createdAt).getTime() - new Date(last.sentAt).getTime()) < 2 * 60 * 1000,
          );
          return audit?.userId ? senderName.get(audit.userId) ?? null : null;
        })(),
      },
      ...(() => {
        const inWorkshop = visits.get(s.vehicleId) ?? null;
        if (inWorkshop || s.attendedAt || lapsed) return { reminderDue: null, nextReminderFrom: null };
        const next = nextReminderStage(due.status, cycleLogs[0]?.reminderNumber ?? null, cycleLogs[0]?.sentAt ?? null, now);
        return { reminderDue: next.stage ? { stage: next.stage } : null, nextReminderFrom: next.dueFrom };
      })(),
    };
  });
}
