import { portalBaseUrl } from '@/lib/portal-url';
import { notFound } from 'next/navigation';
import { getReceipt } from '@/lib/actions/invoices';
import { getOrganisation } from '@/lib/actions/organisation';
import { balanceDue, billingOf, jobCardTotals } from '@/lib/estimate-billing';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { formatDateTime } from '@/lib/utils/format-date';

function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

/**
 * The customer's receipt for one Job Card payment (RCT-number), on the
 * letterhead: what was paid, how, who received it, and what is still due
 * after it (payments up to and including this one, less refunds by then).
 */
export default async function PrintReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [payment, organisation] = await Promise.all([getReceipt(id), getOrganisation()]);
  if (!payment?.jobCard || !organisation) notFound();
  const jc = payment.jobCard;
  const at = new Date(payment.recordedAt).getTime();
  const paidBy = jc.payments.filter((p) => new Date(p.recordedAt).getTime() <= at).reduce((s, p) => s + Number(p.amount), 0);
  const refundedBy = jc.refunds.filter((r) => new Date(r.recordedAt).getTime() <= at).reduce((s, r) => s + Number(r.amount), 0);
  const total = jobCardTotals(jc.estimate, billingOf(jc)).total;
  const balanceAfter = balanceDue(total, paidBy - refundedBy);
  const customerName = jc.customer.customerType === 'ORGANIZATION' && jc.customer.customerCompany?.companyName ? jc.customer.customerCompany.companyName : jc.customer.fullName;
  const vehicle = [jc.vehicle.make, jc.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={jc.branch}
        logoUrl={`${portalBaseUrl()}/images/logo/logo.png`}
        documentTitle="Payment Receipt"
        referenceNumber={payment.receiptNumber!}
        statusLabel={balanceAfter > 0 ? 'Part payment' : 'Paid in full'}
        accentColor="#D6890B"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '20px' }}>
        <Field label="RECEIPT NO." value={payment.receiptNumber!} />
        <Field label="DATE" value={formatDateTime(new Date(payment.recordedAt))} />
        <Field label="RECEIVED FROM" value={customerName} />
        <Field label="JOB CARD" value={jc.jobNumber} />
        <Field label="VEHICLE" value={[vehicle, jc.vehicle.plateNumber].filter(Boolean).join(' · ')} />
        <Field label="PAID BY" value={payment.method === 'CASH' ? 'Cash' : 'Bank Transfer'} />
        {payment.notes ? <Field label="REFERENCE / NOTE" value={payment.notes} /> : null}
        <Field label="RECEIVED BY" value={payment.recordedBy.fullName} />
      </div>

      <div style={{ marginTop: '20px', border: '1.5px solid #0F172A', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.03em' }}>AMOUNT RECEIVED</div>
        <div style={{ fontSize: '20px', fontWeight: 800 }}>{naira(Number(payment.amount))}</div>
      </div>

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px', fontSize: '12px' }}>
        <tbody>
          <tr>
            <td style={{ padding: '4px 0', color: '#475569', width: '60%' }}>Total for this Job Card</td>
            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>{naira(total)}</td>
          </tr>
          <tr>
            <td style={{ padding: '4px 0', color: '#475569' }}>Paid up to and including this receipt</td>
            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>{naira(Math.round((paidBy - refundedBy) * 100) / 100)}</td>
          </tr>
          <tr style={{ borderTop: '1.5px solid #0F172A' }}>
            <td style={{ padding: '6px 0', fontWeight: 700 }}>Balance after this payment</td>
            <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700 }}>{naira(balanceAfter)}</td>
          </tr>
        </tbody>
      </table>

      <SignatureBlock issuerLabel="Received By (Finance)" issuerName={payment.recordedBy.fullName} collectorLabel="Paid By" collectorName={customerName} />
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0A1628' }}>Thank you for choosing {organisation.name}.</div>
        <div style={{ borderTop: '2px solid #D6890B', width: '120px', margin: '6px auto 0' }} />
      </div>
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
