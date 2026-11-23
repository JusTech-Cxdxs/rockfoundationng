import { renderEmailLayout, html, greeting, para, details } from './layout';

export type CustomerBookingEmailOptions = {
  kind: 'CONFIRMED' | 'REMINDER' | 'MOVED' | 'CANCELLED';
  customerName: string;
  number: string;
  visit: string;
  when: string;
  companyName: string;
  phone: string | null;
  logoUrl: string;
};

const HEADING = { CONFIRMED: 'Your booking is confirmed', REMINDER: 'See you tomorrow', MOVED: 'Your booking has a new time', CANCELLED: 'Your booking is cancelled' } as const;
const TONE = { CONFIRMED: 'success', REMINDER: 'info', MOVED: 'warning', CANCELLED: 'neutral' } as const;

/** A workshop booking: confirmed, moved, cancelled, or the reminder the day before. */
export function renderCustomerBookingEmail(o: CustomerBookingEmailOptions): string {
  const lead = {
    CONFIRMED: `Your booking at ${o.companyName} is confirmed. Please come a few minutes early with your vehicle.`,
    REMINDER: `A reminder of your booking at ${o.companyName} tomorrow. We look forward to seeing you.`,
    MOVED: `Your booking at ${o.companyName} has been moved. The new day and time are below.`,
    CANCELLED: `Your booking at ${o.companyName} is cancelled. You are welcome to book again at any time.`,
  }[o.kind];
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(lead)}
    ${details([
      ['Booking', o.number],
      ['Visit', o.visit],
      ['When', o.when],
    ])}
    ${para(o.phone ? `To change the booking, call us on ${o.phone}.` : 'To change the booking, call the workshop.')}`;
  return renderEmailLayout({
    previewText: `${HEADING[o.kind]}: ${o.when}`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    status: { label: o.number, tone: TONE[o.kind] },
    heading: HEADING[o.kind],
    bodyHtml,
    audience: 'customer',
  });
}
