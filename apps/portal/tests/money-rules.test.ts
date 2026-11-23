import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ownerMustApprove, ownerApprovalWhy, parseOwnerApprovalAbove, creditable, vatInside, checkCreditAmount, credited,
  checkPosReference, ageingBucket, daysOutstanding, buildStatement,
} from '../lib/money/rules';

const lines = [{ billTo: 'CUSTOMER' }, { billTo: null }];

test('the supervisor’s check is enough unless the Owner must decide', () => {
  assert.deepEqual(ownerMustApprove({ setting: { ownerApprovesEstimates: false }, total: 500_000, discountNeedsOwner: false, lines }), []);
  assert.deepEqual(ownerMustApprove({ setting: null, total: 1, discountNeedsOwner: false, lines: [] }), []);
});

test('when set, the Owner approves every estimate', () => {
  assert.deepEqual(ownerMustApprove({ setting: { ownerApprovesEstimates: true }, total: 10, discountNeedsOwner: false, lines }), ['SETTING']);
});

test('above the amount set, the Owner approves (VAT included; the amount itself does not)', () => {
  const setting = { ownerApprovesEstimates: false, ownerApprovalAbove: '250000.00' };
  assert.deepEqual(ownerMustApprove({ setting, total: 250_000, discountNeedsOwner: false, lines }), []);
  assert.deepEqual(ownerMustApprove({ setting, total: 250_000.01, discountNeedsOwner: false, lines }), ['ABOVE_AMOUNT']);
  assert.deepEqual(ownerMustApprove({ setting: { ownerApprovalAbove: 0 }, total: 1, discountNeedsOwner: false, lines }), ['ABOVE_AMOUNT']);
  assert.deepEqual(ownerMustApprove({ setting: { ownerApprovalAbove: null }, total: 9e9, discountNeedsOwner: false, lines }), []);
});

test('a discount above the limit, lines the business pays for and a comeback always go to the Owner', () => {
  assert.deepEqual(ownerMustApprove({ setting: {}, total: 10, discountNeedsOwner: true, lines }), ['DISCOUNT']);
  for (const billTo of ['WARRANTY', 'GOODWILL', 'INTERNAL']) {
    assert.deepEqual(ownerMustApprove({ setting: {}, total: 10, discountNeedsOwner: false, lines: [...lines, { billTo }] }), ['NOT_CHARGED'], billTo);
  }
  assert.deepEqual(ownerMustApprove({ setting: {}, total: 10, discountNeedsOwner: false, lines, comeback: true }), ['COMEBACK']);
  const all = ownerMustApprove({ setting: { ownerApprovesEstimates: true, ownerApprovalAbove: 5 }, total: 10, discountNeedsOwner: true, lines: [{ billTo: 'WARRANTY' }], comeback: true });
  assert.deepEqual(all, ['SETTING', 'ABOVE_AMOUNT', 'DISCOUNT', 'NOT_CHARGED', 'COMEBACK']);
  assert.match(ownerApprovalWhy(['SETTING', 'DISCOUNT']), /^the Owner approves every estimate .* and it carries a discount above the limit$/);
});

test('the "Owner approves above" amount from the form', () => {
  assert.equal(parseOwnerApprovalAbove(''), null);
  assert.equal(parseOwnerApprovalAbove('₦250,000'), 250_000);
  assert.equal(parseOwnerApprovalAbove('0'), 0);
  assert.equal(parseOwnerApprovalAbove('-5'), 'invalid');
  assert.equal(parseOwnerApprovalAbove('abc'), 'invalid');
});

test('credit notes: what is left to credit, the VAT inside, the amount checked', () => {
  const notes = [{ amount: '10000', status: 'APPROVED' }, { amount: 5000, status: 'PENDING' }, { amount: 99_999, status: 'DECLINED' }];
  assert.equal(creditable(107_500, notes), 92_500);
  assert.equal(creditable(10_000, [{ amount: 12_000, status: 'APPROVED' }]), 0);
  assert.equal(vatInside(10_750, 7.5), 750);
  assert.equal(vatInside(10_000, 0), 0);
  assert.equal(checkCreditAmount('₦5,000', 92_500), 5000);
  assert.equal(checkCreditAmount('92500.004', 92_500), 92_500);
  assert.match(String(checkCreditAmount('92,501', 92_500)), /At most ₦92,500\.00/);
  assert.match(String(checkCreditAmount('0', 100)), /Enter the amount/);
  assert.match(String(checkCreditAmount('5', 0)), /Nothing is left/);
  assert.equal(credited(notes), 10_000);
  assert.equal(credited([{ amount: 1.005 }, { amount: 2 }]), 3.01);
});

test('POS payments carry the terminal reference', () => {
  assert.equal(checkPosReference('CASH', 'anything'), null);
  assert.equal(checkPosReference('POS', ' 0123 4567 89 '), '0123456789');
  assert.deepEqual(checkPosReference('POS', ''), { error: 'Enter the POS transaction reference (the RRN or STAN on the terminal slip).' });
  assert.ok(typeof checkPosReference('POS', '<script>') === 'object');
});

test('ageing: 0–30, 31–60, 61–90 and over 90 days, counted in Lagos days', () => {
  assert.equal(ageingBucket(0), 'CURRENT');
  assert.equal(ageingBucket(30), 'CURRENT');
  assert.equal(ageingBucket(31), 'D31_60');
  assert.equal(ageingBucket(60), 'D31_60');
  assert.equal(ageingBucket(61), 'D61_90');
  assert.equal(ageingBucket(90), 'D61_90');
  assert.equal(ageingBucket(91), 'D90_PLUS');
  // 23:30 Lagos on the 1st to 00:30 Lagos on the 2nd is one day.
  assert.equal(daysOutstanding(new Date('2026-11-01T22:30:00Z'), new Date('2026-11-01T23:30:00Z')), 1);
  assert.equal(daysOutstanding(new Date('2026-11-02T00:00:00Z'), new Date('2026-11-01T00:00:00Z')), 0);
});

test('the statement: balances after payments and credit notes, oldest first, totals per bucket', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const ago = (d: number) => new Date(+now - d * 86_400_000);
  const s = buildStatement([
    { invoiceNumber: 'INV-3', jobNumber: 'JC-3', issuedAt: ago(5), dueDate: ago(-25), total: 50_000, paid: 0, credited: 0 },
    { invoiceNumber: 'INV-1', jobNumber: 'JC-1', issuedAt: ago(100), dueDate: ago(70), total: 200_000, paid: 50_000, credited: 10_000 },
    { invoiceNumber: 'INV-2', jobNumber: 'JC-2', issuedAt: ago(45), dueDate: null, total: 30_000, paid: 30_000, credited: 0 },
    { invoiceNumber: 'INV-4', jobNumber: 'JC-4', issuedAt: ago(70), dueDate: ago(40), total: 10_000, paid: 8_000, credited: 5_000 },
  ], now);
  assert.deepEqual(s.rows.map((r) => r.invoiceNumber), ['INV-1', 'INV-3']);
  assert.equal(s.rows[0]!.balance, 140_000);
  assert.equal(s.rows[0]!.bucket, 'D90_PLUS');
  assert.equal(s.rows[0]!.overdue, true);
  assert.deepEqual(s.totals, { CURRENT: 50_000, D31_60: 0, D61_90: 0, D90_PLUS: 140_000 });
  assert.equal(s.owed, 190_000);
  assert.equal(s.overdue, 140_000);
});
