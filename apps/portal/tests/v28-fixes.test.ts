/**
 * Regression tests for defects found by the independent test programme
 * (E2E-07, LOG-01, CONC-01). Pure: no database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logFailure } from '../lib/log';
import { NUMBER_CLASH_TRIES, numberClashPause, retryOnNumberClash } from '../lib/integrity-core';

test('LOG-01: failure logs are one JSON line with emails masked and secrets removed', () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (line: string) => { lines.push(line); };
  try {
    logFailure('Email failed for ada.customer@example.com', new Error('auth failed password=hunter2 for postgres://u:p@db.host/x'), { to: 'boss@example.com' });
  } finally {
    console.error = original;
  }
  assert.equal(lines.length, 1);
  const out = JSON.parse(lines[0]!);
  const text = JSON.stringify(out);
  assert.equal(out.level, 'error');
  assert.ok(!text.includes('ada.customer@example.com') && text.includes('a***@example.com'));
  assert.ok(!text.includes('boss@example.com'));
  assert.ok(!text.includes('hunter2') && !text.includes('u:p@'));
});

test('CONC-01: number clashes are retried with a short random pause, then succeed', async () => {
  assert.ok(NUMBER_CLASH_TRIES >= 10);
  const t = Date.now();
  await numberClashPause(1);
  assert.ok(Date.now() - t < 500);
  let calls = 0;
  const value = await retryOnNumberClash('jobNumber', async () => {
    calls += 1;
    if (calls < 4) throw Object.assign(new Error('Unique constraint'), { code: 'P2002', meta: { target: ['jobNumber'] } });
    return 'JC-2026-000004';
  });
  assert.equal(value, 'JC-2026-000004');
  assert.equal(calls, 4);
});

test('SEC-01c: the seed never replaces an existing Master Admin password unless explicitly asked', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  const src = readFileSync(join(__dirname, '..', '..', '..', '..', 'packages', 'database', 'prisma', 'seed.ts'), 'utf8');
  const update = src.indexOf('prisma.account.update(');
  assert.ok(update > 0, 'the reset path exists');
  const guard = src.lastIndexOf("RESET_MASTER_ADMIN_PASSWORD === 'yes'", update);
  assert.ok(guard > 0, 'the only password update sits behind RESET_MASTER_ADMIN_PASSWORD=yes');
  assert.equal(src.split('prisma.account.update(').length - 1, 1, 'no other path updates the password');
  assert.ok(!/password:\s*requireEnv\('MASTER_ADMIN_PASSWORD'\)/.test(src), 'the password is not required on every run');
});
