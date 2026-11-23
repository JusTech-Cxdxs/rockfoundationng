/**
 * From EJO's records to QuickBooks documents (pure: no database). The server
 * reads the records (lib/quickbooks/collect-server.ts); these functions turn
 * them into the shapes lib/quickbooks/iif.ts writes, with the workshop's own
 * account and item names (lib/quickbooks/settings.ts). Unit-tested.
 */
import type { QbCreditNote, QbCustomer, QbInvoice, QbInvoiceLine, QbItem, QbLineKind, QbPayment, QbRefund, QbSalesReceipt, QbStockMovement } from './iif';
import type { QuickBooksSettings } from './settings';

export const EXPORT_KINDS = ['customers', 'items', 'invoices', 'counterSales', 'payments', 'creditNotes', 'refunds', 'stockMovements'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
export const EXPORT_KIND_LABEL: Record<ExportKind, string> = {
  customers: 'Customers', items: 'Items (parts and services)', invoices: 'Invoices', counterSales: 'Counter sales', payments: 'Payments received',
  creditNotes: 'Credit notes', refunds: 'Refunds', stockMovements: 'Stock count adjustments',
};
/** Kinds that carry money, in the order a file should be imported (lists first, then sales, then money in and out). */
export const TRANSACTION_KINDS: readonly ExportKind[] = ['invoices', 'counterSales', 'payments', 'creditNotes', 'refunds', 'stockMovements'];
export const isExportKind = (k: unknown): k is ExportKind => typeof k === 'string' && (EXPORT_KINDS as readonly string[]).includes(k);

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

/**
 * QuickBooks needs every customer name to be unique. A name used by more than
 * one customer keeps it for the oldest; the others get their EJO reference in
 * brackets, the same in every export so QuickBooks recognises them again.
 */
export function qbCustomerNames(customers: readonly { id: string; fullName: string; createdAt: Date }[]): Map<string, string> {
  const byName = new Map<string, { id: string; createdAt: Date }[]>();
  for (const c of customers) {
    const key = c.fullName.trim().replace(/\s+/g, ' ').toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), c]);
  }
  const out = new Map<string, string>();
  for (const c of customers) {
    const name = c.fullName.trim().replace(/\s+/g, ' ').replace(/["\t\r\n:]/g, ' ');
    const same = byName.get(c.fullName.trim().replace(/\s+/g, ' ').toLowerCase()) ?? [];
    const oldest = [...same].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))[0];
    // QuickBooks Desktop takes customer names up to 41 characters.
    out.set(c.id, same.length > 1 && oldest?.id !== c.id ? `${name.slice(0, 32)} (${c.id.slice(-6).toUpperCase()})` : name.slice(0, 41));
  }
  return out;
}

/** The kind of line, from the estimate line type and the job's type. */
export function lineKindFor(type: string, jobType?: string | null): QbLineKind {
  if (jobType === 'CAR_WASH' && (type === 'LABOUR' || type === 'SUNDRY' || type === 'INTERNAL_JOB')) return 'CAR_WASH';
  if (type === 'STORE_PART') return 'PART';
  if (type === 'EXTERNAL_PART') return 'OUTSIDE_PART';
  if (type === 'SUNDRY') return 'SUNDRY';
  return 'LABOUR';
}

/** A store part's item name: its part number (QuickBooks Desktop takes 31 characters), or the generic parts item. */
export function partItemName(partNumber: string | null | undefined, settings: QuickBooksSettings): string {
  return partNumber?.trim().slice(0, 31) || settings.items.parts;
}

/** The QuickBooks item a line uses: a store part's own part number when known, else the item set for its kind. */
export function itemNameFor(type: string, kind: QbLineKind, settings: QuickBooksSettings, partNumber?: string | null): string {
  if (type === 'STORE_PART') return partItemName(partNumber, settings);
  if (kind === 'CAR_WASH') return settings.items.carWash;
  if (type === 'EXTERNAL_PART') return settings.items.outsidePart;
  if (type === 'EXTERNAL_JOB') return settings.items.outsideWork;
  if (type === 'SUNDRY') return settings.items.sundry;
  return settings.items.labour;
}

/** An issued invoice's frozen line (Invoice.lines). */
export type FrozenLine = { description: string; type: string; quantity: number; unitPrice: number | null; lineDiscount: number; amount: number; billTo: string };

/**
 * An issued invoice as QuickBooks reads it: only the lines charged to the
 * customer (warranty, goodwill and internal lines are not sales), each at
 * what the customer pays after its own discount; the invoice discount, VAT
 * and total exactly as frozen on the invoice.
 */
