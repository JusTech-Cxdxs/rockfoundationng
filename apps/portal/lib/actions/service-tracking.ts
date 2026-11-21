'use server';
import { logFailure } from '@/lib/log';
import { prisma } from '@ejo/database';
import { authorize, authorizeOnJobCard, branchWithinReach, inMyOrganisation, seeVehicle } from '@/lib/authz/server';
import { requireUser, currentUserIsMasterAdmin, listEligibleManagersForBranch } from './workshop';
import { writeAuditLog, getWorkshopBranchId } from '@/lib/workshop-core';
import { billingOf, jobCardTotals, ESTIMATE_TOTALS_SELECT, JOB_CARD_BILLING_SELECT } from '@/lib/estimate-billing';
import { historyAnchorId, jobCardAnchorId, serviceAnchorHref, SERVICE_JOB_CARD_WHERE, loadServiceTracking, type WorkshopVisit } from '@/lib/vehicle-service-cycle';
import { type ServiceReminderStage } from '@/lib/email-templates/service-reminder';
import { getVehiclesNeedingServiceReminder, sendServiceReminder } from '@/lib/service-reminders-core';
import { lagosDayKey } from '@/lib/utils/format-date';

/**
 * The next-service side of the workshop: each vehicle's service health, the
 * Service Tracker, service-due reminders and the organisation's default
 * service interval. The clock itself lives in lib/vehicle-service-cycle.
 */

class ServiceTrackingError extends Error {}

export type VehicleServiceHealth = {
  status: 'UP_TO_DATE' | 'DUE_SOON' | 'OVERDUE' | 'NO_DATA';
  nextServiceDueOdometer: number | null;
  nextServiceDueDate: Date | null;
  primaryServiceMileage: number | null;
  primaryServiceDate: Date | null;
  serviceId: string;
  serviceNumber: string;
  serviceHref: string;
  kmRemaining: number | null;
  daysRemaining: number | null;
  attendedAt: Date | null;
  /** The vehicle is back in the workshop now; reminders are held meanwhile. */
  inWorkshop: WorkshopVisit | null;
  remindersSentThisCycle: number;
  lastReminderAt: Date | null;
  /** The reminder a person can send now, if any (reminders are semi-automatic). */
  reminderDue: { stage: 1 | 2 | 3 | 4 } | null;
  nextReminderFrom: Date | null;
  /** Who to remind and on what: for "Send on WhatsApp" next to the emailed reminder. */
  customer: { name: string; phone: string | null; altPhone: string | null; organisation: boolean };
  vehicle: { description: string; plateNumber: string | null };
};

/**
 * The vehicle's service status (up to date, due soon, overdue), from its
 * latest completed service. DUE_SOON starts 1,000 km or 30 days before the
 * due point. No completed service yet is never treated as overdue.
 */
export async function getVehicleServiceHealth(vehicleId: string): Promise<VehicleServiceHealth | null> {
  await requireUser();
  await seeVehicle(vehicleId, 'getVehicleServiceHealth');
  // Shared calculation, so custody, the Service Tracker and reminders agree.
  const [t] = await loadServiceTracking({ vehicleId });
  if (!t) return null;
  return {
    status: t.status === 'ON_TRACK' ? 'UP_TO_DATE' : t.status,
    nextServiceDueOdometer: t.nextServiceDueOdometer,
    nextServiceDueDate: t.nextServiceDueDate,
    primaryServiceMileage: t.lastService.mileage,
    primaryServiceDate: t.lastService.date,
    serviceId: t.lastService.id,
    serviceNumber: t.lastService.serviceNumber,
    serviceHref: serviceAnchorHref(t),
    kmRemaining: t.kmRemaining,
    daysRemaining: t.daysRemaining,
    attendedAt: t.attendedAt,
    inWorkshop: t.inWorkshop,
    remindersSentThisCycle: t.reminders.sentThisCycle,
    lastReminderAt: t.reminders.lastSentAt,
    reminderDue: t.reminderDue,
    nextReminderFrom: t.nextReminderFrom,
    customer: { name: t.customerName, phone: t.customerPhone, altPhone: t.customerAltPhone, organisation: t.customerIsOrganisation },
    vehicle: { description: t.vehicleDescription, plateNumber: t.plateNumber },
  };
}

