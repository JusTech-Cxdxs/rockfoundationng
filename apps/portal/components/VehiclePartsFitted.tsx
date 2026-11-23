'use client';

import { useMemo, useState } from 'react';
import { LoadingLink } from '@/components/LoadingLink';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';
import { naira } from '@/lib/crm';

export type PartFittedRow = {
  id: string;
  date: string | null;
  dateLabel: string;
  /** Null for a part bought outside (not in the catalogue). */
  partId: string | null;
  partName: string;
  partNumber: string | null;
  unit: string;
  quantity: number;
  serials: string[];
  /** The selling price charged for one (null when not priced; 0 under warranty or goodwill). */
  unitPrice: number | null;
  /** Covered, not charged: "Warranty", "Goodwill", "Internal". */
  covered: string | null;
  /** From the store (a parts request), or bought outside for the job. */
  source: 'STORE' | 'OUTSIDE';
  slipId: string | null;
  slipNumber: string | null;
  jobCard: { id: string; number: string } | null;
  customer: string | null;
};

const RECENT = 5;

/** Search across every number and name a row carries. */
export function filterPartsFitted(rows: PartFittedRow[], query: string): PartFittedRow[] {
  const t = query.trim().toLowerCase();
  if (!t) return rows;
  return rows.filter((r) =>
    [r.slipNumber, r.jobCard?.number, r.partName, r.partNumber, r.dateLabel, r.customer, ...r.serials]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(t)),
  );
}

/**
 * Every part released to this vehicle, newest first — searchable by PRS,
 * Job Card, part name or number, serial or date. Shows the latest few with "View all"; rows wrap (never scroll
 * sideways) and every number opens its exact record.
 */
export function VehiclePartsFitted({ rows }: { rows: PartFittedRow[] }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const filtered = useMemo(() => filterPartsFitted(rows, q), [q, rows]);
  const searching = q.trim().length > 0;
  const shown = searching || all ? filtered : filtered.slice(0, RECENT);
  const link = 'text-[var(--ejo-primary)] hover:underline';

  return (
    <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Parts fitted</h2>
          <p className="text-xs text-[var(--ejo-text-muted)]">{pluralize(rows.length, 'part')} fitted to this vehicle (from the store and bought outside), newest first, at the price charged.</p>
        </div>
        {rows.length > 0 ? (
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search PRS, JC, part, serial or date…"
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)] sm:w-80"
          />
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--ejo-text-muted)]">No parts have been fitted to this vehicle yet.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--ejo-text-muted)]">Nothing matches &ldquo;{q}&rdquo;.</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--ejo-border)]">
          {shown.map((r) => (
            <li key={r.id} className="grid gap-x-6 gap-y-1 py-3 text-sm sm:grid-cols-[110px_minmax(0,2fr)_minmax(0,1.5fr)]">
              <span className="text-xs text-[var(--ejo-text-muted)]">{r.dateLabel}</span>
              <span className="min-w-0 break-words">
                {r.partId ? <LoadingLink href={`/inventory/parts/${r.partId}`} className={`font-medium ${link}`}>{r.partName}</LoadingLink> : <span className="font-medium text-[var(--ejo-text)]">{r.partName}</span>}
                <span className="block text-xs text-[var(--ejo-text-muted)]">
                  {r.partNumber ? `${r.partNumber} · ` : ''}
                  {r.quantity.toLocaleString('en-NG', { maximumFractionDigits: 3 })} {pluralizeWord(r.quantity, r.unit)}
                  {r.serials.length ? ` · ${pluralizeWord(r.serials.length, 'serial')} ${r.serials.join(', ')}` : ''}
                  {r.covered ? ` · ${r.covered}, not charged` : r.unitPrice !== null ? ` · ${naira(r.unitPrice)} each` : ''}
                  {r.source === 'OUTSIDE' ? ' · bought outside' : ''}
                </span>
              </span>
              <span className="min-w-0 break-words text-xs">
                {r.slipId ? <><LoadingLink href={`/workshop/parts-requests/${r.slipId}`} className={link}>{r.slipNumber}</LoadingLink>{' · '}</> : null}
                {r.jobCard ? <LoadingLink href={`/workshop/job-cards/${r.jobCard.id}`} className={link}>{r.jobCard.number}</LoadingLink> : null}
                {r.customer ? <span className="block text-[var(--ejo-text-muted)]">{r.customer}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!searching && filtered.length > RECENT ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 text-xs font-medium text-[var(--ejo-primary)] hover:underline">
          {all ? 'Show only the latest' : `View all ${filtered.length} (${filtered.length - RECENT} more)`}
        </button>
      ) : null}
      {searching ? <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">{pluralize(filtered.length, 'match', 'matches')} for &ldquo;{q}&rdquo;.</p> : null}
    </div>
  );
}
