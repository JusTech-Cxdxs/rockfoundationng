import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { requireCustomer } from '@/lib/customer-portal/session';
import { fmtDate, naira, num } from '@/lib/customer-portal/format';
import { BackLink } from '@/components/customer/ui';
import { PrintButton } from '@/components/customer/PrintButton';

export const metadata = { title: 'Invoice' };

type FrozenLine = { description: string; quantity: number; unitOfMeasure: string | null; unitPrice: number | null; lineDiscount: number; amount: number; billTo: string };
const NOT_CHARGED: Record<string, string> = { WARRANTY: 'Covered by warranty', GOODWILL: 'Goodwill', INTERNAL: 'Covered by us' };
const r2 = (n: number) => Math.round(n * 100) / 100;

// Only the invoice on paper: the portal's menus and buttons are left out when printing.
const PRINT_ONLY_INVOICE = '@media print { body * { visibility: hidden; } #customer-invoice, #customer-invoice * { visibility: visible; } #customer-invoice { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none; border: 0; } }';

/**
 * The customer's invoice for one of their own Job Cards, to view, print or
 * save as a PDF. Found by the Job Card id AND the signed-in customer (the
 * invoice's own customer and organisation too): anyone else's is "not
 * found". Every figure is the invoice as issued; staff names never appear.
 */
