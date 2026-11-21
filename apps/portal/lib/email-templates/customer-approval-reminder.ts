import { renderEmailLayout, html, greeting, para, details, highlight, primaryButton } from './layout';
import { ordinal } from '../utils/ordinal';

export type CustomerApprovalReminderEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  totalEstimate: string;
  /** Omitted (or null) when no deposit applies. */
  minimumDepositAmount?: string | null;
  /** The deposit as a percentage of the total, e.g. 70. */
  depositPercent?: number;
  dueDate: string;
  /** A fresh secure link to approve or decline online. */
  approvalUrl?: string | null;
  reminderNumber: number;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** The estimate was sent but the customer has not given the go-ahead (or paid the deposit) yet. */
export function renderCustomerApprovalReminderEmail(o: CustomerApprovalReminderEmailOptions): string {
  const deposit = o.minimumDepositAmount || null;
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(deposit
      ? `The estimate for your ${o.vehicleDescription} is still waiting for your go-ahead. Work starts once you approve it and the deposit is received, so answering early means your vehicle is ready sooner.`
      : `The estimate for your ${o.vehicleDescription} is still waiting for your go-ahead. Work starts as soon as you approve it, so answering early means your vehicle is ready sooner.`)}
    ${highlight(deposit ? 'Please approve and pay the deposit by' : 'Please approve by', o.dueDate, 'If something is holding you up, contact the branch and we will work it out with you.', 'warning')}
    ${o.approvalUrl ? primaryButton('Approve or decline online', o.approvalUrl) : ''}
    ${details([
      ['Job Card', o.jobNumber],
      ['Vehicle', o.vehicleDescription],
      ['Estimate total', o.totalEstimate],
      deposit ? [o.depositPercent ? `Deposit to start (${o.depositPercent}%)` : 'Deposit to start', deposit] : null,
      ['Reminder', `${ordinal(Math.max(1, o.reminderNumber))} reminder`],
    ])}
    ${para(deposit ? 'The bank details and payment reference are in the estimate email we sent you, and in your customer portal.' : 'You can also approve it in your customer portal, or call the branch.', 'small')}`;
  return renderEmailLayout({
    previewText: deposit ? `Your estimate for Job Card ${o.jobNumber} is waiting. Please approve it and pay the deposit by ${o.dueDate}.` : `Your estimate for Job Card ${o.jobNumber} is waiting. Please approve it by ${o.dueDate}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Action needed', tone: 'warning' },
    heading: 'Your estimate is waiting for you',
    bodyHtml,
    ctaLabel: 'View estimate',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
