'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { attendToOverdueVehicle, runServiceRemindersNow, sendManualServiceReminder, stopTrackingVehicle, updatePrimaryServiceInterval } from './service-tracking';

/** Thin <form action={...}> wrappers around lib/actions/service-tracking.ts. */

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
function num(formData: FormData, key: string): number | undefined {
  const value = str(formData, key);
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
/** Only a workshop page of this portal (never another site). */
function safeWorkshopPath(raw: string, fallback: string): string {
  return raw.startsWith('/workshop/') && !raw.startsWith('//') && !raw.includes('://') ? (raw.split('?')[0] ?? fallback) : fallback;
}

export async function updatePrimaryServiceIntervalFormAction(formData: FormData) {
  const returnTo = safeWorkshopPath(str(formData, 'returnTo'), '/workshop/service-tracker');
  try {
    await updatePrimaryServiceInterval(str(formData, 'organisationId'), num(formData, 'primaryServiceIntervalKm'), num(formData, 'primaryServiceIntervalDays'));
  } catch (err) {
    const message = friendlyError(err, 'Could not update the service interval.', 'service-tracking-form-handlers');
    redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/workshop/service-tracker');
  redirect(`${returnTo}?status=interval_updated`);
}

export async function attendToOverdueVehicleFormAction(formData: FormData) {
  const returnTo = safeWorkshopPath(str(formData, 'returnTo'), '/workshop/service-tracker');
  try {
    await attendToOverdueVehicle(str(formData, 'serviceId'));
  } catch (err) {
    const message = friendlyError(err, 'Could not attend to this vehicle.', 'service-tracking-form-handlers');
    redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/workshop/service-tracker');
  redirect(`${returnTo}?status=attended`);
}

export async function sendManualServiceReminderFormAction(formData: FormData) {
  const returnTo = safeWorkshopPath(str(formData, 'returnTo'), '/workshop/service-tracker');
  try {
    await sendManualServiceReminder(str(formData, 'vehicleId'));
  } catch (err) {
    const message = friendlyError(err, 'Could not send the reminder.', 'service-tracking-form-handlers');
    redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(returnTo);
  revalidatePath('/workshop/service-tracker');
  redirect(`${returnTo}?status=reminder_sent`);
}

export async function runServiceRemindersNowFormAction() {
  let result = { evaluated: 0, sent: 0, failed: 0 };
  try {
    result = await runServiceRemindersNow();
  } catch (err) {
    const message = friendlyError(err, 'Could not run reminders.', 'service-tracking-form-handlers');
    redirect(`/workshop/service-tracker?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/workshop/service-tracker');
  redirect(`/workshop/service-tracker?status=reminders_run&sent=${result.sent}&evaluated=${result.evaluated}&failed=${result.failed}`);
}

export async function stopTrackingVehicleFormAction(formData: FormData) {
  const returnTo = safeWorkshopPath(str(formData, 'returnTo'), '/workshop/service-tracker');
  try {
    await stopTrackingVehicle(str(formData, 'vehicleId'), str(formData, 'reason'));
  } catch (err) {
    const message = friendlyError(err, 'Could not stop tracking this vehicle.', 'service-tracking-form-handlers');
    redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/workshop/service-tracker');
  revalidatePath(returnTo);
  redirect(`${returnTo}?status=tracking_stopped`);
}
