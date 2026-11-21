import { renderToBuffer } from '@react-pdf/renderer';
import { prisma } from '@ejo/database';
import { EstimatePdf } from '@/lib/pdf/estimate-pdf';
import { ReceiptPdf } from '@/lib/pdf/receipt-pdf';
import { jobEstimatePdfProps, letterhead, receiptPdfProps } from '@/lib/pdf/document-props';
import { BILLING_SETTINGS_SELECT, ESTIMATE_TOTALS_SELECT, billingOf, depositFractionFor, jobCardTotals, vatSettingFor } from '@/lib/estimate-billing';
import { INVOICE_DOCUMENT_SELECT, invoicePdfBuffer } from '@/lib/invoices';
import { bankDetailsFor } from '@/lib/workshop-core';
import { portalBaseUrl } from '@/lib/portal-url';
import { formatDateTime } from '@/lib/utils/format-date';
import { documentPdfFileName, type DocumentKind } from '@/lib/document-links-core';

/**
 * The customer documents as PDFs (server only, not a server action: no
 * sign-in check here — the callers check). Each is drawn from the live
 * record by the same builders as the copy emailed to the customer
 * (lib/pdf/document-props), so the PDF a WhatsApp link opens is the
 * document the email carries:
 *
 *   ESTIMATE  the Job Card's Manager-approved estimate (the email to the
 *             customer attaches this same PDF);
 *   INVOICE   the invoice, its figures frozen at issue (lib/invoices);
 *   RECEIPT   one payment's receipt (as app/print/receipts shows it).
 *
 * Each answers null when the record is gone, is not the organisation's, or
 * is no longer that document (an estimate sent back for changes).
 */

export type DocumentPdf = { pdf: Buffer; fileName: string; number: string };

const ESTIMATE_PDF_SELECT = {
  id: true, jobNumber: true,
  vehicle: { select: { make: true, model: true, plateNumber: true, chassisNumber: true } },
  customer: { select: { fullName: true, address: true, customerType: true } },
  branch: {
    select: {
      id: true, name: true, address: true, hotlines: true, email: true,
      businessUnit: { select: { organisationId: true, organisation: { select: { name: true, legalName: true, hqAddress: true, poBox: true, rcNumber: true, hotlines: true, website: true, email: true, ...BILLING_SETTINGS_SELECT } } } },
    },
  },
  estimate: {
    select: {
      status: true, discountAmount: true, vatRate: true,
      lineItems: { orderBy: { createdAt: 'asc' as const }, select: { type: true, description: true, quantity: true, amount: true, unitOfMeasure: true, billTo: true, discountAmount: true, coveringWarranty: { select: { warrantyNumber: true } } } },
    },
  },
} as const;

/**
 * The Job Card's estimate PDF, as attached to the "estimate ready" email:
 * the letterhead, the three customer figures, any discount and VAT, the
 * deposit for this customer and the branch's bank details. Only once the
 * Manager has approved it.
 */
export async function estimatePdfFor(jobCardId: string, organisationId?: string): Promise<DocumentPdf | null> {
  const jc = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: ESTIMATE_PDF_SELECT });
  if (!jc?.estimate || jc.estimate.status !== 'MANAGER_APPROVED') return null;
  const org = jc.branch.businessUnit.organisation;
  if (organisationId && jc.branch.businessUnit.organisationId !== organisationId) return null;
  const billing = { discountAmount: jc.estimate.discountAmount, vat: vatSettingFor(jc.estimate, org), depositFraction: depositFractionFor(org, String(jc.customer.customerType)) };
  const pdf = await renderToBuffer(
    EstimatePdf(jobEstimatePdfProps({
      letterhead: letterhead(org, jc.branch, portalBaseUrl()),
      bank: await bankDetailsFor(jc.branch.id),
      jobNumber: jc.jobNumber,
      customer: jc.customer,
      vehicle: jc.vehicle,
      lineItems: jc.estimate.lineItems,
      billing,
    })),
  );
  return { pdf, fileName: documentPdfFileName('ESTIMATE', jc.jobNumber), number: jc.jobNumber };
}

