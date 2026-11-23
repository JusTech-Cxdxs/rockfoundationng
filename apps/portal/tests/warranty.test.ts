import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  warrantyTerms, parseWarrantyForm, guaranteeAtCheckout, guaranteeRuns, comebackCandidates, termText, partWarrantyText,
  guaranteeText, parsePartWarranty, comebackRate, DEFAULT_WARRANTY,
} from '../lib/money/warranty';

const DAY = 86_400_000;

test('the terms: stored values over the defaults; anything malformed is ignored', () => {
  assert.deepEqual(warrantyTerms(null), DEFAULT_WARRANTY);
  const t = warrantyTerms({ SERVICE: { days: 45, km: '2,000' }, REPAIR: { days: -1, km: 'x' }, NONSENSE: { days: 1 } });
  assert.deepEqual(t.SERVICE, { days: 45, km: 2000 });
  assert.deepEqual(t.REPAIR, { days: null, km: null });
  assert.deepEqual(t.SPRAYING, DEFAULT_WARRANTY.SPRAYING);
  assert.deepEqual(warrantyTerms([1, 2]), DEFAULT_WARRANTY);
});

test('the Settings form: blank is no guarantee; bad numbers are refused', () => {
  const form = (o: Record<string, string>) => (k: string) => o[k];
  const ok = parseWarrantyForm(form({ days_SERVICE: '30', km_SERVICE: '1,000', days_SPRAYING: '365' }));
  assert.ok(typeof ok === 'object');
  assert.deepEqual(ok.SERVICE, { days: 30, km: 1000 });
  assert.deepEqual(ok.CAR_WASH, { days: null, km: null });
  assert.match(String(parseWarrantyForm(form({ days_REPAIR: '9999' }))), /whole days/);
  assert.match(String(parseWarrantyForm(form({ km_REPAIR: '1.5' }))), /whole kilometres/);
});

test('the guarantee is fixed at checkout from the check-in mileage', () => {
  const out = new Date('2026-11-23T10:00:00Z');
  const g = guaranteeAtCheckout({ days: 90, km: 5000 }, out, 61_250);
  assert.equal(+g.until!, +out + 90 * DAY);
  assert.equal(g.untilKm, 66_250);
  assert.deepEqual(guaranteeAtCheckout({ days: null, km: 5000 }, out, null), { until: null, untilKm: null });
  assert.deepEqual(guaranteeAtCheckout({ days: null, km: null }, out, 10), { until: null, untilKm: null });
});

test('whichever comes first: past the date or past the mileage, it has ended', () => {
  const now = new Date('2026-11-23T10:00:00Z');
  const g = { warrantyUntil: new Date(+now + DAY), warrantyUntilKm: 66_250 };
  assert.equal(guaranteeRuns(g, now, 66_000), true);
  assert.equal(guaranteeRuns(g, now, 66_251), false);
  assert.equal(guaranteeRuns(g, now, null), true);
  assert.equal(guaranteeRuns({ ...g, warrantyUntil: new Date(+now - 1) }, now, 1), false);
  assert.equal(guaranteeRuns({ warrantyUntil: null, warrantyUntilKm: null }, now, 1), false);
  assert.equal(guaranteeRuns({ warrantyUntil: null, warrantyUntilKm: 100 }, now, 99), true);
});

test('a comeback is offered on checked-out jobs whose guarantee runs, newest first', () => {
  const now = new Date('2026-11-23T10:00:00Z');
  const job = (id: string, daysAgo: number, untilDays: number | null, status = 'CHECKED_OUT') => ({
    id, jobNumber: id, jobType: 'REPAIR', status, checkedOutAt: new Date(+now - daysAgo * DAY),
    warrantyUntil: untilDays === null ? null : new Date(+now + untilDays * DAY), warrantyUntilKm: null,
  });
  const out = comebackCandidates([job('old', 60, 30), job('new', 5, 85), job('ended', 200, -110), job('open', 1, 89, 'IN_PROGRESS'), job('wash', 2, null)], now);
  assert.deepEqual(out.map((j) => j.id), ['new', 'old']);
});

test('words on the invoice', () => {
  assert.equal(termText({ days: 90, km: 5000 }), '3 months or 5,000 km, whichever comes first');
  assert.equal(termText({ days: 365, km: null }), '1 year');
  assert.equal(termText({ days: 30, km: null }), '30 days');
  assert.equal(termText({ days: null, km: null }), 'No guarantee');
  assert.equal(partWarrantyText(6, 10_000), '6 months or 10,000 km, whichever comes first');
  assert.equal(partWarrantyText(1, null), '1 month');
  assert.equal(partWarrantyText(null, null), null);
  assert.equal(guaranteeText({ warrantyUntil: new Date('2027-02-21T10:00:00Z'), warrantyUntilKm: 66_250 }), 'until 21/02/2027 or 66,250 km, whichever comes first');
  assert.equal(guaranteeText({ warrantyUntil: null, warrantyUntilKm: null }), null);
});

test('a part’s warranty from the form, and the comeback rate', () => {
  assert.deepEqual(parsePartWarranty('6', ''), { months: 6, km: null });
  assert.deepEqual(parsePartWarranty('', ''), { months: null, km: null });
  assert.match(String(parsePartWarranty('121', '')), /1 to 120/);
  assert.equal(comebackRate(3, 40), 7.5);
  assert.equal(comebackRate(0, 0), null);
});

import { claimNext, checkClaim, checkRecovered } from '../lib/money/warranty';

test('supplier claims: the steps, and what a claim needs', () => {
  assert.deepEqual(claimNext('OPEN'), ['SUBMITTED', 'SETTLED', 'REJECTED']);
  assert.deepEqual(claimNext('SUBMITTED'), ['SETTLED', 'REJECTED']);
  assert.deepEqual(claimNext('SETTLED'), []);
  assert.deepEqual(claimNext('REJECTED'), []);
  const ok = checkClaim({ partName: 'Alternator', supplierName: 'Ota Motor Parts', quantity: '1', amountClaimed: '₦85,000', fault: 'Stopped charging after two weeks' });
  assert.deepEqual(ok, { partName: 'Alternator', supplierName: 'Ota Motor Parts', quantity: 1, amountClaimed: 85_000, fault: 'Stopped charging after two weeks' });
  assert.match(String(checkClaim({ partName: '', supplierName: 'x', quantity: 1, amountClaimed: 1, fault: 'xxxxx' })), /part that failed/);
  assert.match(String(checkClaim({ partName: 'Pads', supplierName: 'Shop', quantity: '1.5', amountClaimed: 1, fault: 'worn out' })), /whole number/);
  assert.match(String(checkClaim({ partName: 'Pads', supplierName: 'Shop', quantity: 1, amountClaimed: 0, fault: 'worn out' })), /cost us/);
  assert.equal(checkRecovered('85,000', 85_000), 85_000);
  assert.equal(checkRecovered('0', 85_000), 0);
  assert.match(String(checkRecovered('90000', 85_000)), /cannot be more/);
});