export function invoiceFor(inv: {
  invoiceNumber: string; issuedAt: Date; dueDate: Date | null; customerName: string; jobNumber: string; plate: string | null; jobType: string | null;
  lines: unknown; discountAmount: unknown; vatRate: unknown; vatAmount: unknown; total: unknown;
  /** Part numbers of the estimate's lines, by position (null when not a store part or unknown). */
  partNumbers?: (string | null)[];
}, settings: QuickBooksSettings): QbInvoice {
  const frozen = (Array.isArray(inv.lines) ? inv.lines : []) as FrozenLine[];
  const lines: QbInvoiceLine[] = [];
  frozen.forEach((l, i) => {
    if (l.billTo && l.billTo !== 'CUSTOMER') return;
    const amount = r2(num(l.amount) - num(l.lineDiscount));
    if (amount <= 0) return;
    const kind = lineKindFor(l.type, inv.jobType);
    const quantity = num(l.quantity) > 0 ? num(l.quantity) : 1;
    lines.push({ kind, item: itemNameFor(l.type, kind, settings, inv.partNumbers?.[i]), description: String(l.description ?? '').slice(0, 200), quantity, unitPrice: r2(amount / quantity), amount });
  });
  return {
    number: inv.invoiceNumber, date: inv.issuedAt, dueDate: inv.dueDate, customer: inv.customerName,
    memo: [`Job card ${inv.jobNumber}`, inv.plate].filter(Boolean).join(' · '),
    lines, discount: r2(num(inv.discountAmount)), vatRate: num(inv.vatRate), vatAmount: r2(num(inv.vatAmount)), total: r2(num(inv.total)),
  };
}

export function salesReceiptFor(s: {
  number: string; soldAt: Date; customerName: string | null; buyerName: string; paymentMethod: string; paymentReference: string | null;
  vatRate: unknown; vatAmount: unknown; total: unknown; lines: { description: string; partNumber: string | null; quantity: unknown; unitPrice: unknown; amount: unknown }[];
}, settings: QuickBooksSettings): QbSalesReceipt {
  return {
    number: s.number, date: s.soldAt, customer: s.customerName ?? settings.walkInCustomer, method: s.paymentMethod, reference: s.paymentReference,
    memo: s.customerName ? 'Counter sale' : `Counter sale to ${s.buyerName}`,
    lines: s.lines.map((l) => ({ kind: 'PART' as const, item: partItemName(l.partNumber, settings), description: l.description.slice(0, 200), quantity: num(l.quantity), unitPrice: r2(num(l.unitPrice)), amount: r2(num(l.amount)) })),
    vatRate: num(s.vatRate), vatAmount: r2(num(s.vatAmount)), total: r2(num(s.total)),
  };
}

export function paymentFor(p: { id: string; receiptNumber: string | null; recordedAt: Date; amount: unknown; method: string; posReference: string | null; notes: string | null; customerName: string; invoiceNumber: string | null; jobNumber: string | null }): QbPayment {
  const memo = [p.jobNumber ? `Job card ${p.jobNumber}` : null, p.posReference ? `POS ref ${p.posReference}` : null, p.notes?.slice(0, 80) ?? null].filter(Boolean).join(' · ');
  return { reference: p.receiptNumber ?? `PAY-${p.id.slice(-8).toUpperCase()}`, date: p.recordedAt, customer: p.customerName, amount: r2(num(p.amount)), method: p.method, invoiceNumber: p.invoiceNumber, memo: memo || null };
}

/** An approved credit note: its amount includes VAT; the VAT inside it is kept on the note. */
export function creditNoteFor(c: { number: string | null; id: string; decidedAt: Date | null; requestedAt: Date; customerName: string; invoiceNumber: string; reason: string; amount: unknown; vatAmount: unknown }): QbCreditNote {
  const total = r2(num(c.amount));
  const vat = r2(num(c.vatAmount));
  return { number: c.number ?? `CN-${c.id.slice(-8).toUpperCase()}`, date: c.decidedAt ?? c.requestedAt, customer: c.customerName, reason: c.reason.slice(0, 120), netAmount: r2(total - vat), vatAmount: vat, total, invoiceNumber: c.invoiceNumber };
}

export function refundFor(r: { referenceNumber: string; recordedAt: Date; amount: unknown; method: string; reason: string; paidToName: string; customerName: string }): QbRefund {
  return { reference: r.referenceNumber, date: r.recordedAt, customer: r.customerName, amount: r2(num(r.amount)), method: r.method, reason: r.reason.slice(0, 120), memo: r.paidToName !== r.customerName ? `paid to ${r.paidToName}` : null };
}

export function customerFor(c: { id: string; fullName: string; customerType: string; email: string | null; phone: string | null; altPhone: string | null; address: string | null; externalId: string | null; companyName?: string | null; paymentTermsDays?: number | null; creditLimit?: unknown }, name: string): QbCustomer {
  const parts = c.customerType === 'INDIVIDUAL' ? c.fullName.trim().split(/\s+/) : [];
  return {
    name, companyName: c.customerType === 'INDIVIDUAL' ? null : (c.companyName ?? c.fullName),
    firstName: parts.length > 1 ? parts[0]! : null, lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
    phone: c.phone, altPhone: c.altPhone, email: c.email, addressLines: c.address ? [c.address] : [],
    terms: c.paymentTermsDays && c.paymentTermsDays > 0 ? `Net ${c.paymentTermsDays}` : null,
    creditLimit: c.creditLimit === null || c.creditLimit === undefined ? null : num(c.creditLimit),
    accountNumber: c.externalId ?? c.id.slice(-8).toUpperCase(),
  };
}

