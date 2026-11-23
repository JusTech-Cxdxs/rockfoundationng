import { guardAnyPage } from '@/lib/authz/server';
import { getPartsReport } from '@/lib/actions/parts-report';
import { REPORT_PERIODS } from '@/lib/inventory/parts-report';
import { formatDateOnly } from '@/lib/utils/format-date';
import { naira } from '@/lib/crm';
import { LoadingLink } from '@/components/LoadingLink';
import { OrgTrail } from '@/components/OrgTrail';
import { EmptyState, PageHeader, ResponsiveTable, SectionCard, StatTile } from '@/components/ui';

export const dynamic = 'force-dynamic';

const q = (n: number) => n.toLocaleString('en-NG', { maximumFractionDigits: 3 });

/** The parts store report: sales on jobs and over the counter, low stock, slow movers. Costs and profit for the Owner only. */
export default async function PartsReportPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await guardAnyPage(['store.view'], '/inventory/reports');
  const { period } = await searchParams;
  const r = await getPartsReport(period ?? 'this_month');
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        icon="chart"
        back={{ href: '/inventory', label: 'Back to Inventory' }}
        title="Parts store report"
        description={<>Parts sold on jobs and over the counter, what is running low and what has not moved. <OrgTrail area="Store" /></>}
        meta={
          <nav className="flex flex-wrap gap-2" aria-label="Period">
            {Object.entries(REPORT_PERIODS).map(([k, label]) => (
              <LoadingLink key={k} href={`/inventory/reports?period=${k}`} aria-current={r.period === k ? 'page' : undefined} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${r.period === k ? 'bg-[var(--ejo-primary)] text-white ring-[var(--ejo-primary)]' : 'text-[var(--ejo-text-muted)] ring-[var(--ejo-border)] hover:bg-[var(--ejo-surface)]'}`}>{label}</LoadingLink>
            ))}
          </nav>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon="money" label="Parts sales" value={naira(r.totals.revenue)} hint="Selling prices, before VAT" />
        <StatTile icon="wrench" label="On jobs" value={naira(r.totals.jobRevenue)} />
        <StatTile icon="cart" label="Over the counter" value={naira(r.totals.counterRevenue)} href="/inventory/counter-sales" />
        {r.withCosts ? <StatTile icon="trend-up" label="Gross profit on parts" value={r.totals.profit === null ? 'Costs missing' : naira(r.totals.profit)} hint={r.totals.profit === null ? 'Some deliveries have no cost yet' : undefined} /> : <StatTile icon="alert" label="Running low" value={r.low.length} tone={r.low.length ? 'warning' : 'brand'} />}
      </div>

      <div className="space-y-6">
        <SectionCard icon="package" title="Parts sold" description={REPORT_PERIODS[r.period]} flush>
          {r.sold.length === 0 ? <EmptyState compact icon="package" title="No parts sold in this period." /> : (
            <ResponsiveTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                    <th className="px-4 py-2">Part</th>
                    <th className="px-4 py-2 text-right">On jobs</th>
                    <th className="px-4 py-2 text-right">Counter</th>
                    <th className="px-4 py-2 text-right">Sales</th>
                    {r.withCosts ? <><th className="px-4 py-2 text-right">Cost</th><th className="px-4 py-2 text-right">Profit</th></> : null}
                  </tr>
                </thead>
                <tbody>
                  {r.sold.map((s) => (
                    <tr key={s.partId} className="border-b border-[var(--ejo-border)] last:border-0">
                      <td className="px-4 py-2"><LoadingLink href={`/inventory/parts/${s.partId}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{s.name}</LoadingLink></td>
                      <td data-label="On jobs" className="px-4 py-2 text-right">{q(s.jobQty)} {s.unit}</td>
                      <td data-label="Counter" className="px-4 py-2 text-right">{q(s.counterQty)} {s.unit}</td>
                      <td data-label="Sales" className="px-4 py-2 text-right font-semibold">{naira(s.revenue)}</td>
                      {r.withCosts ? <><td data-label="Cost" className="px-4 py-2 text-right">{s.cost === null ? '—' : naira(s.cost)}</td><td data-label="Profit" className="px-4 py-2 text-right">{s.profit === null ? '—' : naira(s.profit)}</td></> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard icon="alert" title="Running low" description="Free stock at or below the reorder level, or none left." flush>
            {r.low.length === 0 ? <EmptyState compact icon="check-circle" title="Nothing is running low." /> : (
              <ResponsiveTable>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-4 py-2">Part</th><th className="px-4 py-2 text-right">Free</th><th className="px-4 py-2 text-right">Reorder at</th></tr></thead>
                  <tbody>
                    {r.low.map((p) => (
                      <tr key={p.partId} className="border-b border-[var(--ejo-border)] last:border-0">
                        <td className="px-4 py-2"><LoadingLink href={`/inventory/parts/${p.partId}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{p.name}</LoadingLink>{p.outOfStock ? <span className="ml-2 rounded-full bg-[var(--ejo-error)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--ejo-error)]">None free</span> : null}{p.reserved > 0 ? <span className="block text-[11px] text-[var(--ejo-text-muted)]">{q(p.reserved)} kept for jobs</span> : null}</td>
                        <td data-label="Free" className="px-4 py-2 text-right">{q(p.free)} {p.unit}</td>
                        <td data-label="Reorder at" className="px-4 py-2 text-right text-[var(--ejo-text-muted)]">{p.reorderPoint === null ? '—' : q(p.reorderPoint)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            )}
          </SectionCard>
          <SectionCard icon="clock" title="Slow movers" description="In stock, but not sold or issued for 90 days or more." flush>
            {r.slow.length === 0 ? <EmptyState compact icon="check-circle" title="Everything in stock has moved recently." /> : (
              <ResponsiveTable>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-4 py-2">Part</th><th className="px-4 py-2 text-right">On hand</th><th className="px-4 py-2">Last moved</th>{r.withCosts ? <th className="px-4 py-2 text-right">Value</th> : null}</tr></thead>
                  <tbody>
                    {r.slow.slice(0, 50).map((p) => (
                      <tr key={p.partId} className="border-b border-[var(--ejo-border)] last:border-0">
                        <td className="px-4 py-2"><LoadingLink href={`/inventory/parts/${p.partId}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{p.name}</LoadingLink></td>
                        <td data-label="On hand" className="px-4 py-2 text-right">{q(p.onHand)} {p.unit}</td>
                        <td data-label="Last moved" className="px-4 py-2 text-[var(--ejo-text-muted)]">{p.lastMovedAt ? `${formatDateOnly(p.lastMovedAt)} (${p.daysIdle} days)` : 'Not in the last 400 days'}</td>
                        {r.withCosts ? <td data-label="Value" className="px-4 py-2 text-right">{p.value === null ? '—' : naira(p.value)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
