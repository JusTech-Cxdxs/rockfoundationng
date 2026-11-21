import { portalBaseUrl } from '@/lib/portal-url';
import { notFound } from 'next/navigation';
import { billingOf, billingSplit, isCustomerLine, coveredLabel, jobCardTotals } from '@/lib/estimate-billing';
import { vatLabel } from '@/lib/pdf/document-props';
import { getJobCard } from '@/lib/actions/workshop';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';
import { serviceJobCardCycle } from '@/lib/vehicle-service-cycle';
import { visitDurations } from '@/lib/visit-durations';
import { moduleIsOn } from '@/lib/modules';

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TYPE_LABEL: Record<string, string> = {
  STORE_PART: 'Part',
  EXTERNAL_PART: 'External Part',
  EXTERNAL_JOB: 'External Job',
  INTERNAL_JOB: 'Labour',
  LABOUR: 'Labour',
  SUNDRY: 'Sundry',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CARD: 'Card',
  CHEQUE: 'Cheque',
};

/** A label above its value, kept close together. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

/**
 * Vehicle Collection Receipt for a Job Card, outside the app layout. Only
 * available once CHECKED_OUT: a CLOSED vehicle can still be in the yard.
 */
export default async function PrintJobCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';

  const [jobCard, organisation] = await Promise.all([getJobCard(id), getOrganisation()]);
  if (!jobCard || !organisation) notFound();
  if (jobCard.status !== 'CHECKED_OUT') notFound();

  // A cancelled Job Card also ends as CHECKED_OUT; the approved
  // cancellation request is what marks it as cancelled.
  const cancellation = jobCard.cancellationRequests[0] ?? null;
  const wasCancelled = Boolean(cancellation);

  const lineItems = jobCard.estimate?.lineItems ?? [];
  // What the customer pays — covered lines (warranty / goodwill / internal) are shown but not charged.
  const totals = jobCardTotals(jobCard.estimate, billingOf(jobCard));
  const totalEstimate = totals.total;
  const discounts = Math.round((totals.lineDiscounts + totals.discountAmount) * 100) / 100;
  const coveredTotal = billingSplit(lineItems).covered;
  const totalPaid = jobCard.payments.reduce((sum: number, p: (typeof jobCard.payments)[number]) => sum + Number(p.amount), 0);
  const vehicleSummary = [jobCard.vehicle.year, jobCard.vehicle.make, jobCard.vehicle.model, jobCard.vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file';
  const accentColor = wasCancelled ? '#DC2626' : '#EC3237';
  // Working days up to check-out (lib/visit-durations, as on the Job Card
  // page). In Service ends at completion, cancellation or check-out.
  const durations = visitDurations({
    checkedInAt: jobCard.createdAt,
    workStartedAt: jobCard.workStartedAt,
    completedAt: jobCard.completedAt,
    cancelledAt: cancellation?.decidedAt ?? null,
    checkedOutAt: jobCard.checkedOutAt,
  });
  const daysInCustody = durations.custody.days;
  const inServiceDuration = durations.inService?.days ?? null;
  // Money in and money returned — the refund story, on both copies.
  const totalRefunded = jobCard.refunds.reduce((sum: number, r: (typeof jobCard.refunds)[number]) => sum + Number(r.amount), 0);
  const netPaid = Math.round((totalPaid - totalRefunded) * 100) / 100;
  // A Job Card opened as a service: the next-service point it set (not on a cancelled hand-back).
  const nextService = jobCard.isService && !wasCancelled ? await serviceJobCardCycle(id).catch(() => null) : null;
  const nextServiceDue = nextService
    ? [nextService.nextServiceDueOdometer != null ? `${nextService.nextServiceDueOdometer.toLocaleString('en-NG')} km` : null, nextService.nextServiceDueDate ? formatDateOnly(nextService.nextServiceDueDate) : null].filter(Boolean).join(' or ')
    : '';
  const paymentRefs = jobCard.payments.map((p: (typeof jobCard.payments)[number]) => p.notes?.trim()).filter((n: string | undefined): n is string => Boolean(n));

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={jobCard.branch}
        logoUrl={`${portalBaseUrl()}/brand/logo.png`}
        documentTitle={
          wasCancelled
            ? (isOrgCopy ? 'Job Card — Cancelled, Vehicle Returned' : 'Vehicle Return Receipt (Cancelled)')
            : (isOrgCopy ? 'Job Card — Vehicle Collection Record' : 'Vehicle Collection Receipt')
        }
        referenceNumber={jobCard.jobNumber}
        statusLabel={wasCancelled ? 'Cancelled — Checked Out' : 'Checked Out'}
        accentColor={accentColor}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '20px' }}>
        <Field label="CUSTOMER" value={jobCard.customer.fullName} />
        <Field label="VEHICLE" value={vehicleSummary} />
        <Field label="PLATE NO." value={jobCard.vehicle.plateNumber ?? '—'} />
        <Field label="VIN / CHASSIS" value={jobCard.vehicle.chassisNumber ?? '—'} />
        <Field label="CHECKED IN" value={formatDateTime(new Date(jobCard.createdAt))} />
        <Field label="CHECKED OUT" value={jobCard.checkedOutAt ? formatDateTime(new Date(jobCard.checkedOutAt)) : '—'} />
        {jobCard.isService ? <Field label="VISIT" value="Service" /> : null}
        {nextServiceDue ? <Field label="NEXT SERVICE DUE" value={`${nextServiceDue} — whichever comes first`} /> : null}
        {paymentRefs.length > 0 ? <Field label={pluralize(paymentRefs.length, 'PAYMENT REF', 'PAYMENT REFS')} value={paymentRefs.join(', ')} /> : null}
        {jobCard.refunds.length > 0 ? (
          <Field
            label={pluralize(jobCard.refunds.length, 'REFUND RECEIPT', 'REFUND RECEIPTS')}
            value={jobCard.refunds.map((r: (typeof jobCard.refunds)[number]) => r.referenceNumber).join(', ')}
          />
        ) : null}
        {jobCard.customer.address ? <Field label="CUSTOMER ADDRESS" value={jobCard.customer.address} /> : null}
        {isOrgCopy ? (
          <>
            <Field label="TECHNICIAN IN CHARGE" value={((jobCard as { technicianAcceptanceStatus?: string | null }).technicianAcceptanceStatus === 'ACCEPTED' ? jobCard.assignedTechnician?.fullName : null) ?? (jobCard.assignedTechnician ? 'Not yet accepted' : '—')} />
            <Field label="WORKSHOP SUPERVISOR" value={jobCard.supervisor?.fullName ?? '—'} />
            <Field label="TOTAL TIME IN CUSTODY" value={pluralize(daysInCustody, 'working day')} />
            {inServiceDuration !== null ? (
              <Field
                label={durations.inService?.endedBy === 'CANCELLED' ? 'IN SERVICE BEFORE CANCELLATION' : 'IN SERVICE DURATION'}
                value={pluralize(inServiceDuration, 'working day')}
              />
            ) : null}
            {/* Parts request references only where the Store is on. */}
            {moduleIsOn('inventory') && jobCard.partRequestSlips.length > 0 ? (
              <Field
                label={pluralize(jobCard.partRequestSlips.length, 'STORE PARTS REQUEST REF', 'STORE PARTS REQUEST REFS')}
                value={jobCard.partRequestSlips.map((s: (typeof jobCard.partRequestSlips)[number]) => s.referenceNumber).join(', ')}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {wasCancelled && cancellation ? (
        <div style={{ marginTop: '20px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#B91C1C', letterSpacing: '0.02em' }}>THIS JOB CARD WAS CANCELLED</div>
          <div style={{ fontSize: '12px', color: '#7F1D1D', marginTop: '4px' }}>
            Requested by {cancellation.requestedBy.fullName}, approved by {cancellation.decidedBy?.fullName ?? '—'}
            {cancellation.decidedAt ? ` on ${formatDateTime(new Date(cancellation.decidedAt))}` : ''}.
          </div>
          {cancellation.reason ? (
            <div style={{ fontSize: '12px', color: '#7F1D1D', marginTop: '4px' }}>
              <span style={{ fontWeight: 600 }}>Reason: </span>{cancellation.reason}
            </div>
          ) : null}
        </div>
      ) : null}

      {jobCard.complaints.length > 0 ? (
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>REPORTED COMPLAINTS</div>
          <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px' }}>
            {jobCard.complaints.map((c: (typeof jobCard.complaints)[number]) => (
              <li key={c.id}>{c.description}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {lineItems.length > 0 ? (
        <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid #0F172A', textAlign: 'left' }}>
              <th style={{ padding: '6px 4px' }}>S/N</th>
              <th style={{ padding: '6px 4px' }}>Description</th>
              {/* Line types are internal: organisation copy only. */}
              {isOrgCopy ? <th style={{ padding: '6px 4px' }}>Type</th> : null}
              <th style={{ padding: '6px 4px', textAlign: 'right' }}>Quantity</th>
              <th style={{ padding: '6px 4px', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((line: (typeof lineItems)[number], i: number) => (
              <tr key={line.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '6px 4px' }}>{i + 1}</td>
                <td style={{ padding: '6px 4px' }}>{line.description}</td>
                {isOrgCopy ? <td style={{ padding: '6px 4px' }}>{TYPE_LABEL[line.type] ?? line.type}</td> : null}
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                  {line.quantity}{line.unitOfMeasure ? ` ${pluralizeWord(line.quantity, line.unitOfMeasure)}` : ''}
                </td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                  {isCustomerLine(line) ? (
                    line.amount !== null ? formatNaira(Number(line.amount)) : '—'
                  ) : (
                    <span style={{ color: '#166534', fontSize: '11px' }}>
                      {coveredLabel(line.billTo)}
                      {isOrgCopy && line.amount !== null ? ` (${formatNaira(Number(line.amount))})` : ''}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {coveredTotal > 0 ? (
              <tr style={{ color: '#166534' }}>
                <td style={{ padding: '6px 4px' }} colSpan={isOrgCopy ? 4 : 3}>Covered by the workshop (under warranty, goodwill or internal — not charged)</td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>{formatNaira(coveredTotal)}</td>
              </tr>
            ) : null}
            {discounts > 0 ? (
              <tr>
                <td style={{ padding: '6px 4px' }} colSpan={isOrgCopy ? 4 : 3}>Discount{jobCard.estimate?.discountReason && totals.discountAmount > 0 ? ` — ${jobCard.estimate.discountReason}` : ''}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>−{formatNaira(discounts)}</td>
              </tr>
            ) : null}
            {totals.vatRate > 0 ? (
              <tr>
                <td style={{ padding: '6px 4px' }} colSpan={isOrgCopy ? 4 : 3}>{vatLabel(totals.vatRate)}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>{formatNaira(totals.vatAmount)}</td>
              </tr>
            ) : null}
            <tr style={{ borderTop: '1.5px solid #0F172A', fontWeight: 700 }}>
              <td style={{ padding: '6px 4px' }} colSpan={isOrgCopy ? 4 : 3}>
                {pluralize(lineItems.length, 'Item')} total{coveredTotal > 0 ? ' — customer pays' : ''}
              </td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{formatNaira(totalEstimate)}</td>
            </tr>
          </tfoot>
        </table>
      ) : null}

      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px', fontSize: '12px' }}>
        <tbody>
          <tr>
            <td style={{ padding: '4px 0', color: '#475569', width: '50%' }}>Total Amount</td>
            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>{formatNaira(totalEstimate)}</td>
          </tr>
          <tr>
            <td style={{ padding: '4px 0', color: '#475569' }}>Total Paid</td>
            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>{formatNaira(totalPaid)}</td>
          </tr>
          {jobCard.refunds.length > 0 || (wasCancelled && totalPaid > 0) ? (
            <>
              <tr>
                <td style={{ padding: '4px 0', color: '#475569' }}>Total Refunded</td>
                <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>{formatNaira(totalRefunded)}</td>
              </tr>
              <tr style={{ borderTop: '1.5px solid #0F172A' }}>
                <td style={{ padding: '6px 0', fontWeight: 700 }}>Net Paid (kept)</td>
                <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700 }}>{formatNaira(netPaid)}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 0', color: '#475569' }}>Refund status</td>
                <td style={{ padding: '2px 0', textAlign: 'right', fontWeight: 700 }}>{netPaid <= 0 ? 'Fully refunded' : wasCancelled ? `${formatNaira(netPaid)} not yet refunded` : 'Partly refunded'}</td>
              </tr>
            </>
          ) : null}
        </tbody>
      </table>

      {/* Customer copy: a clean record of money in and out — no staff names. */}
      {!isOrgCopy && (jobCard.payments.length > 0 || jobCard.refunds.length > 0) ? (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>PAYMENTS &amp; REFUNDS</div>
          <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <tbody>
              {jobCard.payments.map((p: (typeof jobCard.payments)[number]) => (
                <tr key={p.id}>
                  <td style={{ padding: '2px 0', color: '#475569', width: '25%' }}>{formatDateTime(new Date(p.recordedAt))}</td>
                  <td style={{ padding: '2px 0' }}>
                    Payment — {PAYMENT_METHOD_LABEL[p.method] ?? p.method} — {formatNaira(Number(p.amount))}
                    {p.notes ? ` — Ref: ${p.notes}` : ''}
                  </td>
                </tr>
              ))}
              {jobCard.refunds.map((r: (typeof jobCard.refunds)[number]) => (
                <tr key={r.id}>
                  <td style={{ padding: '2px 0', color: '#475569' }}>{formatDateTime(new Date(r.recordedAt))}</td>
                  <td style={{ padding: '2px 0' }}>
                    Refund {r.referenceNumber} — {r.method === 'CASH' ? 'Cash' : 'Bank Transfer'} — {formatNaira(Number(r.amount))} — received by {r.paidToName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {isOrgCopy && jobCard.payments.length > 0 ? (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>PAYMENT RECORD</div>
          <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <tbody>
              {jobCard.payments.map((p: (typeof jobCard.payments)[number]) => (
                <tr key={p.id}>
                  <td style={{ padding: '2px 0', color: '#475569', width: '25%' }}>{formatDateTime(new Date(p.recordedAt))}</td>
                  <td style={{ padding: '2px 0' }}>
                    {PAYMENT_METHOD_LABEL[p.method] ?? p.method} — {formatNaira(Number(p.amount))} — recorded by {p.recordedBy.fullName}
                    {p.notes ? ` — Ref: ${p.notes}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {isOrgCopy && jobCard.refunds.length > 0 ? (
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>REFUND RECORD</div>
          <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <tbody>
              {jobCard.refunds.map((r: (typeof jobCard.refunds)[number]) => (
                <tr key={r.id}>
                  <td style={{ padding: '2px 0', color: '#475569', width: '25%' }}>{formatDateTime(new Date(r.recordedAt))}</td>
                  <td style={{ padding: '2px 0' }}>
                    {r.referenceNumber} — {r.method === 'CASH' ? 'Cash' : 'Bank Transfer'} — {formatNaira(Number(r.amount))} to {r.paidToName} — recorded by {r.recordedBy.fullName}
                    {r.notes ? ` — Ref: ${r.notes}` : ''} — Reason: {r.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {isOrgCopy ? (
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>DOCUMENT TRAIL</div>
          <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <tbody>
              <tr>
                <td style={{ padding: '2px 0', color: '#475569', width: '25%' }}>Checked In</td>
                <td style={{ padding: '2px 0' }}>{jobCard.createdBy.fullName} — {formatDateTime(new Date(jobCard.createdAt))}</td>
              </tr>
              {jobCard.approvedBy ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Approved</td>
                  <td style={{ padding: '2px 0' }}>{jobCard.approvedBy.fullName} — {jobCard.approvedAt ? formatDateTime(new Date(jobCard.approvedAt)) : ''}</td>
                </tr>
              ) : null}
              {jobCard.workStartedAt ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Work Started</td>
                  <td style={{ padding: '2px 0' }}>{formatDateTime(new Date(jobCard.workStartedAt))}</td>
                </tr>
              ) : null}
              {jobCard.completedAt ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Completed</td>
                  <td style={{ padding: '2px 0' }}>{formatDateTime(new Date(jobCard.completedAt))}</td>
                </tr>
              ) : null}
              {jobCard.closedAt ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Closed</td>
                  <td style={{ padding: '2px 0' }}>{formatDateTime(new Date(jobCard.closedAt))}</td>
                </tr>
              ) : null}
              {wasCancelled && cancellation ? (
                <tr>
                  <td style={{ padding: '2px 0', color: '#475569' }}>Cancelled</td>
                  <td style={{ padding: '2px 0' }}>
                    {cancellation.decidedBy?.fullName ?? '—'}
                    {cancellation.decidedAt ? ` — ${formatDateTime(new Date(cancellation.decidedAt))}` : ''}
                  </td>
                </tr>
              ) : null}
              <tr>
                <td style={{ padding: '2px 0', color: '#475569' }}>Checked Out</td>
                <td style={{ padding: '2px 0' }}>{jobCard.checkedOutAt ? formatDateTime(new Date(jobCard.checkedOutAt)) : '—'} — collected by {jobCard.collectedByName ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      <SignatureBlock
        issuerLabel={wasCancelled ? 'Returned By (Workshop)' : 'Released By (Workshop)'}
        issuerName={jobCard.supervisor?.fullName ?? ((jobCard as { technicianAcceptanceStatus?: string | null }).technicianAcceptanceStatus === 'ACCEPTED' ? jobCard.assignedTechnician?.fullName : null) ?? null}
        collectorLabel="Collected By"
        collectorName={jobCard.collectedByName}
      />

      <DocumentFooter organisation={organisation} />
    </div>
  );
}
