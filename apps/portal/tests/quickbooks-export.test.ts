/**
 * The QuickBooks export (lib/quickbooks/*): counter sales, POS payments,
 * credit notes and refunds as QuickBooks reads them, every IIF file
 * balancing, the workshop's own account and item names, unique customer
 * names, the date range, and EJO records turned into QuickBooks documents.
 * Invented names and figures only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditNotesIif, DEFAULT_QB_ACCOUNTS, documentAddsUp, invoicesCsv, invoicesIif, paymentAccountFor, refundsCsv, refundsIif, salesReceiptsCsv, salesReceiptsIif, unbalancedTransactions, type QbSalesReceipt } from '../lib/quickbooks/iif';
import { DEFAULT_QB_SETTINGS, parseQuickBooksForm, quickBooksSettings, ACCOUNT_FIELDS, ITEM_FIELDS } from '../lib/quickbooks/settings';
import { creditNoteFor, invoiceFor, itemsFor, lagosRange, lineKindFor, parseRange, paymentFor, qbCustomerNames, refundFor, salesReceiptFor, stockMovementFor, totalsOf } from '../lib/quickbooks/assemble';
import { exportFiles, storedFiles, downloadHeaders, UnbalancedExportError } from '../lib/quickbooks/files';

const S = DEFAULT_QB_SETTINGS;
const day = new Date('2026-11-20T09:00:00Z');
const rows = (file: string) => file.trim().split('\r\n').map((r) => r.split('\t'));

const sale: QbSalesReceipt = {
  number: 'CS-2026-000004', date: day, customer: 'Walk-in customer', method: 'POS', reference: 'TRM 0042 991', memo: 'Counter sale to Musa Example',
  lines: [{ kind: 'PART', item: 'NGK-ILKAR7B11', description: 'Spark plug, iridium', quantity: 4, unitPrice: 8500, amount: 34000 }, { kind: 'PART', item: 'TY-90915', description: 'Oil filter', quantity: 1, unitPrice: 6500, amount: 6500 }],
  vatRate: 7.5, vatAmount: 3037.5, total: 43537.5,
};

test('a counter sale is a cash sale into the account for its payment method, parts and VAT credited, and it balances', () => {
  const file = salesReceiptsIif([sale]);
  assert.deepEqual(unbalancedTransactions(file), []);
  const r = rows(file);
  const trns = r.find((x) => x[0] === 'TRNS')!;
  assert.deepEqual([trns[2], trns[3], trns[4], trns[5], trns[6], trns[7], trns[10]], ['CASH SALE', '20/11/2026', 'POS Clearing', 'Walk-in customer', '43537.50', 'CS-2026-000004', 'POS (card)']);
  assert.match(trns[8]!, /Ref TRM 0042 991/);
  const splits = r.filter((x) => x[0] === 'SPL');
  assert.deepEqual(splits.map((x) => x[4]), ['Parts Sales', 'Parts Sales', 'VAT Payable']);
  assert.deepEqual(splits.map((x) => x[6]), ['-34000.00', '-6500.00', '-3037.50']);
  assert.throws(() => salesReceiptsIif([{ ...sale, total: 1 }]), /does not add up/);
  assert.match(salesReceiptsCsv([sale]), /^Sales Receipt No,Customer,Date,Payment Method,Deposit To,Reference,/);
  assert.match(salesReceiptsCsv([sale]), /CS-2026-000004,Walk-in customer,20\/11\/2026,POS \(card\),POS Clearing,TRM 0042 991,NGK-ILKAR7B11/);
});

test('a refund is a cheque out of the account it was paid from, back against the customer, and balances', () => {
  const file = refundsIif([{ reference: 'RF-2026-000002', date: day, customer: 'Tolani Example', amount: 12500, method: 'BANK_TRANSFER', reason: 'Deposit returned, job cancelled' }]);
  assert.deepEqual(unbalancedTransactions(file), []);
  const r = rows(file);
  assert.deepEqual(r.find((x) => x[0] === 'TRNS')!.slice(2, 8), ['CHECK', '20/11/2026', 'Bank Account', 'Tolani Example', '-12500.00', 'RF-2026-000002']);
  assert.deepEqual(r.find((x) => x[0] === 'SPL')!.slice(4, 7), ['Accounts Receivable', 'Tolani Example', '12500.00']);
  assert.match(refundsCsv([{ reference: 'RF-1', date: day, customer: 'A', amount: 10, method: 'CASH', reason: 'x', memo: 'paid to B' }]), /RF-1,20\/11\/2026,A,10\.00,Cash,Undeposited Funds,x \(paid to B\)/);
});

test('a credit note takes the amount before VAT off sales and the VAT off VAT payable, and balances', () => {
  const file = creditNotesIif([{ number: 'CN-2026-000001', date: day, customer: 'A', reason: 'Labour overcharged', netAmount: 10000, vatAmount: 750, total: 10750, invoiceNumber: 'INV-2026-000003' }]);
  assert.deepEqual(unbalancedTransactions(file), []);
  const splits = rows(file).filter((x) => x[0] === 'SPL');
  assert.deepEqual(splits.map((x) => [x[4], x[6]]), [['Sales Returns and Allowances', '10000.00'], ['VAT Payable', '750.00']]);
});

test('an unbalanced transaction is found by its document number; a broken file is never offered', () => {
  const good = invoicesIif([{ number: 'INV-1', date: day, customer: 'A', lines: [{ kind: 'LABOUR', item: 'Labour', description: 'x', quantity: 1, unitPrice: 100, amount: 100 }], discount: 0, vatRate: 7.5, vatAmount: 7.5, total: 107.5 }]);
  assert.deepEqual(unbalancedTransactions(good), []);
  const broken = good.replace('\t107.50\t', '\t108.50\t');
  assert.deepEqual(unbalancedTransactions(broken), ['INV-1']);
  assert.equal(documentAddsUp({ lines: [{ amount: 100 }], discount: 10, vatAmount: 6.75, total: 96.75 }), true);
  assert.equal(documentAddsUp({ lines: [{ amount: 100 }], discount: 10, vatAmount: 6.75, total: 97 }), false);
});

test('payment methods: cash, transfer and POS each have their account', () => {
  assert.equal(paymentAccountFor('CASH', DEFAULT_QB_ACCOUNTS), 'Undeposited Funds');
  assert.equal(paymentAccountFor('BANK_TRANSFER', DEFAULT_QB_ACCOUNTS), 'Bank Account');
  assert.equal(paymentAccountFor('POS', DEFAULT_QB_ACCOUNTS), 'POS Clearing');
  assert.equal(paymentAccountFor('SOMETHING', DEFAULT_QB_ACCOUNTS), 'Undeposited Funds');
});

test('settings: saved names override the defaults; anything unusable falls back; the form is checked', () => {
  const s = quickBooksSettings({ accounts: { bank: 'GTBank Current', vat: 'Output "VAT"', receivable: 'Debtors\tControl' }, dateFormat: 'MM/DD/YYYY', items: { labour: 'Workshop Labour' } });
  assert.equal(s.accounts.bank, 'GTBank Current');
  assert.equal(s.accounts.vat, 'VAT Payable', 'a quote is not allowed in an IIF name: the default stays');
  assert.equal(s.accounts.receivable, 'Debtors Control', 'tabs and runs of spaces become one space');
  assert.equal(s.items.labour, 'Workshop Labour');
  assert.equal(s.dateFormat, 'MM/DD/YYYY');
  assert.deepEqual(quickBooksSettings(null), S);
  const form = (over: Record<string, string> = {}) => {
    const v: Record<string, string> = { dateFormat: 'DD/MM/YYYY', walkInCustomer: 'Walk-in customer' };
    for (const f of ACCOUNT_FIELDS) v[`account_${f.key}`] = S.accounts[f.key];
    for (const f of ITEM_FIELDS) v[`item_${f.key}`] = S.items[f.key];
    Object.assign(v, over);
    return (k: string) => v[k];
  };
  const ok = parseQuickBooksForm(form({ account_bank: 'GTBank Current' }));
  assert.ok(typeof ok !== 'string');
  assert.equal(ok.accounts.bank, 'GTBank Current');
  assert.match(parseQuickBooksForm(form({ account_bank: 'Undeposited Funds' })) as string, /four different accounts/);
  assert.match(parseQuickBooksForm(form({ account_vat: '' })) as string, /VAT payable/);
  assert.match(parseQuickBooksForm(form({ item_labour: 'A name far longer than QuickBooks allows here' })) as string, /31 characters/);
  assert.match(parseQuickBooksForm(form({ dateFormat: 'YYYY' })) as string, /date order/);
});

test('customer names are unique, as QuickBooks needs, and the same in every export', () => {
  const t = (s: string) => new Date(s);
  const names = qbCustomerNames([
    { id: 'cust_older_aaaaaa', fullName: 'Ada Example', createdAt: t('2025-01-01') },
    { id: 'cust_newer_bbbbbb', fullName: 'ada  example', createdAt: t('2026-01-01') },
    { id: 'cust_other_cccccc', fullName: 'Chinedu Example', createdAt: t('2026-02-01') },
  ]);
  assert.equal(names.get('cust_older_aaaaaa'), 'Ada Example');
  assert.equal(names.get('cust_newer_bbbbbb'), 'ada example (BBBBBB)');
  assert.equal(names.get('cust_other_cccccc'), 'Chinedu Example');
  assert.ok([...names.values()].every((n) => n.length <= 41));
});

test('an issued invoice: only lines charged to the customer, after their own discounts, with the frozen discount, VAT and total', () => {
  const inv = invoiceFor({
    invoiceNumber: 'INV-2026-000009', issuedAt: day, dueDate: null, customerName: 'Ada Example', jobNumber: 'JC-2026-000040', plate: 'KJA 901 XY', jobType: 'REPAIR',
    lines: [
      { description: 'Brake service', type: 'LABOUR', quantity: 1, unitPrice: 30000, lineDiscount: 0, amount: 30000, billTo: 'CUSTOMER' },
      { description: 'Brake pads', type: 'STORE_PART', quantity: 2, unitPrice: 20000, lineDiscount: 4000, amount: 40000, billTo: 'CUSTOMER' },
      { description: 'Comeback check', type: 'LABOUR', quantity: 1, unitPrice: 5000, lineDiscount: 0, amount: 5000, billTo: 'WARRANTY' },
      { description: 'Wheel balancing (outside)', type: 'EXTERNAL_JOB', quantity: 1, unitPrice: 8000, lineDiscount: 0, amount: 8000, billTo: 'CUSTOMER' },
    ],
    discountAmount: 2000, vatRate: 7.5, vatAmount: 5400, total: 77400, partNumbers: [null, '04465-02220', null, null],
  }, S);
  assert.deepEqual(inv.lines.map((l) => [l.kind, l.item, l.amount]), [['LABOUR', 'Labour', 30000], ['PART', '04465-02220', 36000], ['LABOUR', 'Outside work', 8000]]);
  assert.equal(inv.lines[1]!.unitPrice, 18000);
  assert.equal(inv.memo, 'Job card JC-2026-000040 · KJA 901 XY');
  assert.ok(documentAddsUp(inv));
  assert.deepEqual(unbalancedTransactions(invoicesIif([inv])), []);
  assert.match(invoicesCsv([inv]), /INV-2026-000009,Ada Example,20\/11\/2026,,Labour,Brake service,1,30000\.00,30000\.00,Labour Income,2000\.00,7\.5%,5400\.00,77400\.00,Job card JC-2026-000040 · KJA 901 XY/);
});

test('line kinds and items: a car wash job posts to car wash income; parts without a number use the parts item', () => {
  assert.equal(lineKindFor('LABOUR', 'CAR_WASH'), 'CAR_WASH');
  assert.equal(lineKindFor('STORE_PART', 'CAR_WASH'), 'PART');
  assert.equal(lineKindFor('EXTERNAL_PART'), 'OUTSIDE_PART');
  assert.equal(lineKindFor('SUNDRY'), 'SUNDRY');
  const wash = invoiceFor({ invoiceNumber: 'INV-W', issuedAt: day, dueDate: null, customerName: 'A', jobNumber: 'JC-1', plate: null, jobType: 'CAR_WASH', lines: [{ description: 'Full wash', type: 'LABOUR', quantity: 1, unitPrice: 5000, lineDiscount: 0, amount: 5000, billTo: 'CUSTOMER' }], discountAmount: 0, vatRate: 0, vatAmount: 0, total: 5000 }, S);
  assert.equal(wash.lines[0]!.item, 'Car wash');
  assert.equal(rows(invoicesIif([wash])).find((x) => x[0] === 'SPL')![4], 'Car Wash Income');
  const cs = salesReceiptFor({ number: 'CS-1', soldAt: day, customerName: null, buyerName: 'Musa Example', paymentMethod: 'CASH', paymentReference: null, vatRate: 7.5, vatAmount: 75, total: 1075, lines: [{ description: 'Wiper', partNumber: null, quantity: 1, unitPrice: 1000, amount: 1000 }] }, S);
  assert.equal(cs.customer, 'Walk-in customer');
  assert.equal(cs.memo, 'Counter sale to Musa Example');
  assert.equal(cs.lines[0]!.item, 'Parts');
});

test('payments, credit notes, refunds and stock count differences from EJO records', () => {
  const p = paymentFor({ id: 'pay_abcdefgh12345678', receiptNumber: null, recordedAt: day, amount: '25000.00', method: 'POS', posReference: 'T-77', notes: null, customerName: 'A', invoiceNumber: 'INV-1', jobNumber: 'JC-1' });
  assert.equal(p.reference, 'PAY-12345678');
  assert.equal(p.amount, 25000);
  assert.equal(p.memo, 'Job card JC-1 · POS ref T-77');
  const cn = creditNoteFor({ number: 'CN-2026-000001', id: 'x', decidedAt: day, requestedAt: day, customerName: 'A', invoiceNumber: 'INV-1', reason: 'Overcharge', amount: 10750, vatAmount: 750 });
  assert.deepEqual([cn.netAmount, cn.vatAmount, cn.total], [10000, 750, 10750]);
  const rf = refundFor({ referenceNumber: 'RF-1', recordedAt: day, amount: 500, method: 'CASH', reason: 'Change', paidToName: 'B', customerName: 'A' });
  assert.equal(rf.memo, 'paid to B');
  const down = stockMovementFor({ countNumber: 'SC-2026-000001', decidedAt: day, item: 'OF-1', difference: -1, value: 4200, reason: 'Damaged' });
  assert.deepEqual([down.quantity, down.value, down.memo], [-1, -4200, 'Stock count SC-2026-000001 · Damaged']);
  const up = stockMovementFor({ countNumber: 'SC-2026-000001', decidedAt: day, item: 'CLT-4L', difference: 2, value: 9000, reason: null });
  assert.equal(up.value, 9000);
  const t = totalsOf({ invoices: [], counterSales: [sale], payments: [p], creditNotes: [cn], refunds: [rf], stockMovements: [down, up] });
  assert.deepEqual([t.counterSales, t.counterSalesVat, t.payments, t.creditNotes, t.refunds, t.stockMovements], [43537.5, 3037.5, 25000, 10750, 500, 4800]);
});

test('items: the service items every file needs, then the store parts; a cost only when given', () => {
  const items = itemsFor([{ partNumber: 'TY-90915', name: 'Oil filter', sellingPrice: '6500', reorderPoint: '5', cost: null }, { partNumber: 'TY-90915', name: 'duplicate', sellingPrice: 1, reorderPoint: null, cost: 1 }], S);
  assert.deepEqual(items.slice(0, 6).map((i) => i.name), ['Labour', 'Outside work', 'Car wash', 'Sundries', 'Parts bought outside', 'Parts']);
  const part = items.find((i) => i.name === 'TY-90915')!;
  assert.equal(part.kind, 'INVENTORY');
  assert.equal(part.cost, null);
  assert.equal(items.filter((i) => i.name === 'TY-90915').length, 1);
});

test('the date range: Lagos days, forwards, at most a year', () => {
  assert.deepEqual(parseRange('2026-11-01', '2026-11-23'), { fromDay: '2026-11-01', toDay: '2026-11-23' });
  assert.match(parseRange('2026-11-23', '2026-11-01') as string, /before the first day/);
  assert.match(parseRange('2025-01-01', '2026-11-23') as string, /a year/);
  assert.match(parseRange('23/11/2026', '2026-11-23') as string, /first and last day/);
  const r = lagosRange('2026-11-01', '2026-11-01');
  assert.equal(r.gte.toISOString(), '2026-10-31T23:00:00.000Z');
  assert.equal(r.lt.toISOString(), '2026-11-01T23:00:00.000Z');
});

test('the files: one IIF with lists first, or one CSV per kind; stored files read back safely', () => {
  const docs = { customers: [{ name: 'A' }], items: itemsFor([], S), invoices: [], counterSales: [sale], payments: [], creditNotes: [], refunds: [], stockMovements: [] };
  const iif = exportFiles('QBX-2026-000001', 'IIF', docs, S);
  assert.equal(iif.length, 1);
  assert.equal(iif[0]!.name, 'QBX-2026-000001.iif');
  assert.ok(iif[0]!.text.indexOf('!CUST') < iif[0]!.text.indexOf('!INVITEM'));
  assert.ok(iif[0]!.text.indexOf('!INVITEM') < iif[0]!.text.indexOf('CASH SALE'));
  const csv = exportFiles('QBX-2026-000001', 'CSV', docs, S);
  assert.deepEqual(csv.map((f) => f.name), ['QBX-2026-000001-customers.csv', 'QBX-2026-000001-items.csv', 'QBX-2026-000001-counter-sales.csv']);
  assert.throws(() => exportFiles('QBX-1', 'IIF', { ...docs, counterSales: [{ ...sale, total: 1 }] }, S), /does not add up/);
  assert.ok(new UnbalancedExportError('x') instanceof Error);
  assert.deepEqual(storedFiles([{ name: 'a.iif', kind: 'all', text: 'x' }, { name: 1 }, null]), [{ name: 'a.iif', kind: 'all', text: 'x' }]);
  assert.deepEqual(storedFiles('nonsense'), []);
  assert.deepEqual(downloadHeaders('QBX-2026-000001-items.csv'), { contentType: 'text/csv; charset=utf-8', disposition: 'attachment; filename="QBX-2026-000001-items.csv"' });
  assert.equal(downloadHeaders('../evil"name.iif').disposition, 'attachment; filename=".._evil_name.iif"');
});
