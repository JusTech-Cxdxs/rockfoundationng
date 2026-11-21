import { renderEmailLayout, html, greeting, para, details, highlight, primaryButton, vehicleLabel } from './layout';

export type CustomerEstimateApprovalLinkEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  plateNumber?: string | null;
  totalAmount: string;
  /** The deposit due before work starts; omitted (or null) when none applies. */
  minimumDepositAmount?: string | null;
  depositPercent?: number;
  /** The secure link (works once, for 7 days). */
  approvalUrl: string;
  /** "Friday, 27 November 2026": when the link stops working. */
  expiresOn: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** A colleague sends the customer a fresh link to approve or decline their estimate online. */
export function renderCustomerEstimateApprovalLinkEmail(o: CustomerEstimateApprovalLinkEmailOptions): string {
  const vehicle = vehicleLabel(o.vehicleDescription, o.plateNumber);
  const deposit = o.minimumDepositAmount || null;
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Here is a secure link to approve the estimate for your ${vehicle}, or to tell us you do not want the work. ${deposit ? 'Work starts once you approve it and the deposit is received.' : 'Work starts as soon as you approve it.'}`)}
    ${primaryButton('Approve or decline online', o.approvalUrl)}
    ${highlight('Estimate total', o.totalAmount, `The link works once and stops working on ${o.expiresOn}. Any earlier link no longer works.`, 'warning')}
    ${details([
      ['Job Card', o.jobNumber],
      ['Vehicle', vehicle],
      deposit ? [o.depositPercent ? `Deposit to start (${o.depositPercent}%)` : 'Deposit to start', deposit] : null,
    ])}
    ${para('You can also see the full estimate in your customer portal, or call the branch.', 'small')}`;
  return renderEmailLayout({
    previewText: `Approve or decline the estimate for Job Card ${o.jobNumber} online. The link works until ${o.expiresOn}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Action needed', tone: 'warning' },
    heading: 'Approve your estimate online',
    bodyHtml,
    ctaLabel: 'View estimate',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
