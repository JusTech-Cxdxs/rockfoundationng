import { renderEmailLayout, html, greeting, para, details, strong } from './layout';

type Brand = { companyName: string; logoUrl: string };

/**
 * To the colleagues on a Job Card (who opened it, its supervisor): the
 * customer approved or declined the estimate themselves, by the secure link
 * or in their customer portal. Every value is escaped by `html`.
 */
export function renderEstimateAnswerStaffEmail(o: Brand & {
  recipientName: string; jobNumber: string; customerName: string; branchName?: string | null;
  answer: 'approved' | 'declined'; via: 'LINK' | 'PORTAL'; note?: string | null; workStarted: boolean; depositWaiting?: string | null; url: string;
}): { subject: string; html: string } {
  const how = o.via === 'LINK' ? 'with the secure link' : 'in the customer portal';
  const next = o.answer === 'declined'
    ? 'Call the customer to understand why. If they change their mind, they can approve in the portal, or you can record their approval by phone or send a new link. To stop the job, request a cancellation.'
    : o.workStarted
      ? 'The Job Card is In Progress: the work can start.'
      : `The work starts once the deposit${o.depositWaiting ? ` (${o.depositWaiting})` : ''} is recorded under Payments.`;
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(html`${strong(o.customerName)} ${o.answer === 'approved' ? 'approved' : 'declined'} the estimate on Job Card ${strong(o.jobNumber)} ${how}.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Answer', o.answer === 'approved' ? 'Approved' : 'Declined'],
      o.note ? ['Their note', o.note] : null,
      ['Branch', o.branchName ?? ''],
    ])}
    ${para(next, 'small')}`;
  return {
    subject: `${o.answer === 'approved' ? 'Customer approved' : 'Customer declined'} the estimate — Job Card ${o.jobNumber}`,
    html: renderEmailLayout({
      previewText: `${o.customerName} ${o.answer === 'approved' ? 'approved' : 'declined'} the estimate on ${o.jobNumber}.`,
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      orgContext: [o.branchName],
      status: o.answer === 'approved' ? { label: 'Approved', tone: 'success' } : { label: 'Declined', tone: 'warning' },
      heading: o.answer === 'approved' ? 'The customer approved the estimate' : 'The customer declined the estimate',
      bodyHtml,
      ctaLabel: 'Open the Job Card',
      ctaUrl: o.url,
      audience: 'staff',
      reason: `You are receiving this because you work on this Job Card at ${o.companyName}.`,
    }),
  };
}
