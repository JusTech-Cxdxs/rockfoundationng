'use server';

import { prisma } from '@ejo/database';
import { allows, authorize, seeJobCard } from '@/lib/authz/server';
import { ensureInvoice, sendInvoiceEmail, INVOICEABLE_STATUSES, INVOICE_DOCUMENT_SELECT } from '@/lib/invoices';
import { writeAuditLog } from '@/lib/workshop-core';
import { BILLING_SETTINGS_SELECT, ESTIMATE_TOTALS_SELECT } from '@/lib/estimate-billing';
import { requireUser } from './workshop';

class InvoiceActionError extends Error {}

/**
 * Who may issue or resend an invoice at the Job Card's branch: Finance
 * (workshop.payment.record — they bill and take the money) or the branch
 * Owner (workshop.close.approve — they sign off finished jobs). Anyone who
 * can see the Job Card can view and print it.
 */
async function requireBiller(branchId: string, where: string): Promise<{ id: string }> {
  const user = await requireUser();
  if (await allows('workshop.payment.record', { branchId, homeBranch: true })) return user;
  await authorize('workshop.close.approve', { branchId, homeBranch: true }, where, 'Only Finance or the Owner for this branch can issue invoices.');
  return user;
}

/** Can the viewer issue / resend this Job Card's invoice? (The same rule as the actions, for showing the buttons.) */
export async function canIssueInvoices(branchId: string): Promise<boolean> {
  return (await allows('workshop.payment.record', { branchId, homeBranch: true })) || allows('workshop.close.approve', { branchId, homeBranch: true });
}

/**
 * "Issue invoice" for a finished Job Card that has none (one completed
 * before invoices existed, or whose automatic issue failed). Idempotent: an
 * invoice already issued is returned as it is.
 */
export async function issueInvoice(jobCardId: string): Promise<{ id: string; invoiceNumber: string }> {
  const jc = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { branchId: true, status: true, estimate: { select: { status: true } } } });
  if (!jc) throw new InvoiceActionError('Job Card not found.');
  await seeJobCard(jobCardId, 'issueInvoice');
  const user = await requireBiller(jc.branchId, 'issueInvoice');
  if (!(INVOICEABLE_STATUSES as readonly string[]).includes(jc.status)) throw new InvoiceActionError('An invoice is issued once the work is completed.');
  if (jc.estimate?.status !== 'MANAGER_APPROVED') throw new InvoiceActionError('This Job Card has no Owner-approved estimate to invoice.');
  const issued = await ensureInvoice(jobCardId, user.id);
  if (!issued) throw new InvoiceActionError('This Job Card could not be invoiced — refresh the page and try again.');
  if (issued.created) await sendInvoiceEmail(issued.invoice.id);
  return issued.invoice;
}

/** Sends the invoice (with its PDF) to the customer again. */
export async function emailInvoice(invoiceId: string): Promise<void> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, invoiceNumber: true, branchId: true, jobCardId: true, customer: { select: { email: true } } } });
  if (!inv) throw new InvoiceActionError('Invoice not found.');
  await seeJobCard(inv.jobCardId, 'emailInvoice');
  const user = await requireBiller(inv.branchId, 'emailInvoice');
  if (!inv.customer.email) throw new InvoiceActionError('This customer has no email address on file — print the invoice instead.');
  if (!(await sendInvoiceEmail(inv.id))) throw new InvoiceActionError('The invoice email could not be sent just now — try again in a moment.');
  await writeAuditLog({ userId: user.id, action: 'invoice.emailed', entityType: 'JobCard', entityId: inv.jobCardId, metadata: { invoiceNumber: inv.invoiceNumber } });
}

/** The Job Card's invoice, if one has been issued (for the Job Card page). */
export async function getJobCardInvoice(jobCardId: string) {
  await requireUser();
  await seeJobCard(jobCardId, 'getJobCardInvoice');
  return prisma.invoice.findUnique({ where: { jobCardId }, select: { id: true, invoiceNumber: true, issuedAt: true, total: true, dueDate: true } });
}

/** One invoice, everything its print page shows. Whoever can see its Job Card. */
export async function getInvoice(invoiceId: string) {
  await requireUser();
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: INVOICE_DOCUMENT_SELECT });
  if (!inv) return null;
  await seeJobCard(inv.jobCard.id, 'getInvoice');
  return inv;
}

/** One payment's receipt: the payment, its Job Card and what was paid up to and including it. */
export async function getReceipt(paymentId: string) {
  await requireUser();
  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true, receiptNumber: true, amount: true, method: true, notes: true, recordedAt: true,
      recordedBy: { select: { fullName: true } },
      jobCard: {
        select: {
          id: true, jobNumber: true, branchId: true,
          branch: { select: { name: true, address: true, hotlines: true, email: true, businessUnit: { select: { organisation: { select: BILLING_SETTINGS_SELECT } } } } },
          estimate: { select: ESTIMATE_TOTALS_SELECT },
          customer: { select: { fullName: true, phone: true, customerType: true, customerCompany: { select: { companyName: true } } } },
          vehicle: { select: { make: true, model: true, plateNumber: true } },
          payments: { select: { id: true, amount: true, recordedAt: true } },
          refunds: { select: { amount: true, recordedAt: true } },
        },
      },
    },
  });
  if (!p?.jobCard || !p.receiptNumber) return null;
  await seeJobCard(p.jobCard.id, 'getReceipt');
  return p;
}
