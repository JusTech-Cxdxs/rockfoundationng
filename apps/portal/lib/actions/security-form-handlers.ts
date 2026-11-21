'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { confirmVehicleExit } from './security';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Security confirms a released vehicle leaving; on to its gate pass. */
export async function confirmVehicleExitFormAction(f: FormData) {
  const recordId = str(f, 'recordId');
  let id = '';
  try {
    id = (await confirmVehicleExit(recordId, str(f, 'collectedBy'), str(f, 'notes'))).id;
  } catch (err) {
    const message = friendlyError(err, 'Could not record the vehicle leaving.', 'security-form-handlers');
    redirect(`/security/vehicles/release/${recordId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/security/vehicles');
  revalidatePath('/security');
  redirect(`/security/vehicles/exits/${id}?status=vehicle_out`);
}
