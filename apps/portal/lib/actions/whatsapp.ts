'use server';

import { prisma } from '@ejo/database';
import { allows, authorize, seeJobCard } from '@/lib/authz/server';
import { writeAuditLog, workshopContactFor } from '@/lib/workshop-core';
import { issueDocumentLink } from '@/lib/document-links';
import { isDocumentKind, type DocumentKind } from '@/lib/document-links-core';
import { customerWhatsAppUrl, invoiceMessage, receiptMessage } from '@/lib/whatsapp-messages';
import { BILLING_SETTINGS_SELECT, ESTIMATE_TOTALS_SELECT, balanceDue, billingOf, jobCardTotals } from '@/lib/estimate-billing';
import { customerLinks } from '@/lib/customer-links-core';
import { websiteBaseUrl } from '@/lib/portal-url';
import { whatsAppShareUrlFor } from '@ejo/utils/whatsapp';
import { friendlyError } from '@/lib/errors';
import { requireEligibleFinanceOfficer, requireUser } from './workshop';
import { prepareEstimateWhatsApp } from './customer-approval';
import { sendCustomerAccessOnWhatsApp } from './crm';

/**
 * "Send on WhatsApp" for a customer document — the estimate, the invoice, a
 * payment receipt — and for the portal welcome / set-password link. Each
 * makes the drafted message (the same words as the matching email) and
 * hands back the wa.me address; the colleague opens it and sends the
 * message from their own phone or computer. The server sends nothing.
 *
 * A document goes as a secure link to its PDF (/d/<token>, 30 days), made
 * here: a WhatsApp message cannot attach a file. Allowed for exactly the
 * people who may send the matching email; never during an assisted session;
 * audited as 'whatsapp.prepared' with the kind and the document's number —
 * never a link or a token.
 *
 *   ESTIMATE  id = the Job Card (lib/actions/customer-approval prepareEstimateWhatsApp)
 *   INVOICE   id = the invoice: Accounts or the Owner, as "Email invoice"
 *   RECEIPT   id = the payment: the branch's Accounts, who records it (and its email)
 */

export type WhatsAppPrepared = { ok: true; url: string; note: string } | { ok: false; message: string };

class WhatsAppError extends Error {}

const NO_PHONE = 'There is no mobile number WhatsApp can take on file for this customer.';
const STAFF_NOTE = 'The message is ready. Press “Open WhatsApp” and send it from your phone — nothing has been sent yet.';

/** Accounts (workshop.payment.record) or the Owner (workshop.close.approve): who may email an invoice. */
async function requireBiller(branchId: string, where: string): Promise<{ id: string }> {
  const user = await requireUser();
  if (await allows('workshop.payment.record', { branchId, homeBranch: true })) return user;
  await authorize('workshop.close.approve', { branchId, homeBranch: true }, where, 'Only Accounts or the Owner can send invoices.');
  return user;
}

const money = (rows: { amount: unknown }[]) => rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

async function invoiceWhatsApp(invoiceId: string): Promise<string> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true, invoiceNumber: true, organisationId: true, branchId: true, jobCardId: true, total: true, dueDate: true,
      customer: { select: { fullName: true, phone: true, altPhone: true, customerType: true } },
      jobCard: { select: { jobNumber: true, payments: { select: { amount: true } }, refunds: { select: { amount: true } } } },
    },
  });
  if (!inv) throw new WhatsAppError('Invoice not found.');
  await seeJobCard(inv.jobCardId, 'makeWhatsAppMessage');
  const user = await requireBiller(inv.branchId, 'makeWhatsAppMessage');
  if (!whatsAppShareUrlFor([inv.customer.phone, inv.customer.altPhone], 'x')) throw new WhatsAppError(NO_PHONE);
  const pdf = await issueDocumentLink({ organisationId: inv.organisationId, kind: 'INVOICE', recordId: inv.id, createdById: user.id });
  // What the invoice email says: the total, and the balance after payments less refunds.
  const total = Number(inv.total);
  const balance = balanceDue(total, Math.max(0, money(inv.jobCard.payments) - money(inv.jobCard.refunds)));
  const url = customerWhatsAppUrl(inv.customer, invoiceMessage({
    customerName: inv.customer.fullName,
    organisation: String(inv.customer.customerType) === 'ORGANIZATION',
    invoiceNumber: inv.invoiceNumber,
    jobNumber: inv.jobCard.jobNumber,
    total,
    balance,
    dueOn: inv.dueDate,
    portalUrl: customerLinks(websiteBaseUrl()).invoice(inv.jobCardId),
    pdfUrl: pdf.url,
    workshop: await workshopContactFor(inv.branchId),
  }));
  if (!url) throw new WhatsAppError(NO_PHONE);
  await writeAuditLog({ userId: user.id, organisationId: inv.organisationId, action: 'whatsapp.prepared', entityType: 'JobCard', entityId: inv.jobCardId, metadata: { kind: 'INVOICE', invoiceNumber: inv.invoiceNumber, expiresAt: pdf.expiresAt.toISOString() } });
  return url;
}

