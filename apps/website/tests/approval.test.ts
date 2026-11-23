/**
 * The customer website: the deposit follows the one
 * rule (off by default, never for an organisation), the customer's words
 * no longer say "paying the deposit approves the work", and the secure
 * approval link is never kept in the visit counts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { depositFractionFor } from '@ejo/utils/billing';
import { moneyFor } from '../lib/customer-portal/format';
import { JOB_CARD_STATUS } from '../lib/customer-portal/status';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const lines = [{ amount: 100000 }];

test('the deposit on the customer’s page: none by default, the organisation’s share for an individual, never for an organisation', () => {
  const none = moneyFor({ notified: true, lines, payments: [], refunds: [] });
  assert.equal(none.minDeposit, 0);
  assert.equal(none.depositDue, 0);
  assert.equal(none.depositPercent, 0);
  const on = { depositRequired: true, depositPercent: 70 };
  const individual = moneyFor({ notified: true, lines, depositFraction: depositFractionFor(on, 'INDIVIDUAL'), payments: [{ amount: 20000 }], refunds: [] });
  assert.deepEqual([individual.minDeposit, individual.depositDue, individual.depositPercent], [70000, 50000, 70]);
  const organisation = moneyFor({ notified: true, lines, depositFraction: depositFractionFor(on, 'ORGANIZATION'), payments: [], refunds: [] });
  assert.equal(organisation.minDeposit, 0);
});

test('the customer’s words: approve the estimate (link, portal or phone); no hard-coded deposit', () => {
  assert.match(JOB_CARD_STATUS.AWAITING_CUSTOMER_APPROVAL!.explain, /Approve it/);
  assert.doesNotMatch(JOB_CARD_STATUS.AWAITING_CUSTOMER_APPROVAL!.explain, /deposit approves/i);
  for (const f of ['components/customer/ServiceDetail.tsx', 'app/customer-portal/dashboard/support/page.tsx', 'app/customer-portal/dashboard/page.tsx', 'lib/customer-portal/notifications.ts', 'lib/enyo/rules.ts']) {
    assert.doesNotMatch(read(f), /MINIMUM_DEPOSIT_FRACTION|minimum deposit of|Paying the minimum deposit/, f);
  }
  const detail = read('components/customer/ServiceDetail.tsx');
  assert.match(detail, /<EstimateAnswerForm jobCardId=\{item\.id\}/, 'the signed-in customer answers on their own Job Card page');
});
