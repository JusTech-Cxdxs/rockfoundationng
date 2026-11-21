/**
 * Who pays for each Job Card estimate line: one rule for every total the
 * customer is asked to pay (payment status, deposits, recording payments,
 * close requests, reminders, emails, the Job Card page and print). A line
 * with no bill-to (older data) is the customer's.
 */
import { billingTotals, depositFractionFor, depositOf, vatSettingFor, type BillingLine, type BillingTotals, type DepositSetting, type VatSetting } from '@ejo/utils/billing';

export { vatIsFixed, vatSettingFor, billingTotals, balanceDue, depositOf, depositFractionFor, depositPercentOf, paymentApproves, workMayStart, discountNeedsManager, discountPercent, paidInFull, toKobo, type BillingTotals, type DepositSetting, type VatSetting } from '@ejo/utils/billing';

/**
 * Who pays for a line: the customer, or the workshop itself — under the
 * workshop's own warranty (its guarantee on earlier work or parts), as
 * goodwill, or as an internal cost.
 */
export type BillTo = 'CUSTOMER' | 'WARRANTY' | 'GOODWILL' | 'INTERNAL';

export const BILL_TO_LABEL: Record<BillTo, string> = {
  CUSTOMER: 'Customer',
  WARRANTY: 'Under warranty',
  GOODWILL: 'Goodwill',
  INTERNAL: 'Internal',
};

export function isCustomerLine(li: { billTo?: string | null }): boolean {
  return !li.billTo || li.billTo === 'CUSTOMER';
}

const amt = (li: { amount: unknown }) => (li.amount === null || li.amount === undefined ? 0 : Number(li.amount));

/** Customer lines after their own discounts (before the estimate's discount and VAT). */
export function customerTotal(lines: { amount: unknown; billTo?: string | null; discountAmount?: unknown }[]): number {
  return billingTotals({ lines }).subtotal;
}

/** The organisation's billing switches, selected wherever a total is worked out. */
export const BILLING_SETTINGS_SELECT = { vatEnabled: true, vatRate: true, vatNumber: true, discountApprovalPercent: true, depositRequired: true, depositPercent: true } as const;
/** The same, reached from a Job Card (its branch's organisation). */
export const JOB_CARD_BILLING_SELECT = { branch: { select: { businessUnit: { select: { organisation: { select: BILLING_SETTINGS_SELECT } } } } } } as const;
/** The estimate fields every total needs. */
export const ESTIMATE_TOTALS_SELECT = { discountAmount: true, vatRate: true, lineItems: { select: { amount: true, billTo: true, discountAmount: true } } } as const;

export type BillingSettings = VatSetting & DepositSetting & { vatNumber?: string | null; discountApprovalPercent?: number | null };
type EstimateForTotals = { discountAmount?: unknown; vatRate?: unknown; lineItems: readonly BillingLine[] } | null | undefined;

/** The organisation's settings from a Job Card selected with JOB_CARD_BILLING_SELECT. */
export function billingOf(jc: { branch: { businessUnit: { organisation: BillingSettings } } }): BillingSettings {
  return jc.branch.businessUnit.organisation;
}

/**
 * What the customer owes on a Job Card: its estimate through the one shared
 * calculation (@ejo/utils/billing), with the VAT rate fixed on it at the
 * Manager's approval, else the organisation's current setting. No estimate
 * yet: nothing.
 */
export function jobCardTotals(estimate: EstimateForTotals, settings: VatSetting | null | undefined): BillingTotals {
  return billingTotals({ lines: estimate?.lineItems ?? [], discountAmount: estimate?.discountAmount, vat: vatSettingFor(estimate, settings) });
}

/** The whole estimate split by who pays. */
export function billingSplit(lines: { amount: unknown; billTo?: string | null }[]) {
  const by = (b: BillTo) => Math.round(lines.filter((li) => (li.billTo ?? 'CUSTOMER') === b).reduce((s, li) => s + amt(li), 0) * 100) / 100;
  const customer = customerTotal(lines);
  const warranty = by('WARRANTY');
  const goodwill = by('GOODWILL');
  const internal = by('INTERNAL');
  return { customer, warranty, goodwill, internal, covered: Math.round((warranty + goodwill + internal) * 100) / 100, total: Math.round((customer + warranty + goodwill + internal) * 100) / 100 };
}

/** Text shown in place of a price for a covered line. */
export function coveredLabel(billTo: string | null | undefined): string {
  if (billTo === 'WARRANTY') return 'Under warranty — not charged';
  if (billTo === 'GOODWILL') return 'Goodwill — not charged';
  if (billTo === 'INTERNAL') return 'Internal — not charged';
  return '';
}

/**
 * The deposit due before work starts on this total, for this customer: the
 * one rule (depositFractionFor) — 0 when the organisation has the deposit
 * switched off and always 0 for an organisation customer.
 */
export function depositDueOn(total: number, settings: DepositSetting | null | undefined, customerType: string | null | undefined): { fraction: number; amount: number } {
  const fraction = depositFractionFor(settings, customerType);
  return { fraction, amount: depositOf(total, fraction) };
}
