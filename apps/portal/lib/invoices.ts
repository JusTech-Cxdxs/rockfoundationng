import { renderToBuffer } from '@react-pdf/renderer';
import { prisma, type Prisma } from '@ejo/database';
import { lockExisting } from '@/lib/integrity';
import { isUniqueClashOn, retryOnNumberClash } from '@/lib/integrity-core';
import { highestSequence } from '@/lib/recycle-bin/numbers';
import { lagosYear } from '@/lib/utils/format-date';
import { BILLING_SETTINGS_SELECT, jobCardTotals } from '@/lib/estimate-billing';
import { invoiceDueDate, isOnCredit } from '@/lib/credit-core';
import { invoiceLinesFrom, invoicePdfProps, letterhead, nairaForPdf, type InvoiceLine } from '@/lib/pdf/document-props';
import { InvoicePdf } from '@/lib/pdf/invoice-pdf';
import { bankDetailsFor, writeAuditLog } from '@/lib/workshop-core';
import { sendEmail } from '@/lib/email';
import { renderCustomerInvoiceEmail } from '@/lib/email-templates/customer-invoice';
import { portalBaseUrl, websiteBaseUrl } from '@/lib/portal-url';
import { customerLinks } from '@/lib/customer-links-core';
import { logFailure } from '@/lib/log';

/**
 * Invoices (server only, not a server action: the guarded actions are in
 * lib/actions/invoices.ts). One invoice per Job Card, issued when the work
 * is completed. Its figures and lines are frozen at issue, so a reprint is
 * always the document the customer was given.
 */

/** A Job Card whose work is finished can carry an invoice. */
export const INVOICEABLE_STATUSES = ['COMPLETED', 'READY_FOR_COLLECTION', 'CHECKED_OUT', 'CLOSED'] as const;

/** INV-2026-000001 */
async function nextInvoiceNumber(db: Pick<typeof prisma, 'invoice'>): Promise<string> {
  const prefix = `INV-${lagosYear()}-`;
  const latest = await db.invoice.findFirst({ where: { invoiceNumber: { startsWith: prefix } }, orderBy: { invoiceNumber: 'desc' }, select: { invoiceNumber: true } });
  return `${prefix}${String(highestSequence(prefix, [latest?.invoiceNumber]) + 1).padStart(6, '0')}`;
}

/** "21 November 2026", in Lagos. */
export const invoiceDate = (d: Date) => d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });

const net = (rows: { amount: unknown }[]) => rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

/**
 * The Job Card's invoice: the one already issued, or a new one now. Called
 * when the Job Card moves to COMPLETED and by "Issue invoice" (older Job
 * Cards). Idempotent: a second call, or two at the same instant, hand back
 * the same invoice (`created: false`). Null when there is nothing to invoice
 * yet (no Owner-approved estimate, or the work is not finished).
 */
