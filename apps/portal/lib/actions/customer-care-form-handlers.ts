'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { addCallback, callbackNoAnswer, cancelCallback, completeCallback, logComplaint, setCustomerCareDetails } from './customer-care';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Only our own customer-care and customer pages are returned to (never an address from outside). */
function backTo(f: FormData, fallback: string): string {
  const v = str(f, 'returnTo');
  return /^\/(crm(\/[A-Za-z0-9_-]+)*|workshop\/job-cards\/[A-Za-z0-9_-]+)\/?(\?[A-Za-z0-9_=&%.-]*)?(#[a-z-]+)?$/.test(v) ? v : fallback;
}
function go(path: string, key: 'status' | 'error', value: string): never {
  const [base, hash] = path.split('#');
  redirect(`${base}${base!.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}${hash ? `#${hash}` : ''}`);
}
function fail(path: string, err: unknown, fallback: string): never {
  go(path, 'error', friendlyError(err, fallback, 'customer-care-form-handlers'));
}

export async function addCallbackForm(f: FormData): Promise<void> {
  const back = backTo(f, '/crm/callbacks');
  try {
    await addCallback({ customerId: str(f, 'customerId'), reason: str(f, 'reason'), dueAt: str(f, 'dueAt'), note: str(f, 'note'), jobCardId: str(f, 'jobCardId') || undefined, assignedToId: str(f, 'assignedToId') || undefined });
  } catch (err) { fail(back, err, 'The call could not be added.'); }
  revalidatePath('/crm/callbacks');
  go(back, 'status', 'callback_added');
}

export async function completeCallbackForm(f: FormData): Promise<void> {
  const back = backTo(f, '/crm/callbacks');
  try { await completeCallback(str(f, 'id'), str(f, 'outcome')); } catch (err) { fail(back, err, 'The call could not be closed.'); }
  revalidatePath('/crm/callbacks');
  go(back, 'status', 'callback_done');
}

export async function callbackNoAnswerForm(f: FormData): Promise<void> {
  const back = backTo(f, '/crm/callbacks');
  let closed = false;
  try { closed = (await callbackNoAnswer(str(f, 'id'))).closed; } catch (err) { fail(back, err, 'That could not be saved.'); }
  revalidatePath('/crm/callbacks');
  go(back, 'status', closed ? 'callback_no_answer_closed' : 'callback_no_answer');
}

export async function cancelCallbackForm(f: FormData): Promise<void> {
  const back = backTo(f, '/crm/callbacks');
  try { await cancelCallback(str(f, 'id'), str(f, 'reason')); } catch (err) { fail(back, err, 'The call could not be cancelled.'); }
  revalidatePath('/crm/callbacks');
  go(back, 'status', 'callback_cancelled');
}

export async function logComplaintForm(f: FormData): Promise<void> {
  const back = backTo(f, '/crm/complaints');
  let made: { id: string } | null = null;
  try {
    made = await logComplaint({ customerId: str(f, 'customerId'), channel: str(f, 'channel'), category: str(f, 'category'), severity: str(f, 'severity'), details: String(f.get('details') ?? ''), jobCardId: str(f, 'jobCardId') || undefined });
  } catch (err) { fail(back, err, 'The complaint could not be logged.'); }
  revalidatePath('/crm/complaints');
  redirect(`/crm/support/${made!.id}?status=complaint_logged`);
}

export async function setCustomerCareDetailsForm(f: FormData): Promise<void> {
  const id = str(f, 'customerId');
  const back = backTo(f, `/crm/customers/${id}`);
  try { await setCustomerCareDetails(id, { preferredContact: str(f, 'preferredContact'), whatsappPhone: str(f, 'whatsappPhone'), birthday: str(f, 'birthday') }); }
  catch (err) { fail(back, err, 'The contact preferences could not be saved.'); }
  revalidatePath(`/crm/customers/${id}`);
  go(back, 'status', 'care_saved');
}
