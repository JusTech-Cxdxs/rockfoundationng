/**
 * QuickBooks Desktop files (pure: no database). The workshop keeps
 * QuickBooks as its accounting system; these builders turn EJO's customers,
 * parts, invoices, payments, credit notes and stock movements into the files
 * QuickBooks Desktop imports:
 *
 *  - IIF (Intuit Interchange Format): tab-separated text, the format of
 *    File → Utilities → Import → IIF Files. Lists use one header row
 *    (!CUST, !INVITEM); each transaction is a !TRNS row, its !SPL rows and
 *    ENDTRNS, and must balance (the TRNS amount equals minus the sum of its
 *    splits), or QuickBooks refuses it.
 *  - CSV for the lists (customers and items), for File → Utilities → Import
 *    → Excel Files, which maps columns on screen.
 *
 * Signs follow Intuit's own samples: an invoice debits Accounts Receivable
 * (positive TRNS amount) and credits income and VAT (negative splits with
 * negative quantities); a credit note is the reverse; a payment debits
 * Undeposited Funds and credits Accounts Receivable.
 *
 * VAT is posted as its own split to the VAT account named in Settings, not
 * through QuickBooks' sales-tax items, so the file imports whether or not the
 * company file has sales tax switched on. The account names are the
 * accountant's: each one is a Settings value, and docs/QUICKBOOKS_IMPORT.md
 * tells them which to create first.
 */

export type QbDateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY';

/** The account and item names in the workshop's QuickBooks company file. */
export type QbAccounts = {
  receivable: string;
  undepositedFunds: string;
  labourIncome: string;
  partsIncome: string;
  sundryIncome: string;
  vat: string;
  discounts: string;
  inventoryAsset: string;
  costOfGoodsSold: string;
  stockAdjustment: string;
};

export const DEFAULT_QB_ACCOUNTS: QbAccounts = {
  receivable: 'Accounts Receivable',
  undepositedFunds: 'Undeposited Funds',
  labourIncome: 'Labour Income',
  partsIncome: 'Parts Sales',
  sundryIncome: 'Sundry Income',
  vat: 'VAT Payable',
  discounts: 'Discounts Given',
  inventoryAsset: 'Inventory Asset',
  costOfGoodsSold: 'Cost of Goods Sold',
  stockAdjustment: 'Inventory Adjustments',
};

export type QbCustomer = {
  name: string;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  altPhone?: string | null;
  email?: string | null;
  addressLines?: string[];
  /** e.g. "Net 30" for a fleet company on credit. */
  terms?: string | null;
  creditLimit?: number | null;
  /** The EJO customer number, kept in QuickBooks' account number field. */
  accountNumber?: string | null;
};

export type QbItem = {
  /** Item name in QuickBooks: the part number for a stock part. */
  name: string;
  description: string;
  kind: 'INVENTORY' | 'SERVICE' | 'OTHER_CHARGE';
  salesPrice: number;
  /** Cost price (stock parts only). */
  cost?: number | null;
  incomeAccount: string;
  reorderPoint?: number | null;
  preferredVendor?: string | null;
};

/** Labour, a stock part, a part bought outside, a sundry or the customer's own part. */
export type QbLineKind = 'LABOUR' | 'PART' | 'OUTSIDE_PART' | 'SUNDRY' | 'CLIENT_PART';

export type QbInvoiceLine = {
  kind: QbLineKind;
  /** The QuickBooks item name (part number, "Labour", "Sundries"…). */
  item: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** quantity × unit price, before the invoice's discount. */
  amount: number;
};

export type QbInvoice = {
  number: string;
  date: Date;
  dueDate?: Date | null;
  customer: string;
  memo?: string | null;
  lines: QbInvoiceLine[];
  /** The discount given on the whole invoice (a positive amount). */
  discount: number;
  vatRate: number;
  vatAmount: number;
  /** What the customer owes: lines − discount + VAT. */
  total: number;
};

