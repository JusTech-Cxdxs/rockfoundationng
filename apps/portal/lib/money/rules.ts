/**
 * Money rules for Phase 5, pure (no database), so each is tested on its own:
 * who gives an estimate its final approval, credit notes, POS payments, and
 * the customer statement with its ageing.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

// ─────────────────────────────────────────────── the Owner's approval

export type OwnerApprovalSetting = { ownerApprovesEstimates?: boolean | null; ownerApprovalAbove?: unknown };

export type OwnerApprovalReason = 'SETTING' | 'ABOVE_AMOUNT' | 'DISCOUNT' | 'NOT_CHARGED' | 'COMEBACK';

export const OWNER_APPROVAL_REASON: Record<OwnerApprovalReason, string> = {
  SETTING: 'the Owner approves every estimate (Settings → Billing)',
  ABOVE_AMOUNT: 'the estimate is above the amount the Owner approves',
  DISCOUNT: 'it carries a discount above the limit',
  NOT_CHARGED: 'it has lines the business pays for (warranty, goodwill or internal)',
  COMEBACK: 'it is a comeback on earlier work',
};

/**
 * Why the Owner must give an estimate its final approval, or [] when the
 * supervisor's check is enough. The Owner always decides when the setting is
 * on, when the total (VAT included) is above the amount set, when a discount
 * is above the limit and not yet approved, when any line is not charged to
 * the customer, and on a comeback.
 */
export function ownerMustApprove(input: {
  setting: OwnerApprovalSetting | null | undefined;
  total: number;
  discountNeedsOwner: boolean;
  lines: readonly { billTo?: string | null }[];
  comeback?: boolean;
}): OwnerApprovalReason[] {
  const out: OwnerApprovalReason[] = [];
  const s = input.setting ?? {};
  if (s.ownerApprovesEstimates) out.push('SETTING');
  const above = s.ownerApprovalAbove === null || s.ownerApprovalAbove === undefined || s.ownerApprovalAbove === '' ? null : Number(s.ownerApprovalAbove);
  if (above !== null && Number.isFinite(above) && above >= 0 && input.total > above) out.push('ABOVE_AMOUNT');
  if (input.discountNeedsOwner) out.push('DISCOUNT');
  if (input.lines.some((l) => l.billTo && l.billTo !== 'CUSTOMER')) out.push('NOT_CHARGED');
  if (input.comeback) out.push('COMEBACK');
  return out;
}

