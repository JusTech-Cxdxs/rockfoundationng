import { notFound } from 'next/navigation';
import { whatsAppShareUrl } from '@ejo/utils/whatsapp';
import { allows, guardAnyPage } from '@/lib/authz/server';
import { getCounterSale } from '@/lib/actions/counter-sales';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';
import { naira } from '@/lib/crm';
import { PAYMENT_LABEL, isPaymentMethod } from '@/lib/inventory/counter-sale';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { LoadingLink } from '@/components/LoadingLink';
import { HeaderAction, PageHeader, ResponsiveTable, SectionCard } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** One counter sale, as its receipt shows it: the buyer, the parts, VAT, the total and how it was paid. */
export default async function CounterSalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> }) {
  await guardAnyPage(['store.counter.sell', 'workshop.payment.record'], '/inventory/counter-sales');
  const { id } = await params;
  const { status } = await searchParams;
  const sale = await getCounterSale(id);
  if (!sale) notFound();
  const canSeeCustomers = await allows('crm.view');
  const method = isPaymentMethod(sale.paymentMethod) ? PAYMENT_LABEL[sale.paymentMethod] : sale.paymentMethod;
  const text = `Thank you for buying from us. Sales receipt ${sale.number} of ${formatDateOnly(sale.soldAt)}: ${naira(sale.total)}, paid by ${method.toLowerCase()}. Ask us for the PDF copy if you need it.`;
  const shareUrl = whatsAppShareUrl(sale.buyerPhone, text);
  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <PageHeader
        icon="receipt"
        back={{ href: '/inventory/counter-sales', label: 'Back to Counter sales' }}
        eyebrow={formatDateTime(sale.soldAt)}
        title={`Sales receipt ${sale.number}`}
        description={<>Sold over the counter by {sale.soldBy.fullName}. Paid in full.</>}
        actions={<>
          <HeaderAction href={`/api/counter-sales/${sale.id}/pdf`} icon="download" variant="secondary">Download the receipt (PDF)</HeaderAction>
          {shareUrl ? <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:brightness-110">Send on WhatsApp</a> : null}
        </>}
      />
      {status === 'sold' ? <div className="mb-6"><FormFeedbackBanner kind="success" message="Sale recorded. The parts have come off the stock." /></div> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <SectionCard icon="cart" title="Parts sold" flush>
          <ResponsiveTable>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-2">Part</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                  <th className="px-4 py-2 text-right">Unit price</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sale.lines.map((l) => (
                  <tr key={l.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-2">
                      <LoadingLink href={`/inventory/parts/${l.partId}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{l.description}</LoadingLink>
                      {l.partNumber ? <span className="ml-1 text-[11px] text-[var(--ejo-text-muted)]">{l.partNumber}</span> : null}
                      {l.serialNumbers.length ? <span className="block text-[11px] text-[var(--ejo-text-muted)]">Serial {l.serialNumbers.join(', ')}</span> : null}
                    </td>
                    <td data-label="Quantity" className="px-4 py-2 text-right">{l.quantity.toLocaleString('en-NG')} {l.unitOfMeasure}</td>
                    <td data-label="Unit price" className="px-4 py-2 text-right">{naira(l.unitPrice)}</td>
                    <td data-label="Amount" className="px-4 py-2 text-right font-medium">{naira(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
          <dl className="ml-auto max-w-xs space-y-1 px-4 py-3 text-sm">
            <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Subtotal</dt><dd>{naira(sale.subtotal)}</dd></div>
            {sale.vatRate > 0 ? <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">VAT ({sale.vatRate}%){sale.vatNumber ? ` · TIN ${sale.vatNumber.replace(/^TIN\s*/i, '')}` : ''}</dt><dd>{naira(sale.vatAmount)}</dd></div> : null}
            <div className="flex justify-between border-t border-[var(--ejo-border)] pt-1 text-base font-bold"><dt>Total paid</dt><dd>{naira(sale.total)}</dd></div>
          </dl>
        </SectionCard>
        <SectionCard icon="user" title="Buyer">
          <p className="text-sm font-medium text-[var(--ejo-text)]">
            {sale.customerId && canSeeCustomers ? <LoadingLink href={`/crm/customers/${sale.customerId}`} className="text-[var(--ejo-primary)] hover:underline">{sale.buyerName}</LoadingLink> : sale.buyerName}
          </p>
          <p className="text-xs text-[var(--ejo-text-muted)]">{sale.customerId ? 'Registered customer' : 'Walk-in buyer'}{sale.buyerPhone ? ` · ${sale.buyerPhone}` : ''}</p>
          <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Paid by {method}{sale.paymentReference ? ` · ${sale.paymentReference}` : ''}</p>
          {sale.notes ? <p className="mt-2 text-xs text-[var(--ejo-text)]">{sale.notes}</p> : null}
        </SectionCard>
      </div>
    </div>
  );
}
