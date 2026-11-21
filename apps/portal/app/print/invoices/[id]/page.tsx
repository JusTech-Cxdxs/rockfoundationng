import { portalBaseUrl } from '@/lib/portal-url';
import { notFound } from 'next/navigation';
import { getInvoice } from '@/lib/actions/invoices';
import { billToName, invoiceDate, invoiceLines, paidTowards } from '@/lib/invoices';
import { BILL_TO_LABEL, isCustomerLine, type BillTo } from '@/lib/estimate-billing';
import { vatLabel } from '@/lib/pdf/document-props';
import { bankDetailsFor } from '@/lib/workshop-core';
import { DocumentHeader, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { pluralizeWord } from '@/lib/utils/pluralize';

const RED = '#EC3237'; // the logo red: the rules on the invoice

function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

function Field({ label, value, sub }: { label: string; value: string; sub?: (string | null)[] }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
      {(sub ?? []).filter(Boolean).map((line) => (
        <div key={line} style={{ fontSize: '11px', color: '#475569', marginTop: '1px' }}>{line}</div>
      ))}
    </div>
  );
}

/**
 * The customer's invoice on the letterhead. Every figure and line is the
 * invoice as issued (frozen), so a reprint never changes; only "Amount paid"
 * and "Balance due" show the payments as they are today.
 */
export default async function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await getInvoice(id);
  if (!inv) notFound();
  const lines = invoiceLines(inv);
  const c = inv.customer;
  const isCompany = c.customerType === 'ORGANIZATION' && Boolean(c.customerCompany?.companyName);
  const vehicle = inv.jobCard.vehicle;
  const total = Number(inv.total);
  const paid = paidTowards(inv);
  const balance = Math.max(0, r2(total - paid));
  const vatRate = Number(inv.vatRate);
  const discounts = r2(Number(inv.lineDiscounts) + Number(inv.discountAmount));
  const bank = await bankDetailsFor(inv.branch.id);
  const cell = { padding: '6px 4px' } as const;
  const cellRight = { padding: '6px 4px', textAlign: 'right' } as const;
  const row = (label: string, value: string, strong = false) => (
    <tr style={strong ? { borderTop: '1.5px solid #0F172A' } : undefined}>
      <td style={{ padding: strong ? '6px 0' : '3px 0', color: strong ? '#0F172A' : '#475569', fontWeight: strong ? 700 : 400, fontSize: strong ? '14px' : '12px', width: '60%' }}>{label}</td>
      <td style={{ padding: strong ? '6px 0' : '3px 0', textAlign: 'right', fontWeight: strong ? 700 : 400, fontSize: strong ? '14px' : '12px' }}>{value}</td>
    </tr>
  );

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={inv.organisation}
        branch={inv.branch}
        logoUrl={`${portalBaseUrl()}/brand/logo.png`}
        documentTitle="Invoice"
        referenceNumber={inv.invoiceNumber}
        statusLabel={balance > 0 ? `Balance due ${naira(balance)}` : 'Paid in full'}
        accentColor={RED}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '20px' }}>
        <Field label="BILL TO" value={billToName(c)} sub={[isCompany ? `Attn: ${c.fullName}` : null, c.phone, c.email, c.address]} />
        <Field label="INVOICE DATE" value={invoiceDate(inv.issuedAt)} sub={[`Job Card ${inv.jobCard.jobNumber}`, inv.dueDate ? `Payment due by ${invoiceDate(inv.dueDate)}` : null, vatRate > 0 && inv.vatNumber ? `Tax ID (TIN): ${inv.vatNumber}` : null]} />
        <Field label="VEHICLE" value={[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'} sub={[vehicle.chassisNumber ? `VIN / chassis ${vehicle.chassisNumber}` : null]} />
        <Field label="PLATE NO. / MILEAGE" value={[vehicle.plateNumber ?? '—', inv.jobCard.mileageAtCheckIn != null ? `${inv.jobCard.mileageAtCheckIn.toLocaleString('en-NG')} km` : null].filter(Boolean).join(' · ')} />
      </div>

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1.5px solid #0F172A', textAlign: 'left' }}>
            <th style={cell}>S/N</th>
            <th style={cell}>Description</th>
            <th style={cellRight}>Quantity</th>
            <th style={cellRight}>Unit Price</th>
            <th style={cellRight}>Discount</th>
            <th style={cellRight}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>{l.description}</td>
              <td style={cellRight}>{l.quantity}{l.unitOfMeasure ? ` ${pluralizeWord(l.quantity, l.unitOfMeasure)}` : ''}</td>
              <td style={cellRight}>{isCustomerLine(l) && l.unitPrice !== null ? naira(l.unitPrice) : '—'}</td>
              <td style={cellRight}>{isCustomerLine(l) && l.lineDiscount > 0 ? `−${naira(l.lineDiscount)}` : '—'}</td>
              <td style={cellRight}>{isCustomerLine(l) ? naira(r2(l.amount - l.lineDiscount)) : `${BILL_TO_LABEL[l.billTo as BillTo] ?? l.billTo} — not charged`}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
        <tbody>
          {row('Subtotal', naira(r2(Number(inv.subtotal) + Number(inv.lineDiscounts))))}
          {discounts > 0 ? row(Number(inv.discountAmount) > 0 && inv.discountReason ? `Discount — ${inv.discountReason}` : 'Discount', `−${naira(discounts)}`) : null}
          {vatRate > 0 ? row(`${vatLabel(vatRate)}${inv.vatNumber ? ` · TIN ${inv.vatNumber}` : ''}`, naira(Number(inv.vatAmount))) : null}
          {row('Total', naira(total), true)}
          {row('Amount paid', naira(paid))}
          {row('Balance due', naira(balance), true)}
        </tbody>
      </table>

      {balance > 0 ? (
        <div style={{ marginTop: '16px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 16px', fontSize: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>HOW TO PAY</div>
          {inv.dueDate ? <div style={{ fontWeight: 700, marginBottom: '4px' }}>Payment due by {invoiceDate(inv.dueDate)}</div> : null}
          <div>Bank: {bank.bankName}</div>
          <div>Account Name: {bank.accountName}</div>
          <div>Account Number: {bank.accountNumber}</div>
          <div>Payment Reference: {[inv.invoiceNumber, inv.jobCard.jobNumber, vehicle.plateNumber].filter(Boolean).join(' ')}</div>
          <div style={{ marginTop: '6px', color: '#64748B', fontSize: '11px' }}>Or pay the cashier at our {inv.branch.name} office.</div>
        </div>
      ) : null}

      <div style={{ marginTop: '28px', textAlign: 'center' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#3E4095' }}>Thank you for choosing {inv.organisation.name}.</div>
        <div style={{ borderTop: `2px solid ${RED}`, width: '160px', margin: '8px auto 0' }} />
        <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '6px' }}>Issued by {inv.issuedBy.fullName} on {invoiceDate(inv.issuedAt)}.</div>
      </div>

      <DocumentFooter organisation={inv.organisation} />
    </div>
  );
}
