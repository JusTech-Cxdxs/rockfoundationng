'use server';

import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { createStockCount, decideStockCount } from './stock-counts';

const str = (f: FormData, k: string) => { const v = f.get(k); return typeof v === 'string' ? v.trim() : ''; };

/** The count form: one "counted:<partId>" and "reason:<partId>" field per part. */
export async function createStockCountFormAction(formData: FormData) {
  let made: { id: string } | null = null;
  try {
    const lines: { partId: string; counted: string; reason: string }[] = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith('counted:') || typeof value !== 'string') continue;
      const partId = key.slice('counted:'.length);
      lines.push({ partId, counted: value, reason: str(formData, `reason:${partId}`) || str(formData, `reasonText:${partId}`) });
    }
    // "Other" asks for the person's own words.
    for (const l of lines) if (l.reason === 'Other') l.reason = str(formData, `reasonText:${l.partId}`) || 'Other';
    made = await createStockCount({ idempotencyKey: str(formData, 'idempotencyKey') || undefined, note: str(formData, 'note'), lines });
  } catch (err) {
    redirect(`/inventory/stock-counts/new?error=${encodeURIComponent(friendlyError(err, 'The count could not be recorded.', 'stock-counts-form-handlers'))}`);
  }
  redirect(`/inventory/stock-counts/${made!.id}?status=recorded`);
}

export async function decideStockCountFormAction(formData: FormData) {
  const id = str(formData, 'id');
  const decision = str(formData, 'decision') === 'REJECT' ? 'REJECT' : 'APPROVE';
  try {
    await decideStockCount(id, decision, str(formData, 'note'));
  } catch (err) {
    redirect(`/inventory/stock-counts/${encodeURIComponent(id)}?error=${encodeURIComponent(friendlyError(err, 'The decision could not be saved.', 'stock-counts-form-handlers'))}`);
  }
  redirect(`/inventory/stock-counts/${encodeURIComponent(id)}?status=${decision === 'APPROVE' ? 'approved' : 'rejected'}`);
}