/** "the Owner approves every estimate, and it carries a discount above the limit" */
export function ownerApprovalWhy(reasons: readonly OwnerApprovalReason[]): string {
  const words = reasons.map((r) => OWNER_APPROVAL_REASON[r]);
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The "Owner approves above" amount from a form: blank = no amount; otherwise a whole naira amount ≥ 0. */
export function parseOwnerApprovalAbove(raw: unknown): number | null | 'invalid' {
  const t = String(raw ?? '').replace(/[₦,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? Math.round(n) : 'invalid';
}

// ─────────────────────────────────────────────── credit notes

/**
 * What can still be credited on an invoice: its total less the credit notes
 * already approved or waiting (a pending one holds its amount, so two people
 * cannot credit the same money twice).
 */
export function creditable(invoiceTotal: number, notes: readonly { amount: unknown; status: string }[]): number {
  const held = notes.filter((n) => n.status === 'APPROVED' || n.status === 'PENDING').reduce((s, n) => s + Number(n.amount ?? 0), 0);
  return r2(Math.max(0, invoiceTotal - held));
}

/** The VAT inside a VAT-inclusive amount at the invoice's rate (7.5 → 7.5%). */
export function vatInside(amount: number, ratePercent: number): number {
  if (!(ratePercent > 0)) return 0;
  return r2((amount * ratePercent) / (100 + ratePercent));
}

/** A credit note's amount from the form: ₦, more than 0, not more than what can be credited. */
export function checkCreditAmount(raw: unknown, available: number): number | string {
  const n = Number(String(raw ?? '').replace(/[₦,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return 'Enter the amount to credit, in naira.';
  const amount = r2(n);
  if (amount > available + 0.004) return available > 0 ? `At most ${naira(available)} can be credited on this invoice.` : 'Nothing is left to credit on this invoice.';
  return amount;
}

/** The sum of the approved credit notes on a Job Card (they lower what the customer owes). */
export function credited(notes: readonly { amount: unknown; status?: string | null }[]): number {
  return r2(notes.filter((n) => !n.status || n.status === 'APPROVED').reduce((s, n) => s + Number(n.amount ?? 0), 0));
}

// ─────────────────────────────────────────────── POS

/** A POS payment needs the terminal's transaction reference: 4 to 40 letters, digits or dashes. */
export function checkPosReference(method: string, raw: unknown): string | null | { error: string } {
  const ref = String(raw ?? '').trim().replace(/\s+/g, '').toUpperCase();
  if (method !== 'POS') return null;
  if (!/^[A-Z0-9-]{4,40}$/.test(ref)) return { error: 'Enter the POS transaction reference (the RRN or STAN on the terminal slip).' };
  return ref;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = { CASH: 'Cash', BANK_TRANSFER: 'Bank Transfer', POS: 'POS (card)' };

// ─────────────────────────────────────────────── statements and ageing

export type AgeingBucket = 'CURRENT' | 'D31_60' | 'D61_90' | 'D90_PLUS';
export const AGEING_LABEL: Record<AgeingBucket, string> = { CURRENT: '0–30 days', D31_60: '31–60 days', D61_90: '61–90 days', D90_PLUS: 'Over 90 days' };
export const AGEING_ORDER: AgeingBucket[] = ['CURRENT', 'D31_60', 'D61_90', 'D90_PLUS'];

const DAY = 86_400_000;
/** Whole days from the invoice date to `now`, counted in Lagos days. */
export function daysOutstanding(issuedAt: Date, now: Date): number {
  const day = (d: Date) => Math.floor((+d + 3_600_000) / DAY); // Lagos is UTC+1, no daylight saving
  return Math.max(0, day(now) - day(issuedAt));
}

export function ageingBucket(days: number): AgeingBucket {
  if (days <= 30) return 'CURRENT';
  if (days <= 60) return 'D31_60';
  if (days <= 90) return 'D61_90';
  return 'D90_PLUS';
}

export type StatementInvoice = { invoiceNumber: string; jobNumber: string; issuedAt: Date; dueDate: Date | null; total: number; paid: number; credited: number };
export type StatementRow = StatementInvoice & { balance: number; days: number; bucket: AgeingBucket; overdue: boolean };

/**
 * A customer's statement: every invoice with a balance, oldest first, with
 * its age (from the invoice date) and the totals per ageing bucket. Paid and
 * credited money never makes a balance negative.
 */
export function buildStatement(invoices: readonly StatementInvoice[], now: Date): { rows: StatementRow[]; totals: Record<AgeingBucket, number>; owed: number; overdue: number } {
  const rows: StatementRow[] = [];
  const totals: Record<AgeingBucket, number> = { CURRENT: 0, D31_60: 0, D61_90: 0, D90_PLUS: 0 };
  for (const inv of [...invoices].sort((a, b) => +a.issuedAt - +b.issuedAt)) {
    const balance = r2(Math.max(0, inv.total - inv.paid - inv.credited));
    if (balance <= 0.004) continue;
    const days = daysOutstanding(inv.issuedAt, now);
    const bucket = ageingBucket(days);
    totals[bucket] = r2(totals[bucket] + balance);
    rows.push({ ...inv, balance, days, bucket, overdue: inv.dueDate ? +inv.dueDate < +now : false });
  }
  const owed = r2(rows.reduce((s, r) => s + r.balance, 0));
  const overdue = r2(rows.filter((r) => r.overdue).reduce((s, r) => s + r.balance, 0));
  return { rows, totals, owed, overdue };
}

/** ₦12,500.00 */
export function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
