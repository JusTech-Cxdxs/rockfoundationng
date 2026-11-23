/**
 * What goes into each customer document, worked out in one place (pure): the
 * estimate a customer is sent for a Job Card, and the inspection report. The email to the customer and the bulk copies for the
 * records (A4c2) are built from these, so a copy made later is the document
 * the customer was sent — the same lines, figures, deposit and bank details.
 *
 * The customer sees three figures: Parts & Services, Labour and Sundry —
 * never the internal line types. Lines the workshop covers (under its own
 * warranty, goodwill or internal) are never charged, and say so.
 */
import { PAYMENT_METHOD_LABEL } from '../money/rules';
import { partWarrantyText } from '../money/warranty';
import { BILL_TO_LABEL, balanceDue, billingTotals, coveredLabel, depositOf, depositPercentOf, isCustomerLine, type BillTo, type VatSetting } from '../estimate-billing';
import { pluralizeWord } from '../utils/pluralize';
import type { EstimatePdfProps, InspectionPdfProps, InvoicePdfProps, ReceiptPdfProps } from './document-types';

export type Letterhead = Pick<EstimatePdfProps, 'organisation' | 'branch' | 'logoUrl'>;
export type Bank = { bankName: string; accountName: string; accountNumber: string };

type Org = EstimatePdfProps['organisation'];
type Branch = EstimatePdfProps['branch'];
/** The letterhead from the organisation's and branch's own records, field by field (nothing else of theirs reaches a document). */
export function letterhead(org: Org, branch: Branch, portalUrl: string): Letterhead {
  return {
    organisation: { name: org.name, legalName: org.legalName, hqAddress: org.hqAddress, poBox: org.poBox, rcNumber: org.rcNumber, hotlines: org.hotlines, website: org.website, email: org.email },
    branch: { name: branch.name, address: branch.address, hotlines: branch.hotlines, email: branch.email },
    logoUrl: `${portalUrl.replace(/\/$/, '')}/brand/logo.png`,
  };
}

/** PDFs embed Noto Sans (lib/pdf/fonts.ts), which has the ₦, so money reads as it does on screen. */
export const nairaForPdf = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** The deposit on a total at the fraction the one rule gave (depositFractionFor); 0 = none. */
export const minimumDepositOf = (total: number, depositFraction = 0) => depositOf(total, depositFraction);

type Vehicle = { make: string | null; model: string | null; year?: number | null; plateNumber: string | null; chassisNumber: string | null };
type Customer = { fullName: string; address: string | null };

const JOB_SERVICES = new Set(['STORE_PART', 'EXTERNAL_PART', 'EXTERNAL_JOB', 'INTERNAL_JOB']);
export type JobEstimateLine = { type: string; description: string; quantity: unknown; amount: unknown; unitOfMeasure: string | null; billTo?: string | null; discountAmount?: unknown };

/**
 * The estimate-level money a Job Card total needs beside its lines: its
 * discount, the organisation's VAT, and the deposit share for this customer
 * (depositFractionFor; 0 or left out = no deposit).
 */
export type JobEstimateBilling = { discountAmount?: unknown; vat?: VatSetting | null; depositFraction?: number };

/**
 * A Job Card estimate's customer figures: only lines the customer pays
 * count. The three plain figures are the lines' own amounts; the discounts,
 * VAT and total come from the one shared calculation (@ejo/utils/billing).
 */
export function jobEstimateTotals(lines: { type: string; amount: unknown; billTo?: string | null; discountAmount?: unknown }[], billing: JobEstimateBilling = {}) {
  let services = 0, labour = 0, sundry = 0;
  for (const li of lines) {
    if (!isCustomerLine(li)) continue;
    const amount = Number(li.amount ?? 0);
    if (li.type === 'LABOUR') labour += amount;
    else if (li.type === 'SUNDRY') sundry += amount;
    else if (JOB_SERVICES.has(li.type)) services += amount;
  }
  const t = billingTotals({ lines, discountAmount: billing.discountAmount, vat: billing.vat });
  return {
    services: Math.round(services * 100) / 100, labour: Math.round(labour * 100) / 100, sundry: Math.round(sundry * 100) / 100,
    discounts: Math.round((t.lineDiscounts + t.discountAmount) * 100) / 100, vatRate: t.vatRate, vatAmount: t.vatAmount,
    total: t.total, minimumDeposit: minimumDepositOf(t.total, billing.depositFraction ?? 0), depositPercent: depositPercentOf(billing.depositFraction ?? 0),
  };
}

/** "VAT (7.5%)" */
export const vatLabel = (rate: number) => `VAT (${Number(rate.toFixed(2))}%)`;

