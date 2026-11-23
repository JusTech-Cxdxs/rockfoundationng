import { websiteBaseUrl } from '@/lib/portal-url';
/**
 * Server-only service-reminder engine (used by the scheduled job and by the
 * signed-in reminder actions). NOT a 'use server' file — none of this can be
 * called from outside the server.
 */

import { prisma, getAuditActor } from '@ejo/database';
import { writeAuditLog } from '@/lib/workshop-core';
import { loadServiceTracking, SERVICE_JOB_CARD_WHERE } from '@/lib/vehicle-service-cycle';
import { sendEmail } from '@/lib/email';
import { renderServiceReminderEmail, serviceReminderSubject, type ServiceReminderStage } from '@/lib/email-templates/service-reminder';
import { PLATFORM } from '@/lib/brand';
import { whatsAppToCustomer } from '@/lib/whatsapp/send';
import { vehicleText, waDate } from '@/lib/whatsapp/words';


export type VehicleNeedingReminder = {
  vehicleId: string;
  nextStage: ServiceReminderStage;
  estimatedDueOdometer: number | null;
  estimatedDueDate: Date | null;
  kmRemaining: number | null;
  daysRemaining: number | null;
  isOverdue: boolean;
};

/**
 * The reminder due now for each vehicle with a next-service prediction,
 * computed fresh each time (no queue or pending flag). Only reminders sent
 * after the current prediction was set count toward the stage.
 */
export async function getVehiclesNeedingServiceReminder(): Promise<VehicleNeedingReminder[]> {
  // Every vehicle whose reminder is due right now — straight from the
  // one shared tracking calculation and staging rule (nextReminderStage),
  // so this list, the Service Tracker, custody and the vehicle page can
  // never disagree. Semi-automatic: nothing here sends anything.
  const tracked = await loadServiceTracking();
  return tracked
    .filter((t) => t.reminderDue !== null)
    .map((t) => ({
      vehicleId: t.vehicleId,
      nextStage: t.reminderDue!.stage as ServiceReminderStage,
      estimatedDueOdometer: t.nextServiceDueOdometer,
      estimatedDueDate: t.nextServiceDueDate,
      kmRemaining: t.kmRemaining,
      daysRemaining: t.daysRemaining,
      isOverdue: t.status === 'OVERDUE',
    }));
}

/**
 * Sends one reminder and logs it. The log keeps the figures as they were
 * at send time, since the vehicle's mileage and the interval change later.
 */
export async function sendServiceReminder(need: VehicleNeedingReminder, trigger?: 'MANUAL', sentById?: string): Promise<void> {
  const vehicle = await prisma.customerVehicle.findUnique({
    where: { id: need.vehicleId },
    select: {
      make: true,
      model: true,
      plateNumber: true,
      mileage: true,
      customer: { select: { id: true, fullName: true, email: true } },
      // The last service Job Card anchors the cycle.
      jobCards: {
        where: SERVICE_JOB_CARD_WHERE,
        orderBy: { checkedOutAt: 'desc' },
        take: 1,
        select: { mileageAtCheckIn: true, checkedOutAt: true, branch: { select: { name: true, businessUnit: { select: { organisation: { select: { name: true } } } } } } },
      },
    },
  });
  if (!vehicle) return;

  const serviceCard = vehicle.jobCards[0];
  const lastService = serviceCard ? { primaryServiceMileage: serviceCard.mileageAtCheckIn, primaryServiceDate: serviceCard.checkedOutAt as Date | null, branch: serviceCard.branch } : null;
  const branchContext = lastService?.branch;
  const websiteUrl = websiteBaseUrl();
  const vehicleDescription = [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'your vehicle';
  // Which reminder this is in the current service cycle — shown to the
  // customer. (Who sent it is recorded on the internal audit trail only;
  // no employee's name ever appears in a customer email.)
  const sentThisCycle = await prisma.serviceReminderLog.count({
    where: { vehicleId: need.vehicleId, ...(lastService?.primaryServiceDate ? { sentAt: { gte: lastService.primaryServiceDate } } : {}) },
  });

  // On WhatsApp too, when the customer agreed — also for a customer with no email on file
  // (then the reminder counts as sent only if WhatsApp took it).
  const due = [need.estimatedDueOdometer !== null ? `${need.estimatedDueOdometer.toLocaleString('en-NG')} km` : null, need.estimatedDueDate ? waDate(need.estimatedDueDate) : null].filter(Boolean).join(' or ');
  const onWhatsApp = await whatsAppToCustomer({
    customerId: vehicle.customer.id, key: 'service_reminder', related: { type: 'CustomerVehicle', id: need.vehicleId },
    values: {
      vehicle: vehicleText(vehicle),
      due: need.isOverdue ? `now past its service${due ? ` (it was due at ${due}, whichever came first)` : ''}` : `due for its service${due ? ` at ${due}, whichever comes first` : ' soon'}`,
      link: `${websiteUrl}/customer-portal/dashboard`,
      workshop: branchContext?.businessUnit.organisation.name,
    },
  });
  if (!vehicle.customer.email) {
    if (onWhatsApp.status !== 'SENT') return;
  } else await sendEmail(
    vehicle.customer.email,
    serviceReminderSubject(need.nextStage, vehicle.plateNumber ? `${vehicleDescription} (${vehicle.plateNumber})` : vehicleDescription),
    renderServiceReminderEmail({
      stage: need.nextStage,
      customerName: vehicle.customer.fullName,
      vehicleDescription,
      plateNumber: vehicle.plateNumber,
      currentMileage: vehicle.mileage,
      lastServiceMileage: lastService?.primaryServiceMileage ?? null,
      lastServiceDate: lastService?.primaryServiceDate ?? null,
      estimatedDueOdometer: need.estimatedDueOdometer,
      estimatedDueDate: need.estimatedDueDate,
      kmRemaining: need.kmRemaining,
      daysRemaining: need.daysRemaining,
      isOverdue: need.isOverdue,
      reminderCount: sentThisCycle + 1,
      // The customer's own account — never a staff-portal page they can't open.
      vehicleUrl: `${websiteUrl}/customer-portal/dashboard`,
      logoUrl: `${websiteUrl}/brand/emblem.png`,
      companyName: branchContext?.businessUnit.organisation.name ?? PLATFORM.name,
      branchName: branchContext?.name ?? '',
    }),
  );

  await prisma.serviceReminderLog.create({
    data: {
      vehicleId: need.vehicleId,
      reminderNumber: need.nextStage,
      estimatedDueOdometer: need.estimatedDueOdometer,
      estimatedDueDate: need.estimatedDueDate,
      recordedOdometerAtSend: vehicle.mileage,
      trigger: trigger ?? (need.isOverdue ? 'OVERDUE' : 'DUE_SOON'),
      deliveryStatus: 'SENT',
    },
  });
  // Every reminder sent — single or bulk — is on the vehicle's audit
  // trail, attributed to whoever clicked Send.
  await writeAuditLog({
    // Passed explicitly by the caller (never left to request context),
    // so every reminder on the trail names who sent it.
    userId: sentById ?? getAuditActor()?.userId ?? null,
    action: 'vehicle.service_reminder_sent',
    entityType: 'CustomerVehicle',
    entityId: need.vehicleId,
    metadata: { stage: need.nextStage, overdue: need.isOverdue, trigger: trigger ?? 'AUTOMATIC', estimatedDueOdometer: need.estimatedDueOdometer, estimatedDueDate: need.estimatedDueDate?.toISOString() ?? null },
  });
}

