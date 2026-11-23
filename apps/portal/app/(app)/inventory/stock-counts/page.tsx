import { allows, guardAnyPage } from '@/lib/authz/server';
import { listStockCounts } from '@/lib/actions/stock-counts';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { LoadingLink } from '@/components/LoadingLink';
import { OrgTrail } from '@/components/OrgTrail';
import { EmptyState, HeaderAction, PageHeader, ResponsiveTable, StatusChip } from '@/components/ui';
import { COUNT_STATUS_LABEL } from '@/lib/inventory/stock-count';

export const dynamic = 'force-dynamic';

/** Stock counts: when the shelf was counted, by whom, and what the Owner decided about the differences. */
export default async function StockCountsPage() {
  await guardAnyPage(['store.stock.count', 'store.stock.approve'], '/inventory/stock-counts');
  const [counts, canCount] = await Promise.all([listStockCounts(), allows('store.stock.count')]);
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        icon="clipboard"
        back={{ href: '/inventory', label: 'Back to Inventory' }}
        title="Stock counts"
        description={<>Count the shelf against the system. Differences move the stock only when the Owner approves them. <OrgTrail area="Store" /></>}
        actions={canCount ? <HeaderAction href="/inventory/stock-counts/new">Count the stock</HeaderAction> : null}
      />
      {counts.length === 0 ? (
        <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]"><EmptyState compact icon="clipboard" title="No stock counts yet." /></div>
      ) : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-4 py-2">Count</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Parts counted</th>
                <th className="px-4 py-2">Differences</th>
                <th className="px-4 py-2">Counted</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className="px-4 py-2 font-medium"><LoadingLink href={`/inventory/stock-counts/${c.id}`} className="text-[var(--ejo-primary)] hover:underline">{c.number}</LoadingLink></td>
                  <td data-label="Status" className="px-4 py-2"><StatusChip status={c.status} label={COUNT_STATUS_LABEL[c.status] ?? c.status} /></td>
                  <td data-label="Parts counted" className="px-4 py-2">{c.parts}</td>
                  <td data-label="Differences" className="px-4 py-2">{c.differences}</td>
                  <td data-label="Counted" className="px-4 py-2 text-[var(--ejo-text-muted)]">{formatDateTimeCompact(c.countedAt)} · {c.countedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