export function jobEstimatePdfProps(p: { letterhead: Letterhead; bank: Bank; jobNumber: string; customer: Customer; vehicle: Vehicle; lineItems: JobEstimateLine[]; billing?: JobEstimateBilling }): EstimatePdfProps {
  const t = jobEstimateTotals(p.lineItems, p.billing);
  const vehicleDescription = [p.vehicle.make, p.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
  return {
    ...p.letterhead,
    jobNumber: p.jobNumber,
    customerName: p.customer.fullName,
    customerAddress: p.customer.address,
    vehicleDescription,
    plateNumber: p.vehicle.plateNumber,
    chassisNumber: p.vehicle.chassisNumber,
    lineItems: p.lineItems.map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      unitLabel: li.unitOfMeasure ? pluralizeWord(Number(li.quantity), li.unitOfMeasure) : null,
      amount: isCustomerLine(li) ? nairaForPdf(Number(li.amount ?? 0)) : coveredLabel(li.billTo),
    })),
    servicesSubtotal: t.services > 0 ? nairaForPdf(t.services) : null,
    labourSubtotal: t.labour > 0 ? nairaForPdf(t.labour) : null,
    sundrySubtotal: t.sundry > 0 ? nairaForPdf(t.sundry) : null,
    discountAmount: t.discounts > 0 ? `−${nairaForPdf(t.discounts)}` : null,
    vatLabel: t.vatRate > 0 ? vatLabel(t.vatRate) : null,
    vatAmount: t.vatRate > 0 ? nairaForPdf(t.vatAmount) : null,
    totalAmount: nairaForPdf(t.total),
    // No deposit box when none applies (deposit switched off, or an organisation customer).
    minimumDepositAmount: t.minimumDeposit > 0 ? nairaForPdf(t.minimumDeposit) : null,
    depositPercent: t.minimumDeposit > 0 ? t.depositPercent : null,
    ...p.bank,
    // Payment reference: number, vehicle, plate.
    paymentRemarkSuggestion: [p.jobNumber, vehicleDescription, p.vehicle.plateNumber].filter(Boolean).join(' '),
  };
}

