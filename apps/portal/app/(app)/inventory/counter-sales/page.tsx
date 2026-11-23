import { allows, guardAnyPage } from '@/lib/authz/server';
import { listCounterSales } from '@/lib/actions/counter-sales';
import { formatDateTimeCompact, isSameLagosDay } from '@/lib/utils/format-date';
import { naira } from '@/lib/crm';
import { pluralize } from '@/lib/utils/pluralize';
import { PAYMENT_LABEL, isPaymentMethod } from '@/lib/inventory/counter-sale';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { LoadingLink } from '@/components/LoadingLink';
import { OrgTrail } from '@/components/OrgTrail';
import { EmptyState, HeaderAction, PageHeader, ResponsiveTable } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** Parts sold over the counter, newest first: who bought, what it came to and how it was paid. */
export default async function CounterSalesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await guardAnyPage(['store.counter.sell', 'workshop.payment.record'], '/inventory/counter-sales');
  const { q } = await searchParams;
  const [sales, canSell] = await Promise.all([listCounterSales(q), allows('store.counter.sell')]);
  const now = new Date();
  const today = q ? [] : sales.filter((s) => isSameLagosDay(s.soldAt, now));
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        icon="cart"
        back={{ href: '/inventory', label: 'Back to Inventory' }}
        title="Counter sales"
        description={<>Parts sold over the counter, without a Job Card. <OrgTrail area="Store" /></>}
        actions={canSell ? <HeaderAction href="/inventory/counter-sales/new">New sale</HeaderAction> : null}
        meta={today.length ? <span className="rounded-full bg-[var(--ejo-success)]/10 px-3 py-1 text-xs font-semibold text-[var(--ejo-success)]">Today: {pluralize(today.length, 'sale')} · {naira(today.reduce((s, x) => s + x.total, 0))}</span> : null}
      />
      <form className="mb-6 flex gap-2" action="/inventory/counter-sales">
        <LiveSearchInput type="search" name="q" defaultValue={q ?? ''} placeholder="Search by number, buyer, phone or part…" className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
      </form>
      {sales.length === 0 ? (
        <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]">
          <EmptyState compact icon="cart" title={q ? 'No sale matches.' : 'No counter sales yet.'}>{canSell && !q ? 'Record the first one with “New sale”.' : null}</EmptyState>
        </div>
      ) : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-4 py-2">Sale</th>
                <th className="px-4 py-2">Buyer</th>
                <th className="px-4 py-2">Parts</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Paid by</th>
                <th className="px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className="px-4 py-2 font-medium"><LoadingLink href={`/inventory/counter-sales/${s.id}`} className="text-[var(--ejo-primary)] hover:underline">{s.number}</LoadingLink></td>
                  <td data-label="Buyer" className="px-4 py-2 text-[var(--ejo-text)]">{s.buyerName}{s.customerId ? null : <span className="ml-1 text-[11px] text-[var(--ejo-text-muted)]">walk-in</span>}</td>
                  <td data-label="Parts" className="px-4 py-2 text-[var(--ejo-text-muted)]">{s.lines}</td>
                  <td data-label="Total" className="px-4 py-2 text-right font-semibold">{naira(s.total)}</td>
                  <td data-label="Paid by" className="px-4 py-2 text-[var(--ejo-text-muted)]">{isPaymentMethod(s.paymentMethod) ? PAYMENT_LABEL[s.paymentMethod] : s.paymentMethod}</td>
                  <td data-label="When" className="px-4 py-2 text-[var(--ejo-text-muted)]">{formatDateTimeCompact(s.soldAt)} · {s.soldBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
