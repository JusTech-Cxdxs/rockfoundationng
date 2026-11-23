import { renderToBuffer } from '@react-pdf/renderer';
import { prisma } from '@ejo/database';
import { EstimatePdf } from '@/lib/pdf/estimate-pdf';
import { InspectionPdf } from '@/lib/pdf/inspection-pdf';
import { ReceiptPdf } from '@/lib/pdf/receipt-pdf';
import { InvoicePdf } from '@/lib/pdf/invoice-pdf';
import { counterSalePdfProps, inspectionPdfProps, jobEstimatePdfProps, letterhead, receiptPdfProps } from '@/lib/pdf/document-props';
import { BILLING_SETTINGS_SELECT, ESTIMATE_TOTALS_SELECT, billingOf, depositFractionFor, jobCardTotals, vatSettingFor } from '@/lib/estimate-billing';
import { INVOICE_DOCUMENT_SELECT, invoicePdfBuffer } from '@/lib/invoices';
import { bankDetailsFor } from '@/lib/workshop-core';
import { portalBaseUrl } from '@/lib/portal-url';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';
import { documentPdfFileName, type DocumentKind } from '@/lib/document-links-core';

/**
 * The customer documents as PDFs (server only, not a server action: no
 * sign-in check here — the callers check). Each is drawn from the live
 * record by the same builders as the copy emailed to the customer
 * (lib/pdf/document-props), so the PDF a WhatsApp link opens is the
 * document the email carries:
 *
 *   ESTIMATE  the Job Card's Owner-approved estimate (the email to the
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
      lineItems: { orderBy: { createdAt: 'asc' as const }, select: { type: true, description: true, quantity: true, amount: true, unitOfMeasure: true, billTo: true, discountAmount: true } },
    },
  },
} as const;

/**
 * The Job Card's estimate PDF, as attached to the "estimate ready" email:
 * the letterhead, the three customer figures, any discount and VAT, the
 * deposit for this customer and the branch's bank details. Only once the
 * Owner has approved it.
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

/**
 * The customer's vehicle inspection report: the items the technician
 * reviewed at check-in (never the ones not checked), on the letterhead. Only
 * once the inspection is completed.
 */
export async function inspectionPdfFor(jobCardId: string, organisationId?: string): Promise<DocumentPdf | null> {
  const jc = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      jobNumber: true,
      customer: { select: { fullName: true } },
      vehicle: { select: { make: true, model: true, year: true, plateNumber: true, chassisNumber: true } },
      branch: { select: ESTIMATE_PDF_SELECT.branch.select },
      inspection: { select: { status: true, completedAt: true, inspectedBy: { select: { fullName: true } }, items: { select: { section: true, name: true, condition: true, severity: true, action: true } } } },
    },
  });
  if (!jc?.inspection || jc.inspection.status !== 'COMPLETED') return null;
  const org = jc.branch.businessUnit.organisation;
  if (organisationId && jc.branch.businessUnit.organisationId !== organisationId) return null;
  const pdf = await renderToBuffer(
    InspectionPdf(inspectionPdfProps({
      letterhead: letterhead(org, jc.branch, portalBaseUrl()),
      jobNumber: jc.jobNumber,
      customerName: jc.customer.fullName,
      vehicle: jc.vehicle,
      inspectedByName: jc.inspection.inspectedBy.fullName,
      completedOnLabel: jc.inspection.completedAt ? formatDateTime(jc.inspection.completedAt) : '',
      items: jc.inspection.items,
    })),
  );
  return { pdf, fileName: `Inspection-${jc.jobNumber}.pdf`, number: jc.jobNumber };
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

/** A counter sale's receipt PDF (CS-number): the lines, VAT and total as frozen at the sale, paid in full. */
export async function counterSalePdfFor(saleId: string, organisationId?: string): Promise<DocumentPdf | null> {
  const s = await prisma.counterSale.findUnique({
    where: { id: saleId },
    select: {
      number: true, organisationId: true, soldAt: true, buyerName: true, buyerPhone: true, subtotal: true, vatRate: true, vatAmount: true, vatNumber: true, total: true, paymentMethod: true, paymentReference: true,
      soldBy: { select: { fullName: true } },
      customer: { select: { address: true, email: true } },
      lines: { orderBy: { id: 'asc' }, select: { description: true, partNumber: true, quantity: true, unitOfMeasure: true, unitPrice: true, amount: true, serialNumbers: true } },
      branch: {
        select: {
          id: true, name: true, address: true, hotlines: true, email: true,
          businessUnit: { select: { organisation: { select: { name: true, legalName: true, hqAddress: true, poBox: true, rcNumber: true, hotlines: true, website: true, email: true } } } },
        },
      },
    },
  });
  if (!s || (organisationId && s.organisationId !== organisationId)) return null;
  const method = s.paymentMethod === 'CASH' ? 'Cash' : 'Bank transfer';
  const pdf = await renderToBuffer(InvoicePdf(counterSalePdfProps({
    letterhead: letterhead(s.branch.businessUnit.organisation, s.branch, portalBaseUrl()),
    bank: await bankDetailsFor(s.branch.id),
    number: s.number,
    soldOnLabel: formatDateOnly(s.soldAt),
    buyer: { name: s.buyerName, contact: [s.buyerPhone, s.customer?.email].filter(Boolean).join(' · ') || null, address: s.customer?.address ?? null },
    lines: s.lines.map((l) => ({
      description: [l.partNumber ? `${l.description} (${l.partNumber})` : l.description, l.serialNumbers.length ? `Serial ${l.serialNumbers.join(', ')}` : null].filter(Boolean).join(' · '),
      quantity: Number(l.quantity), unitOfMeasure: l.unitOfMeasure, unitPrice: Number(l.unitPrice), amount: Number(l.amount),
    })),
    figures: s,
    paidBy: [method, s.paymentReference].filter(Boolean).join(' · '),
    soldBy: s.soldBy.fullName,
  })));
  return { pdf, fileName: `Sales-receipt-${s.number}.pdf`, number: s.number };
}
