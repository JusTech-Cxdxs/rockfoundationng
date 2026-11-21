'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { reviewIntegrityAlert, runIntegrityScanNow } from './integrity';
import { requireUser } from './workshop';

/** <form action> wrappers for the integrity watch and Speak up (each calls the authorised action). */

const str = (f: FormData, k: string) => String(f.get(k) ?? '');

export async function reviewIntegrityAlertAction(f: FormData): Promise<void> {
  await requireUser();
  const id = str(f, 'id');
  try {
    await reviewIntegrityAlert({ id, status: str(f, 'status'), resolution: str(f, 'resolution') });
  } catch (err) {
    redirect(`/integrity/${encodeURIComponent(id)}?error=${encodeURIComponent(friendlyError(err, 'Could not save your review.', 'integrity-form-handlers'))}`);
  }
  revalidatePath('/integrity');
  redirect(`/integrity/${encodeURIComponent(id)}?status=saved`);
}

export async function runIntegrityScanAction(): Promise<void> {
  await requireUser();
  let q = '';
  try {
    const r = await runIntegrityScanNow();
    q = `status=scanned&found=${r.findings}&new=${r.created}`;
  } catch (err) {
    q = `error=${encodeURIComponent(friendlyError(err, 'The checks could not run just now.', 'integrity-form-handlers'))}`;
  }
  revalidatePath('/integrity');
  redirect(`/integrity?${q}`);
}
