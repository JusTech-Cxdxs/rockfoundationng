import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditNotesIif, csvCell, customersIif, DEFAULT_QB_ACCOUNTS, iifField, invoicesIif, itemsCsv, itemsIif, paymentsIif, qbDate, stockMovementsIif, type QbInvoice } from '../lib/quickbooks/iif';

/** Every TRNS block must balance: the TRNS amount plus its splits is zero (to the kobo). */
function assertBalanced(file: string) {
  const lines = file.trim().split('\r\n');
  let sum: number | null = null;
  let blocks = 0;
  for (const l of lines) {
    const c = l.split('\t');
    if (c[0] === 'TRNS') sum = Math.round(Number(c[6]) * 100);
    else if (c[0] === 'SPL') sum = (sum ?? 0) + Math.round(Number(c[6]) * 100);
    else if (c[0] === 'ENDTRNS') { assert.equal(sum, 0, 'a transaction does not balance'); sum = null; blocks++; }
  }
  return blocks;
}

const invoice: QbInvoice = {
  number: 'INV-2026-0042', date: new Date('2026-11-20T10:00:00Z'), dueDate: new Date('2026-12-20T10:00:00Z'), customer: 'Adeyemi Logistics Ltd', memo: 'Job card JC-0042 · LND 123 AB',
  lines: [
    { kind: 'LABOUR', item: 'Labour', description: 'Brake service', quantity: 2, unitPrice: 15000, amount: 30000 },
    { kind: 'PART', item: 'BP-TOY-001', description: 'Brake pads (front)', quantity: 1, unitPrice: 42500, amount: 42500 },
    { kind: 'SUNDRY', item: 'Sundries', description: 'Brake cleaner', quantity: 1, unitPrice: 3333.33, amount: 3333.33 },
  ],
  discount: 2500, vatRate: 7.5, vatAmount: 5549.99, total: 78883.32,
};

test('dates are the Lagos calendar day, DD/MM/YYYY by default', () => {
  assert.equal(qbDate(new Date('2026-11-20T23:30:00Z')), '21/11/2026');
  assert.equal(qbDate(new Date('2026-11-20T10:00:00Z'), 'MM/DD/YYYY'), '11/20/2026');
});

test('an invoice: AR debited with the total, income and VAT credited, discount debited, and it balances', () => {
  const file = invoicesIif([invoice]);
  assert.ok(file.startsWith('!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT'));
  assert.equal(assertBalanced(file), 1);
  const rows = file.trim().split('\r\n').map((r) => r.split('\t'));
  const trns = rows.find((r) => r[0] === 'TRNS')!;
  assert.deepEqual([trns[2], trns[3], trns[4], trns[5], trns[6], trns[7]], ['INVOICE', '20/11/2026', 'Accounts Receivable', 'Adeyemi Logistics Ltd', '78883.32', 'INV-2026-0042']);
  const splits = rows.filter((r) => r[0] === 'SPL');
  assert.deepEqual(splits.map((s) => s[4]), ['Labour Income', 'Parts Sales', 'Sundry Income', 'Discounts Given', 'VAT Payable']);
  assert.equal(splits[1]![9], '-1');
  assert.equal(splits[1]![11], 'BP-TOY-001');
  assert.equal(splits[3]![6], '2500.00');
});

test('an invoice whose figures do not add up is refused, not exported', () => {
  assert.throws(() => invoicesIif([{ ...invoice, total: 1 }]), /does not add up/);
});

test('payments, credit notes and stock adjustments each balance', () => {
  assert.equal(assertBalanced(paymentsIif([{ reference: 'RCT-0007', date: invoice.date, customer: 'Adeyemi Logistics Ltd', amount: 50000, method: 'Transfer', invoiceNumber: 'INV-2026-0042' }])), 1);
  assert.equal(assertBalanced(creditNotesIif([{ number: 'CN-0001', date: invoice.date, customer: 'Adeyemi Logistics Ltd', reason: 'Overcharge on labour', netAmount: 10000, vatAmount: 750, total: 10750 }])), 1);
  assert.equal(assertBalanced(stockMovementsIif([{ reference: 'ADJ-0003', date: invoice.date, item: 'OF-TOY-090', quantity: -2, value: -7000, memo: 'Stock count' }])), 1);
  const pay = paymentsIif([{ reference: 'RCT-0007', date: invoice.date, customer: 'A', amount: 50000, method: 'Transfer' }]).split('\r\n')[3]!.split('\t');
  assert.equal(pay[4], DEFAULT_QB_ACCOUNTS.undepositedFunds);
});

test('lists: customers and items, with tabs and line breaks made safe', () => {
  assert.equal(iifField('a\tb\nc"d'), 'a b cd');
  const cust = customersIif([{ name: 'Chiamaka Obi', firstName: 'Chiamaka', lastName: 'Obi', phone: '+234 803 000 0001', email: 'chiamaka@example.com', addressLines: ['5 Idiroko Road', 'Ota'], accountNumber: 'C-0001' }]);
  assert.equal(cust.split('\r\n')[1]!.split('\t')[1], 'Chiamaka Obi');
  const items = itemsIif([{ name: 'OF-TOY-090', description: 'Oil filter', kind: 'INVENTORY', salesPrice: 6500, cost: 3500, incomeAccount: 'Parts Sales', reorderPoint: 5 }]);
  const cells = items.split('\r\n')[1]!.split('\t');
  assert.deepEqual([cells[2], cells[6], cells[7], cells[8], cells[9]], ['INVENTORY', 'Inventory Asset', 'Cost of Goods Sold', '6500.00', '3500.00']);
});

test('CSV cells: quoted when needed, and never run as a formula in Excel', () => {
  assert.equal(csvCell('Obi, Chiamaka'), '"Obi, Chiamaka"');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('-2500.00'), '-2500.00');
  assert.ok(itemsCsv([{ name: 'Labour', description: 'Workshop labour', kind: 'SERVICE', salesPrice: 15000, incomeAccount: 'Labour Income' }]).includes('Labour,Service,Workshop labour,15000.00'));
});
