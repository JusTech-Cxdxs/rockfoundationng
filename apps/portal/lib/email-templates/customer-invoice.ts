import { renderEmailLayout, html, greeting, para, details, highlight, sectionTitle } from './layout';

export type CustomerInvoiceEmailOptions = {
  customerName: string;
  invoiceNumber: string;
  jobNumber: string;
  vehicleDescription: string;
  issuedOn: string;
  /** For an organisation on credit: "Payment due by …". Null = due before collection. */
  dueOn?: string | null;
  totalAmount: string;
  amountPaid: string;
  /** Null when nothing is left to pay. */
  balanceDue: string | null;
  bankName: string;
  accountName: string;
  accountNumber: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** The customer's invoice, sent when the work on their Job Card is completed (the PDF is attached). */
export function renderCustomerInvoiceEmail(o: CustomerInvoiceEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`The work on your ${o.vehicleDescription} (Job Card ${o.jobNumber}) is complete. Your invoice is attached to this email.`)}
    ${highlight(o.balanceDue ? 'Balance due' : 'Invoice total', o.balanceDue ?? o.totalAmount, o.balanceDue ? (o.dueOn ? `Payment due by ${o.dueOn}.` : 'Please pay the balance before collecting your vehicle.') : 'Thank you. This invoice is paid in full.', o.balanceDue ? 'warning' : 'success')}
    ${details([
      ['Invoice', o.invoiceNumber],
      ['Date', o.issuedOn],
      o.dueOn ? ['Payment due by', o.dueOn] : null,
      ['Job Card', o.jobNumber],
      ['Invoice total', o.totalAmount],
      ['Paid so far', o.amountPaid],
      ['Balance due', o.balanceDue ?? 'None (paid in full)'],
    ])}
    ${o.balanceDue ? sectionTitle('How to pay') : ''}
    ${o.balanceDue ? details([
      ['Bank', o.bankName],
      ['Account name', o.accountName],
      ['Account number', o.accountNumber],
      ['Payment reference', `${o.invoiceNumber} ${o.jobNumber}`],
    ]) : ''}
    ${para(`Thank you for choosing ${o.companyName}. Keep this email and the attached invoice for your records.`, 'small')}`;
  return renderEmailLayout({
    previewText: `Invoice ${o.invoiceNumber} for Job Card ${o.jobNumber}: ${o.totalAmount}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: o.balanceDue ? 'Balance due' : 'Paid in full', tone: o.balanceDue ? 'warning' : 'success' },
    heading: 'Your invoice',
    bodyHtml,
    ctaLabel: 'View in customer portal',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