export default async function CustomerInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireCustomer();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const inv = await prisma.invoice.findFirst({
    where: { jobCardId: id, customerId: me.id, organisationId: me.organisationId, jobCard: { customerId: me.id } },
    select: {
      invoiceNumber: true, issuedAt: true, dueDate: true, subtotal: true, lineDiscounts: true, discountAmount: true, discountReason: true,
      vatRate: true, vatAmount: true, vatNumber: true, total: true, lines: true,
      organisation: { select: { name: true, legalName: true, hqAddress: true, rcNumber: true, hotlines: true, email: true } },
      branch: { select: { name: true, address: true, hotlines: true, bankName: true, bankAccountName: true, bankAccountNumber: true } },
      jobCard: { select: { jobNumber: true, mileageAtCheckIn: true, vehicle: { select: { make: true, model: true, year: true, plateNumber: true } }, payments: { select: { amount: true } }, refunds: { select: { amount: true } } } },
    },
  });
  if (!inv) notFound();
  const lines = (Array.isArray(inv.lines) ? inv.lines : []) as FrozenLine[];
  const paid = Math.max(0, r2(inv.jobCard.payments.reduce((s, p) => s + num(p.amount), 0) - inv.jobCard.refunds.reduce((s, r) => s + num(r.amount), 0)));
  const total = num(inv.total);
  const balance = Math.max(0, r2(total - paid));
  const vatRate = num(inv.vatRate);
  const discounts = r2(num(inv.lineDiscounts) + num(inv.discountAmount));
  const v = inv.jobCard.vehicle;
  const billTo = me.customerType === 'ORGANIZATION' && me.companyName ? me.companyName : me.fullName;
  const row = 'flex justify-between gap-3 py-1';

  return (
    <div className="space-y-4">
      <style>{PRINT_ONLY_INVOICE}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href={`/customer-portal/dashboard/services/jc/${id}`}>Back to the Job Card</BackLink>
        <PrintButton />
      </div>
      <article id="customer-invoice" className="mx-auto max-w-3xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-white p-6 text-[#0F172A] sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#EC3237] pb-4">
          <div>
            <p className="text-2xl font-extrabold">{inv.organisation.name}</p>
            {inv.organisation.legalName && inv.organisation.legalName !== inv.organisation.name ? <p className="text-sm font-semibold">{inv.organisation.legalName}</p> : null}
            {inv.organisation.hqAddress ? <p className="text-xs text-[#475569]">{inv.organisation.hqAddress}</p> : null}
            <p className="text-xs text-[#475569]">{[inv.organisation.rcNumber ? `RC Number: ${inv.organisation.rcNumber}` : null, inv.organisation.hotlines.join(' | ') || null, inv.organisation.email].filter(Boolean).join(' · ')}</p>
            <p className="mt-1 text-xs text-[#475569]">{[inv.branch.name, inv.branch.address].filter(Boolean).join(' — ')}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-[#3E4095]">Invoice</p>
            <p className="font-mono text-sm">{inv.invoiceNumber}</p>
            <p className="text-xs text-[#475569]">{fmtDate(inv.issuedAt)}</p>
            {inv.dueDate ? <p className="text-xs font-semibold text-[#475569]">Payment due by {fmtDate(inv.dueDate)}</p> : null}
          </div>
        </header>

        <dl className="mt-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-[10px] font-semibold tracking-wide text-[#94A3B8]">BILL TO</dt><dd className="font-semibold">{billTo}</dd>{billTo !== me.fullName ? <dd className="text-xs text-[#475569]">Attn: {me.fullName}</dd> : null}{me.phone ? <dd className="text-xs text-[#475569]">{me.phone}</dd> : null}</div>
          <div><dt className="text-[10px] font-semibold tracking-wide text-[#94A3B8]">JOB CARD</dt><dd className="font-semibold">{inv.jobCard.jobNumber}</dd>{vatRate > 0 && inv.vatNumber ? <dd className="text-xs text-[#475569]">Tax ID (TIN): {inv.vatNumber}</dd> : null}</div>
          <div><dt className="text-[10px] font-semibold tracking-wide text-[#94A3B8]">VEHICLE</dt><dd className="font-semibold">{[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Your vehicle'}</dd></div>
          <div><dt className="text-[10px] font-semibold tracking-wide text-[#94A3B8]">PLATE NO. / MILEAGE</dt><dd className="font-semibold">{[v.plateNumber ?? '—', inv.jobCard.mileageAtCheckIn != null ? `${inv.jobCard.mileageAtCheckIn.toLocaleString('en-NG')} km` : null].filter(Boolean).join(' · ')}</dd></div>
        </dl>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-[#0F172A] text-left text-xs text-[#475569]">
              <th className="py-1.5 pr-2">Description</th><th className="py-1.5 text-right">Qty</th><th className="py-1.5 text-right">Unit price</th><th className="py-1.5 text-right">Discount</th><th className="py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const charged = !l.billTo || l.billTo === 'CUSTOMER';
              return (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={i} className="border-b border-[#E2E8F0]">
                  <td className="py-1.5 pr-2">{l.description}</td>
                  <td className="py-1.5 text-right tabular-nums">{l.quantity}{l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ''}</td>
                  <td className="py-1.5 text-right tabular-nums">{charged && l.unitPrice !== null ? naira(l.unitPrice) : '—'}</td>
                  <td className="py-1.5 text-right tabular-nums">{charged && l.lineDiscount > 0 ? `−${naira(l.lineDiscount)}` : '—'}</td>
                  <td className="py-1.5 text-right tabular-nums">{charged ? naira(r2(l.amount - l.lineDiscount)) : `${NOT_CHARGED[l.billTo] ?? 'Not charged'} — not charged`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <dl className="ml-auto mt-4 max-w-xs text-sm">
          <div className={row}><dt className="text-[#475569]">Subtotal</dt><dd className="tabular-nums">{naira(r2(num(inv.subtotal) + num(inv.lineDiscounts)))}</dd></div>
          {discounts > 0 ? <div className={row}><dt className="text-[#475569]">Discount{num(inv.discountAmount) > 0 && inv.discountReason ? ` — ${inv.discountReason}` : ''}</dt><dd className="tabular-nums">−{naira(discounts)}</dd></div> : null}
          {vatRate > 0 ? <div className={row}><dt className="text-[#475569]">VAT ({vatRate}%)</dt><dd className="tabular-nums">{naira(num(inv.vatAmount))}</dd></div> : null}
          <div className={`${row} border-t-2 border-[#0F172A] font-bold`}><dt>Total</dt><dd className="tabular-nums">{naira(total)}</dd></div>
          <div className={row}><dt className="text-[#475569]">Amount paid</dt><dd className="tabular-nums">{naira(paid)}</dd></div>
          <div className={`${row} border-t border-[#E2E8F0] font-bold`}><dt>Balance due</dt><dd className="tabular-nums">{naira(balance)}</dd></div>
        </dl>

        {balance > 0 && inv.branch.bankAccountNumber ? (
          <div className="mt-6 rounded-[var(--ejo-radius-md)] border border-[#E2E8F0] p-4 text-sm">
            <p className="text-xs font-bold text-[#475569]">HOW TO PAY</p>
            <p>Bank: {inv.branch.bankName}</p>
            <p>Account name: {inv.branch.bankAccountName}</p>
            <p>Account number: {inv.branch.bankAccountNumber}</p>
            <p>Payment reference: {[inv.invoiceNumber, inv.jobCard.jobNumber].join(' ')}</p>
          </div>
        ) : null}

        <footer className="mt-8 text-center">
          <p className="font-bold text-[#3E4095]">Thank you for choosing {inv.organisation.name}.</p>
          <div className="mx-auto mt-2 w-40 border-t-2 border-[#EC3237]" />
        </footer>
      </article>
    </div>
  );
}
