import { renderEmailLayout, html, greeting, para, details } from './layout';

export type CustomerRatingRequestEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  ratingUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** "How did we do?" after the vehicle is collected: one tap to rate the job, 1 to 5. */
export function renderCustomerRatingRequestEmail(o: CustomerRatingRequestEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Thank you for bringing your ${o.vehicleDescription} to ${o.companyName}. How did we do? It takes ten seconds, and your answer goes straight to our management.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Vehicle', o.vehicleDescription],
    ])}
    ${para('If anything was not right, tell us on the same page and someone will call you to put it right.')}`;
  return renderEmailLayout({
    previewText: `How did we do with your ${o.vehicleDescription}?`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Your opinion', tone: 'info' },
    heading: 'How did we do?',
    bodyHtml,
    ctaLabel: 'Rate this job',
    ctaUrl: o.ratingUrl,
    audience: 'customer',
  });
}
