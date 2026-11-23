import { prisma } from '@ejo/database';
import { BILLING_SETTINGS_SELECT, ESTIMATE_TOTALS_SELECT, balanceDue, billingOf, depositDueOn, jobCardTotals } from '@/lib/estimate-billing';
import { customerLinks } from '@/lib/customer-links-core';
import { websiteBaseUrl } from '@/lib/portal-url';
import { whatsAppToCustomer, type WhatsAppSent } from './send';
import { balanceSentence, depositSentence, jobRecord, nairaText, vehicleText, waDate } from './words';

/**
 * The customer documents on WhatsApp, each with its PDF (server only, not a
 * server action: the callers check who may send): the invoice, a payment's
 * receipt and the Job Card's estimate. Used beside the email that carries
 * the same document (lib/invoices, recordPayment, the estimate) and by
 * "Send now on WhatsApp" (lib/actions/whatsapp). Each loads the record as it
 * is now, so the figures match the PDF. Never throws.
 */

const money = (rows: { amount: unknown }[]) => rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
const FAILED: WhatsAppSent = { status: 'FAILED', message: 'The document could not be found.' };

/** The invoice, its balance after payments less refunds, and the invoice PDF. */
export async function whatsAppInvoice(invoiceId: string, actorId: string | null): Promise<WhatsAppSent> {
  try {
    const inv = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true, invoiceNumber: true, customerId: true, jobCardId: true, total: true, dueDate: true, issuedById: true,
        jobCard: { select: { jobNumber: true, payments: { select: { amount: true } }, refunds: { select: { amount: true } } } },
      },
    });
    if (!inv) return FAILED;
    const total = Number(inv.total);
    const balance = balanceDue(total, Math.max(0, money(inv.jobCard.payments) - money(inv.jobCard.refunds)));
    return await whatsAppToCustomer({
      customerId: inv.customerId, key: 'invoice', related: { type: 'Invoice', id: inv.id },
      values: { invoiceNumber: inv.invoiceNumber, record: jobRecord(inv.jobCard.jobNumber), total: nairaText(total), balance: balanceSentence(balance, inv.dueDate), link: customerLinks(websiteBaseUrl()).invoice(inv.jobCardId) },
      document: { kind: 'INVOICE', recordId: inv.id, number: inv.invoiceNumber, createdById: actorId ?? inv.issuedById ?? null },
    });
  } catch {
    return FAILED;
  }
}

/** One payment's receipt: the amount and date, the balance after it (as the receipt reads), and the receipt PDF. */
export async function whatsAppPaymentReceipt(paymentId: string, actorId: string | null): Promise<WhatsAppSent> {
  try {
    const p = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true, receiptNumber: true, amount: true, recordedAt: true, recordedById: true,
        jobCard: {
          select: {
            id: true, jobNumber: true, customerId: true,
            branch: { select: { businessUnit: { select: { organisation: { select: BILLING_SETTINGS_SELECT } } } } },
            estimate: { select: ESTIMATE_TOTALS_SELECT },
            payments: { select: { amount: true, recordedAt: true } },
            refunds: { select: { amount: true, recordedAt: true } },
          },
        },
      },
    });
    if (!p?.jobCard || !p.receiptNumber) return FAILED;
    const jc = p.jobCard;
    const at = new Date(p.recordedAt).getTime();
    const paidBy = money(jc.payments.filter((x) => new Date(x.recordedAt).getTime() <= at)) - money(jc.refunds.filter((r) => new Date(r.recordedAt).getTime() <= at));
    const total = jobCardTotals(jc.estimate, billingOf(jc)).total;
    return await whatsAppToCustomer({
      customerId: jc.customerId, key: 'payment_receipt', related: { type: 'JobCard', id: jc.id },
      values: { amount: nairaText(Number(p.amount ?? 0)), paidOn: waDate(p.recordedAt), record: jobRecord(jc.jobNumber), receiptNumber: p.receiptNumber, balance: balanceSentence(balanceDue(total, paidBy)) },
      document: { kind: 'RECEIPT', recordId: p.id, number: p.receiptNumber, createdById: actorId ?? p.recordedById },
    });
  } catch {
    return FAILED;
  }
}

/**
 * The approved estimate with its PDF and the link to answer it (a
 * fresh approval link made by the caller, or the Job Card in the customer
 * portal).
 */
export async function whatsAppEstimate(jobCardId: string, actorId: string | null, approvalUrl: string | null): Promise<WhatsAppSent> {
  try {
    const jc = await prisma.jobCard.findUnique({
      where: { id: jobCardId },
      select: {
        id: true, jobNumber: true, customerId: true,
        customer: { select: { customerType: true } },
        vehicle: { select: { make: true, model: true, plateNumber: true } },
        branch: { select: { businessUnit: { select: { organisation: { select: BILLING_SETTINGS_SELECT } } } } },
        estimate: { select: { status: true, ...ESTIMATE_TOTALS_SELECT } },
      },
    });
    if (!jc?.estimate || jc.estimate.status !== 'MANAGER_APPROVED') return FAILED;
    const total = jobCardTotals(jc.estimate, billingOf(jc)).total;
    const deposit = depositDueOn(total, billingOf(jc), String(jc.customer.customerType));
    return await whatsAppToCustomer({
      customerId: jc.customerId, key: 'estimate_ready', related: { type: 'JobCard', id: jc.id },
      values: { vehicle: vehicleText(jc.vehicle), record: jobRecord(jc.jobNumber), total: nairaText(total), deposit: depositSentence(deposit.amount), link: approvalUrl ?? customerLinks(websiteBaseUrl()).jobCard(jc.id) },
      document: { kind: 'ESTIMATE', recordId: jc.id, number: jc.jobNumber, createdById: actorId },
    });
  } catch {
    return FAILED;
  }
}