export type VehicleMileagePoint = { date: Date; mileage: number; label: string };
export type VehicleVisitMonth = { month: string; jobCardCount: number };
export type VehicleSpendPoint = { date: Date; amount: number; label: string };
export type VehicleFindingsBreakdown = { good: number; attention: number; serviceRequired: number; critical: number };

export type VehicleAnalytics = {
  mileageTimeline: VehicleMileagePoint[];
  visitHistory: VehicleVisitMonth[];
  spendTimeline: VehicleSpendPoint[];
  /** Every inspection finding ever recorded for this vehicle. */
  findingsBreakdown: VehicleFindingsBreakdown;
  /** The most recent completed inspection: the vehicle's current condition. */
  latestInspection: { jobNumber: string; completedAt: Date | null; breakdown: VehicleFindingsBreakdown } | null;
  totalVisits: number;
  /** What the customer was asked to pay on approved estimates. */
  totalSpend: number;
  totalPaid: number;
  outstanding: number;
};

/**
 * A vehicle's history across its Job Cards: odometer readings, approved
 * amounts, payments and inspection findings, as recorded. The next-service prediction comes from
 * getVehicleServiceHealth().
 */
export async function getVehicleAnalytics(vehicleId: string): Promise<VehicleAnalytics> {
  await requireUser();
  await seeVehicle(vehicleId, 'getVehicleAnalytics');
  const [jobCards, payments, refunds, inspections] = await Promise.all([
    prisma.jobCard.findMany({
      where: { vehicleId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'asc' },
      select: { jobNumber: true, createdAt: true, mileageAtCheckIn: true, estimate: { select: { status: true, ...ESTIMATE_TOTALS_SELECT } }, ...JOB_CARD_BILLING_SELECT },
    }),
    prisma.payment.findMany({ where: { jobCard: { vehicleId } }, select: { amount: true } }),
    // Refunds (cancelled after a deposit): "paid" means money kept.
    prisma.refund.findMany({ where: { jobCard: { vehicleId } }, select: { amount: true } }),
    prisma.vehicleInspection.findMany({
      where: { jobCard: { vehicleId } },
      orderBy: { completedAt: 'desc' },
      select: { status: true, completedAt: true, jobCard: { select: { jobNumber: true } }, items: { select: { severity: true } } },
    }),
  ]);

  const mileageTimeline: VehicleMileagePoint[] = jobCards
    .filter((j) => j.mileageAtCheckIn !== null)
    .map((j) => ({ date: j.createdAt, mileage: j.mileageAtCheckIn as number, label: j.jobNumber }));

  const monthKey = (d: Date) => lagosDayKey(d).slice(0, 7);
  const monthLabel = (d: Date) => d.toLocaleDateString('en-NG', { month: 'short', year: '2-digit', timeZone: 'Africa/Lagos' });
  const visitsByMonth = new Map<string, VehicleVisitMonth>();
  for (const j of jobCards) {
    const key = monthKey(j.createdAt);
    const existing = visitsByMonth.get(key) ?? { month: monthLabel(j.createdAt), jobCardCount: 0 };
    existing.jobCardCount += 1;
    visitsByMonth.set(key, existing);
  }
  const visitHistory = [...visitsByMonth.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v);

  const tally = (items: { severity: string | null }[]): VehicleFindingsBreakdown => {
    const b: VehicleFindingsBreakdown = { good: 0, attention: 0, serviceRequired: 0, critical: 0 };
    for (const item of items) {
      if (item.severity === 'GOOD') b.good += 1;
      else if (item.severity === 'ATTENTION') b.attention += 1;
      else if (item.severity === 'SERVICE_REQUIRED') b.serviceRequired += 1;
      else if (item.severity === 'CRITICAL') b.critical += 1;
    }
    return b;
  };
  const latestDone = inspections.find((i) => i.status === 'COMPLETED') ?? null;

  // An estimate counts once it has its final approval; only what the
  // customer pays (goodwill and internal lines are not their spend).
  const spendTimeline: VehicleSpendPoint[] = jobCards
    .filter((j) => j.estimate?.status === 'MANAGER_APPROVED')
    .map((j) => ({ date: j.createdAt, amount: jobCardTotals(j.estimate, billingOf(j)).total, label: j.jobNumber }));
  const totalSpend = spendTimeline.reduce((sum, p) => sum + p.amount, 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0) - refunds.reduce((sum, r) => sum + Number(r.amount), 0);
  return {
    mileageTimeline,
    visitHistory,
    spendTimeline,
    findingsBreakdown: tally(inspections.flatMap((i) => i.items)),
    latestInspection: latestDone ? { jobNumber: latestDone.jobCard.jobNumber, completedAt: latestDone.completedAt, breakdown: tally(latestDone.items) } : null,
    totalVisits: jobCards.length,
    totalSpend,
    totalPaid,
    outstanding: Math.max(0, Math.round((totalSpend - totalPaid) * 100) / 100),
  };
}

