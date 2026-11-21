'use server';

import { friendlyError } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { updateBillingSettings, updateOrganisation } from './organisation';

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function strList(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function updateOrganisationFormAction(formData: FormData) {
  const organisationId = str(formData, 'organisationId');
  try {
    await updateOrganisation(organisationId, {
      name: str(formData, 'name'),
      legalName: str(formData, 'legalName'),
      website: str(formData, 'website'),
      email: str(formData, 'email'),
      hotlines: strList(formData, 'hotlines'),
      hqAddress: str(formData, 'hqAddress'),
      poBox: str(formData, 'poBox'),
      rcNumber: str(formData, 'rcNumber'),
    });
  } catch (err) {
    const message = friendlyError(err, 'Could not update organisation details.', 'organisation-form-handlers');
    redirect(`/organisation?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/organisation');
  redirect('/organisation?status=updated');
}

export async function updateBillingSettingsFormAction(formData: FormData) {
  const organisationId = str(formData, 'organisationId');
  const threshold = str(formData, 'discountApprovalPercent');
  try {
    await updateBillingSettings(organisationId, {
      vatEnabled: formData.get('vatEnabled') === 'on',
      vatRate: Number(str(formData, 'vatRate') || '7.5'),
      vatNumber: str(formData, 'vatNumber'),
      discountApprovalPercent: threshold === '' ? null : Number(threshold),
      depositRequired: formData.get('depositRequired') === 'on',
      depositPercent: Number(str(formData, 'depositPercent') || '70'),
    });
  } catch (err) {
    const message = friendlyError(err, 'Could not update billing and tax settings.', 'organisation-form-handlers');
    redirect(`/organisation?editBilling=true&error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/organisation');
  redirect('/organisation?status=billing-updated');
}
