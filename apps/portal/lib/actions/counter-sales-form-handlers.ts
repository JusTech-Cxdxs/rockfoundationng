'use server';

import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { createCounterSale } from './counter-sales';

/** <form action> for the counter sale (components/CounterSaleForm.tsx). Lines arrive as JSON from the form. */
export async function createCounterSaleFormAction(formData: FormData) {
  const str = (k: string) => { const v = formData.get(k); return typeof v === 'string' ? v.trim() : ''; };
  let sale: { id: string } | null = null;
  try {
    let lines: { partId: string; quantity: number; serialNumbers?: string[] }[] = [];
    try {
      const parsed = JSON.parse(str('lines') || '[]') as unknown;
      if (Array.isArray(parsed)) lines = parsed.slice(0, 60).map((l) => ({ partId: String(l?.partId ?? ''), quantity: Number(l?.quantity), serialNumbers: Array.isArray(l?.serialNumbers) ? l.serialNumbers.slice(0, 100).map(String) : [] }));
    } catch {
      lines = [];
    }
    sale = await createCounterSale({
      idempotencyKey: str('idempotencyKey') || undefined,
      customerId: str('customerId') || null,
      buyerName: str('buyerName'),
      buyerPhone: str('buyerPhone'),
      lines,
      paymentMethod: str('paymentMethod'),
      paymentReference: str('paymentReference'),
      notes: str('notes'),
    });
  } catch (err) {
    redirect(`/inventory/counter-sales/new?error=${encodeURIComponent(friendlyError(err, 'The sale could not be recorded.', 'counter-sales-form-handlers'))}`);
  }
  redirect(`/inventory/counter-sales/${sale!.id}?status=sold`);
}