export type VehicleDueForService = {
  serviceId: string;
  vehicleId: string;
  status: 'DUE_SOON' | 'OVERDUE';
  vehicleDescription: string;
  plateNumber: string | null;
  customerId?: string;
  customerName: string;
  nextServiceDueOdometer: number | null;
  nextServiceDueDate: Date | null;
  kmRemaining: number | null;
  daysRemaining: number | null;
  /** Back in the workshop now: still listed and named, never reminded. */
  inWorkshop: WorkshopVisit | null;
  remindersSentThisCycle: number;
  reminderDue: { stage: 1 | 2 | 3 | 4 } | null;
  nextReminderFrom: Date | null;
  vehicleType: 'PASSENGER' | 'COMMERCIAL' | null;
};

/** Vehicles at this branch that are due soon or overdue, not yet attended to. */
export async function listVehiclesDueForService(branchId: string): Promise<VehicleDueForService[]> {
  await requireUser();
  branchId = await branchWithinReach('workshop.job_card.view', branchId);
  const tracked = await loadServiceTracking({ branchId });
  return tracked
    .filter((t) => (t.status === 'DUE_SOON' || t.status === 'OVERDUE') && !t.attendedAt && !t.lapsed)
    .map((t) => ({
      serviceId: t.lastService.id,
      vehicleId: t.vehicleId,
      status: t.status as 'DUE_SOON' | 'OVERDUE',
      vehicleDescription: t.vehicleDescription,
      plateNumber: t.plateNumber,
      customerId: t.customerId,
      customerName: t.customerName,
      nextServiceDueOdometer: t.nextServiceDueOdometer,
      nextServiceDueDate: t.nextServiceDueDate,
      kmRemaining: t.kmRemaining,
      daysRemaining: t.daysRemaining,
      inWorkshop: t.inWorkshop,
      remindersSentThisCycle: t.reminders.sentThisCycle,
      reminderDue: t.reminderDue,
      nextReminderFrom: t.nextReminderFrom,
      vehicleType: t.vehicleType,
    }))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'OVERDUE' ? -1 : 1));
}

/**
 * Marks a due prediction as handled (the customer is booked in, or staff
 * are dealing with it). The next service Job Card carries its own prediction.
 * The anchor is a service Job Card ("jc:<id>") or an old-system job ("hist:<id>").
 */
