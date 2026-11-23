import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Icon } from '@/components/ui';
import { requestCreditNoteForm } from '@/lib/actions/money-form-handlers';
import { naira } from '@/lib/money/rules';
import type { CreditNoteRow } from '@/lib/actions/credit-notes';

const STATUS: Record<string, string> = { PENDING: 'Waiting for the Owner', APPROVED: 'Approved', DECLINED: 'Declined' };
const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';

/** The invoice's credit notes on the Job Card: each one with its state and PDF, and "Ask for a credit note" for front desk and Accounts. */
export function CreditNotesPanel({ jobCardId, invoiceId, data }: { jobCardId: string; invoiceId: string; data: { rows: CreditNoteRow[]; available: number; canRequest: boolean; canApprove: boolean } }) {
  if (!data.rows.length && !data.canRequest) return null;
  return (
    <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6" data-testid="credit-notes-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Credit notes</h2>
        {data.canApprove && data.rows.some((r) => r.status === 'PENDING') ? <Link href="/money/credit-notes?show=pending" className="text-xs font-semibold text-[var(--ejo-primary)] hover:underline">Decide in Money → Credit notes</Link> : null}
      </div>
      {data.rows.length ? (
        <ul className="mt-2 divide-y divide-[var(--ejo-border)] text-sm">
          {data.rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><span className="font-medium">{r.number ?? 'Not numbered yet'}</span> · {naira(r.amount)} · {STATUS[r.status]}<span className="block text-xs text-[var(--ejo-text-muted)]">“{r.reason}”{r.declineNote ? ` — declined: ${r.declineNote}` : ''}</span></span>
              {r.status === 'APPROVED' ? <a href={`/api/credit-notes/${r.id}/pdf`} className="inline-flex items-center gap-1 rounded-full border border-[var(--ejo-border)] px-3 py-1 text-xs font-semibold"><Icon name="download" size={14} /> PDF</a> : null}
            </li>
          ))}
        </ul>
      ) : <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">None on this invoice.</p>}
      {data.canRequest && data.available > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--ejo-primary)]">Ask for a credit note</summary>
          <form action={requestCreditNoteForm} className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr]" data-testid="credit-note-form">
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <input type="hidden" name="returnTo" value={`/workshop/job-cards/${jobCardId}#invoice-panel`} />
            <label><span className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Amount (₦, VAT included)</span><input name="amount" required inputMode="decimal" placeholder={`Up to ${naira(data.available)}`} className={field} /></label>
            <label><span className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Why</span><input name="reason" required minLength={5} maxLength={500} placeholder="e.g. Charged twice for the oil filter" className={field} /></label>
            <div className="sm:col-span-2"><SubmitButton label="Ask the Owner" pendingLabel="Sending…" className="min-h-11 rounded-full bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white" /></div>
          </form>
        </details>
      ) : null}
    </div>
  );
}
