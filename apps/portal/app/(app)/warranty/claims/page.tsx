import Link from 'next/link';
import { guardAnyPage } from '@/lib/authz/server';
import { PageHeader, SectionCard, EmptyState, StatusChip, RevealPanel } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { listSupplierClaims } from '@/lib/actions/warranty';
import { addSupplierClaimForm, updateSupplierClaimForm } from '@/lib/actions/money-form-handlers';
import { CLAIM_LABEL, claimNext, type ClaimStatus } from '@/lib/money/warranty';
import { naira } from '@/lib/money/rules';
import { formatDateOnly } from '@/lib/utils/format-date';
import { WarrantyTabs } from '@/components/money/WarrantyTabs';

export const dynamic = 'force-dynamic';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
const SAVED: Record<string, string> = { claim_added: 'Claim recorded.', claim_updated: 'Claim updated.' };

/** Warranty → Claims to suppliers: faulty parts claimed back under the supplier's warranty, followed to a credit, refund, replacement or refusal. */
export default async function SupplierClaimsPage({ searchParams }: { searchParams: Promise<{ show?: string; status?: string; error?: string; id?: string }> }) {
  await guardAnyPage(['workshop.warranty.claims', 'workshop.warranty.report'], '/warranty/claims');
  const sp = await searchParams;
  const show = sp.show === 'all' ? 'all' : 'open';
  const { rows, canManage, suppliers } = await listSupplierClaims(show, sp.id);
  const back = `/warranty/claims${show === 'all' ? '?show=all' : ''}`;
  return (
    <div className="p-4 sm:p-8">
      <PageHeader icon="shield-check" title="Claims to suppliers" description="A part that failed under its supplier’s warranty is claimed back: recorded, sent, then settled (credit, refund or replacement) or refused." />
      <WarrantyTabs active="claims" />
      {sp.error ? <div className="mb-4"><FormFeedbackBanner kind="error" message={sp.error} /></div> : null}
      {sp.status && SAVED[sp.status] ? <div className="mb-4"><FormFeedbackBanner kind="success" message={SAVED[sp.status]!} /></div> : null}
      {canManage ? (
        <RevealPanel label="Record a claim" icon="plus" className="mb-6">
          <form action={addSupplierClaimForm} className="grid gap-4 sm:grid-cols-2" data-testid="claim-form">
            <input type="hidden" name="returnTo" value={back} />
            <label><span className={label}>Supplier</span>
              <select name="supplierId" className={field} defaultValue=""><option value="">Not in the list (type it below)</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </label>
            <label><span className={label}>Supplier’s name (if not in the list)</span><input name="supplierName" maxLength={120} className={field} /></label>
            <label><span className={label}>Part that failed</span><input name="partName" required maxLength={120} placeholder="e.g. Alternator" className={field} /></label>
            <label><span className={label}>Part number (optional)</span><input name="partNumber" maxLength={60} className={field} /></label>
            <label><span className={label}>How many</span><input name="quantity" inputMode="numeric" defaultValue="1" className={field} /></label>
            <label><span className={label}>What it cost us (₦)</span><input name="amountClaimed" required inputMode="decimal" className={field} /></label>
            <label><span className={label}>Job Card it was fitted on (optional)</span><input name="jobNumber" maxLength={30} placeholder="JC-2026-000123" className={field} /></label>
            <label className="sm:col-span-2"><span className={label}>What went wrong</span><textarea name="fault" required minLength={5} maxLength={1000} rows={3} className={field} /></label>
            <div className="sm:col-span-2"><SubmitButton label="Record the claim" pendingLabel="Saving…" className="min-h-11 rounded-full bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white" /></div>
          </form>
        </RevealPanel>
      ) : null}
      <nav aria-label="Show" className="mb-4 inline-flex gap-1 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1 text-sm">
        <Link href="/warranty/claims" aria-current={show === 'open' ? 'page' : undefined} className={`rounded-full px-3.5 py-1.5 font-medium ${show === 'open' ? 'bg-[var(--ejo-primary)] text-white' : 'text-[var(--ejo-text-muted)]'}`}>Open</Link>
        <Link href="/warranty/claims?show=all" aria-current={show === 'all' ? 'page' : undefined} className={`rounded-full px-3.5 py-1.5 font-medium ${show === 'all' ? 'bg-[var(--ejo-primary)] text-white' : 'text-[var(--ejo-text-muted)]'}`}>All</Link>
      </nav>
      <SectionCard icon="boxes" title={`${rows.length} ${rows.length === 1 ? 'claim' : 'claims'}`}>
        {rows.length === 0 ? <EmptyState icon="check-circle" title={show === 'open' ? 'No open claims' : 'No claims yet'} compact /> : (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {rows.map((c) => (
              <li key={c.id} className="py-4" data-testid="supplier-claim">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--ejo-text)]">{c.number} · {c.partName}{c.partNumber ? ` (${c.partNumber})` : ''} × {c.quantity}</p>
                    <p className="text-sm text-[var(--ejo-text)]">{c.supplierName} · claimed {naira(c.amountClaimed)}{c.amountRecovered !== null ? ` · recovered ${naira(c.amountRecovered)}` : ''}{c.jobNumber ? <> · <Link href={`/workshop/job-cards/${c.jobCardId}`} className="text-[var(--ejo-primary)] hover:underline">{c.jobNumber}</Link></> : null}</p>
                    <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">“{c.fault}”{c.outcome ? ` — ${c.outcome}` : ''}</p>
                    <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Recorded by {c.createdBy}, {formatDateOnly(c.createdAt)}</p>
                  </div>
                  <StatusChip status={c.status === 'SETTLED' ? 'APPROVED' : c.status === 'REJECTED' ? 'REJECTED' : 'PENDING'} label={CLAIM_LABEL[c.status as ClaimStatus]} />
                </div>
                {canManage && claimNext(c.status).length ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    {claimNext(c.status).includes('SUBMITTED') ? (
                      <form action={updateSupplierClaimForm}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="to" value="SUBMITTED" /><input type="hidden" name="returnTo" value={back} />
                        <SubmitButton label="Sent to the supplier" pendingLabel="Saving…" className="min-h-11 rounded-full border border-[var(--ejo-border)] px-4 text-sm font-semibold" /></form>
                    ) : null}
                    <form action={updateSupplierClaimForm} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="to" value="SETTLED" /><input type="hidden" name="returnTo" value={back} />
                      <input name="amountRecovered" required inputMode="decimal" placeholder="₦ recovered" aria-label="What the supplier gave back" className={`${field} w-36`} />
                      <input name="outcome" maxLength={500} placeholder="How (credit, refund, replacement)" aria-label="How it was settled" className={`${field} w-56`} />
                      <SubmitButton label="Settled" pendingLabel="Saving…" className="min-h-11 rounded-full bg-[var(--ejo-success)] px-4 text-sm font-semibold text-white" /></form>
                    <form action={updateSupplierClaimForm} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="to" value="REJECTED" /><input type="hidden" name="returnTo" value={back} />
                      <input name="outcome" required minLength={3} maxLength={500} placeholder="Why the supplier refused" aria-label="Why the supplier refused" className={`${field} w-56`} />
                      <SubmitButton label="Refused" pendingLabel="Saving…" className="min-h-11 rounded-full border border-[var(--ejo-error)] px-4 text-sm font-semibold text-[var(--ejo-error)]" /></form>
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
