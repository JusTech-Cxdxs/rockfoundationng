import Link from 'next/link';
import { guardAnyPage } from '@/lib/authz/server';
import { PageHeader, SectionCard, EmptyState, StatusChip, Icon } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { listCreditNotes } from '@/lib/actions/credit-notes';
import { decideCreditNoteForm } from '@/lib/actions/money-form-handlers';
import { naira } from '@/lib/money/rules';
import { formatDateTime } from '@/lib/utils/format-date';
import { MoneyTabs } from '@/components/money/MoneyTabs';

export const dynamic = 'force-dynamic';

const SAVED: Record<string, string> = { credit_note_approved: 'Credit note approved and numbered.', credit_note_declined: 'Credit note declined.', credit_note_requested: 'Credit note asked for — it waits for the Owner.' };
const STATUS: Record<string, string> = { PENDING: 'Waiting for the Owner', APPROVED: 'Approved', DECLINED: 'Declined' };
const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';

/**
 * Money → Credit notes: every credit note asked for, and the Owner's decision
 * on each pending one. They are asked for from the Job Card, against its invoice.
 */
export default async function CreditNotesPage({ searchParams }: { searchParams: Promise<{ show?: string; status?: string; error?: string }> }) {
  await guardAnyPage(['money.credit_note.request', 'money.credit_note.approve'], '/money/credit-notes');
  const sp = await searchParams;
  const show = sp.show === 'pending' ? 'pending' : 'all';
  const { rows, canApprove } = await listCreditNotes(show);
  const back = `/money/credit-notes${show === 'pending' ? '?show=pending' : ''}`;
  return (
    <div className="p-4 sm:p-8">
      <PageHeader icon="receipt" title="Credit notes" description="Money a customer no longer owes on an invoice: an overcharge, goodwill, a part returned. Asked for from the Job Card; the Owner approves each one." />
      <MoneyTabs active="credit-notes" />
      {sp.error ? <div className="mb-4"><FormFeedbackBanner kind="error" message={sp.error} /></div> : null}
      {sp.status && SAVED[sp.status] ? <div className="mb-4"><FormFeedbackBanner kind="success" message={SAVED[sp.status]!} /></div> : null}
      <nav aria-label="Show" className="mb-4 inline-flex gap-1 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1 text-sm">
        <Link href="/money/credit-notes?show=pending" aria-current={show === 'pending' ? 'page' : undefined} className={`rounded-full px-3.5 py-1.5 font-medium ${show === 'pending' ? 'bg-[var(--ejo-primary)] text-white' : 'text-[var(--ejo-text-muted)]'}`}>Waiting</Link>
        <Link href="/money/credit-notes" aria-current={show === 'all' ? 'page' : undefined} className={`rounded-full px-3.5 py-1.5 font-medium ${show === 'all' ? 'bg-[var(--ejo-primary)] text-white' : 'text-[var(--ejo-text-muted)]'}`}>All</Link>
      </nav>
      <SectionCard icon="receipt" title={`${rows.length} credit ${rows.length === 1 ? 'note' : 'notes'}`}>
        {rows.length === 0 ? <EmptyState icon="check-circle" title={show === 'pending' ? 'Nothing waiting' : 'No credit notes yet'} compact /> : (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {rows.map((c) => (
              <li key={c.id} className="py-4" data-testid="credit-note">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--ejo-text)]">{c.number ?? 'Not numbered yet'} · {naira(c.amount)}{c.vatAmount > 0 ? <span className="ml-1 text-xs font-normal text-[var(--ejo-text-muted)]">(VAT {naira(c.vatAmount)})</span> : null}</p>
                    <p className="text-sm text-[var(--ejo-text)]">{c.customerName} · invoice {c.invoiceNumber} · <Link href={`/workshop/job-cards/${c.jobCardId}#invoice`} className="text-[var(--ejo-primary)] hover:underline">{c.jobNumber}</Link></p>
                    <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">“{c.reason}”</p>
                    <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Asked for by {c.requestedBy}, {formatDateTime(c.requestedAt)}{c.decidedBy ? ` · ${c.status === 'APPROVED' ? 'approved' : 'declined'} by ${c.decidedBy}${c.decidedAt ? `, ${formatDateTime(c.decidedAt)}` : ''}` : ''}{c.declineNote ? ` — “${c.declineNote}”` : ''}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusChip status={c.status} label={STATUS[c.status]} />
                    {c.status === 'APPROVED' ? <a href={`/api/credit-notes/${c.id}/pdf`} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[var(--ejo-border)] px-3 text-xs font-semibold"><Icon name="download" size={14} /> PDF</a> : null}
                  </div>
                </div>
                {c.status === 'PENDING' && canApprove ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <form action={decideCreditNoteForm}>
                      <input type="hidden" name="id" value={c.id} /><input type="hidden" name="decision" value="approve" /><input type="hidden" name="returnTo" value={back} />
                      <SubmitButton label="Approve" pendingLabel="Approving…" className="min-h-11 rounded-full bg-[var(--ejo-success)] px-5 text-sm font-semibold text-white" />
                    </form>
                    <form action={decideCreditNoteForm} className="flex min-w-[16rem] flex-1 items-end gap-2">
                      <input type="hidden" name="id" value={c.id} /><input type="hidden" name="decision" value="decline" /><input type="hidden" name="returnTo" value={back} />
                      <input name="note" required minLength={3} maxLength={500} placeholder="Why it is declined" aria-label="Why the credit note is declined" className={field} />
                      <SubmitButton label="Decline" pendingLabel="Declining…" className="min-h-11 shrink-0 rounded-full border border-[var(--ejo-error)] px-4 text-sm font-semibold text-[var(--ejo-error)]" />
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
