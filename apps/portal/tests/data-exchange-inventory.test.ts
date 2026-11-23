import { ROLE_GRANTS } from '../lib/authz/catalogue';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoMap, mappingProblems, unitWord } from '../lib/data-exchange/fields';
import { checkPartRow, checkStockRow, checkSupplierRow, parseAmount, partKey } from '../lib/data-exchange/check-inventory';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

test('amounts as accounting systems, Excel and people write them', () => {
  assert.equal(parseAmount('1,250.00'), 1250);
  assert.equal(parseAmount('₦1,250'), 1250);
  assert.equal(parseAmount('NGN 45 000.50'), 45000.5);
  assert.equal(parseAmount('100-'), -100); // a trailing minus
  assert.equal(parseAmount('(250)'), -250);
  assert.equal(parseAmount('1.2E+3'), 1200);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
});

test('common unit codes become the Store’s words', () => {
  assert.equal(unitWord('ST'), 'Piece');
  assert.equal(unitWord('ea'), 'Each');
  assert.equal(unitWord('L'), 'Litre');
  assert.equal(unitWord('CAR'), 'Carton');
  assert.equal(unitWord('drum'), 'Drum');
  assert.equal(unitWord(''), '');
});

test('a parts list maps itself; unit and tracking come through', () => {
  const m = autoMap('parts', ['Part number', 'Description', 'Category', 'Base unit', 'Tracking', 'Barcode', 'Reorder point', 'Safety stock', 'Alternative unit', 'Base units in the alternative unit', 'Number in the old system']);
  assert.deepEqual([m.partNumber, m.name, m.category, m.baseUnit, m.trackingType, m.barcode, m.reorderPoint, m.safetyStock, m.altUnit, m.altFactor, m.externalId], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const r = checkPartRow(['04465-02220', 'Brake pad set, front (Toyota Corolla)', 'BRAKES', 'ST', 'Batch', '', '4', '2', 'CAR', '10', 'BP-COR-F'], m);
  assert.equal(r.status, 'GOOD', JSON.stringify(r.issues));
  assert.deepEqual(r.values, { partNumber: '04465-02220', name: 'Brake pad set, front (Toyota Corolla)', category: 'BRAKES', baseUnit: 'Piece', trackingType: 'BATCH', barcode: null, sellingPrice: null, reorderPoint: 4, safetyStock: 2, altUnit: { name: 'Carton', factor: 10 }, externalId: 'BP-COR-F' });
  assert.deepEqual(r.keys, ['ext:BP-COR-F', 'part:04465-02220']);
});

test('parts: no part number or description rejects; gaps are notes', () => {
  const m = autoMap('parts', ['Part number', 'Description', 'Unit', 'Price']);
  assert.equal(checkPartRow(['', 'Filter', 'EA', ''], m).status, 'REJECTED');
  assert.equal(checkPartRow(['F-1', '', 'EA', ''], m).status, 'REJECTED');
  const gap = checkPartRow(['F-1', 'Oil filter', '', 'lots'], m);
  assert.equal(gap.status, 'WARNING');
  assert.equal(gap.values?.baseUnit, 'Piece');
  assert.equal(gap.values?.sellingPrice, null);
  assert.equal(gap.values?.externalId, null, 'no old-system number unless the file gives one');
  assert.equal(partKey(' ab  12 '), 'AB 12');
});

test('opening stock: cost from the stock value, or the unit cost per price unit; one line per part, batch and storage location', () => {
  const m = autoMap('stock', ['Part number', 'Quantity on hand', 'Unit', 'Stock value', 'Unit cost', 'Price unit', 'Batch', 'Storage location']);
  const byValue = checkStockRow(['04465-02220', '12', 'ST', '540,000.00', '45000', '1', '', '0001'], m);
  assert.equal(byValue.status, 'GOOD', JSON.stringify(byValue.issues));
  assert.equal(byValue.values?.totalValue, 540000);
  assert.equal(byValue.values?.unitCost, 45000);
  assert.deepEqual(byValue.keys, ['line:04465-02220||0001']);
  // Cost per 100 units (a price unit), no stock value.
  const per100 = checkStockRow(['BOLT-M10', '250', 'ST', '', '1500', '100', '', ''], m);
  assert.equal(per100.values?.unitCost, 15);
  assert.equal(per100.values?.totalValue, 3750);
  // A value and a unit cost that disagree: the value wins, with a note.
  const differ = checkStockRow(['X-1', '10', 'ST', '1000', '500', '1', '', ''], m);
  assert.equal(differ.status, 'WARNING');
  assert.equal(differ.values?.totalValue, 1000);
});

test('opening stock: negative, zero, missing cost and mismatched serials are rejected', () => {
  const m = autoMap('stock', ['Part number', 'Quantity', 'Stock value', 'Unit cost', 'Serial numbers']);
  assert.match(checkStockRow(['A', '5-', '100', '', ''], m).issues[0]!.message, /Negative stock/);
  assert.match(checkStockRow(['A', '0', '100', '', ''], m).issues[0]!.message, /zero/);
  assert.match(checkStockRow(['A', '5', '', '', ''], m).issues[0]!.message, /No cost/);
  assert.match(checkStockRow(['A', '2', '100', '', 'SN1; SN2; SN3'], m).issues.map((i) => i.message).join(' '), /3 serial numbers for a quantity of 2/);
  const ok = checkStockRow(['A', '2', '100', '', 'SN1, SN2'], m);
  assert.deepEqual(ok.values?.serials, ['SN1', 'SN2']);
  assert.deepEqual(ok.keys.slice(1), ['serial:SN1', 'serial:SN2']);
  assert.deepEqual(mappingProblems('stock', { partNumber: 0, quantity: 1, totalValue: null, unitCost: null }), ['Choose the column for the stock value or the unit cost: stock is valued at what it cost.']);
});

test('suppliers: a vendor list maps itself; name required', () => {
  const m = autoMap('suppliers', ['Supplier number', 'Name', 'Name, second line', 'Phone', 'Email', 'Address', 'City', 'Tax ID']);
  const r = checkSupplierRow(['0000300045', 'Ota Auto Parts', 'Limited', '+234 803 000 0001', 'orders@example.com', '12 Idiroko Road', 'Ota', ''], m);
  assert.equal(r.status, 'GOOD', JSON.stringify(r.issues));
  assert.equal(r.values?.externalId, '300045');
  assert.equal(r.values?.name, 'Ota Auto Parts Limited');
  assert.equal(r.values?.address, '12 Idiroko Road, Ota');
  assert.equal(checkSupplierRow(['1', '', '', '', '', '', '', ''], m).status, 'REJECTED');
});

test('opening stock goes in as an opening-balance goods receipt; its reversal checks nothing was issued', () => {
  const src = read('lib/data-exchange/inventory-server.ts');
  assert.match(src, /isOpeningBalance: true, importJobId: job\.id/);
  assert.match(src, /receivedAt = job\.asOf \?\? new Date\(\)/);
  // Parts with stock history (not made by this import) are refused, at the check and again when loading.
  assert.match(src, /This part already has stock history/);
  assert.match(src, /Stock was recorded for this part after the check/);
  assert.match(src, /ON CONFLICT \("partId"\) DO UPDATE SET "quantityOnHand" = part_stock\."quantityOnHand" \+ EXCLUDED\."quantityOnHand"/);
  const rev = src.slice(src.indexOf('export async function reverseStockBatch('));
  assert.match(rev, /quantityConsumptions: \{ some: \{\} \}/);
  assert.match(rev, /status: \{ not: 'IN_STOCK' \}/);
  assert.match(rev, /quantityReserved: \{ not: 0 \}/);
});

test('the Owner approves imports someone else prepared; a second person confirms opening stock and invoice history totals', () => {
  const src = read('lib/actions/data-exchange.ts');
  assert.match(src, /await authorize\(ENTITIES\[asEntity\(job\.entity\)\]\.needs, undefined, 'approveImport'/);
  assert.match(src, /if \(!run && !approve && !financeSigned\(job\.entity\)\) throw new DataExchangeError\('This import was not found\.'\);/);
  assert.match(src, /const financeSigned = \(e: string\): boolean => Boolean\(ENTITIES\[asEntity\(e\)\]\.financeSignOff\);/);
  assert.match(src, /You prepared or approved this import, so someone else in Finance confirms its totals\./);
  // Two people for every import: Front Desk prepares it, the Owner approves and loads it.
  for (const [slug, grants] of Object.entries(ROLE_GRANTS)) assert.equal(Boolean(grants['dataexchange.import.approve']), slug === 'owner', `${slug}: approves imports`);
  assert.equal(ROLE_GRANTS['front-desk']!['dataexchange.import.run'], 'BRANCH');
});

test('the Store’s lists stay fast with a catalogue of any size', () => {
  const store = read('lib/actions/store.ts');
  assert.match(store, /export async function listPartsPage\(/);
  assert.match(store, /skip: \(p - 1\) \* PARTS_PAGE_SIZE, take: PARTS_PAGE_SIZE/);
  assert.match(store, /export async function searchPartsForReceipt\([\s\S]{0,900}take: 25/);
  assert.match(store, /export async function listLowStockParts\([\s\S]{0,900}LIMIT 300/);
  assert.doesNotMatch(read('components/GoodsReceiptForm.tsx'), /parts: PartOption\[\]/);
  assert.match(read('app/(app)/inventory/parts/page.tsx'), /listPartsPage\(branchId, q, Number\(page\) \|\| 1, origin\)/);
});

test('long imports stay inside the flood limit and survive a dropped connection', () => {
  // Server: each check, load and undo request works in blocks for about two seconds, reading on from a row cursor.
  const src = read('lib/actions/data-exchange.ts');
  assert.match(src, /const STEP_BUDGET_MS = 2_500;/);
  assert.equal((src.match(/Date\.now\(\) - begun > STEP_BUDGET_MS\) break;/g) ?? []).length, 3);
  assert.match(src, /rowNumber: \{ gt \} \}, orderBy: \{ rowNumber: 'asc' \}, take: CHECK_BATCH/);
  assert.match(src, /writeRowResults\(tx, updates, 'PENDING'\)/);
  // Browser: retried for longer than the limit's one-minute window; uploads paced under 120 a minute.
  const view = read('components/data-exchange/ImportJobView.tsx');
  assert.match(view, /const RETRY_DELAYS_MS = \[2_000, 5_000, 10_000, 20_000, 30_000\];/);
  assert.match(view, /if \(busy\.current\) return null;/);
  const up = read('components/data-exchange/ImportUploader.tsx');
  assert.match(up, /const MIN_SEND_GAP_MS = 600;/);
  assert.match(up, /const RETRY_DELAYS_MS = \[2_000, 5_000, 10_000, 20_000, 40_000\];/);
  const mw = read('middleware.ts');
  assert.match(mw, /const MAX_POSTS = 120;/, 'the pacing above assumes this limit');
});
