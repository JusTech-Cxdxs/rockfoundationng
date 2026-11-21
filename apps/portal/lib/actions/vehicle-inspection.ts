'use server';
import { logFailure } from '@/lib/log';

import { authorizeOnJobCard, seeJobCard } from '@/lib/authz/server';
import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { getApplicableTemplate, VEHICLE_INSPECTION_TEMPLATE } from '@/lib/vehicle-inspection-template';
import { sendLoggedEmail } from '@/lib/logged-email';

class VehicleInspectionActionError extends Error {}

/** Logs each inspection event against both the inspection and its Job
 * Card, so it shows on both timelines. */
async function logInspectionEvent(params: {
  userId: string;
  action: string;
  inspectionId: string;
  jobCardId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await Promise.all([
    writeAuditLog({ userId: params.userId, action: params.action, entityType: 'VehicleInspection', entityId: params.inspectionId, metadata: params.metadata }),
    writeAuditLog({ userId: params.userId, action: params.action, entityType: 'JobCard', entityId: params.jobCardId, metadata: params.metadata }),
  ]);
}

/** Statuses after which the inspection is history and can no longer change. */
const FINISHED = ['CHECKED_OUT', 'CLOSED', 'CANCELLED'];

/** The Job Card the inspection belongs to, refused once the vehicle has left or the job was cancelled. */
async function openJobCard(jobCardId: string) {
  const jc = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { jobNumber: true, status: true, vehicle: { select: { vehicleType: true } } } });
  if (!jc) throw new VehicleInspectionActionError('Job Card not found.');
  if (FINISHED.includes(jc.status)) throw new VehicleInspectionActionError(`Job Card ${jc.jobNumber} is ${jc.status.toLowerCase().replace(/_/g, ' ')} — its inspection can no longer change.`);
  return jc;
}

/**
 * Creates the Job Card's check-in inspection with items from the
 * vehicle-type template (one per Job Card). Called the first time the
 * inspection is opened; calling it again returns the existing record.
 */
export async function startVehicleInspection(jobCardId: string): Promise<{ id: string }> {
  await authorizeOnJobCard('workshop.inspection.perform', jobCardId, 'startVehicleInspection');
  const user = await requireUser();
  const existing = await prisma.vehicleInspection.findUnique({ where: { jobCardId }, select: { id: true } });
  if (existing) return existing;

  const jc = await openJobCard(jobCardId);
  if (!jc.vehicle.vehicleType) {
    throw new VehicleInspectionActionError(
      'This vehicle has no Passenger/Commercial type on file yet — set it on the Vehicles page before starting an inspection.',
    );
  }

  const template = getApplicableTemplate(jc.vehicle.vehicleType);
  const inspection = await prisma.$transaction(async (tx) => {
    const created = await tx.vehicleInspection.create({
      data: { jobCardId, inspectedById: user.id, status: 'IN_PROGRESS', startedAt: new Date() },
    });
    await tx.vehicleInspectionItem.createMany({
      data: template.flatMap((s) => s.items.map((i) => ({ inspectionId: created.id, section: s.section, name: i.name }))),
    });
    return created;
  });

  await logInspectionEvent({
    userId: user.id,
    action: 'vehicle_inspection.started',
    inspectionId: inspection.id,
    jobCardId,
    metadata: { jobNumber: jc.jobNumber },
  });
  return { id: inspection.id };
}

export type InspectionItemInput = {
  itemId: string;
  condition?: string;
  severity?: 'GOOD' | 'ATTENTION' | 'SERVICE_REQUIRED' | 'CRITICAL';
  action?: string;
  notes?: string;
};

/** Records that the inspection was skipped, so a skip is as visible in the
 * audit trail as a completed inspection. Refused if the inspection was
 * already started or decided; cancelVehicleInspection undoes that first. */
export async function skipVehicleInspection(jobCardId: string, reason?: string): Promise<{ id: string }> {
  await authorizeOnJobCard('workshop.inspection.perform', jobCardId, 'skipVehicleInspection');
  const user = await requireUser();
  const existing = await prisma.vehicleInspection.findUnique({ where: { jobCardId }, select: { id: true, status: true } });
  if (existing) {
    throw new VehicleInspectionActionError(`This inspection is already ${existing.status.toLowerCase().replace('_', ' ')} — it can't be skipped now.`);
  }
  const jc = await openJobCard(jobCardId);
  const inspection = await prisma.vehicleInspection.create({
    data: { jobCardId, inspectedById: user.id, status: 'SKIPPED', skippedAt: new Date(), skipReason: reason?.trim() || null },
  });
  await logInspectionEvent({
    userId: user.id,
    action: 'vehicle_inspection.skipped',
    inspectionId: inspection.id,
    jobCardId,
    metadata: { jobNumber: jc.jobNumber, reason: reason?.trim() || undefined },
  });
  return { id: inspection.id };
}

/**
 * Undoes a start, completion or skip by deleting the inspection, so the
 * Job Card is back at the Start/Skip choice. Logged against the Job Card
 * (and the inspection id) before the delete.
 */
