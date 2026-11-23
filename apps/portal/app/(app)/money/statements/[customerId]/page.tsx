import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardPage } from '@/lib/authz/server';
import { BackLink, PageHeader, SectionCard, StatTile, EmptyState, ResponsiveTable, Icon } from '@/components/ui';
import { getCustomerStatement } from '@/lib/actions/statements';
import { AGEING_LABEL, AGEING_ORDER, naira } from '@/lib/money/rules';
import { formatDateOnly } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

/** One customer's statement of account: each invoice with a balance, its age, and the PDF to send. */
export default async function CustomerStatementPage({ params }: { params: Promise<{ customerId: string }> }) {
  await guardPage('money.statement.view', '/money/statements');
  const { customerId } = await params;
  const s = await getCustomerStatement(customerId);
  if (!s) notFound();
  return (
    <div className="p-4 sm:p-8">
      <BackLink href="/money/statements" label="What customers owe" className="mb-4" />
      <PageHeader icon="receipt" title={`Statement — ${s.customer.name}`} description={s.customer.paymentTermsDays ? `On credit: ${s.customer.paymentTermsDays} days from the invoice date${s.customer.creditLimit ? `, limit ${naira(s.customer.creditLimit)}` : ''}.` : 'Pays before collection.'}
        actions={<a href={`/api/customers/${s.customer.id}/statement`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--ejo-primary)] px-4 text-sm font-semibold text-white" data-testid="statement-pdf"><Icon name="download" size={16} /> Statement (PDF)</a>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile icon="money" label="Owed" value={naira(s.owed)} emphasis />
        <StatTile icon="alert" label="Past its due date" value={naira(s.overdue)} tone={s.overdue > 0 ? 'warning' : 'brand'} />
        {AGEING_ORDER.map((b) => <StatTile key={b} icon="clock" label={AGEING_LABEL[b]} value={naira(s.totals[b])} />)}
      </div>
      <SectionCard icon="receipt" title="Invoices with a balance" flush>
        {s.rows.length === 0 ? <EmptyState icon="check-circle" title="Nothing is owed" compact /> : (
          <ResponsiveTable label="Invoices with a balance">
            <table className="w-full text-sm" data-testid="statement-table">
              <thead><tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-4 py-2">Invoice</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Due</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Paid</th><th className="px-4 py-2 text-right">Credited</th><th className="px-4 py-2 text-right">Balance</th><th className="px-4 py-2 text-right">Age</th>
              </tr></thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.invoiceNumber} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-2 font-medium">{r.invoiceNumber}<span className="block text-xs text-[var(--ejo-text-muted)]">{r.jobNumber}</span></td>
                    <td data-label="Date" className="px-4 py-2">{formatDateOnly(r.issuedAt)}</td>
                    <td data-label="Due" className={`px-4 py-2 ${r.overdue ? 'font-semibold text-[var(--ejo-error)]' : ''}`}>{r.dueDate ? formatDateOnly(r.dueDate) : 'On collection'}</td>
                    <td data-label="Total" className="px-4 py-2 text-right tabular-nums">{naira(r.total)}</td>
                    <td data-label="Paid" className="px-4 py-2 text-right tabular-nums">{naira(r.paid)}</td>
                    <td data-label="Credited" className="px-4 py-2 text-right tabular-nums">{r.credited > 0 ? naira(r.credited) : '—'}</td>
                    <td data-label="Balance" className="px-4 py-2 text-right font-semibold tabular-nums">{naira(r.balance)}</td>
                    <td data-label="Age" className="px-4 py-2 text-right">{r.days} days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
      </SectionCard>
      <p className="mt-4 text-xs text-[var(--ejo-text-muted)]"><Link href={`/crm/customers/${s.customer.id}`} className="text-[var(--ejo-primary)] hover:underline">Open the customer</Link> to see their vehicles, payments and messages.</p>
    </div>
  );
}