async function receiptWhatsApp(paymentId: string): Promise<string> {
  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      receiptNumber: true, amount: true, recordedAt: true, jobCardId: true,
      jobCard: {
        select: {
          id: true, jobNumber: true, branchId: true,
          branch: { select: { businessUnit: { select: { organisationId: true, organisation: { select: BILLING_SETTINGS_SELECT } } } } },
          estimate: { select: ESTIMATE_TOTALS_SELECT },
          customer: { select: { fullName: true, phone: true, altPhone: true, customerType: true } },
          payments: { select: { amount: true, recordedAt: true } },
          refunds: { select: { amount: true, recordedAt: true } },
        },
      },
    },
  });
  if (!p?.jobCard || !p.receiptNumber) throw new WhatsAppError('This payment has no receipt.');
  const jc = p.jobCard;
  await seeJobCard(jc.id, 'makeWhatsAppMessage');
  const user = await requireEligibleFinanceOfficer(jc.branchId, 'workshop.payment.record');
  if (!whatsAppShareUrlFor([jc.customer.phone, jc.customer.altPhone], 'x')) throw new WhatsAppError(NO_PHONE);
  const organisationId = jc.branch.businessUnit.organisationId;
  const pdf = await issueDocumentLink({ organisationId, kind: 'RECEIPT', recordId: paymentId, createdById: user.id });
  // The balance after this payment, as its receipt reads (payments up to it, less refunds by then).
  const at = new Date(p.recordedAt).getTime();
  const paidBy = money(jc.payments.filter((x) => new Date(x.recordedAt).getTime() <= at)) - money(jc.refunds.filter((r) => new Date(r.recordedAt).getTime() <= at));
  const total = jobCardTotals(jc.estimate, billingOf(jc)).total;
  const url = customerWhatsAppUrl(jc.customer, receiptMessage({
    customerName: jc.customer.fullName,
    organisation: String(jc.customer.customerType) === 'ORGANIZATION',
    receiptNumber: p.receiptNumber,
    amount: Number(p.amount ?? 0),
    jobNumber: jc.jobNumber,
    paidAt: new Date(p.recordedAt),
    balance: balanceDue(total, paidBy),
    pdfUrl: pdf.url,
    workshop: await workshopContactFor(jc.branchId),
  }));
  if (!url) throw new WhatsAppError(NO_PHONE);
  await writeAuditLog({ userId: user.id, organisationId, action: 'whatsapp.prepared', entityType: 'JobCard', entityId: jc.id, metadata: { kind: 'RECEIPT', receiptNumber: p.receiptNumber, expiresAt: pdf.expiresAt.toISOString() } });
  return url;
}

/** The drafted message for one document, as a wa.me address. */
export async function makeWhatsAppMessage(input: { kind: DocumentKind; id: string }): Promise<WhatsAppPrepared> {
  try {
    const id = typeof input?.id === 'string' ? input.id.trim() : '';
    if (!isDocumentKind(input?.kind) || !id) throw new WhatsAppError('Nothing to send.');
    if (input.kind === 'ESTIMATE') {
      const made = await prepareEstimateWhatsApp(id);
      return { ok: true, url: made.whatsAppUrl, note: `${STAFF_NOTE} The approval link in it replaces the one we emailed: only the newest link works.` };
    }
    const url = input.kind === 'INVOICE' ? await invoiceWhatsApp(id) : await receiptWhatsApp(id);
    return { ok: true, url, note: STAFF_NOTE };
  } catch (err) {
    return { ok: false, message: friendlyError(err, 'Could not prepare the WhatsApp message.', 'whatsapp') };
  }
}

/**
 * The portal welcome (just registered) or the set-password link again, on
 * WhatsApp: a fresh set-password link, the same as the email's, which
 * replaces the link we emailed (lib/actions/crm sendCustomerAccessOnWhatsApp).
 */
export async function makeWelcomeWhatsAppMessage(input: { customerId: string; kind: 'welcome' | 'access' }): Promise<WhatsAppPrepared> {
  try {
    const id = typeof input?.customerId === 'string' ? input.customerId.trim() : '';
    if (!id) throw new WhatsAppError('Nothing to send.');
    const made = await sendCustomerAccessOnWhatsApp(id, input.kind === 'welcome' ? 'welcome' : 'access');
    if (made.url === null) return { ok: false, message: made.reason };
    return { ok: true, url: made.url, note: `${STAFF_NOTE} This replaces the link we emailed: only the newest set-password link works.` };
  } catch (err) {
    return { ok: false, message: friendlyError(err, 'Could not prepare the WhatsApp message.', 'whatsapp') };
  }
}