/** The invoice PDF, as attached to the invoice email (lib/invoices invoicePdfBuffer). */
export async function invoicePdfFor(invoiceId: string, organisationId?: string): Promise<DocumentPdf | null> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { ...INVOICE_DOCUMENT_SELECT, organisationId: true } });
  if (!inv || (organisationId && inv.organisationId !== organisationId)) return null;
  return { pdf: await invoicePdfBuffer(inv), fileName: documentPdfFileName('INVOICE', inv.invoiceNumber), number: inv.invoiceNumber };
}

/**
 * One payment's receipt PDF: what was paid and how, who received it, and
 * the balance after it — payments up to and including it, less refunds by
 * then, against the Job Card's total (the printed receipt's reading).
 */
export async function receiptPdfFor(paymentId: string, organisationId?: string): Promise<DocumentPdf | null> {
  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      receiptNumber: true, amount: true, method: true, notes: true, recordedAt: true,
      recordedBy: { select: { fullName: true } },
      jobCard: {
        select: {
          jobNumber: true,
          branch: { select: { name: true, address: true, hotlines: true, email: true, businessUnit: { select: { organisationId: true, organisation: { select: { name: true, legalName: true, hqAddress: true, poBox: true, rcNumber: true, hotlines: true, website: true, email: true, ...BILLING_SETTINGS_SELECT } } } } } },
          estimate: { select: ESTIMATE_TOTALS_SELECT },
          customer: { select: { fullName: true, customerType: true, customerCompany: { select: { companyName: true } } } },
          vehicle: { select: { make: true, model: true, plateNumber: true } },
          payments: { select: { amount: true, recordedAt: true } },
          refunds: { select: { amount: true, recordedAt: true } },
        },
      },
    },
  });
  if (!p?.jobCard || !p.receiptNumber) return null;
  const jc = p.jobCard;
  if (organisationId && jc.branch.businessUnit.organisationId !== organisationId) return null;
  const at = new Date(p.recordedAt).getTime();
  const paidBy = jc.payments.filter((x) => new Date(x.recordedAt).getTime() <= at).reduce((s, x) => s + Number(x.amount), 0);
  const refundedBy = jc.refunds.filter((r) => new Date(r.recordedAt).getTime() <= at).reduce((s, r) => s + Number(r.amount), 0);
  const total = jobCardTotals(jc.estimate, billingOf(jc)).total;
  const paidToDate = Math.round((paidBy - refundedBy) * 100) / 100;
  const customerName = jc.customer.customerType === 'ORGANIZATION' && jc.customer.customerCompany?.companyName ? jc.customer.customerCompany.companyName : jc.customer.fullName;
  const pdf = await renderToBuffer(
    ReceiptPdf(receiptPdfProps({
      letterhead: letterhead(jc.branch.businessUnit.organisation, jc.branch, portalBaseUrl()),
      receiptNumber: p.receiptNumber,
      receivedOnLabel: formatDateTime(new Date(p.recordedAt)),
      customerName,
      jobNumber: jc.jobNumber,
      vehicle: jc.vehicle,
      amount: p.amount,
      method: String(p.method),
      reference: p.notes,
      receivedByName: p.recordedBy.fullName,
      total,
      paidToDate,
    })),
  );
  return { pdf, fileName: documentPdfFileName('RECEIPT', p.receiptNumber), number: p.receiptNumber };
}

/** The PDF a document link opens, inside the link's organisation only. */
export function documentPdf(kind: DocumentKind, recordId: string, organisationId: string): Promise<DocumentPdf | null> {
  if (kind === 'ESTIMATE') return estimatePdfFor(recordId, organisationId);
  if (kind === 'INVOICE') return invoicePdfFor(recordId, organisationId);
  return receiptPdfFor(recordId, organisationId);
}
