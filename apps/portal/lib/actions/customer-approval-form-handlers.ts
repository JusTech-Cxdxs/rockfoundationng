'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { recordCustomerApprovalByPhone, sendEstimateApprovalLink } from './customer-approval';

/** <form action={...}> wrappers around lib/actions/customer-approval.ts. */

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function recordCustomerApprovalByPhoneFormAction(formData: FormData) {
  const jobCardId = str(formData, 'jobCardId');
  let started = false;
  try {
    started = (await recordCustomerApprovalByPhone(jobCardId, str(formData, 'spokeWith'), str(formData, 'note') || undefined)).workStarted;
  } catch (err) {
    const message = friendlyError(err, 'Could not record the customer’s approval.', 'customer-approval-form-handlers');
    redirect(`/workshop/job-cards/${jobCardId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/job-cards/${jobCardId}`);
  redirect(`/workshop/job-cards/${jobCardId}?status=${started ? 'customer_approved_started' : 'customer_approved'}`);
}

/** The state the "Send approval link" panel shows: the WhatsApp message is opened by the colleague, never sent by us. */
export type ApprovalLinkState = { ok: boolean; message: string; whatsAppUrl?: string | null; at?: number } | null;

export async function sendEstimateApprovalLinkAction(_prev: ApprovalLinkState, formData: FormData): Promise<ApprovalLinkState> {
  const jobCardId = str(formData, 'jobCardId');
  try {
    const sent = await sendEstimateApprovalLink(jobCardId);
    revalidatePath(`/workshop/job-cards/${jobCardId}`);
    const parts = [
      'A new approval link is ready (any earlier link no longer works).',
      sent.emailed ? 'It has been emailed to the customer.' : 'The customer has no email address on file, so it was not emailed.',
      sent.whatsAppUrl ? 'To send it on WhatsApp, press “Share on WhatsApp” and send the message from your phone.' : 'There is no usable mobile number for WhatsApp.',
    ];
    return { ok: true, message: parts.join(' '), whatsAppUrl: sent.whatsAppUrl, at: Date.now() };
  } catch (err) {
    return { ok: false, message: friendlyError(err, 'Could not make the approval link.', 'customer-approval-form-handlers'), at: Date.now() };
  }
}
