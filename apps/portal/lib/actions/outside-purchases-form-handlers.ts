'use server';

import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { setOutsideCost } from './outside-purchases';

export async function setOutsideCostFormAction(formData: FormData) {
  const s = (k: string) => { const v = formData.get(k); return typeof v === 'string' ? v.trim() : ''; };
  const jobCardId = s('jobCardId');
  try {
    await setOutsideCost(s('lineId'), Number(s('cost')), s('supplierName'));
  } catch (err) {
    redirect(`/workshop/job-cards/${encodeURIComponent(jobCardId)}?error=${encodeURIComponent(friendlyError(err, 'The cost could not be saved.', 'outside-purchases-form-handlers'))}#outside-costs`);
  }
  redirect(`/workshop/job-cards/${encodeURIComponent(jobCardId)}?status=outside_cost_saved#outside-costs`);
}
