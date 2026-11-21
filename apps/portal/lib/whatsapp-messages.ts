/**
 * The messages behind "Send on WhatsApp" (pure): a colleague clicks, WhatsApp
 * opens on their own phone or computer with the message written, and they
 * send it themselves — the server sends nothing. One builder per moment the
 * customer is contacted, next to the email the portal already sends: the
 * service reminder (Service Tracker and the vehicle's page), "ready for
 * collection" (the Job Card and Vehicles in custody), the invoice and the
 * payment receipt. Plain words, money as ₦12,345.00, the workshop's own
 * number to call back.
 *
 * The link itself is @ejo/utils/whatsapp whatsAppShareUrlFor: no usable
 * phone, no link, and the button is not shown.
 *
 * D'Phoenix phase 6A: the estimate, the invoice and the receipt go with
 * their PDF, as the email does — a WhatsApp message cannot attach a file, so
 * it carries the secure document link (/d/<token>, 30 days) made by the
 * "Send on WhatsApp" action (lib/actions/whatsapp.ts). Also the welcome and
 * set-password link, the refund, and the Job Card's checked-out, cancelled
 * and closed notices: the same words as each email.
 */
import { whatsAppNumber, whatsAppShareUrlFor } from '@ejo/utils/whatsapp';

/** ₦12,345.00 */
export function nairaText(amount: number | string | { toString(): string } | null | undefined): string {
  const n = Number(amount === null || amount === undefined ? 0 : typeof amount === 'number' ? amount : amount.toString());
  const safe = Number.isFinite(n) ? n : 0;
  return `${safe < 0 ? '-' : ''}₦${Math.abs(safe).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 21 November 2026, in Lagos. */
const dayText = (d: Date) => d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });

/** "Hello Tolani" for a person; "Hello" and the company for an organisation. */
function greeting(customerName: string, organisation: boolean): string {
  const name = customerName.trim();
  if (!name) return 'Hello,';
  return organisation ? `Hello ${name},` : `Hello ${name.split(/\s+/)[0]},`;
}

/** "Toyota Hilux (EKY 123 AB)" */
export function vehicleText(v: { make?: string | null; model?: string | null; plateNumber?: string | null }): string {
  const name = [v.make, v.model].filter(Boolean).join(' ') || 'vehicle';
  return v.plateNumber ? `${name} (${v.plateNumber})` : name;
}

/** The workshop's sign-off: its name and the first number to call. */
export type WorkshopContact = { name: string; phone: string | null };
const signOff = (w: WorkshopContact) => (w.phone ? `${w.name}\nCall or WhatsApp us: ${w.phone}` : w.name);

export function serviceReminderMessage(o: {
  customerName: string; organisation?: boolean; vehicle: { make?: string | null; model?: string | null; plateNumber?: string | null };
  dueOdometer: number | null; dueDate: Date | null; overdue: boolean; workshop: WorkshopContact;
}): string {
  const due = [o.dueOdometer !== null ? `${o.dueOdometer.toLocaleString('en-NG')} km` : null, o.dueDate ? dayText(o.dueDate) : null].filter(Boolean).join(' or ');
  return [
    greeting(o.customerName, Boolean(o.organisation)),
    o.overdue
      ? `Your ${vehicleText(o.vehicle)} is now past its service${due ? ` (it was due at ${due}, whichever came first)` : ''}.`
      : `Your ${vehicleText(o.vehicle)} is due for its service${due ? ` at ${due}, whichever comes first` : ' soon'}.`,
    'Reply to this message or call us to book a convenient day.',
    signOff(o.workshop),
  ].join('\n');
}

export function readyForCollectionMessage(o: {
  customerName: string; organisation?: boolean; vehicle: { make?: string | null; model?: string | null; plateNumber?: string | null };
  jobNumber: string; balance: number; onCredit?: boolean; workshop: WorkshopContact & { address?: string | null };
}): string {
  return [
    greeting(o.customerName, Boolean(o.organisation)),
    `Your ${vehicleText(o.vehicle)} is ready for collection (Job Card ${o.jobNumber}).`,
    o.balance > 0 ? (o.onCredit ? `The invoice of ${nairaText(o.balance)} goes on your account, by your payment terms.` : `The balance to pay on collection is ${nairaText(o.balance)}.`) : 'Everything is paid.',
    o.workshop.address ? `Collect it from ${o.workshop.address}.` : null,
    signOff(o.workshop),
  ].filter(Boolean).join('\n');
}

/** The line that carries a document's PDF, and how long it opens. */
const pdfLine = (what: string, url: string | null | undefined) => (url ? `Your ${what} (PDF): ${url}\nThe link works for 30 days.` : null);

export function invoiceMessage(o: {
  customerName: string; organisation?: boolean; invoiceNumber: string; jobNumber: string; total: number; balance: number; dueOn: Date | null; portalUrl: string | null; workshop: WorkshopContact;
  /** The invoice's PDF (a document link), as the email attaches it. */
  pdfUrl?: string | null;
}): string {
  return [
    greeting(o.customerName, Boolean(o.organisation)),
    `Your invoice ${o.invoiceNumber} for Job Card ${o.jobNumber} is ${nairaText(o.total)}.`,
    o.balance > 0 ? `Balance to pay: ${nairaText(o.balance)}${o.dueOn ? `, by ${dayText(o.dueOn)}` : ''}.` : 'It is paid in full. Thank you.',
    pdfLine('invoice', o.pdfUrl),
    o.portalUrl ? `See it, and print it, in your customer portal: ${o.portalUrl}` : null,
    signOff(o.workshop),
  ].filter(Boolean).join('\n');
}

export function receiptMessage(o: {
  customerName: string; organisation?: boolean; receiptNumber: string; amount: number; jobNumber: string; paidAt: Date; balance: number; workshop: WorkshopContact;
  /** The receipt's PDF (a document link). */
  pdfUrl?: string | null;
}): string {
  return [
    greeting(o.customerName, Boolean(o.organisation)),
    `We have received ${nairaText(o.amount)} on ${dayText(o.paidAt)} for Job Card ${o.jobNumber}. Your receipt number is ${o.receiptNumber}.`,
    o.balance > 0 ? `Balance still to pay: ${nairaText(o.balance)}.` : 'Nothing more is owed on this Job Card. Thank you.',
    pdfLine('receipt', o.pdfUrl),
    signOff(o.workshop),
  ].filter(Boolean).join('\n');
}

/**
 * The estimate, as the "estimate ready" email sends it: the total, any
 * deposit to start, the PDF, and the approval link (it works once, until
 * the date given, and replaces any earlier approval link).
 */
export function estimateMessage(o: {
  customerName: string; organisation?: boolean; vehicle: { make?: string | null; model?: string | null; plateNumber?: string | null };
  jobNumber: string; total: number; deposit: number; approvalUrl: string | null; approvalExpiresOn: Date | null; pdfUrl: string | null; portalUrl: string | null; workshop: WorkshopContact;
}): string {
  return [
    greeting(o.customerName, Boolean(o.organisation)),
    `The estimate for your ${vehicleText(o.vehicle)} is ready: Job Card ${o.jobNumber}, total ${nairaText(o.total)}${o.deposit > 0 ? `, deposit to start the work ${nairaText(o.deposit)}` : ''}.`,
    pdfLine('estimate', o.pdfUrl),
    o.approvalUrl ? `Approve or decline it here: ${o.approvalUrl}` : null,
    o.approvalUrl ? `The approval link works once${o.approvalExpiresOn ? `, until ${dayText(o.approvalExpiresOn)}` : ''}. It replaces any approval link we sent you before.` : null,
    o.portalUrl ? `You can also answer in your customer portal: ${o.portalUrl}` : null,
    signOff(o.workshop),
  ].filter(Boolean).join('\n');
}

/**
 * The welcome (just registered) or the set-password link sent again, as the
 * email has it: the customer portal's address, the one-time link and how
 * long it works. Only the newest link works, so the message says it
 * replaces any earlier one.
 */
export function welcomeMessage(o: {
  kind: 'welcome' | 'access'; customerName: string; organisation?: boolean; email: string; signInUrl: string; setPasswordUrl: string; hours: number; workshop: WorkshopContact;
}): string {
  return [
    greeting(o.customerName, Boolean(o.organisation)),
    o.kind === 'welcome'
      ? `Welcome to ${o.workshop.name}. Your customer portal account is ready: follow your vehicles, Job Cards, estimates and payments online.`
      : `Here is a new link to set your password for the ${o.workshop.name} customer portal.`,
    `Set your password here (the link works once, for ${o.hours} hours): ${o.setPasswordUrl}`,
    'This link replaces any earlier one we sent you, by email or WhatsApp; only the newest link works.',
    `Then sign in at ${o.signInUrl} with your email address ${o.email}.`,
    signOff(o.workshop),
  ].join('\n');
}

/** A refund, as the refund-receipt email has it (there is no refund PDF: the printed copy is given at the counter). */
export function refundMessage(o: {
  customerName: string; organisation?: boolean; referenceNumber: string; recordLabel: string; recordNumber: string; amount: number; method: string; refundedAt: Date; remaining: number; workshop: WorkshopContact;
}): string {
  return [
    greeting(o.customerName, Boolean(o.organisation)),
    `We have refunded ${nairaText(o.amount)} on ${dayText(o.refundedAt)} (${o.method === 'CASH' ? 'cash' : 'bank transfer'}) for ${o.recordLabel} ${o.recordNumber}. Your refund receipt number is ${o.referenceNumber}.`,
    o.remaining > 0 ? `Still to be refunded: ${nairaText(o.remaining)}. You will get a receipt for each payment.` : 'Your refund is complete.',
    signOff(o.workshop),
  ].join('\n');
}

/** The Job Card notices the status emails send, in their words. */
export type JobCardNotice = 'CHECKED_IN' | 'IN_PROGRESS' | 'QUALITY_CHECK' | 'COMPLETED' | 'CHECKED_OUT' | 'CANCELLED' | 'CLOSED';
export const JOB_CARD_NOTICES: readonly JobCardNotice[] = ['CHECKED_IN', 'IN_PROGRESS', 'QUALITY_CHECK', 'COMPLETED', 'CHECKED_OUT', 'CANCELLED', 'CLOSED'];

/** A Job Card's status notice, as its email: checked in, work started, quality check, completed, collected, cancelled, closed. */
export function jobCardNoticeMessage(o: {
  notice: JobCardNotice; customerName: string; organisation?: boolean; vehicle: { make?: string | null; model?: string | null; plateNumber?: string | null };
  jobNumber: string; collectedByName?: string | null; portalUrl: string | null; workshop: WorkshopContact;
}): string {
  const v = vehicleText(o.vehicle);
  const BODY: Record<JobCardNotice, string[]> = {
    CHECKED_IN: [`Thank you for bringing your ${v} to ${o.workshop.name}. We have checked it in under Job Card ${o.jobNumber}, and the inspection will start shortly.`, 'We will let you know when the estimate is ready.'],
    IN_PROGRESS: [`Our technicians have started work on your ${v} (Job Card ${o.jobNumber}).`, 'There is nothing you need to do for now.'],
    QUALITY_CHECK: [`The work on your ${v} is finished (Job Card ${o.jobNumber}). Our quality team is now carrying out final checks, including a road test.`],
    COMPLETED: [`Your ${v} has passed our final quality inspection (Job Card ${o.jobNumber}). We are preparing it for collection and will send you the collection details shortly.`],
    CHECKED_OUT: [`This confirms that your ${v} has been collected (Job Card ${o.jobNumber})${o.collectedByName ? `, by ${o.collectedByName}` : ''}.`, 'If you did not collect it yourself or authorise this person, contact us straight away.'],
    CANCELLED: [`As requested, Job Card ${o.jobNumber} for your ${v} has been cancelled. No further work will be carried out under it.`, 'If your vehicle is still with us, please arrange to collect it. If you paid anything towards this job, we will contact you about it.'],
    CLOSED: [`Job Card ${o.jobNumber} for your ${v} is now closed. The work and payment are settled.`],
  };
  const body = BODY[o.notice];
  return [
    greeting(o.customerName, Boolean(o.organisation)),
    ...body,
    o.portalUrl ? `${o.notice === 'CHECKED_OUT' || o.notice === 'CANCELLED' || o.notice === 'CLOSED' ? 'See it' : 'Follow each step'} in your customer portal: ${o.portalUrl}` : null,
    o.notice === 'CHECKED_OUT' || o.notice === 'CLOSED' ? `Thank you for choosing ${o.workshop.name}.` : null,
    signOff(o.workshop),
  ].filter(Boolean).join('\n');
}

/** The wa.me link for a customer (their main phone, then the other one), or null: then no button. */
export function customerWhatsAppUrl(customer: { phone?: string | null; altPhone?: string | null }, text: string): string | null {
  return whatsAppShareUrlFor([customer.phone, customer.altPhone], text);
}

/** Whether the customer has a phone WhatsApp can take (the main one, then the other): no phone, no button. */
export function customerCanWhatsApp(customer: { phone?: string | null; altPhone?: string | null }): boolean {
  return Boolean(whatsAppNumber(customer.phone) ?? whatsAppNumber(customer.altPhone));
}

/**
 * The reminders from Vehicles in custody, as their emails: the vehicle is
 * ready and waiting (collection reminder), or its Job Card was cancelled and
 * it is still with us (collection notice).
 */
export function custodyReminderMessage(o: {
  kind: 'READY' | 'CANCELLED'; customerName: string; organisation?: boolean; vehicle: { make?: string | null; model?: string | null; plateNumber?: string | null };
  jobNumber: string; collectBy: Date | null; workshop: WorkshopContact;
}): string {
  const v = vehicleText(o.vehicle);
  return [
    greeting(o.customerName, Boolean(o.organisation)),
    o.kind === 'READY'
      ? `A reminder that your ${v} is ready for collection (Job Card ${o.jobNumber}).${o.collectBy ? ` Please collect it by ${dayText(o.collectBy)}; storage charges may apply after that date.` : ''}`
      : `Job Card ${o.jobNumber} for your ${v} was cancelled, and the vehicle is still with us. Please arrange to collect it as soon as you can.`,
    o.kind === 'READY' ? 'Please make sure any balance is paid before collection, and bring a form of identification.' : 'If you need a different arrangement, reply to this message or call us.',
    signOff(o.workshop),
  ].join('\n');
}

/** A staff reply on a support request, as the reply email: the request's number and subject, and the reply itself. */
export function supportReplyMessage(o: { customerName: string; ticketNumber: string; subject: string; reply: string; workshop: WorkshopContact }): string {
  return [
    greeting(o.customerName, false),
    `About your request ${o.ticketNumber} (${o.subject}):`,
    o.reply.trim(),
    signOff(o.workshop),
  ].join('\n');
}
