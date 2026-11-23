'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { decideCreditNote, requestCreditNote } from './credit-notes';
import { addSupplierClaim, updateSupplierClaim } from './warranty';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Only our own pages are returned to (never an address from outside). */
function backTo(f: FormData, fallback: string): string {
  const v = str(f, 'returnTo');
  return /^\/(money|warranty|workshop\/job-cards)(\/[A-Za-z0-9_-]+)*\/?(\?[A-Za-z0-9_=&%.-]*)?(#[a-z-]+)?$/.test(v) ? v : fallback;
}
function go(path: string, key: 'status' | 'error', value: string): never {
  const [base, hash] = path.split('#');
  redirect(`${base}${base!.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}${hash ? `#${hash}` : ''}`);
}
function fail(path: string, err: unknown, fallback: string): never {
  go(path, 'error', friendlyError(err, fallback, 'money-form-handlers'));
}

export async function requestCreditNoteForm(f: FormData): Promise<void> {
  const back = backTo(f, '/money/credit-notes');
  try {
    await requestCreditNote(str(f, 'invoiceId'), str(f, 'amount'), str(f, 'reason'), str(f, 'idempotencyKey') || undefined);
  } catch (err) { fail(back, err, 'The credit note could not be asked for.'); }
  revalidatePath('/money/credit-notes');
  go(back, 'status', 'credit_note_requested');
}

export async function decideCreditNoteForm(f: FormData): Promise<void> {
  const back = backTo(f, '/money/credit-notes');
  const approve = str(f, 'decision') === 'approve';
  try {
    await decideCreditNote(str(f, 'id'), approve, str(f, 'note'));
  } catch (err) { fail(back, err, 'The credit note could not be decided.'); }
  revalidatePath('/money/credit-notes');
  go(back, 'status', approve ? 'credit_note_approved' : 'credit_note_declined');
}

export async function addSupplierClaimForm(f: FormData): Promise<void> {
  const back = backTo(f, '/warranty/claims');
  try {
    await addSupplierClaim({
      supplierId: str(f, 'supplierId') || null, supplierName: str(f, 'supplierName'), jobNumber: str(f, 'jobNumber') || null, partName: str(f, 'partName'),
      partNumber: str(f, 'partNumber') || null, quantity: str(f, 'quantity'), amountClaimed: str(f, 'amountClaimed'), fault: str(f, 'fault'),
    });
  } catch (err) { fail(back, err, 'The claim could not be recorded.'); }
  revalidatePath('/warranty/claims');
  go(back, 'status', 'claim_added');
}

export async function updateSupplierClaimForm(f: FormData): Promise<void> {
  const back = backTo(f, '/warranty/claims');
  try {
    await updateSupplierClaim(str(f, 'id'), str(f, 'to'), { amountRecovered: str(f, 'amountRecovered'), outcome: str(f, 'outcome') });
  } catch (err) { fail(back, err, 'The claim could not be updated.'); }
  revalidatePath('/warranty/claims');
  go(back, 'status', 'claim_updated');
}
