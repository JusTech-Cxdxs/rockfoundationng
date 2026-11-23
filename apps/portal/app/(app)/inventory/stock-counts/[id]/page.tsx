import { notFound } from 'next/navigation';
import { guardAnyPage } from '@/lib/authz/server';
import { getStockCount } from '@/lib/actions/stock-counts';
import { decideStockCountFormAction } from '@/lib/actions/stock-counts-form-handlers';
import { COUNT_STATUS_LABEL } from '@/lib/inventory/stock-count';
import { formatDateTime } from '@/lib/utils/format-date';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { PageHeader, ResponsiveTable, SectionCard, StatusChip } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STATUS_MESSAGE: Record<string, string> = {
  recorded: 'Count recorded.',
  approved: 'Approved. The stock now matches the count.',
  rejected: 'Rejected. Nothing on the stock changed.',
};

/** One stock count: each part's system figure, the shelf, the difference and why; the Owner's decision. */
export default async function StockCountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['store.stock.count', 'store.stock.approve'], '/inventory/stock-counts');
  const { id } = await params;
  const { status, error } = await searchParams;
  const sc = await getStockCount(id);
  if (!sc) notFound();
  const diffs = sc.lines.filter((l) => l.difference !== 0);
  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <PageHeader
        icon="clipboard"
        back={{ href: '/inventory/stock-counts', label: 'Back to Stock counts' }}
        eyebrow={formatDateTime(sc.countedAt)}
        title={`Stock count ${sc.number}`}
        description={<>Counted by {sc.countedBy.fullName}. {sc.lines.length} {sc.lines.length === 1 ? 'part' : 'parts'} counted, {diffs.length} with a difference.{sc.note ? ` “${sc.note}”` : ''}</>}
        meta={<StatusChip status={sc.status} label={COUNT_STATUS_LABEL[sc.status] ?? sc.status} />}
      />
      {status && STATUS_MESSAGE[status] ? <div className="mb-6"><FormFeedbackBanner kind="success" message={STATUS_MESSAGE[status]!} /></div> : null}
      {error ? <div className="mb-6"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SectionCard icon="list" title="What was counted" flush>
          <ResponsiveTable>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-2">Part</th>
                  <th className="px-4 py-2 text-right">System</th>
                  <th className="px-4 py-2 text-right">Shelf</th>
                  <th className="px-4 py-2 text-right">Difference</th>
                  <th className="px-4 py-2">Why</th>
                </tr>
              </thead>
              <tbody>
                {sc.lines.map((l) => (
                  <tr key={l.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-2"><LoadingLink href={`/inventory/parts/${l.partId}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{l.part.name}</LoadingLink>{l.part.partNumber ? <span className="ml-1 text-[11px] text-[var(--ejo-text-muted)]">{l.part.partNumber}</span> : null}</td>
                    <td data-label="System" className="px-4 py-2 text-right text-[var(--ejo-text-muted)]">{l.systemQuantity.toLocaleString('en-NG')} {l.part.baseUnitOfMeasure}</td>
                    <td data-label="Shelf" className="px-4 py-2 text-right">{l.countedQuantity.toLocaleString('en-NG')}</td>
                    <td data-label="Difference" className={`px-4 py-2 text-right font-semibold ${l.difference < 0 ? 'text-[var(--ejo-error)]' : l.difference > 0 ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-text-muted)]'}`}>{l.difference === 0 ? 'Matches' : `${l.difference > 0 ? '+' : ''}${l.difference.toLocaleString('en-NG')}`}</td>
                    <td data-label="Why" className="px-4 py-2 text-[var(--ejo-text-muted)]">{l.reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        </SectionCard>
        <div className="space-y-6">
          {sc.mayDecide ? (
            <SectionCard icon="check-circle" title="Your decision" description="Approving moves the stock by each difference: a shortfall comes off the shelf, a surplus comes in as a goods receipt for you to cost.">
              <form action={decideStockCountFormAction} className="relative space-y-3" data-testid="stock-count-decision">
                <FormPendingOverlay />
                <input type="hidden" name="id" value={sc.id} />
                <label htmlFor="decision-note" className="block text-xs font-medium text-[var(--ejo-text-muted)]">Note (required to reject)</label>
                <textarea id="decision-note" name="note" rows={2} maxLength={500} className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm" />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton label="Approve the differences" pendingLabel="Approving…" name="decision" value="APPROVE" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110" />
                  <SubmitButton label="Reject" pendingLabel="Rejecting…" name="decision" value="REJECT" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-semibold text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/5" />
                </div>
              </form>
            </SectionCard>
          ) : sc.status === 'PENDING_APPROVAL' ? (
            <SectionCard icon="clock" title="Waiting for the Owner"><p className="text-sm text-[var(--ejo-text-muted)]">The Owner approves or rejects these differences. Whoever counted cannot approve their own count.</p></SectionCard>
          ) : null}
          {sc.decidedAt ? (
            <SectionCard icon="history" title="Decision">
              <p className="text-sm text-[var(--ejo-text)]">{COUNT_STATUS_LABEL[sc.status]} by {sc.decidedBy?.fullName ?? 'the Owner'}, {formatDateTime(sc.decidedAt)}.</p>
              {sc.decisionNote ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">“{sc.decisionNote}”</p> : null}
              {sc.receipts.map((r) => <p key={r.id} className="mt-2 text-xs text-[var(--ejo-text-muted)]">Stock found on the shelf came in as <LoadingLink href={`/inventory/goods-receipts/${r.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{r.referenceNumber}</LoadingLink>.</p>)}
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