/** "2024 Toyota Hilux", or the make and model without a year. */
const vehicleWithYear = (v: Vehicle) => [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';

export type InspectionItem = { section: string; name: string; condition: string | null; severity: string | null; action: string | null };

/** The customer's inspection report: reviewed items only (the customer copy never lists what was not checked). */
export function inspectionPdfProps(p: { letterhead: Letterhead; jobNumber: string; customerName: string; vehicle: Vehicle; inspectedByName: string; completedOnLabel: string; items: InspectionItem[] }): InspectionPdfProps {
  return {
    ...p.letterhead,
    jobNumber: p.jobNumber,
    customerName: p.customerName,
    vehicleDescription: vehicleWithYear(p.vehicle),
    plateNumber: p.vehicle.plateNumber,
    chassisNumber: p.vehicle.chassisNumber,
    inspectedByName: p.inspectedByName,
    completedOnLabel: p.completedOnLabel,
    reviewedItems: p.items.filter((i) => i.severity).map((i) => ({ section: i.section, name: i.name, condition: i.condition, severity: i.severity, action: i.action })),
  };
}

/** One line of an invoice as frozen when it was issued (Invoice.lines). */
export type InvoiceLine = { description: string; type: string; quantity: number; unitOfMeasure: string | null; unitPrice: number | null; lineDiscount: number; amount: number; billTo: string; warranty?: string | null };

/** The frozen figures of an issued invoice (the Invoice row). */
export type InvoiceFigures = { subtotal: unknown; lineDiscounts: unknown; discountAmount: unknown; discountReason: string | null; vatRate: unknown; vatAmount: unknown; vatNumber: string | null; total: unknown };

const money = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

/** The lines as an invoice keeps them: what each cost, its discount, and what the customer pays for it. */
export function invoiceLinesFrom(lineItems: { type: string; description: string; quantity: unknown; unitPrice: unknown; amount: unknown; unitOfMeasure: string | null; billTo?: string | null; discountAmount?: unknown; warrantyMonths?: number | null; warrantyKm?: number | null }[]): InvoiceLine[] {
  const t = billingTotals({ lines: lineItems });
  return lineItems.map((li, i) => ({
    description: li.description,
    type: li.type,
    quantity: Number(li.quantity),
    unitOfMeasure: li.unitOfMeasure,
    unitPrice: li.unitPrice === null || li.unitPrice === undefined ? null : money(li.unitPrice),
    lineDiscount: t.lines[i]!.discount,
    amount: t.lines[i]!.amount,
    billTo: (li.billTo ?? 'CUSTOMER') as string,
    // A part's own warranty, in words, frozen with the line (only when it has one).
    ...(partWarrantyText(li.warrantyMonths, li.warrantyKm) ? { warranty: partWarrantyText(li.warrantyMonths, li.warrantyKm) } : {}),
  }));
}

/**
 * The customer's invoice PDF: the letterhead, the customer and vehicle, the
 * frozen lines and figures, what has been paid and what is still due, and
 * how to pay. Pure, like the estimate.
 */
export function invoicePdfProps(p: {
  letterhead: Letterhead;
  bank: Bank;
  invoiceNumber: string;
  issuedOnLabel: string;
  /** "Payment due by …" for an organisation on credit; null = due before collection. */
  dueOnLabel?: string | null;
  jobNumber: string;
  customer: { name: string; contact: string | null; address: string | null };
  vehicle: Vehicle & { mileage: number | null };
  lines: InvoiceLine[];
  figures: InvoiceFigures;
  amountPaid: number;
  /** The workshop's guarantee on the work, as frozen on the invoice. */
  guarantee?: string | null;
}): InvoicePdfProps {
  const total = money(p.figures.total);
  const vatRate = Number(p.figures.vatRate ?? 0);
  const discounts = money(p.figures.lineDiscounts) + money(p.figures.discountAmount);
  const vehicleDescription = [p.vehicle.make, p.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
  const balance = Math.max(0, Math.round((total - p.amountPaid) * 100) / 100);
  return {
    ...p.letterhead,
    invoiceNumber: p.invoiceNumber,
    issuedOnLabel: p.issuedOnLabel,
    dueOnLabel: p.dueOnLabel ?? null,
    jobNumber: p.jobNumber,
    customerName: p.customer.name,
    customerContact: p.customer.contact,
    customerAddress: p.customer.address,
    vehicleDescription,
    plateNumber: p.vehicle.plateNumber,
    mileage: p.vehicle.mileage != null ? `${p.vehicle.mileage.toLocaleString('en-NG')} km` : null,
    lineItems: p.lines.map((l) => ({
      description: l.warranty ? `${l.description} (warranty: ${l.warranty})` : l.description,
      quantity: l.quantity,
      unitLabel: l.unitOfMeasure ? pluralizeWord(l.quantity, l.unitOfMeasure) : null,
      unitPrice: isCustomerLine(l) && l.unitPrice !== null ? nairaForPdf(l.unitPrice) : '',
      discount: isCustomerLine(l) && l.lineDiscount > 0 ? `−${nairaForPdf(l.lineDiscount)}` : '',
      amount: isCustomerLine(l) ? nairaForPdf(Math.round((l.amount - l.lineDiscount) * 100) / 100) : `${BILL_TO_LABEL[l.billTo as BillTo] ?? l.billTo} — not charged`,
    })),
    subtotalAmount: nairaForPdf(money(p.figures.subtotal) + money(p.figures.lineDiscounts)),
    discountAmount: discounts > 0 ? `−${nairaForPdf(Math.round(discounts * 100) / 100)}` : null,
    discountReason: money(p.figures.discountAmount) > 0 ? p.figures.discountReason : null,
    vatLabel: vatRate > 0 ? vatLabel(vatRate) : null,
    vatAmount: vatRate > 0 ? nairaForPdf(money(p.figures.vatAmount)) : null,
    vatNumber: vatRate > 0 ? p.figures.vatNumber : null,
    totalAmount: nairaForPdf(total),
    amountPaid: nairaForPdf(Math.round(p.amountPaid * 100) / 100),
    balanceDue: nairaForPdf(balance),
    ...p.bank,
    paymentRemarkSuggestion: [p.invoiceNumber, p.jobNumber, p.vehicle.plateNumber].filter(Boolean).join(' '),
    closing: `Thank you for choosing ${p.letterhead.organisation.name}.`,
    guarantee: p.guarantee ? `Workshop guarantee on this work: ${p.guarantee}. Bring the vehicle back to us if anything we did is not right.` : null,
  };
}

/**
 * The customer's receipt for one Job Card payment (the RCT-number), as the
 * printed receipt shows it: what was paid, how, who received it, and what is
 * still due after it — payments up to and including this one, less refunds
 * by then, against the Job Card's total. Pure, like the invoice.
 */
export function receiptPdfProps(p: {
  letterhead: Letterhead;
  receiptNumber: string;
  receivedOnLabel: string;
  customerName: string;
  jobNumber: string;
  vehicle: { make: string | null; model: string | null; plateNumber: string | null };
  amount: unknown;
  method: string;
  reference: string | null;
  receivedByName: string;
  total: number;
  /** Payments up to and including this one, less refunds by then. */
  paidToDate: number;
}): ReceiptPdfProps {
  const total = money(p.total);
  const paid = money(p.paidToDate);
  const balance = balanceDue(total, paid);
  return {
    ...p.letterhead,
    receiptNumber: p.receiptNumber,
    receivedOnLabel: p.receivedOnLabel,
    customerName: p.customerName,
    jobNumber: p.jobNumber,
    vehicleDescription: [p.vehicle.make, p.vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
    plateNumber: p.vehicle.plateNumber,
    amountReceived: nairaForPdf(money(p.amount)),
    methodLabel: PAYMENT_METHOD_LABEL[p.method] ?? 'Bank transfer',
    reference: p.reference?.trim() || null,
    receivedByName: p.receivedByName,
    totalAmount: nairaForPdf(total),
    paidToDate: nairaForPdf(paid),
    balanceAfter: nairaForPdf(balance),
    statusLabel: balance > 0 ? 'Part payment' : 'Paid in full',
    closing: `Thank you for choosing ${p.letterhead.organisation.name}.`,
  };
}