export async function cancelVehicleInspection(jobCardId: string, reason?: string): Promise<void> {
  await authorizeOnJobCard('workshop.inspection.perform', jobCardId, 'cancelVehicleInspection');
  const user = await requireUser();
  const inspection = await prisma.vehicleInspection.findUnique({ where: { jobCardId }, select: { id: true, status: true } });
  if (!inspection) {
    throw new VehicleInspectionActionError('No inspection exists yet for this Job Card.');
  }
  const jc = await openJobCard(jobCardId);
  await logInspectionEvent({
    userId: user.id,
    action: 'vehicle_inspection.cancelled',
    inspectionId: inspection.id,
    jobCardId,
    metadata: { jobNumber: jc.jobNumber, previousStatus: inspection.status, reason: reason?.trim() || undefined },
  });
  await prisma.vehicleInspection.delete({ where: { id: inspection.id } });
}

/** Saves one section at a time. Items left blank keep their current
 * values. Allowed after completion too (completion doesn't lock the
 * record); clearing an item's severity moves it back to Not Reviewed. */
export async function updateInspectionItems(inspectionId: string, items: InspectionItemInput[]): Promise<void> {
  {
    const owner = await prisma.vehicleInspection.findUnique({ where: { id: inspectionId }, select: { jobCardId: true } });
    if (!owner) throw new Error('This inspection no longer exists — refresh the page.');
    await authorizeOnJobCard('workshop.inspection.perform', owner.jobCardId, 'updateInspectionItems');
    await openJobCard(owner.jobCardId);
  }
  const user = await requireUser();
  const inspection = await prisma.vehicleInspection.findUnique({ where: { id: inspectionId }, select: { jobCardId: true, status: true } });
  if (!inspection) {
    throw new VehicleInspectionActionError('Inspection record not found.');
  }
  if (inspection.status === 'SKIPPED') {
    throw new VehicleInspectionActionError('This inspection was skipped. Cancel the skip first to start an inspection.');
  }
  // Every item must belong to this inspection (the one just authorised); an
  // item id from another inspection rejects the whole save.
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const saved = await tx.vehicleInspectionItem.updateMany({
        where: { id: item.itemId, inspectionId },
        data: {
          condition: item.condition?.trim() || null,
          severity: item.severity ?? null,
          action: item.action?.trim() || null,
          notes: item.notes?.trim() || null,
        },
      });
      if (saved.count !== 1) throw new VehicleInspectionActionError('An item on this form is not part of this inspection — refresh the page.');
    }
  });
  await logInspectionEvent({
    userId: user.id,
    action: 'vehicle_inspection.items_updated',
    inspectionId,
    jobCardId: inspection.jobCardId,
    metadata: { count: items.length },
  });
}

/** Can be called again after further edits; updates completedAt and notes. */
export async function completeVehicleInspection(inspectionId: string, notes?: string): Promise<void> {
  {
    const owner = await prisma.vehicleInspection.findUnique({ where: { id: inspectionId }, select: { jobCardId: true } });
    if (!owner) throw new Error('This inspection no longer exists — refresh the page.');
    await authorizeOnJobCard('workshop.inspection.perform', owner.jobCardId, 'completeVehicleInspection');
    await openJobCard(owner.jobCardId);
  }
  const user = await requireUser();
  const inspection = await prisma.vehicleInspection.findUnique({ where: { id: inspectionId }, select: { jobCardId: true, status: true } });
  if (!inspection) {
    throw new VehicleInspectionActionError('Inspection record not found.');
  }
  if (inspection.status === 'SKIPPED') {
    throw new VehicleInspectionActionError('This inspection was skipped — there is nothing to complete.');
  }
  await prisma.vehicleInspection.update({
    where: { id: inspectionId },
    data: { status: 'COMPLETED', completedAt: new Date(), notes: notes?.trim() || null },
  });
  await logInspectionEvent({ userId: user.id, action: 'vehicle_inspection.completed', inspectionId, jobCardId: inspection.jobCardId });
  // Tell the supervisor (and the technician): the estimate is next.
  try {
    const jc = await prisma.jobCard.findUnique({ where: { id: inspection.jobCardId }, select: { jobNumber: true, supervisor: { select: { fullName: true, email: true } }, assignedTechnician: { select: { fullName: true, email: true } } } });
    if (jc) await sendLoggedEmail({ entityType: 'JobCard', entityId: inspection.jobCardId, recipients: [jc.supervisor, jc.assignedTechnician].filter((x): x is { fullName: string; email: string } => Boolean(x?.email)), subject: `Inspection completed — ${jc.jobNumber}`, heading: 'The vehicle inspection is complete', lines: [jc.jobNumber, 'The findings are recorded — the estimate can now be prepared.'], path: `/workshop/job-cards/${inspection.jobCardId}`, actorId: user.id });
  } catch (err) {
    logFailure('Inspection completed email failed', err);
  }
}

export async function getVehicleInspection(jobCardId: string) {
  await requireUser();
  await seeJobCard(jobCardId, 'getVehicleInspection');
  const inspection = await prisma.vehicleInspection.findUnique({
    where: { jobCardId },
    include: {
      inspectedBy: { select: { fullName: true } },
      items: true,
    },
  });
  if (!inspection) return inspection;
  // Sort by the template's section order, not database row order.
  const sectionOrder = VEHICLE_INSPECTION_TEMPLATE.map((s) => s.section);
  const itemOrder = new Map(VEHICLE_INSPECTION_TEMPLATE.flatMap((s) => s.items.map((i, idx) => [`${s.section}::${i.name}`, idx])));
  const items = [...inspection.items].sort((a, b) => {
    const sectionDiff = sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section);
    if (sectionDiff !== 0) return sectionDiff;
    return (itemOrder.get(`${a.section}::${a.name}`) ?? 0) - (itemOrder.get(`${b.section}::${b.name}`) ?? 0);
  });
  return { ...inspection, items };
}