export type QbPayment = {
  reference: string;
  date: Date;
  customer: string;
  amount: number;
  method: string;
  invoiceNumber?: string | null;
  memo?: string | null;
};

export type QbCreditNote = {
  number: string;
  date: Date;
  customer: string;
  reason: string;
  /** Before VAT. */
  netAmount: number;
  vatAmount: number;
  total: number;
  invoiceNumber?: string | null;
};

export type QbStockMovement = {
  reference: string;
  date: Date;
  item: string;
  /** Positive for stock in, negative for stock out (an adjustment or count difference). */
  quantity: number;
  /** quantity × cost, the value that leaves or joins stock. */
  value: number;
  memo: string;
};

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const qty = (n: number) => String(Math.round(n * 1000) / 1000);

/** Tabs and line breaks end a field in IIF, so they become spaces; quotes are dropped. */
export function iifField(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\t\r\n]+/g, ' ').replace(/"/g, '').trim();
}

export function qbDate(d: Date, format: QbDateFormat = 'DD/MM/YYYY'): string {
  // The calendar day in Lagos, whatever the server's own time zone.
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return format === 'DD/MM/YYYY' ? `${get('day')}/${get('month')}/${get('year')}` : `${get('month')}/${get('day')}/${get('year')}`;
}

const row = (cells: unknown[]) => cells.map(iifField).join('\t');

export function customersIif(customers: QbCustomer[]): string {
  const head = ['!CUST', 'NAME', 'COMPANYNAME', 'FIRSTNAME', 'LASTNAME', 'BADDR1', 'BADDR2', 'BADDR3', 'BADDR4', 'PHONE1', 'PHONE2', 'EMAIL', 'TERMS', 'LIMIT', 'NOTE'];
  const out = [row(head)];
  for (const c of customers) {
    const a = c.addressLines ?? [];
    out.push(row(['CUST', c.name, c.companyName ?? '', c.firstName ?? '', c.lastName ?? '', a[0] ?? '', a[1] ?? '', a[2] ?? '', a[3] ?? '', c.phone ?? '', c.altPhone ?? '', c.email ?? '', c.terms ?? '', c.creditLimit != null ? money(c.creditLimit) : '', c.accountNumber ? `EJO ${c.accountNumber}` : '']));
  }
  return out.join('\r\n') + '\r\n';
}

const ITEM_TYPE: Record<QbItem['kind'], string> = { INVENTORY: 'INVENTORY', SERVICE: 'SERV', OTHER_CHARGE: 'OTHC' };

export function itemsIif(items: QbItem[], accounts: QbAccounts = DEFAULT_QB_ACCOUNTS): string {
  const head = ['!INVITEM', 'NAME', 'INVITEMTYPE', 'DESC', 'PURCHASEDESC', 'ACCNT', 'ASSETACCNT', 'COGSACCNT', 'PRICE', 'COST', 'REORDERPOINT', 'PREFVEND'];
  const out = [row(head)];
  for (const i of items) {
    const stock = i.kind === 'INVENTORY';
    out.push(row(['INVITEM', i.name, ITEM_TYPE[i.kind], i.description, stock ? i.description : '', i.incomeAccount, stock ? accounts.inventoryAsset : '', stock ? accounts.costOfGoodsSold : '', money(i.salesPrice), stock && i.cost != null ? money(i.cost) : '', stock && i.reorderPoint != null ? qty(i.reorderPoint) : '', i.preferredVendor ?? '']));
  }
  return out.join('\r\n') + '\r\n';
}

