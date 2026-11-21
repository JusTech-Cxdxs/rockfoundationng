'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { clientIp } from '@/lib/customer-audit';
import { logCustomerError } from '@/lib/error-events';
import { currentCustomer } from '@/lib/customer-portal/session';
import { LINK_PROBLEM, recordEstimateAnswer, type EstimateAnswer } from '@/lib/estimate-approval-core';

/**
 * The customer approves or declines their estimate: on the secure link's
 * page (the unguessable link IS the permission, like the support request
 * page; nothing changes on opening it, only when a button is pressed), or
 * on their own Job Card page in the customer portal (the signed-in
 * customer's own Job Card only). Both are rate-limited.
 */

export type AnswerState = { ok: boolean; message: string; answered?: EstimateAnswer } | null;

const hits = new Map<string, number[]>();
function tooMany(key: string): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(key, list);
  return list.length > 10;
}

async function ip(): Promise<string | null> {
  try { return clientIp(await headers()); } catch { return null; }
}

const noteFrom = (f: FormData) => String(f.get('note') ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 500) || null;
const answerFrom = (f: FormData): EstimateAnswer | null => (f.get('answer') === 'approve' ? 'approve' : f.get('answer') === 'decline' ? 'decline' : null);

function thanks(answer: EstimateAnswer, workStarted: boolean): string {
  if (answer === 'decline') return 'Thank you for letting us know. We have told the team, and the branch will contact you about your vehicle.';
  return workStarted
    ? 'Thank you — your estimate is approved and our team can start work on your vehicle. We will keep you posted.'
    : 'Thank you — your estimate is approved. Work starts as soon as the deposit is received; the details on how to pay are in our email and your customer portal.';
}

/** The answer on the secure link's page (no sign-in). */
export async function answerByLink(_prev: AnswerState, f: FormData): Promise<AnswerState> {
  const token = String(f.get('token') ?? '');
  const answer = answerFrom(f);
  if (!answer) return { ok: false, message: 'Choose Approve or Decline.' };
  const addr = await ip();
  if (tooMany(`link:${token}`) || (addr && tooMany(`ip:${addr}`))) return { ok: false, message: 'Please wait a moment, then try again.' };
  try {
    const r = await recordEstimateAnswer({ via: 'LINK', answer, note: noteFrom(f), token, ipAddress: addr });
    if (!r.ok) return { ok: false, message: LINK_PROBLEM[r.reason] };
    // No refresh of the page here: it would now read the link as used and
    // replace this thank-you with "already used".
    return { ok: true, message: thanks(answer, r.workStarted), answered: answer };
  } catch (err) {
    const ref = await logCustomerError('estimate.answer.link', err);
    return { ok: false, message: `That did not work just now. Please try again, or call the branch (reference ${ref}).` };
  }
}

/** The answer on the signed-in customer's own Job Card page. */
export async function answerInPortal(_prev: AnswerState, f: FormData): Promise<AnswerState> {
  const me = await currentCustomer();
  if (!me) return { ok: false, message: 'Your session has ended. Please sign in again.' };
  const jobCardId = String(f.get('jobCardId') ?? '');
  const answer = answerFrom(f);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(jobCardId)) return { ok: false, message: 'We could not find this Job Card. Refresh the page and try again.' };
  if (!answer) return { ok: false, message: 'Choose Approve or Decline.' };
  if (tooMany(`portal:${me.id}`)) return { ok: false, message: 'Please wait a moment, then try again.' };
  try {
    const r = await recordEstimateAnswer({ via: 'PORTAL', answer, note: noteFrom(f), jobCardId, customerId: me.id, ipAddress: await ip() });
    if (!r.ok) return { ok: false, message: r.reason === 'not-found' ? 'We could not find this Job Card. Refresh the page and try again.' : LINK_PROBLEM[r.reason] };
    revalidatePath('/customer-portal/dashboard', 'layout');
    return { ok: true, message: thanks(answer, r.workStarted), answered: answer };
  } catch (err) {
    const ref = await logCustomerError('estimate.answer.portal', err);
    return { ok: false, message: `We couldn’t save your answer just now. Please try again. If it keeps happening, call your branch and quote reference ${ref}.` };
  }
}
