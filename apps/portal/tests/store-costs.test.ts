/**
 * Cost prices are the Owner's (and whoever the Owner grants "See cost prices"):
 * the Store Keeper records goods receipts but never sees what they cost. This
 * reads the source, so a new cost column or a widened grant fails CI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLE_GRANTS, STORE_COST_PERMISSIONS } from '../lib/authz/catalogue';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

test('the Store Keeper records goods receipts but holds no cost permission', () => {
  const grants = ROLE_GRANTS['store-keeper'] ?? {};
  assert.ok('store.grn.record' in grants);
  for (const k of STORE_COST_PERMISSIONS) assert.ok(!(k in grants), `store-keeper must not hold ${k}`);
  for (const k of STORE_COST_PERMISSIONS) assert.ok(k in (ROLE_GRANTS.owner ?? {}), `the Owner holds ${k}`);
});

test('every cost column in an export is left out for people who may not see costs', () => {
  const kinds = read('lib/exports/kinds.ts');
  const costColumns = kinds.split('\n').filter((l) => /header: '[^']*\bcost\b/i.test(l));
  assert.ok(costColumns.length >= 5, 'the cost columns are found');
  for (const l of costColumns) assert.match(l, /needs: STORE_COST_PERMISSIONS/, l.trim());
  // The file is written with only the columns the downloader may see.
  assert.match(read('lib/exports/download-server.ts'), /c\.kind\.columns\.filter\(\(_, i\) => allowed\[i\]\)/);
});

test('a goods receipt is open to the Store Keeper, its costs are not', () => {
  const store = read('lib/actions/store.ts');
  assert.match(store, /const GRN_VIEW: readonly PermissionKey\[\] = \['store\.grn\.record', \.\.\.STORE_COST_PERMISSIONS\]/);
  // Costs are blanked on the server before the page sees them, and correcting one needs the cost permission.
  assert.match(store, /canSeeCosts \? receipt\.lines : receipt\.lines\.map\([\s\S]{0,80}\(\{ \.\.\.l, unitCost: null, totalCost: null \}\)\)/);
  assert.match(store, /export async function updateGoodsReceiptLineCost[\s\S]{0,1200}if \(!\(await seesCosts\(line\.part\.branchId\)\)\) await authorize\(STORE_COST_PERMISSIONS\[0\]!/);
  for (const page of ['app/(app)/inventory/goods-receipts/page.tsx', 'app/(app)/inventory/goods-receipts/[id]/page.tsx']) {
    assert.match(read(page), /guardAnyPage\(\['store\.grn\.record', \.\.\.STORE_COST_PERMISSIONS\]/, page);
  }
});

test('store emails carry costs and margins only to the Owner', () => {
  const store = read('lib/actions/store.ts');
  // A new selling price: everyone hears of it; the margin and target only in the Owner's copy.
  const priceEmails = store.split('renderPartSellingPriceSetEmail({').slice(1);
  assert.equal(priceEmails.length, 2);
  for (const e of priceEmails) assert.match(e.slice(0, 900), /targetMarginPercent: recipient\.seesCosts \? /);
  assert.match(priceEmails[0]!.slice(0, 900), /margin: recipient\.seesCosts \? margin : null/);
  // Target margins and pricing alerts (unit costs) go to the Owner alone.
  for (const marker of ['renderPartTargetMarginSetEmail({', 'renderPricingAlertRaisedEmail({']) {
    const before = store.slice(0, store.indexOf(marker));
    const block = before.slice(before.lastIndexOf('const recipients'));
    assert.match(block, /for \(const staffMember of managers\.staff\) recipients\.set/, marker);
    assert.doesNotMatch(block, /officers\.staff/, marker);
  }
});
