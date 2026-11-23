'use client';

import { useMemo, useState } from 'react';
import { IdempotencyKey } from './IdempotencyKey';
import { SubmitButton } from './SubmitButton';
import { FormPendingOverlay } from './FormPendingOverlay';
import { createStockCountFormAction } from '@/lib/actions/stock-counts-form-handlers';
import { COUNT_REASONS } from '@/lib/inventory/stock-count';
import type { CountablePart } from '@/lib/actions/stock-counts';

const cell = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-sm text-[var(--ejo-text)]';

/**
 * The count sheet: what the system holds for each part beside a box for what
 * is on the shelf. Parts left blank are not counted. A difference asks for a
 * reason before the count can be sent; the server checks it all again.
 */
export function StockCountForm({ parts }: { parts: CountablePart[] }) {
  const [filter, setFilter] = useState('');
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? parts.filter((p) => `${p.name} ${p.partNumber ?? ''} ${p.category ?? ''}`.toLowerCase().includes(q)) : parts;
  }, [parts, filter]);
  const diffOf = (p: CountablePart) => {
    const v = counted[p.id];
    if (v === undefined || v.trim() === '' || !Number.isFinite(Number(v))) return null;
    return Math.round((Number(v) - p.onHand) * 10000) / 10000;
  };
  const touched = parts.filter((p) => diffOf(p) !== null);
  const differences = touched.filter((p) => diffOf(p) !== 0);
  return (
    <form action={createStockCountFormAction} className="relative space-y-4" data-testid="stock-count-form">
      <FormPendingOverlay />
      <IdempotencyKey />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="count-filter" className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Find a part on the sheet</label>
          <input id="count-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Name, part number or category…" className={`${cell} w-full py-2`} />
        </div>
        <p className="text-xs text-[var(--ejo-text-muted)]" aria-live="polite">{touched.length} counted · {differences.length} with a difference</p>
      </div>
      <div className="overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
              <th className="px-3 py-2">Part</th>
              <th className="px-3 py-2 text-right">System</th>
              <th className="px-3 py-2">On the shelf</th>
              <th className="px-3 py-2 text-right">Difference</th>
              <th className="px-3 py-2">Why</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const d = diffOf(p);
              const reason = reasons[p.id] ?? '';
              return (
                <tr key={p.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-medium text-[var(--ejo-text)]">{p.name}</span>
                    <span className="block text-[11px] text-[var(--ejo-text-muted)]">{[p.partNumber, p.category, p.reserved > 0 ? `${p.reserved.toLocaleString('en-NG')} kept for jobs` : null].filter(Boolean).join(' · ')}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--ejo-text-muted)]">{p.onHand.toLocaleString('en-NG')} {p.unit}</td>
                  <td className="px-3 py-2">
                    <input name={`counted:${p.id}`} aria-label={`On the shelf: ${p.name}`} type="number" min="0" step="any" inputMode="decimal" value={counted[p.id] ?? ''} onChange={(e) => setCounted((c) => ({ ...c, [p.id]: e.target.value }))} className={`${cell} w-28`} />
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${d === null || d === 0 ? 'text-[var(--ejo-text-muted)]' : d < 0 ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-success)]'}`}>
                    {d === null ? '' : d === 0 ? 'Matches' : `${d > 0 ? '+' : ''}${d.toLocaleString('en-NG')}`}
                  </td>
                  <td className="px-3 py-2">
                    {d !== null && d !== 0 ? (
                      <div className="space-y-1">
                        <select name={`reason:${p.id}`} required aria-label={`Why: ${p.name}`} value={reason} onChange={(e) => setReasons((r) => ({ ...r, [p.id]: e.target.value }))} className={`${cell} w-full`}>
                          <option value="" disabled>Choose…</option>
                          {COUNT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        {reason === 'Other' ? <input name={`reasonText:${p.id}`} required minLength={3} maxLength={200} placeholder="Say what happened" aria-label={`What happened: ${p.name}`} className={`${cell} w-full`} /> : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <label htmlFor="count-note" className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Note for the Owner</label>
        <input id="count-note" name="note" maxLength={500} placeholder="Optional, e.g. Monthly count of the filters shelf" className={`${cell} w-full py-2`} />
      </div>
      <p className="text-xs text-[var(--ejo-text-muted)]">Differences go to the Owner for approval. Nothing on the stock changes until then.</p>
      <SubmitButton label="Send the count" pendingLabel="Sending…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60 sm:w-auto" />
    </form>
  );
}
