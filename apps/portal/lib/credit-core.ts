/**
 * Credit terms for organisation (company / fleet) customers — the pure rules,
 * shared by the Job Card, the customer's page and the tests.
 *
 *  - On credit: the company has payment terms above 0 days, approved by
 *    Accounts or the Owner. Only organisation customers can be.
 *  - A Job Card on credit can leave with a balance once its invoice is
 *    issued, while the organisation's unpaid invoices (this one included)
 *    stay within the credit limit. No limit set: no ceiling.
 *  - The invoice is due on the issue date plus the payment terms.
 */
import { toKobo } from '@ejo/utils/billing';

export type CreditTerms = { creditLimit?: unknown; paymentTermsDays?: number | null; creditApprovedAt?: Date | null } | null | undefined;

export function isOnCredit(customerType: string | null | undefined, terms: CreditTerms): boolean {
  return customerType === 'ORGANIZATION' && Boolean(terms?.creditApprovedAt) && (terms?.paymentTermsDays ?? 0) > 0;
}

/** The limit in naira, or null when there is none. */
export function creditLimitOf(terms: CreditTerms): number | null {
  const v = terms?.creditLimit;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Do the unpaid invoices, this one included, fit within the limit? Compared in whole kobo. */
export function withinCreditLimit(owedIncludingThis: number, limit: number | null): boolean {
  return limit === null || toKobo(owedIncludingThis) <= toKobo(limit);
}

/** Issued date + the payment terms. */
export function invoiceDueDate(issuedAt: Date, paymentTermsDays: number): Date {
  return new Date(issuedAt.getTime() + paymentTermsDays * 86_400_000);
}

/** Unpaid and past its due date. */
export function isOverdue(inv: { dueDate: Date | null; balance: number }, now = new Date()): boolean {
  return Boolean(inv.dueDate) && inv.dueDate!.getTime() < now.getTime() && toKobo(inv.balance) > 0;
}
