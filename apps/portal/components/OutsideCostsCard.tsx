import { naira } from '@/lib/crm';
import { setOutsideCostFormAction } from '@/lib/actions/outside-purchases-form-handlers';
import type { OutsideCostRow } from '@/lib/actions/outside-purchases';
import { SubmitButton } from './SubmitButton';

/**
 * What the parts and jobs bought outside for this Job Card cost the workshop,
 * beside what the customer is charged. Rendered only for those who see costs
 * (the Owner): the rows are null for everyone else (lib/actions/outside-purchases.ts).
 */
export function OutsideCostsCard({ jobCardId, rows }: { jobCardId: string; rows: OutsideCostRow[] }) {
  if (rows.length === 0) return null;
  const field = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-sm text-[var(--ejo-text)]';
  return (
    <div id="outside-costs" className="scroll-mt-20 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6" data-testid="outside-costs">
      <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Bought outside: what it cost</h2>
      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Only you see these figures. They make the profit on outside parts and jobs real.</p>
      <ul className="mt-4 space-y-3">
        {rows.map((r) => {
          const margin = r.cost !== null && r.charged !== null ? Math.round((r.charged - r.cost) * 100) / 100 : null;
          return (
            <li key={r.lineId} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-[var(--ejo-text)]">{r.description} <span className="text-xs text-[var(--ejo-text-muted)]">{r.type === 'EXTERNAL_PART' ? 'Outside part' : 'Outside job'} · ×{r.quantity}</span></span>
                <span className="text-xs text-[var(--ejo-text-muted)]">Charged {r.charged === null ? 'not priced yet' : naira(r.charged)}{margin !== null ? ` · ${margin >= 0 ? 'profit' : 'loss'} ${naira(Math.abs(margin))}` : ''}</span>
              </div>
              <form action={setOutsideCostFormAction} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="jobCardId" value={jobCardId} />
                <input type="hidden" name="lineId" value={r.lineId} />
                <label className="sr-only" htmlFor={`cost-${r.lineId}`}>What it cost</label>
                <input id={`cost-${r.lineId}`} name="cost" type="number" min="0" step="0.01" required defaultValue={r.cost ?? ''} placeholder="What it cost (₦)" className={`${field} w-36`} />
                <label className="sr-only" htmlFor={`supplier-${r.lineId}`}>Bought from</label>
                <input id={`supplier-${r.lineId}`} name="supplierName" maxLength={120} defaultValue={r.supplierName ?? ''} placeholder="Bought from (optional)" className={`${field} min-w-0 flex-1`} />
                <SubmitButton label={r.cost === null ? 'Save' : 'Update'} pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:brightness-110" />
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
