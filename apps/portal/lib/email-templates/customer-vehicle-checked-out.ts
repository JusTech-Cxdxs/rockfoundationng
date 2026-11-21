import { renderEmailLayout, html, greeting, para, details, callout, highlight } from './layout';

export type CustomerVehicleCheckedOutEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  collectedByName: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  /** A Job Card opened as a service: the next-service point it set (as the Vehicle Service completion email shows). */
  nextServiceDueMileage?: string | null;
  nextServiceDueDate?: string | null;
};

/** Confirms the vehicle left the branch, and who collected it. */
export function renderCustomerVehicleCheckedOutEmail(o: CustomerVehicleCheckedOutEmailOptions): string {
  const due = [o.nextServiceDueMileage ? `at ${o.nextServiceDueMileage}` : null, o.nextServiceDueDate ? `by ${o.nextServiceDueDate}` : null].filter(Boolean).join(' or ');
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`This confirms that your ${o.vehicleDescription} has been collected from ${o.branchName || 'the branch'}.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Vehicle', o.vehicleDescription],
      ['Collected by', o.collectedByName],
    ])}
    ${due ? highlight('Next service due', due, o.nextServiceDueMileage && o.nextServiceDueDate ? 'Whichever comes first. We will remind you as it gets close.' : 'We will remind you as it gets close.', 'success') : ''}
    ${callout('If you did not collect the vehicle yourself or authorise this person to collect it, contact the branch straight away.', 'warning')}
    ${para(`Thank you for choosing ${o.companyName}. We look forward to seeing you again.`)}`;
  return renderEmailLayout({
    previewText: `Your ${o.vehicleDescription} was collected by ${o.collectedByName}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Collected', tone: 'success' },
    heading: 'Your vehicle has been collected',
    bodyHtml,
    ctaLabel: 'View in customer portal',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
