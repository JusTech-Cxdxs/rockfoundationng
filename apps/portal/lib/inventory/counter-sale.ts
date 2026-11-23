import { billingTotals, type VatSetting } from '@ejo/utils/billing';

/**
 * Counter sales: parts sold over the counter without a Job Card. The rules
 * here are pure (no database), so the form, the server action and the tests
 * agree: what a line may be, who the buyer is, and the money (the same
 * totals calculation as estimates and invoices, VAT included).
 */

export type CounterSalePart = {
  id: string;
  name: string;
  isActive: boolean;
  trackingType: 'QUANTITY' | 'BATCH' | 'SERIALIZED';
  baseUnitOfMeasure: string;
  sellingPrice: number | null;
  /** On hand less what approved parts requests have reserved. */
  available: number;
};

export type CounterSaleLineInput = { partId: string; quantity: number; serialNumbers?: string[] };

export type CheckedLine = { partId: string; description: string; unitOfMeasure: string; quantity: number; unitPrice: number; amount: number; serialNumbers: string[] };

export const MAX_SALE_LINES = 30;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** One line, checked against the part as it is now. A string is the reason it cannot be sold. */
export function checkSaleLine(part: CounterSalePart | undefined, input: CounterSaleLineInput): CheckedLine | string {
  if (!part || !part.isActive) return 'One of the parts is no longer in the catalogue. Choose it again.';
  const quantity = round4(Number(input.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0) return `Enter how many ${part.baseUnitOfMeasure} of ${part.name} are being sold.`;
  if (part.sellingPrice === null || !(part.sellingPrice > 0)) return `${part.name} has no selling price yet. Set it on the part's page first.`;
  const serialNumbers = (input.serialNumbers ?? []).map((s) => s.trim()).filter(Boolean);
  if (part.trackingType === 'SERIALIZED') {
    if (!Number.isInteger(quantity)) return `${part.name} is sold by the unit: enter a whole number.`;
    if (new Set(serialNumbers).size !== serialNumbers.length) return `${part.name}: the same serial number is entered twice.`;
    if (serialNumbers.length !== quantity) return `${part.name}: enter the serial number of each unit sold (${quantity} needed, ${serialNumbers.length} entered).`;
  }
  if (quantity > part.available + 1e-9) {
    return `Only ${round4(Math.max(0, part.available)).toLocaleString('en-NG')} ${part.baseUnitOfMeasure} of ${part.name} can be sold: the rest is not in stock or is kept for a job.`;
  }
  return {
    partId: part.id,
    description: part.name,
    unitOfMeasure: part.baseUnitOfMeasure,
    quantity,
    unitPrice: round2(part.sellingPrice),
    amount: round2(quantity * part.sellingPrice),
    serialNumbers: part.trackingType === 'SERIALIZED' ? serialNumbers : [],
  };
}

/** Every line checked; the same part twice is one line (the quantities added). */
export function checkSaleLines(parts: Map<string, CounterSalePart>, inputs: CounterSaleLineInput[]): CheckedLine[] | string {
  const merged = new Map<string, CounterSaleLineInput>();
  for (const l of inputs) {
    if (!l.partId) continue;
    const had = merged.get(l.partId);
    merged.set(l.partId, had ? { partId: l.partId, quantity: Number(had.quantity) + Number(l.quantity), serialNumbers: [...(had.serialNumbers ?? []), ...(l.serialNumbers ?? [])] } : l);
  }
  if (merged.size === 0) return 'Add at least one part to the sale.';
  if (merged.size > MAX_SALE_LINES) return `A sale holds up to ${MAX_SALE_LINES} parts. Make a second sale for the rest.`;
  const out: CheckedLine[] = [];
  for (const l of merged.values()) {
    const checked = checkSaleLine(parts.get(l.partId), l);
    if (typeof checked === 'string') return checked;
    out.push(checked);
  }
  return out;
}

export type Buyer = { customerId: string | null; name: string; phone: string | null };

/** A registered customer (their own name on the receipt), or a walk-in buyer with a name. */
export function checkBuyer(input: { customerId?: string | null; customerName?: string | null; buyerName?: string | null; buyerPhone?: string | null }): Buyer | string {
  const phone = String(input.buyerPhone ?? '').replace(/[^\d+ ]/g, '').trim().slice(0, 30) || null;
  if (phone && phone.replace(/\D/g, '').length < 10) return 'That phone number looks too short.';
  if (input.customerId) return { customerId: input.customerId, name: String(input.customerName ?? '').trim() || 'Customer', phone };
  const name = String(input.buyerName ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (name.length < 2) return 'Choose the customer, or write the walk-in buyer’s name.';
  return { customerId: null, name, phone };
}

export type SaleFigures = { subtotal: number; vatRate: number; vatAmount: number; total: number };

/** The sale's money: the lines at the selling price, VAT as the organisation charges it, the total. */
export function saleFigures(lines: Pick<CheckedLine, 'amount'>[], vat: VatSetting | null): SaleFigures {
  const t = billingTotals({ lines: lines.map((l) => ({ amount: l.amount })), vat });
  return { subtotal: t.subtotal, vatRate: t.vatRate, vatAmount: t.vatAmount, total: t.total };
}

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER'] as const;
export type SalePaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_LABEL: Record<SalePaymentMethod, string> = { CASH: 'Cash', BANK_TRANSFER: 'Bank transfer' };
export const isPaymentMethod = (v: unknown): v is SalePaymentMethod => (PAYMENT_METHODS as readonly unknown[]).includes(v);
