/**
 * The parts store (Phase 4): counter sales, stock counts, the report, and
 * the rule that the Store Keeper never sees a cost. Pure rules run directly;
 * the server files are read as source so a cost can never slip back in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkBuyer, checkSaleLine, checkSaleLines, saleFigures, isPaymentMethod, type CounterSalePart } from '../lib/inventory/counter-sale';
import { checkCount, hasDifference, planAdjustments, type CountPart } from '../lib/inventory/stock-count';
import { partsReport, reportRange } from '../lib/inventory/parts-report';
import { stockOutPlace } from '../lib/inventory/stock-out-place';
import { replayQuantityFifo, planQuantityRelease } from '../lib/inventory/quantity-fifo';
import { ROLE_GRANTS, OPTIONAL_ROLE_COVER, APPROVAL_PERMISSIONS, STORE_COST_PERMISSIONS, effectiveRoles } from '../lib/authz/catalogue';
import { approvalArea } from '../lib/approvals';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

const oil: CounterSalePart = { id: 'p_oil', name: 'Engine oil 5W-30', isActive: true, trackingType: 'QUANTITY', baseUnitOfMeasure: 'litre', sellingPrice: 6500, available: 40 };
const tyre: CounterSalePart = { id: 'p_tyre', name: 'Tyre 205/55 R16', isActive: true, trackingType: 'SERIALIZED', baseUnitOfMeasure: 'piece', sellingPrice: 85000, available: 4 };

test('a counter sale line: the selling price, what is free in stock, whole units with their serials', () => {
  const ok = checkSaleLine(oil, { partId: 'p_oil', quantity: 4 });
  assert.ok(typeof ok !== 'string');
  assert.equal(ok.amount, 26000);
  assert.equal(ok.unitPrice, 6500);
  assert.match(String(checkSaleLine(oil, { partId: 'p_oil', quantity: 41 })), /Only 40 litre .* can be sold/);
  assert.match(String(checkSaleLine(oil, { partId: 'p_oil', quantity: 0 })), /Enter how many/);
  assert.match(String(checkSaleLine({ ...oil, sellingPrice: null }, { partId: 'p_oil', quantity: 1 })), /no selling price yet/);
  assert.match(String(checkSaleLine({ ...oil, isActive: false }, { partId: 'p_oil', quantity: 1 })), /no longer in the catalogue/);
  assert.match(String(checkSaleLine(tyre, { partId: 'p_tyre', quantity: 2, serialNumbers: ['T1'] })), /serial number of each unit/);
  assert.match(String(checkSaleLine(tyre, { partId: 'p_tyre', quantity: 2, serialNumbers: ['T1', 'T1'] })), /entered twice/);
  assert.match(String(checkSaleLine(tyre, { partId: 'p_tyre', quantity: 1.5, serialNumbers: ['T1'] })), /whole number/);
  const t = checkSaleLine(tyre, { partId: 'p_tyre', quantity: 2, serialNumbers: [' T1 ', 'T2'] });
  assert.ok(typeof t !== 'string');
  assert.deepEqual(t.serialNumbers, ['T1', 'T2']);
});

test('the same part twice is one line; an empty sale or an unknown part is refused', () => {
  const parts = new Map([[oil.id, oil]]);
  const lines = checkSaleLines(parts, [{ partId: 'p_oil', quantity: 2 }, { partId: 'p_oil', quantity: 3 }]);
  assert.ok(typeof lines !== 'string');
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.quantity, 5);
  assert.match(String(checkSaleLines(parts, [])), /at least one part/);
  assert.match(String(checkSaleLines(parts, [{ partId: 'p_gone', quantity: 1 }])), /no longer in the catalogue/);
});

test('the buyer: a registered customer, or a walk-in with a name; phone numbers checked', () => {
  assert.deepEqual(checkBuyer({ customerId: 'c1', customerName: 'Tunde Bakare' }), { customerId: 'c1', name: 'Tunde Bakare', phone: null });
  assert.deepEqual(checkBuyer({ buyerName: '  Musa   Ibrahim ', buyerPhone: '0803 123 4567' }), { customerId: null, name: 'Musa Ibrahim', phone: '0803 123 4567' });
  assert.match(String(checkBuyer({ buyerName: 'M' })), /walk-in buyer/);
  assert.match(String(checkBuyer({ buyerName: 'Musa', buyerPhone: '0803' })), /too short/);
  assert.ok(isPaymentMethod('CASH') && isPaymentMethod('BANK_TRANSFER') && !isPaymentMethod('CHEQUE'));
});

test('the sale’s money: VAT as on invoices, in whole kobo', () => {
  assert.deepEqual(saleFigures([{ amount: 26000 }, { amount: 170000 }], { vatEnabled: true, vatRate: 7.5 }), { subtotal: 196000, vatRate: 7.5, vatAmount: 14700, total: 210700 });
  assert.deepEqual(saleFigures([{ amount: 26000 }], { vatEnabled: false, vatRate: 7.5 }), { subtotal: 26000, vatRate: 0, vatAmount: 0, total: 26000 });
  assert.equal(saleFigures([{ amount: 333.33 }], { vatEnabled: true, vatRate: 7.5 }).vatAmount, 25);
});

test('counter sales draw FIFO on the same deliveries as releases (a sale after a release takes what is left)', () => {
  const layers = [{ id: 'grn1', receivedAt: new Date('2026-01-01'), quantity: 10 }, { id: 'grn2', receivedAt: new Date('2026-02-01'), quantity: 10 }];
  const released = [{ id: 'rel', consumedAt: new Date('2026-02-02'), quantity: 8, goodsReceiptLineId: 'grn1' }];
  const sold = [{ id: 'out', consumedAt: new Date('2026-02-03'), quantity: 5, goodsReceiptLineId: null }];
  const now = replayQuantityFifo(layers, [...released, ...sold]);
  assert.equal(now.layers.get('grn1')!.remaining, 0);
  assert.equal(now.layers.get('grn2')!.remaining, 7);
  assert.deepEqual(planQuantityRelease(layers, replayQuantityFifo(layers, released).layers, 5), [{ goodsReceiptLineId: 'grn1', quantity: 2 }, { goodsReceiptLineId: 'grn2', quantity: 3 }]);
});

const filter: CountPart = { id: 'p_f', name: 'Oil filter', trackingType: 'QUANTITY', baseUnitOfMeasure: 'piece', onHand: 12, reserved: 2 };
const pads: CountPart = { id: 'p_b', name: 'Brake pads', trackingType: 'BATCH', baseUnitOfMeasure: 'set', onHand: 5, reserved: 0 };
const counted = new Map([[filter.id, filter], [pads.id, pads], ['p_t', { ...filter, id: 'p_t', name: 'Tyre', trackingType: 'SERIALIZED' as const }]]);

test('a stock count: blanks are not counted; a difference needs a reason; kept-for-jobs stock cannot be counted away', () => {
  const lines = checkCount(counted, [{ partId: 'p_f', counted: '10', reason: 'Damaged' }, { partId: 'p_b', counted: 5 }, { partId: 'p_x', counted: '' }]);
  assert.ok(typeof lines !== 'string');
  assert.deepEqual(lines, [
    { partId: 'p_f', systemQuantity: 12, countedQuantity: 10, difference: -2, reason: 'Damaged' },
    { partId: 'p_b', systemQuantity: 5, countedQuantity: 5, difference: 0, reason: null },
  ]);
  assert.ok(hasDifference(lines));
  assert.ok(!hasDifference([lines[1]!]));
  assert.match(String(checkCount(counted, [{ partId: 'p_f', counted: 10 }])), /Say why Oil filter is short by 2 piece/);
  assert.match(String(checkCount(counted, [{ partId: 'p_b', counted: 7, reason: 'x' }])), /Say why Brake pads is over by 2/);
  assert.match(String(checkCount(counted, [{ partId: 'p_f', counted: 1, reason: 'Lost or missing' }])), /kept for jobs/);
  assert.match(String(checkCount(counted, [{ partId: 'p_t', counted: 1 }])), /serial numbers/);
  assert.match(String(checkCount(counted, [{ partId: 'p_f', counted: -1 }])), /0 or more/);
  assert.match(String(checkCount(counted, [])), /at least one part/);
});

test('approving moves each difference as recorded, unless the free stock has gone since', () => {
  const now = new Map([['p_f', { name: 'Oil filter', onHand: 12, reserved: 2 }], ['p_b', { name: 'Brake pads', onHand: 5, reserved: 0 }]]);
  assert.deepEqual(planAdjustments([{ partId: 'p_f', difference: -2 }, { partId: 'p_b', difference: 3 }, { partId: 'p_b', difference: 0 }], now), [{ partId: 'p_f', change: -2 }, { partId: 'p_b', change: 3 }]);
  const moved = new Map([['p_f', { name: 'Oil filter', onHand: 3, reserved: 2 }]]);
  assert.match(String(planAdjustments([{ partId: 'p_f', difference: -2 }], moved)), /has moved since it was counted/);
});

test('the report: job and counter sales side by side; costs and profit only with costs', () => {
  const parts = [{ id: 'p_oil', name: 'Engine oil', partNumber: null, category: null, unit: 'litre', onHand: 30, reserved: 0, reorderPoint: 40, lastCost: 5000 }, { id: 'p_old', name: 'Old part', partNumber: null, category: null, unit: 'piece', onHand: 3, reserved: 0, reorderPoint: null, lastCost: 1000 }];
  const now = new Date('2026-11-20T12:00:00Z');
  const movements = [
    { partId: 'p_oil', at: new Date('2026-11-05'), qty: 4, channel: 'JOB' as const, unitPrice: 6500, unitCost: 5000 },
    { partId: 'p_oil', at: new Date('2026-11-06'), qty: 2, channel: 'COUNTER' as const, unitPrice: 6500, unitCost: 5000 },
    { partId: 'p_old', at: new Date('2026-05-01'), qty: 1, channel: 'JOB' as const, unitPrice: 2000, unitCost: 1000 },
  ];
  const { from, to } = reportRange('this_month', now);
  const owner = partsReport({ parts, movements, from, to, now, withCosts: true });
  assert.deepEqual(owner.sold[0], { partId: 'p_oil', name: 'Engine oil', unit: 'litre', jobQty: 4, counterQty: 2, jobRevenue: 26000, counterRevenue: 13000, revenue: 39000, cost: 30000, profit: 9000 });
  assert.equal(owner.totals.profit, 9000);
  assert.deepEqual(owner.low.map((l) => l.partId), ['p_oil']);
  assert.deepEqual(owner.slow.map((s) => [s.partId, s.value]), [['p_old', 3000]]);
  const keeper = partsReport({ parts, movements, from, to, now, withCosts: false });
  assert.equal(keeper.sold[0]!.cost, null);
  assert.equal(keeper.sold[0]!.profit, null);
  assert.equal(keeper.totals.cost, null);
  assert.equal(keeper.slow[0]!.value, null);
  assert.ok(!JSON.stringify(keeper).includes('30000'));
});

test('report periods are Lagos months', () => {
  const now = new Date('2026-12-01T00:30:00Z'); // 01:30 on 1 December in Lagos
  assert.equal(reportRange('this_month', now).from.toISOString(), '2026-11-30T23:00:00.000Z');
  assert.equal(reportRange('last_month', now).from.toISOString(), '2026-10-31T23:00:00.000Z');
  assert.equal(reportRange('nonsense', now).key, 'this_month');
});

test('stock that left without a parts request links to its sale or count', () => {
  assert.equal(stockOutPlace({ kind: 'COUNTER_SALE', counterSaleLine: { counterSale: { id: 's1', number: 'CS-2026-000001', buyerName: 'Musa', customerId: null } } }).href, '/inventory/counter-sales/s1');
  assert.equal(stockOutPlace({ kind: 'COUNT_SHORTFALL', stockCountLine: { stockCount: { id: 'c1', number: 'SC-2026-000001' } } }).href, '/inventory/stock-counts/c1');
});

test('who does what: the Store Keeper sells and counts, Front Desk sells and covers counting, only the Owner approves and sees costs', () => {
  const keeper = ROLE_GRANTS['store-keeper']!;
  assert.ok('store.counter.sell' in keeper && 'store.stock.count' in keeper && 'store.grn.record' in keeper);
  assert.ok(!('store.stock.approve' in keeper));
  for (const k of STORE_COST_PERMISSIONS) assert.ok(!(k in keeper));
  assert.ok('store.counter.sell' in ROLE_GRANTS['front-desk']!);
  assert.ok('store.stock.count' in OPTIONAL_ROLE_COVER['store-keeper']);
  assert.ok(!('store.stock.count' in (effectiveRoles(['front-desk'], ['store-keeper']).cover)));
  assert.ok('store.stock.count' in effectiveRoles(['front-desk'], []).cover);
  assert.ok('store.stock.approve' in ROLE_GRANTS.owner!);
  assert.ok(APPROVAL_PERMISSIONS.includes('store.stock.approve'));
  assert.equal(approvalArea({ id: 'stk-cnt-abc', title: '' }), 'Store');
});

test('no cost is read for anyone who may not see it (source)', () => {
  // Counter sales and stock counts never read a cost at all.
  for (const f of ['lib/actions/counter-sales.ts', 'lib/actions/stock-counts.ts', 'components/CounterSaleForm.tsx', 'components/StockCountForm.tsx']) {
    assert.doesNotMatch(read(f), /unitCost|totalCost|costPrice|\bcost:/, f);
  }
  // The report reads costs only when the viewer sees them.
  assert.match(read('lib/actions/parts-report.ts'), /const cost = withCosts \? \{ goodsReceiptLine: \{ select: \{ unitCost: true \} \} \} : \{\};/);
  // Outside costs: their own table, read and written only with the cost permission.
  const outside = read('lib/actions/outside-purchases.ts');
  assert.match(outside, /if \(!jc \|\| !\(await allows\(COST_KEY/);
  assert.match(outside, /await authorize\(COST_KEY, \{ branchId: jc\.branchId \}/);
  // The Store Keeper's goods receipt carries no cost; costs typed by them are ignored.
  const store = read('lib/actions/store.ts');
  assert.match(store, /const withCosts = await seesCosts\(input\.branchId\);/);
  assert.match(store, /const typedCost = withCosts \? line\.totalCost : null;/);
  // Pricing alerts and margin targets are emailed to those who see costs only.
  assert.match(store, /Costs and margins: only those who see costs \(the Owner\), never the Store Keeper\./);
  assert.match(store, /margin: seeCost\.has\(recipient\.email\) \? margin : null/);
});

test('every new action is fenced to the organisation and branch (source)', () => {
  const sales = read('lib/actions/counter-sales.ts');
  assert.match(sales, /authorize\('store\.counter\.sell', \{ branchId, homeBranch: true \}/);
  assert.match(sales, /canSeeRecord\(await viewKey\(\), \{ branchId: sale\.branchId \}/);
  assert.match(sales, /lockRows\(tx, 'partStockByPart', partIds\)/);
  const counts = read('lib/actions/stock-counts.ts');
  assert.match(counts, /authorize\('store\.stock\.approve', \{ branchId: sc\.branchId \}/);
  assert.match(counts, /You counted this stock, so someone else must approve it\./);
  assert.match(counts, /updateMany\(\{ where: \{ id: sc\.id, status: 'PENDING_APPROVAL' \}/);
});
