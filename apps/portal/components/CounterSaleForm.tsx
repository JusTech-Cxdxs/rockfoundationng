'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CustomerSearchField } from './CustomerSearchField';
import { IdempotencyKey } from './IdempotencyKey';
import { SubmitButton } from './SubmitButton';
import { FormPendingOverlay } from './FormPendingOverlay';
import { searchSaleParts, type SalePartOption } from '@/lib/actions/counter-sales';
import { createCounterSaleFormAction } from '@/lib/actions/counter-sales-form-handlers';
import { saleFigures, PAYMENT_LABEL, PAYMENT_METHODS } from '@/lib/inventory/counter-sale';
import { naira } from '@/lib/crm';

type Line = { part: SalePartOption; quantity: string; serials: string[] };

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

/**
 * Selling parts over the counter: the buyer (a customer or a walk-in), the
 * parts at their selling price with what is free in stock, VAT and the total,
 * and how it was paid. The server checks everything again under the stock
 * lock (lib/actions/counter-sales.ts); this form only helps get it right.
 */
export function CounterSaleForm({ vat }: { vat: { vatEnabled: boolean; vatRate: number } | null }) {
  const [buyerKind, setBuyerKind] = useState<'customer' | 'walk-in'>('walk-in');
  const [customerId, setCustomerId] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SalePartOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const ask = useRef(0);

  useEffect(() => {
    const id = ++ask.current;
    setSearching(true);
    const t = setTimeout(() => {
      searchSaleParts(query)
        .then((found) => { if (id === ask.current) setResults(found); })
        .catch(() => { if (id === ask.current) setResults([]); })
        .finally(() => { if (id === ask.current) setSearching(false); });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const add = (p: SalePartOption) => {
    if (lines.some((l) => l.part.id === p.id)) return;
    setLines((ls) => [...ls, { part: p, quantity: p.trackingType === 'SERIALIZED' ? '0' : '1', serials: [] }]);
  };
  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.part.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => setLines((ls) => ls.filter((l) => l.part.id !== id));

  const priced = lines.map((l) => {
    const qty = l.part.trackingType === 'SERIALIZED' ? l.serials.length : Number(l.quantity);
    const amount = Number.isFinite(qty) && qty > 0 && l.part.sellingPrice ? Math.round(qty * l.part.sellingPrice * 100) / 100 : 0;
    return { ...l, qty, amount };
  });
  const figures = saleFigures(priced.map((l) => ({ amount: l.amount })), vat);
  const payload = useMemo(() => JSON.stringify(priced.map((l) => ({ partId: l.part.id, quantity: l.qty, serialNumbers: l.serials }))), [priced]);

  return (
    <form action={createCounterSaleFormAction} className="relative space-y-6" data-testid="counter-sale-form">
      <FormPendingOverlay />
      <IdempotencyKey />
      <input type="hidden" name="lines" value={payload} />

      <section className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Who is buying</h2>
        <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Who is buying">
          {(['walk-in', 'customer'] as const).map((k) => (
            <label key={k} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium ${buyerKind === k ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] text-[var(--ejo-text-muted)]'}`}>
              <input type="radio" className="sr-only" name="buyerKind" value={k} checked={buyerKind === k} onChange={() => setBuyerKind(k)} />
              {k === 'walk-in' ? 'Walk-in buyer' : 'Registered customer'}
            </label>
          ))}
        </div>
        {buyerKind === 'customer' ? (
          <div>
            <label className={label}>Customer</label>
            <CustomerSearchField name="customerId" required onSelect={setCustomerId} />
            {!customerId ? <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">Their name goes on the receipt and the sale shows on their page.</p> : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="buyerName">Buyer’s name <span className="text-[var(--ejo-error)]">*</span></label>
              <input id="buyerName" name="buyerName" required minLength={2} maxLength={120} placeholder="e.g. Musa Ibrahim" className={field} />
            </div>
            <div>
              <label className={label} htmlFor="buyerPhone">Phone</label>
              <input id="buyerPhone" name="buyerPhone" inputMode="tel" maxLength={30} placeholder="0803 123 4567" className={field} />
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Parts</h2>
        <label className={label} htmlFor="part-search">Find a part</label>
        <input id="part-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, part number or barcode…" className={field} data-testid="counter-sale-part-search" />
        <ul className="mt-2 max-h-56 divide-y divide-[var(--ejo-border)] overflow-y-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]" aria-busy={searching}>
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{searching ? 'Searching…' : 'No part matches.'}</li>
          ) : results.map((p) => {
            const chosen = lines.some((l) => l.part.id === p.id);
            const sellable = p.available > 0 && (p.sellingPrice ?? 0) > 0;
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[var(--ejo-text)]">{p.name}</span>
                  <span className="block text-[11px] text-[var(--ejo-text-muted)]">
                    {[p.partNumber, `${p.available.toLocaleString('en-NG')} ${p.unit} free`, p.sellingPrice ? `${naira(p.sellingPrice)} per ${p.unit}` : 'No selling price yet'].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button type="button" disabled={chosen || !sellable} onClick={() => add(p)} className="shrink-0 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1 text-xs font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-bg)] disabled:opacity-40" aria-label={`Add ${p.name}`}>
                  {chosen ? 'Added' : 'Add'}
                </button>
              </li>
            );
          })}
        </ul>

        {priced.length > 0 ? (
          <div className="mt-4 space-y-3" data-testid="counter-sale-lines">
            {priced.map((l) => (
              <div key={l.part.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--ejo-text)]">{l.part.name}</p>
                    <p className="text-[11px] text-[var(--ejo-text-muted)]">{naira(l.part.sellingPrice)} per {l.part.unit} · {l.part.available.toLocaleString('en-NG')} free</p>
                  </div>
                  <button type="button" onClick={() => remove(l.part.id)} className="text-xs text-[var(--ejo-error)] hover:underline">Remove</button>
                </div>
                {l.part.trackingType === 'SERIALIZED' ? (
                  <fieldset className="mt-2">
                    <legend className={label}>Which units (serial numbers)</legend>
                    <div className="flex flex-wrap gap-2">
                      {l.part.serials.map((s) => (
                        <label key={s} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ejo-border)] px-2 py-1 text-xs">
                          <input type="checkbox" checked={l.serials.includes(s)} onChange={(e) => update(l.part.id, { serials: e.target.checked ? [...l.serials, s] : l.serials.filter((x) => x !== s) })} />
                          {s}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs text-[var(--ejo-text-muted)]" htmlFor={`qty-${l.part.id}`}>Quantity ({l.part.unit})</label>
                    <input id={`qty-${l.part.id}`} type="number" min="0.001" step="any" max={l.part.available} value={l.quantity} onChange={(e) => update(l.part.id, { quantity: e.target.value })} className="w-28 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-sm" />
                  </div>
                )}
                <p className="mt-2 text-right text-sm font-semibold text-[var(--ejo-text)]">{naira(l.amount)}</p>
              </div>
            ))}
            <dl className="ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Subtotal</dt><dd>{naira(figures.subtotal)}</dd></div>
              {figures.vatRate > 0 ? <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">VAT ({figures.vatRate}%)</dt><dd>{naira(figures.vatAmount)}</dd></div> : null}
              <div className="flex justify-between border-t border-[var(--ejo-border)] pt-1 text-base font-bold"><dt>Total</dt><dd data-testid="counter-sale-total">{naira(figures.total)}</dd></div>
            </dl>
          </div>
        ) : (
          <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Add the parts being sold. Only what is free in stock can be sold: parts kept for a job are not offered.</p>
        )}
      </section>

      <section className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Payment</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="paymentMethod">Paid by <span className="text-[var(--ejo-error)]">*</span></label>
            <select id="paymentMethod" name="paymentMethod" required defaultValue="CASH" className={field}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_LABEL[m]}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="paymentReference">Transfer reference</label>
            <input id="paymentReference" name="paymentReference" maxLength={80} placeholder="Optional" className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="notes">Note</label>
            <input id="notes" name="notes" maxLength={500} placeholder="Optional, e.g. for a Toyota Corolla 2015" className={field} />
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">The buyer pays the full {naira(figures.total)} now. The receipt is ready to print or send as soon as the sale is recorded.</p>
      </section>

      <SubmitButton label="Record the sale" pendingLabel="Recording…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60 sm:w-auto" />
    </form>
  );
}
