import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  afterJobDueAt, birthdayText, complaintCategoryLabel, dedupe, followUpBucket, isBirthdayOn, isLowRating, isScore,
  lagosAt, lagosDay, nextTry, parseBirthday, ratingIdFromToken, ratingMessage, ratingToken, MAX_ATTEMPTS,
} from '../lib/customer-care/rules';

test('Lagos days: an instant late in the UTC evening is already tomorrow in Lagos', () => {
  assert.equal(lagosDay(new Date('2026-11-20T23:30:00Z')), '2026-11-21');
  assert.equal(lagosAt('2026-11-21', 10).toISOString(), '2026-11-21T09:00:00.000Z');
});

test('the after-the-job call is two days after collection, at 10:00 in Lagos', () => {
  assert.equal(afterJobDueAt(new Date('2026-11-20T16:00:00Z')).toISOString(), '2026-11-22T09:00:00.000Z');
});

test('callback list: overdue, today and upcoming by Lagos day', () => {
  const now = new Date('2026-11-21T09:00:00Z'); // 10:00 Lagos
  assert.equal(followUpBucket(new Date('2026-11-20T09:00:00Z'), now), 'overdue');
  assert.equal(followUpBucket(new Date('2026-11-21T14:00:00Z'), now), 'today');
  assert.equal(followUpBucket(new Date('2026-11-21T05:00:00Z'), now), 'overdue', 'due more than two hours ago today');
  assert.equal(followUpBucket(new Date('2026-11-22T09:00:00Z'), now), 'upcoming');
});

test('no answer: tomorrow in working hours, closed after the last try', () => {
  const now = new Date('2026-11-21T19:30:00Z'); // 20:30 Lagos
  const first = nextTry(now, 0);
  assert.equal(first.closeAsNoAnswer, false);
  assert.equal(first.dueAt.toISOString(), '2026-11-22T16:00:00.000Z', 'capped at 17:00 Lagos');
  assert.equal(nextTry(now, MAX_ATTEMPTS - 1).closeAsNoAnswer, true);
});

test('birthdays: day/month only, checked, and 29 February called on 28 February in other years', () => {
  assert.deepEqual(parseBirthday('14/2'), { day: 14, month: 2 });
  assert.equal(parseBirthday(''), null);
  assert.equal(typeof parseBirthday('31/04'), 'string');
  assert.equal(typeof parseBirthday('June 3'), 'string');
  assert.equal(birthdayText(3, 6), '03/06');
  assert.equal(isBirthdayOn(14, 2, '2027-02-14'), true);
  assert.equal(isBirthdayOn(29, 2, '2027-02-28'), true);
  assert.equal(isBirthdayOn(29, 2, '2028-02-28'), false);
});

test('ratings: scores 1 to 5, and 3 or less opens a complaint', () => {
  assert.equal(isScore(5), true);
  assert.equal(isScore(0), false);
  assert.equal(isScore(4.5), false);
  assert.equal(isLowRating(3), true);
  assert.equal(isLowRating(4), false);
  assert.equal(isLowRating(null), false);
});

test('rating links: signed with the secret; a changed id, signature or secret is refused', () => {
  const id = 'cmwqzmabp000lmv608nt4ykav';
  const token = ratingToken(id, 'secret-a');
  assert.equal(ratingIdFromToken(token, 'secret-a'), id);
  assert.equal(ratingToken(id, 'secret-a'), token, 'the same link every time');
  assert.equal(ratingIdFromToken(token, 'secret-b'), null);
  assert.equal(ratingIdFromToken(token.replace(id, 'cmwqzmabp000lmv608nt4ykaw'), 'secret-a'), null);
  assert.equal(ratingIdFromToken('../../etc/passwd', 'secret-a'), null);
  assert.equal(ratingIdFromToken(token, ''), null);
});

test('one automatic callback per occasion', () => {
  assert.equal(dedupe.birthday('c1', '2026'), 'birthday:c1:2026');
  assert.notEqual(dedupe.afterJob('j1'), dedupe.afterJob('j2'));
});

test('the "How did we do?" message greets by first name, or by company for a fleet', () => {
  const m = ratingMessage({ customerName: 'Chiamaka Obi', organisation: false, vehicle: 'Toyota Corolla (LND 123 AB)', jobNumber: 'JC-2026-000042', link: 'https://example.com/rate/x', workshop: 'Rock Foundation Automobile' });
  assert.match(m, /^Hello Chiamaka,/);
  assert.match(m, /https:\/\/example\.com\/rate\/x/);
  assert.match(ratingMessage({ customerName: 'Adeyemi Logistics Ltd', organisation: true, vehicle: 'a', jobNumber: 'b', link: 'c', workshop: 'd' }), /^Hello Adeyemi Logistics Ltd,/);
  assert.equal(complaintCategoryLabel('DELAY'), 'Delay');
});
