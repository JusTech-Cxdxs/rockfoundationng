'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { bookForCustomer, cancelAppointment, confirmAppointment, rescheduleAppointment, saveAppointmentSettings } from './appointments';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Only the bookings page is returned to (never an address from outside). */
function backTo(f: FormData): string {
  const v = str(f, 'returnTo');
  return /^\/workshop\/bookings\/?(\?[A-Za-z0-9_=&%.-]*)?$/.test(v) ? v : '/workshop/bookings';
}
function go(path: string, key: 'status' | 'error', value: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`);
}
function fail(path: string, err: unknown, fallback: string): never {
  go(path, 'error', friendlyError(err, fallback, 'appointment-form-handlers'));
}

export async function confirmAppointmentForm(f: FormData): Promise<void> {
  const back = backTo(f);
  try { await confirmAppointment(str(f, 'id')); } catch (err) { fail(back, err, 'The booking could not be confirmed.'); }
  revalidatePath('/workshop/bookings');
  go(back, 'status', 'confirmed');
}

export async function rescheduleAppointmentForm(f: FormData): Promise<void> {
  const back = backTo(f);
  try { await rescheduleAppointment(str(f, 'id'), str(f, 'day'), str(f, 'slot')); } catch (err) { fail(back, err, 'The booking could not be moved.'); }
  revalidatePath('/workshop/bookings');
  go(back, 'status', 'moved');
}

export async function cancelAppointmentForm(f: FormData): Promise<void> {
  const back = backTo(f);
  try { await cancelAppointment(str(f, 'id'), str(f, 'reason')); } catch (err) { fail(back, err, 'The booking could not be cancelled.'); }
  revalidatePath('/workshop/bookings');
  go(back, 'status', 'cancelled');
}

export async function bookForCustomerForm(f: FormData): Promise<void> {
  const back = backTo(f);
  let number = '';
  try {
    number = (await bookForCustomer({
      customerId: str(f, 'customerId') || undefined, vehicleId: str(f, 'vehicleId') || undefined, name: str(f, 'name'), phone: str(f, 'phone'),
      jobType: str(f, 'jobType'), day: str(f, 'day'), slot: str(f, 'slot'), note: str(f, 'note'),
    })).number;
  } catch (err) { fail(back, err, 'The booking could not be made.'); }
  revalidatePath('/workshop/bookings');
  go(`/workshop/bookings?day=${encodeURIComponent(str(f, 'day'))}`, 'status', `booked:${number}`);
}

export async function saveAppointmentSettingsForm(f: FormData): Promise<void> {
  const back = '/settings/bookings';
  try {
    const capacity = Object.fromEntries(['SERVICE', 'REPAIR', 'SERVICE_AND_REPAIR', 'DIAGNOSTICS', 'SPRAYING', 'CAR_WASH'].map((t) => [t, Number(str(f, `capacity_${t}`) || 0)]));
    await saveAppointmentSettings({
      openDays: f.getAll('openDays').map((v) => Number(v)),
      slots: str(f, 'slots').split(/[\s,]+/).filter(Boolean),
      capacity,
      maxDaysAhead: Number(str(f, 'maxDaysAhead')),
      minHoursNotice: Number(str(f, 'minHoursNotice')),
    });
  } catch (err) { fail(back, err, 'The booking settings could not be saved.'); }
  revalidatePath('/settings/bookings');
  go(back, 'status', 'saved');
}