/** The service items every workshop file needs, plus the store's parts (cost only for those who may see it). */
export function itemsFor(parts: { partNumber: string | null; name: string; sellingPrice: unknown; reorderPoint: unknown; cost: number | null }[], settings: QuickBooksSettings): QbItem[] {
  const a = settings.accounts;
  const service = (name: string, description: string, account: string): QbItem => ({ name, description, kind: 'SERVICE', salesPrice: 0, incomeAccount: account });
  const out: QbItem[] = [
    service(settings.items.labour, 'Workshop labour', a.labourIncome),
    service(settings.items.outsideWork, 'Work done outside and charged on', a.labourIncome),
    service(settings.items.carWash, 'Car wash', a.carWashIncome),
    { ...service(settings.items.sundry, 'Sundries', a.sundryIncome), kind: 'OTHER_CHARGE' },
    { ...service(settings.items.outsidePart, 'Parts bought outside for a job', a.partsIncome), kind: 'OTHER_CHARGE' },
    { ...service(settings.items.parts, 'Store parts (no part number)', a.partsIncome), kind: 'OTHER_CHARGE' },
  ];
  const seen = new Set(out.map((i) => i.name.toLowerCase()));
  for (const p of parts) {
    const name = p.partNumber?.trim() ? partItemName(p.partNumber, settings) : p.name.trim().slice(0, 31);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, description: p.name.slice(0, 200), kind: 'INVENTORY', salesPrice: r2(num(p.sellingPrice)), cost: p.cost, incomeAccount: a.partsIncome, reorderPoint: p.reorderPoint === null || p.reorderPoint === undefined ? null : num(p.reorderPoint) });
  }
  return out;
}

/** A stock count's approved difference on one part: a surplus comes in, a shortfall goes out, at cost. */
export function stockMovementFor(m: { countNumber: string; decidedAt: Date; item: string; difference: unknown; value: number; reason: string | null }): QbStockMovement {
  const qty = num(m.difference);
  return { reference: m.countNumber, date: m.decidedAt, item: m.item, quantity: qty, value: r2(qty < 0 ? -Math.abs(m.value) : Math.abs(m.value)), memo: `Stock count ${m.countNumber}${m.reason ? ` · ${m.reason}` : ''}` };
}

/** The totals the export page shows and the file must match: how many of each kind and their naira. */
export function totalsOf(docs: { invoices: QbInvoice[]; counterSales: QbSalesReceipt[]; payments: QbPayment[]; creditNotes: QbCreditNote[]; refunds: QbRefund[]; stockMovements: QbStockMovement[] }): Record<string, number> {
  const sum = (xs: number[]) => r2(xs.reduce((s, x) => s + x, 0));
  return {
    invoices: sum(docs.invoices.map((i) => i.total)),
    invoicesVat: sum(docs.invoices.map((i) => i.vatAmount)),
    counterSales: sum(docs.counterSales.map((s) => s.total)),
    counterSalesVat: sum(docs.counterSales.map((s) => s.vatAmount)),
    payments: sum(docs.payments.map((p) => p.amount)),
    creditNotes: sum(docs.creditNotes.map((c) => c.total)),
    refunds: sum(docs.refunds.map((r) => r.amount)),
    stockMovements: sum(docs.stockMovements.map((m) => m.value)),
  };
}

/** A Lagos day (YYYY-MM-DD) checked; the range must run forwards and cover at most a year. */
export function parseRange(from: unknown, to: unknown): { fromDay: string; toDay: string } | string {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const f = String(from ?? ''); const t = String(to ?? '');
  if (!re.test(f) || !re.test(t) || Number.isNaN(Date.parse(`${f}T00:00:00Z`)) || Number.isNaN(Date.parse(`${t}T00:00:00Z`))) return 'Choose the first and last day of the export.';
  if (t < f) return 'The last day is before the first day.';
  if ((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86_400_000 > 366) return 'Export at most a year at a time.';
  return { fromDay: f, toDay: t };
}

/** The instants a Lagos day range covers: from 00:00 on the first day to just before 00:00 after the last (Lagos is UTC+1, no summer time). */
export function lagosRange(fromDay: string, toDay: string): { gte: Date; lt: Date } {
  const gte = new Date(`${fromDay}T00:00:00+01:00`);
  const lt = new Date(new Date(`${toDay}T00:00:00+01:00`).getTime() + 86_400_000);
  return { gte, lt };
}