const TRNS_HEAD = ['!TRNS', 'TRNSID', 'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'AMOUNT', 'DOCNUM', 'MEMO', 'DUEDATE', 'PAYMETH'];
const SPL_HEAD = ['!SPL', 'SPLID', 'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'AMOUNT', 'DOCNUM', 'MEMO', 'QNTY', 'PRICE', 'INVITEM'];
const transactionHeader = () => [row(TRNS_HEAD), row(SPL_HEAD), row(['!ENDTRNS'])];

/** The income account each kind of line posts to. The customer's own part is recorded at no charge. */
export function incomeAccountFor(kind: QbLineKind, accounts: QbAccounts): string {
  if (kind === 'LABOUR') return accounts.labourIncome;
  if (kind === 'SUNDRY') return accounts.sundryIncome;
  return accounts.partsIncome;
}

/** The invoice in IIF rows. Throws when its figures do not add up, so a broken file never reaches the accountant. */
export function invoiceRows(inv: QbInvoice, accounts: QbAccounts, format: QbDateFormat): string[] {
  const date = qbDate(inv.date, format);
  const lineTotal = inv.lines.reduce((s, l) => s + l.amount, 0);
  const expected = Math.round((lineTotal - inv.discount + inv.vatAmount) * 100);
  if (Math.abs(expected - Math.round(inv.total * 100)) > 1) {
    throw new Error(`Invoice ${inv.number} does not add up: lines ${money(lineTotal)} − discount ${money(inv.discount)} + VAT ${money(inv.vatAmount)} is not ${money(inv.total)}.`);
  }
  const out = [row(['TRNS', '', 'INVOICE', date, accounts.receivable, inv.customer, money(inv.total), inv.number, inv.memo ?? '', inv.dueDate ? qbDate(inv.dueDate, format) : '', ''])];
  for (const l of inv.lines) {
    out.push(row(['SPL', '', 'INVOICE', date, incomeAccountFor(l.kind, accounts), '', money(-l.amount), inv.number, l.description, qty(-l.quantity), money(l.unitPrice), l.item]));
  }
  if (inv.discount > 0) out.push(row(['SPL', '', 'INVOICE', date, accounts.discounts, '', money(inv.discount), inv.number, 'Discount', '', '', '']));
  if (inv.vatAmount > 0) out.push(row(['SPL', '', 'INVOICE', date, accounts.vat, '', money(-inv.vatAmount), inv.number, `VAT ${inv.vatRate}%`, '', '', '']));
  // The splits always balance the TRNS row: correct any last-kobo rounding on the final split.
  const splitSum = inv.lines.reduce((s, l) => s - Math.round(l.amount * 100), 0) + Math.round(inv.discount * 100) - Math.round(inv.vatAmount * 100);
  const drift = Math.round(inv.total * 100) + splitSum;
  if (drift !== 0) {
    const last = out.length - 1;
    const cells = out[last]!.split('\t');
    cells[6] = money(Number(cells[6]) - drift / 100);
    out[last] = cells.join('\t');
  }
  out.push('ENDTRNS');
  return out;
}

export function invoicesIif(invoices: QbInvoice[], accounts: QbAccounts = DEFAULT_QB_ACCOUNTS, format: QbDateFormat = 'DD/MM/YYYY'): string {
  const out = transactionHeader();
  for (const inv of invoices) out.push(...invoiceRows(inv, accounts, format));
  return out.join('\r\n') + '\r\n';
}

export function paymentsIif(payments: QbPayment[], accounts: QbAccounts = DEFAULT_QB_ACCOUNTS, format: QbDateFormat = 'DD/MM/YYYY'): string {
  const out = transactionHeader();
  for (const p of payments) {
    const date = qbDate(p.date, format);
    const memo = p.memo ?? (p.invoiceNumber ? `For invoice ${p.invoiceNumber}` : '');
    out.push(row(['TRNS', '', 'PAYMENT', date, accounts.undepositedFunds, p.customer, money(p.amount), p.reference, memo, '', p.method]));
    out.push(row(['SPL', '', 'PAYMENT', date, accounts.receivable, p.customer, money(-p.amount), p.reference, memo, '', '', '']));
    out.push('ENDTRNS');
  }
  return out.join('\r\n') + '\r\n';
}

export function creditNotesIif(notes: QbCreditNote[], accounts: QbAccounts = DEFAULT_QB_ACCOUNTS, format: QbDateFormat = 'DD/MM/YYYY'): string {
  const out = transactionHeader();
  for (const n of notes) {
    const date = qbDate(n.date, format);
    const memo = n.invoiceNumber ? `${n.reason} (invoice ${n.invoiceNumber})` : n.reason;
    out.push(row(['TRNS', '', 'CREDIT MEMO', date, accounts.receivable, n.customer, money(-n.total), n.number, memo, '', '']));
    out.push(row(['SPL', '', 'CREDIT MEMO', date, accounts.sundryIncome, '', money(n.netAmount), n.number, memo, '', '', '']));
    if (n.vatAmount > 0) out.push(row(['SPL', '', 'CREDIT MEMO', date, accounts.vat, '', money(n.vatAmount), n.number, 'VAT', '', '', '']));
    out.push('ENDTRNS');
  }
  return out.join('\r\n') + '\r\n';
}

/** Stock counted up or down, or written off: an inventory adjustment against the adjustments account. */
export function stockMovementsIif(moves: QbStockMovement[], accounts: QbAccounts = DEFAULT_QB_ACCOUNTS, format: QbDateFormat = 'DD/MM/YYYY'): string {
  const out = transactionHeader();
  for (const m of moves) {
    const date = qbDate(m.date, format);
    out.push(row(['TRNS', '', 'INVENTORY ADJUST', date, accounts.stockAdjustment, '', money(-m.value), m.reference, m.memo, '', '']));
    out.push(row(['SPL', '', 'INVENTORY ADJUST', date, accounts.inventoryAsset, '', money(m.value), m.reference, m.memo, qty(m.quantity), '', m.item]));
    out.push('ENDTRNS');
  }
  return out.join('\r\n') + '\r\n';
}

/** A CSV cell: quoted when it holds a comma, quote or line break; a leading = + - @ is defused so Excel never runs it as a formula. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/** Customers for Import → Excel Files (columns matched on screen). */
export function customersCsv(customers: QbCustomer[]): string {
  return csv([
    ['Customer Name', 'Company Name', 'First Name', 'Last Name', 'Main Phone', 'Alt. Phone', 'Main Email', 'Address 1', 'Address 2', 'Address 3', 'Terms', 'Credit Limit', 'Account No.'],
    ...customers.map((c) => { const a = c.addressLines ?? []; return [c.name, c.companyName ?? '', c.firstName ?? '', c.lastName ?? '', c.phone ?? '', c.altPhone ?? '', c.email ?? '', a[0] ?? '', a[1] ?? '', a[2] ?? '', c.terms ?? '', c.creditLimit != null ? money(c.creditLimit) : '', c.accountNumber ?? '']; }),
  ]);
}

/** Items for Import → Excel Files. */
export function itemsCsv(items: QbItem[], accounts: QbAccounts = DEFAULT_QB_ACCOUNTS): string {
  const type: Record<QbItem['kind'], string> = { INVENTORY: 'Inventory Part', SERVICE: 'Service', OTHER_CHARGE: 'Other Charge' };
  return csv([
    ['Item Name', 'Type', 'Description', 'Sales Price', 'Cost', 'Income Account', 'Asset Account', 'COGS Account', 'Reorder Point', 'Preferred Vendor'],
    ...items.map((i) => { const stock = i.kind === 'INVENTORY'; return [i.name, type[i.kind], i.description, money(i.salesPrice), stock && i.cost != null ? money(i.cost) : '', i.incomeAccount, stock ? accounts.inventoryAsset : '', stock ? accounts.costOfGoodsSold : '', stock && i.reorderPoint != null ? qty(i.reorderPoint) : '', i.preferredVendor ?? '']; }),
  ]);
}