export async function ensureInvoice(jobCardId: string, issuedById: string): Promise<{ invoice: { id: string; invoiceNumber: string }; created: boolean } | null> {
  const existing = await prisma.invoice.findUnique({ where: { jobCardId }, select: { id: true, invoiceNumber: true } });
  if (existing) return { invoice: existing, created: false };
  try {
    const made = await retryOnNumberClash('invoiceNumber', () => prisma.$transaction(async (tx) => {
      // Under the Job Card's lock, like a payment: the figures are read and frozen in one step.
      await lockExisting(tx, 'jobCard', [jobCardId], 'This Job Card no longer exists — refresh the page.');
      const already = await tx.invoice.findUnique({ where: { jobCardId }, select: { id: true, invoiceNumber: true } });
      if (already) return { invoice: already, created: false };
      const jc = await tx.jobCard.findUnique({
        where: { id: jobCardId },
        select: {
          status: true, branchId: true, customerId: true,
          customer: { select: { customerType: true, customerCompany: { select: { paymentTermsDays: true, creditApprovedAt: true } } } },
          branch: { select: { businessUnit: { select: { organisationId: true, organisation: { select: BILLING_SETTINGS_SELECT } } } } },
          payments: { select: { amount: true } },
          refunds: { select: { amount: true } },
          estimate: {
            select: {
              status: true, discountAmount: true, discountReason: true, vatRate: true,
              lineItems: { orderBy: { createdAt: 'asc' }, select: { type: true, description: true, quantity: true, unitPrice: true, amount: true, unitOfMeasure: true, billTo: true, discountAmount: true } },
            },
          },
        },
      });
      if (!jc || !(INVOICEABLE_STATUSES as readonly string[]).includes(jc.status) || jc.estimate?.status !== 'MANAGER_APPROVED') return null;
      const settings = jc.branch.businessUnit.organisation;
      const t = jobCardTotals(jc.estimate, settings);
      // An organisation on credit pays by the due date (its payment terms); otherwise before collection.
      const issuedAt = new Date();
      const company = jc.customer.customerCompany;
      const dueDate = isOnCredit(String(jc.customer.customerType), company) ? invoiceDueDate(issuedAt, company!.paymentTermsDays!) : null;
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: await nextInvoiceNumber(tx),
          organisationId: jc.branch.businessUnit.organisationId,
          branchId: jc.branchId,
          jobCardId,
          customerId: jc.customerId,
          subtotal: t.subtotal,
          lineDiscounts: t.lineDiscounts,
          discountAmount: t.discountAmount,
          discountReason: t.discountAmount > 0 ? jc.estimate.discountReason : null,
          vatRate: t.vatRate,
          vatAmount: t.vatAmount,
          vatNumber: t.vatRate > 0 ? settings.vatNumber : null,
          total: t.total,
          amountPaidAtIssue: Math.max(0, Math.round((net(jc.payments) - net(jc.refunds)) * 100) / 100),
          lines: invoiceLinesFrom(jc.estimate.lineItems) as unknown as Prisma.InputJsonValue,
          issuedAt,
          dueDate,
          issuedById,
        },
        select: { id: true, invoiceNumber: true },
      });
      return { invoice, created: true };
    }));
    if (made?.created) {
      await writeAuditLog({ userId: issuedById, action: 'invoice.issued', entityType: 'JobCard', entityId: jobCardId, metadata: { invoiceNumber: made.invoice.invoiceNumber, invoiceId: made.invoice.id } });
    }
    return made;
  } catch (err) {
    // Two issues at the same instant: the other one won; hand back its invoice.
    if (isUniqueClashOn(err, 'jobCardId')) {
      const won = await prisma.invoice.findUnique({ where: { jobCardId }, select: { id: true, invoiceNumber: true } });
      if (won) return { invoice: won, created: false };
    }
    throw err;
  }
}

/**
 * A Job Card leaving on credit: its invoice carries the due date. An invoice
 * issued before the customer's credit terms were set gets it now (issued
 * date + the terms); one that already has a date keeps it.
 */
export async function setInvoiceDueDate(invoiceId: string, paymentTermsDays: number): Promise<void> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { issuedAt: true, dueDate: true } });
  if (!inv || inv.dueDate || paymentTermsDays <= 0) return;
  await prisma.invoice.updateMany({ where: { id: invoiceId, dueDate: null }, data: { dueDate: invoiceDueDate(inv.issuedAt, paymentTermsDays) } });
}

/** Everything a printed or PDF invoice shows. */
export const INVOICE_DOCUMENT_SELECT = {
  id: true, invoiceNumber: true, issuedAt: true, dueDate: true, subtotal: true, lineDiscounts: true, discountAmount: true, discountReason: true,
  vatRate: true, vatAmount: true, vatNumber: true, total: true, amountPaidAtIssue: true, lines: true,
  issuedBy: { select: { fullName: true } },
  jobCard: {
    select: {
      id: true, jobNumber: true, branchId: true, mileageAtCheckIn: true,
      payments: { select: { amount: true } },
      refunds: { select: { amount: true } },
      vehicle: { select: { make: true, model: true, year: true, plateNumber: true, chassisNumber: true } },
    },
  },
  customer: { select: { fullName: true, phone: true, email: true, address: true, customerType: true, customerCompany: { select: { companyName: true } } } },
  branch: { select: { id: true, name: true, address: true, hotlines: true, email: true } },
  organisation: { select: { name: true, legalName: true, hqAddress: true, poBox: true, rcNumber: true, hotlines: true, website: true, email: true } },
} satisfies Prisma.InvoiceSelect;