export async function attendToOverdueVehicle(serviceId: string): Promise<void> {
  await authorize('workshop.customer.manage', undefined, 'attendToOverdueVehicle');
  const user = await requireUser();
  const hist = historyAnchorId(serviceId);
  if (hist) {
    const job = await prisma.historicalJob.findUnique({ where: { id: hist }, select: { id: true, jobNumber: true, vehicleId: true, attendedAt: true } });
    if (!job || !job.vehicleId) throw new ServiceTrackingError('That past job is not tracked.');
    await seeVehicle(job.vehicleId, 'attendToOverdueVehicle');
    if (job.attendedAt) throw new ServiceTrackingError('This prediction has already been attended to.');
    await prisma.historicalJob.update({ where: { id: job.id }, data: { attendedAt: new Date() } });
    await writeAuditLog({ userId: user.id, action: 'vehicle_service.attended_to', entityType: 'CustomerVehicle', entityId: job.vehicleId, metadata: { serviceNumber: `${job.jobNumber} (old system)` } });
    return;
  }
  const jcId = jobCardAnchorId(serviceId);
  if (!jcId) throw new ServiceTrackingError('That service is not tracked.');
  await authorizeOnJobCard('workshop.customer.manage', jcId, 'attendToOverdueVehicle');
  const jc = await prisma.jobCard.findFirst({ where: { id: jcId, ...SERVICE_JOB_CARD_WHERE }, select: { id: true, jobNumber: true, serviceAttendedAt: true } });
  if (!jc) throw new ServiceTrackingError('That Job Card is not tracked for service.');
  if (jc.serviceAttendedAt) throw new ServiceTrackingError('This prediction has already been attended to.');
  await prisma.jobCard.update({ where: { id: jc.id }, data: { serviceAttendedAt: new Date() } });
  await writeAuditLog({ userId: user.id, action: 'vehicle_service.attended_to', entityType: 'JobCard', entityId: jc.id, metadata: { serviceNumber: jc.jobNumber } });
}

/** Every vehicle's current next-service prediction at this branch. */
export async function getServiceTracker(branchId: string) {
  const user = await requireUser();
  branchId = await branchWithinReach('workshop.job_card.view', branchId);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [vehicles, remindersLast30Days, isMasterAdmin, managers] = await Promise.all([
    loadServiceTracking({ branchId }),
    prisma.serviceReminderLog.count({ where: { sentAt: { gte: since }, vehicle: { jobCards: { some: { branchId, isService: true } } } } }),
    currentUserIsMasterAdmin(),
    listEligibleManagersForBranch(branchId),
  ]);
  const order: Record<string, number> = { OVERDUE: 0, DUE_SOON: 1, ON_TRACK: 2 };
  vehicles.sort((a, b) => {
    const byStatus = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    if (byStatus !== 0) return byStatus;
    return (a.daysRemaining ?? Number.POSITIVE_INFINITY) - (b.daysRemaining ?? Number.POSITIVE_INFINITY);
  });
  return {
    vehicles,
    remindersLast30Days,
    canRunReminders: isMasterAdmin || managers.supervisors.some((m: { id: string }) => m.id === user.id),
  };
}

/**
 * Stops tracking a vehicle's current service cycle (e.g. the customer asked
 * not to be reminded, or sold the vehicle). A reason is required and audited.
 * Tracking restarts with a fresh cycle at the next completed service.
 */
export async function stopTrackingVehicle(vehicleId: string, reason: string): Promise<void> {
  await authorize('workshop.customer.manage', undefined, 'stopTrackingVehicle');
  const user = await requireUser();
  await seeVehicle(vehicleId, 'stopTrackingVehicle');
  const why = reason.trim();
  if (!why) throw new ServiceTrackingError('A reason is required to stop tracking this vehicle.');
  const [current] = await loadServiceTracking({ vehicleId });
  if (!current) throw new ServiceTrackingError('This vehicle has no service cycle being tracked.');
  if (current.attendedAt) throw new ServiceTrackingError('This vehicle is already not being tracked for its current cycle.');
  const now = new Date();
  const hist = historyAnchorId(current.lastService.id);
  const jc = jobCardAnchorId(current.lastService.id);
  if (hist) await prisma.historicalJob.update({ where: { id: hist }, data: { attendedAt: now } });
  else if (jc) await prisma.jobCard.update({ where: { id: jc }, data: { serviceAttendedAt: now } });
  await writeAuditLog({
    userId: user.id,
    action: 'vehicle.tracking_stopped',
    entityType: 'CustomerVehicle',
    entityId: vehicleId,
    metadata: { reason: why, lastServiceNumber: current.lastService.serviceNumber, status: current.status },
  });
}

