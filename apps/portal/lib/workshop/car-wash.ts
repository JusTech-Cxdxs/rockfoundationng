/**
 * The quick car wash, pure. A car wash whose package has a price in Settings
 * is checked in, priced, approved and started in one step by front desk:
 * no supervisor review, no inspection, no estimate to send. The customer
 * asked for it at the desk and the price is the workshop's list price. It is
 * finished, paid and checked out without a close request (a wash is never
 * left on credit unless the customer is an organisation on credit).
 */
import { WASH_PACKAGES, type WashPackage } from './job-types';

export type CarWashPrices = Partial<Record<WashPackage, number>>;

/** Prices as stored (JSON), keeping only known packages with a positive whole-naira price. */
export function carWashPrices(stored: unknown): CarWashPrices {
  const out: CarWashPrices = {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return out;
  for (const p of WASH_PACKAGES) {
    const n = Number((stored as Record<string, unknown>)[p.key]);
    if (Number.isFinite(n) && n > 0 && n <= 10_000_000) out[p.key] = Math.round(n);
  }
  return out;
}

/** The price of a package, or null when none is set (the wash then goes through the normal steps). */
export function carWashPrice(stored: unknown, pkg: string | null | undefined): number | null {
  if (!pkg) return null;
  return carWashPrices(stored)[pkg as WashPackage] ?? null;
}

/** Prices from the Settings form (`wash_EXTERIOR`, …): blank = no price; otherwise whole naira. */
export function parseCarWashPriceForm(get: (name: string) => unknown): CarWashPrices | string {
  const out: CarWashPrices = {};
  for (const p of WASH_PACKAGES) {
    const raw = String(get(`wash_${p.key}`) ?? '').replace(/[₦,\s]/g, '');
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return `Enter the price of “${p.label}” in naira, or leave it blank.`;
    out[p.key] = Math.round(n);
  }
  return out;
}

/** The single line a quick car wash is billed with. */
export function carWashLine(pkg: WashPackage, price: number): { type: 'LABOUR'; description: string; quantity: 1; unitPrice: number; amount: number } {
  const label = WASH_PACKAGES.find((p) => p.key === pkg)?.label ?? 'Car wash';
  return { type: 'LABOUR', description: `Car wash — ${label}`, quantity: 1, unitPrice: price, amount: price };
}

/**
 * The statuses a quick car wash may move to next. A wash goes from in progress
 * straight to completed (the invoice is issued then), and from completed or
 * ready for collection straight to checked out once paid: no quality check,
 * no close request.
 */
export function carWashNextStatuses(current: string): string[] {
  if (current === 'IN_PROGRESS') return ['COMPLETED'];
  if (current === 'COMPLETED') return ['CHECKED_OUT'];
  if (current === 'READY_FOR_COLLECTION') return ['CHECKED_OUT'];
  return [];
}