export type InvoiceDocument = Prisma.InvoiceGetPayload<{ select: typeof INVOICE_DOCUMENT_SELECT }>;

/** What the customer has paid towards the invoice now (payments less refunds). */
export const paidTowards = (inv: InvoiceDocument) => Math.max(0, Math.round((net(inv.jobCard.payments) - net(inv.jobCard.refunds)) * 100) / 100);

/** The name an invoice is addressed to: the organisation for a company customer, else the person. */
export function billToName(c: InvoiceDocument['customer']): string {
  return c.customerType === 'ORGANIZATION' && c.customerCompany?.companyName ? c.customerCompany.companyName : c.fullName;
}

/** The invoice's frozen lines, read back. */
export const invoiceLines = (inv: { lines: unknown }) => (Array.isArray(inv.lines) ? (inv.lines as InvoiceLine[]) : []);

export async function invoicePdfBuffer(inv: InvoiceDocument): Promise<Buffer> {
  const c = inv.customer;
  return renderToBuffer(InvoicePdf(invoicePdfProps({
    letterhead: letterhead(inv.organisation, inv.branch, portalBaseUrl()),
    bank: await bankDetailsFor(inv.branch.id),
    invoiceNumber: inv.invoiceNumber,
    issuedOnLabel: invoiceDate(inv.issuedAt),
    dueOnLabel: inv.dueDate ? invoiceDate(inv.dueDate) : null,
    jobNumber: inv.jobCard.jobNumber,
    customer: { name: billToName(c), contact: [c.customerType === 'ORGANIZATION' ? c.fullName : null, c.phone, c.email].filter(Boolean).join(' · ') || null, address: c.address },
    vehicle: { ...inv.jobCard.vehicle, mileage: inv.jobCard.mileageAtCheckIn },
    lines: invoiceLines(inv),
    figures: inv,
    amountPaid: paidTowards(inv),
  })));
}

/**
 * Emails the invoice, with its PDF, to the customer when they have an email
 * address. Never throws: a failure is logged and the invoice stands.
 */
export async function sendInvoiceEmail(invoiceId: string): Promise<boolean> {
  try {
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: INVOICE_DOCUMENT_SELECT });
    if (!inv?.customer.email) return false;
    const websiteUrl = websiteBaseUrl();
    const paid = paidTowards(inv);
    const total = Number(inv.total);
    const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
    const attachments = await invoicePdfBuffer(inv)
      .then((content) => [{ filename: `Invoice-${inv.invoiceNumber}.pdf`, content, contentType: 'application/pdf' }])
      .catch((err) => {
        // A failed PDF never blocks the email.
        logFailure('Failed to make the invoice PDF', inv.invoiceNumber, err);
        return undefined;
      });
    await sendEmail(
      inv.customer.email,
      `Invoice ${inv.invoiceNumber} — Job Card ${inv.jobCard.jobNumber}`,
      renderCustomerInvoiceEmail({
        customerName: inv.customer.fullName,
        invoiceNumber: inv.invoiceNumber,
        jobNumber: inv.jobCard.jobNumber,
        vehicleDescription: [inv.jobCard.vehicle.make, inv.jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
        issuedOn: invoiceDate(inv.issuedAt),
        dueOn: inv.dueDate ? invoiceDate(inv.dueDate) : null,
        totalAmount: nairaForPdf(total),
        amountPaid: nairaForPdf(paid),
        balanceDue: balance > 0 ? nairaForPdf(balance) : null,
        ...(await bankDetailsFor(inv.branch.id)),
        dashboardUrl: customerLinks(websiteUrl).jobCard(inv.jobCard.id),
        logoUrl: `${websiteUrl}/brand/emblem.png`,
        companyName: inv.organisation.name,
        branchName: inv.branch.name,
      }),
      attachments,
    );
    return true;
  } catch (err) {
    logFailure('Failed to send the invoice email', invoiceId, err);
    return false;
  }
}
