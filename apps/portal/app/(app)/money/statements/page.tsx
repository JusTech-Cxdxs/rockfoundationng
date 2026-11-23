import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { PageHeader, SectionCard, StatTile, EmptyState, ResponsiveTable } from '@/components/ui';
import { getAgeing } from '@/lib/actions/statements';
import { AGEING_LABEL, AGEING_ORDER, naira } from '@/lib/money/rules';
import { MoneyTabs } from '@/components/money/MoneyTabs';

export const dynamic = 'force-dynamic';

/** Money → Statements: everyone who owes money, with the ageing (0–30 · 31–60 · 61–90 · over 90 days), largest first. */
export default async function StatementsPage() {
  await guardPage('money.statement.view', '/money/statements');
  const a = await getAgeing();
  return (
    <div className="p-4 sm:p-8">
      <PageHeader icon="receipt" title="What customers owe" description="Every invoice with a balance after payments and credit notes, by how long it has been owed. Open a customer for their statement." />
      <MoneyTabs active="statements" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile icon="money" label="Owed in all" value={naira(a.owed)} emphasis />
        <StatTile icon="alert" label="Past its due date" value={naira(a.overdue)} tone={a.overdue > 0 ? 'warning' : 'brand'} />
        {AGEING_ORDER.map((b) => <StatTile key={b} icon="clock" label={AGEING_LABEL[b]} value={naira(a.totals[b])} tone={b === 'D90_PLUS' && a.totals[b] > 0 ? 'error' : 'brand'} />)}
      </div>
      <SectionCard icon="users" title={`${a.customers.length} ${a.customers.length === 1 ? 'customer owes' : 'customers owe'} money`} flush>
        {a.customers.length === 0 ? <EmptyState icon="check-circle" title="Nobody owes anything" compact /> : (
          <ResponsiveTable label="Customers who owe money">
            <table className="w-full text-sm" data-testid="ageing-table">
              <thead><tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-4 py-2">Customer</th>{AGEING_ORDER.map((b) => <th key={b} className="px-4 py-2 text-right">{AGEING_LABEL[b]}</th>)}<th className="px-4 py-2 text-right">Owed</th><th className="px-4 py-2 text-right">Overdue</th>
              </tr></thead>
              <tbody>
                {a.customers.map((c) => (
                  <tr key={c.customerId} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-2 font-medium"><Link href={`/money/statements/${c.customerId}`} className="text-[var(--ejo-primary)] hover:underline">{c.name}</Link>{c.organisation ? <span className="ml-2 rounded-full bg-[var(--ejo-bg)] px-2 py-0.5 text-[10px] text-[var(--ejo-text-muted)]">Organisation</span> : null}<span className="block text-xs text-[var(--ejo-text-muted)]">{c.invoices} {c.invoices === 1 ? 'invoice' : 'invoices'} · oldest {c.oldestDays} days</span></td>
                    {AGEING_ORDER.map((b) => <td key={b} data-label={AGEING_LABEL[b]} className={`px-4 py-2 text-right tabular-nums ${c.buckets[b] > 0 && b !== 'CURRENT' ? 'text-[var(--ejo-warning-text,var(--ejo-warning))]' : ''}`}>{c.buckets[b] > 0 ? naira(c.buckets[b]) : '—'}</td>)}
                    <td data-label="Owed" className="px-4 py-2 text-right font-semibold tabular-nums">{naira(c.owed)}</td>
                    <td data-label="Overdue" className="px-4 py-2 text-right tabular-nums">{c.overdue > 0 ? naira(c.overdue) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
      </SectionCard>
    </div>
  );
}
