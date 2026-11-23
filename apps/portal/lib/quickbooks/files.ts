/**
 * The files of one QuickBooks export (pure). IIF: a single file for
 * QuickBooks Desktop, lists first (customers, items) then the transactions in
 * the order they must be imported, every transaction checked to balance.
 * CSV: one file per kind, for Excel or QuickBooks Online's import screens.
 */
import {
  creditNotesCsv, creditNotesIif, customersCsv, customersIif, invoicesCsv, invoicesIif, itemsCsv, itemsIif, paymentsCsv, paymentsIif, refundsCsv, refundsIif,
  salesReceiptsCsv, salesReceiptsIif, stockMovementsCsv, stockMovementsIif, unbalancedTransactions,
  type QbCreditNote, type QbCustomer, type QbInvoice, type QbItem, type QbPayment, type QbRefund, type QbSalesReceipt, type QbStockMovement,
} from './iif';
import type { QuickBooksSettings } from './settings';
import type { ExportKind } from './assemble';

export type ExportFormat = 'IIF' | 'CSV';
export type ExportFile = { name: string; kind: ExportKind | 'all'; text: string };
export type Documents = {
  customers: QbCustomer[]; items: QbItem[]; invoices: QbInvoice[]; counterSales: QbSalesReceipt[];
  payments: QbPayment[]; creditNotes: QbCreditNote[]; refunds: QbRefund[]; stockMovements: QbStockMovement[];
};

const ORDER: ExportKind[] = ['customers', 'items', 'invoices', 'counterSales', 'payments', 'creditNotes', 'refunds', 'stockMovements'];
const FILE_WORD: Record<ExportKind, string> = { customers: 'customers', items: 'items', invoices: 'invoices', counterSales: 'counter-sales', payments: 'payments', creditNotes: 'credit-notes', refunds: 'refunds', stockMovements: 'stock-adjustments' };

export class UnbalancedExportError extends Error {}

/** The files for these documents. Throws when an IIF transaction does not balance, so a broken file is never offered. */
export function exportFiles(number: string, format: ExportFormat, docs: Documents, settings: QuickBooksSettings): ExportFile[] {
  const a = settings.accounts;
  const f = settings.dateFormat;
  const has = (k: ExportKind) => docs[k].length > 0;
  if (format === 'IIF') {
    const parts: string[] = [];
    for (const k of ORDER) {
      if (!has(k)) continue;
      if (k === 'customers') parts.push(customersIif(docs.customers));
      else if (k === 'items') parts.push(itemsIif(docs.items, a));
      else if (k === 'invoices') parts.push(invoicesIif(docs.invoices, a, f));
      else if (k === 'counterSales') parts.push(salesReceiptsIif(docs.counterSales, a, f));
      else if (k === 'payments') parts.push(paymentsIif(docs.payments, a, f));
      else if (k === 'creditNotes') parts.push(creditNotesIif(docs.creditNotes, a, f));
      else if (k === 'refunds') parts.push(refundsIif(docs.refunds, a, f));
      else parts.push(stockMovementsIif(docs.stockMovements, a, f));
    }
    const text = parts.join('');
    const bad = unbalancedTransactions(text);
    if (bad.length) throw new UnbalancedExportError(`These do not balance and were not exported: ${bad.slice(0, 10).join(', ')}.`);
    return text ? [{ name: `${number}.iif`, kind: 'all', text }] : [];
  }
  const out: ExportFile[] = [];
  for (const k of ORDER) {
    if (!has(k)) continue;
    const text = k === 'customers' ? customersCsv(docs.customers)
      : k === 'items' ? itemsCsv(docs.items, a)
      : k === 'invoices' ? invoicesCsv(docs.invoices, a, f)
      : k === 'counterSales' ? salesReceiptsCsv(docs.counterSales, a, f)
      : k === 'payments' ? paymentsCsv(docs.payments, a, f)
      : k === 'creditNotes' ? creditNotesCsv(docs.creditNotes, a, f)
      : k === 'refunds' ? refundsCsv(docs.refunds, a, f)
      : stockMovementsCsv(docs.stockMovements, a, f);
    out.push({ name: `${number}-${FILE_WORD[k]}.csv`, kind: k, text });
  }
  return out;
}

/** A stored file list, read back safely (a damaged row gives no files rather than an error). */
export function storedFiles(raw: unknown): ExportFile[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is ExportFile => Boolean(x) && typeof (x as ExportFile).name === 'string' && typeof (x as ExportFile).text === 'string')
    .map((x) => ({ name: x.name, kind: x.kind, text: x.text }));
}

/** The MIME type and a safe download name for a stored file. */
export function downloadHeaders(name: string): { contentType: string; disposition: string } {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, '_');
  return { contentType: safe.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8', disposition: `attachment; filename="${safe}"` };
}