/** The organisation's default service interval, used when a vehicle has none of its own. */
export async function updatePrimaryServiceInterval(organisationId: string, intervalKm: number | undefined, intervalDays: number | undefined): Promise<void> {
  const user = await requireUser();
  if (!(await currentUserIsMasterAdmin()) || !(await inMyOrganisation(organisationId))) {
    throw new ServiceTrackingError('You do not have permission to change the service interval.');
  }
  if ((intervalKm !== undefined && (!Number.isInteger(intervalKm) || intervalKm <= 0)) || (intervalDays !== undefined && (!Number.isInteger(intervalDays) || intervalDays <= 0))) {
    throw new ServiceTrackingError('Enter the interval as whole kilometres and days, greater than zero.');
  }
  await prisma.organisation.update({
    where: { id: organisationId },
    data: { primaryServiceIntervalKm: intervalKm ?? null, primaryServiceIntervalDays: intervalDays ?? null },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'organisation.primary_service_interval_updated',
    entityType: 'Organisation',
    entityId: organisationId,
    metadata: { intervalKm: intervalKm ?? null, intervalDays: intervalDays ?? null },
  });
}

/** Reminder history for one vehicle, shown on its page: what was sent and when. */
export async function getVehicleReminderHistory(vehicleId: string) {
  await requireUser();
  await seeVehicle(vehicleId, 'getVehicleReminderHistory');
  return prisma.serviceReminderLog.findMany({ where: { vehicleId }, orderBy: { sentAt: 'desc' } });
}

/**
 * Sends a reminder now, from the Service Tracker or the vehicle's page.
 * Picks the stage for where the vehicle stands. Refused when not yet due, or
 * when the vehicle is back in the workshop. Logged (trigger MANUAL) and audited.
 */
export async function sendManualServiceReminder(vehicleId: string): Promise<void> {
  const user = await requireUser();
  await seeVehicle(vehicleId, 'sendManualServiceReminder');
  const [t] = await loadServiceTracking({ vehicleId });
  if (!t) throw new ServiceTrackingError('This vehicle has no completed service to remind about yet.');
  if (t.inWorkshop) throw new ServiceTrackingError(`This vehicle is in the workshop right now (${t.inWorkshop.number}) — no reminder is needed.`);
  if (t.attendedAt) throw new ServiceTrackingError('This prediction has already been attended to — no further reminders.');
  if (!t.reminderDue) {
    throw new ServiceTrackingError(
      t.nextReminderFrom
        ? `The next reminder isn't due yet — it can be sent from ${t.nextReminderFrom.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Africa/Lagos' })}.`
        : 'This vehicle is not due yet — reminders start once it is due soon.',
    );
  }
  if (!t.customerEmail) throw new ServiceTrackingError('The customer has no email address on file — send the reminder on WhatsApp instead.');
  await sendServiceReminder(
    {
      vehicleId,
      nextStage: t.reminderDue.stage as ServiceReminderStage,
      estimatedDueOdometer: t.nextServiceDueOdometer,
      estimatedDueDate: t.nextServiceDueDate,
      kmRemaining: t.kmRemaining,
      daysRemaining: t.daysRemaining,
      isOverdue: t.status === 'OVERDUE',
    },
    'MANUAL',
    user.id,
  );
}

/**
 * "Send all due reminders": the Owner sends the reminders that
 * are due now (same stages, 7-working-day spacing and skips).
 */
export async function runServiceRemindersNow(): Promise<{ evaluated: number; sent: number; failed: number }> {
  const user = await requireUser();
  if (!(await currentUserIsMasterAdmin())) {
    const managers = await listEligibleManagersForBranch(await getWorkshopBranchId());
    if (!managers.supervisors.some((m: { id: string }) => m.id === user.id)) {
      throw new ServiceTrackingError('Only the Owner can run reminders on demand.');
    }
  }
  const needing = await getVehiclesNeedingServiceReminder();
  let sent = 0;
  let failed = 0;
  for (const need of needing) {
    try {
      await sendServiceReminder(need, 'MANUAL', user.id);
      sent += 1;
    } catch (err) {
      failed += 1;
      logFailure('Failed to send service reminder', need.vehicleId, err);
    }
  }
  await writeAuditLog({ userId: user.id, action: 'service_reminders.run_manually', entityType: 'System', entityId: 'service-reminders', metadata: { evaluated: needing.length, sent, failed } });
  return { evaluated: needing.length, sent, failed };
}
