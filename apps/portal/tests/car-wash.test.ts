import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carWashPrices, carWashPrice, parseCarWashPriceForm, carWashLine, carWashNextStatuses } from '../lib/workshop/car-wash';

test('prices by package: known packages with a positive price only', () => {
  assert.deepEqual(carWashPrices({ FULL: 5000, EXTERIOR: '3000', DETAILING: 0, MADE_UP: 10, FULL_ENGINE: -1 }), { FULL: 5000, EXTERIOR: 3000 });
  assert.deepEqual(carWashPrices(null), {});
  assert.equal(carWashPrice({ FULL: 5000 }, 'FULL'), 5000);
  assert.equal(carWashPrice({ FULL: 5000 }, 'EXTERIOR'), null);
  assert.equal(carWashPrice({ FULL: 5000 }, null), null);
});

test('the Settings form', () => {
  const form = (o: Record<string, string>) => (k: string) => o[k];
  assert.deepEqual(parseCarWashPriceForm(form({ wash_FULL: '₦5,000', wash_EXTERIOR: '' })), { FULL: 5000 });
  assert.match(String(parseCarWashPriceForm(form({ wash_FULL: 'free' }))), /Full wash/);
});

test('one line, and the short way through', () => {
  assert.deepEqual(carWashLine('FULL', 5000), { type: 'LABOUR', description: 'Car wash — Full wash (inside and out)', quantity: 1, unitPrice: 5000, amount: 5000 });
  assert.deepEqual(carWashNextStatuses('IN_PROGRESS'), ['COMPLETED']);
  assert.deepEqual(carWashNextStatuses('COMPLETED'), ['CHECKED_OUT']);
  assert.deepEqual(carWashNextStatuses('READY_FOR_COLLECTION'), ['CHECKED_OUT']);
  assert.deepEqual(carWashNextStatuses('CHECKED_IN'), []);
});
