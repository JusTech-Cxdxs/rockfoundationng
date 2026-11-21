import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NO_CUSTOMER_EMAIL, hasEmail } from '../lib/customer-email';

// A customer brought in from QuickBooks or an old spreadsheet may have no email.
// They are full customer records; nothing is ever sent to, or recorded as sent
// to, a missing address, and no made-up address is ever used.

// Compiled to apps/portal/.test-out/tests: four levels up is the repository.
const REPO = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

test('a real address is one with text in it', () => {
  assert.equal(hasEmail('ada@example.ng'), true);
  for (const x of [null, undefined, '', '   ']) assert.equal(hasEmail(x), false, String(x));
  assert.match(NO_CUSTOMER_EMAIL, /no email address on file/);
  assert.match(NO_CUSTOMER_EMAIL, /phone/);
});

test('the schema: email optional but unique, old-system numbers unique per organisation and per branch', () => {
  const schema = read('packages/database/prisma/schema.prisma');
  const customer = schema.slice(schema.indexOf('model Customer {'), schema.indexOf('model CustomerVehicle {'));
  assert.match(customer, /\n\s+email\s+String\?\s+@unique/);
  assert.match(customer, /@@unique\(\[organisationId, externalSource, externalId\]\)/);
  const part = schema.slice(schema.indexOf('model Part {'), schema.indexOf('model PartStock {'));
  assert.match(part, /@@unique\(\[branchId, externalSource, externalId\]\)/);
});

test('the email sender refuses a missing address instead of skipping it', () => {
  const src = read('apps/portal/lib/email.ts');
  assert.match(src, /export async function sendEmail\(to: string \| null \| undefined,/);
  assert.match(src, /if \(!to \|\| !to\.trim\(\)\) throw new NoEmailAddressError\(\);/);
});

test('reminder buttons stop before anything is recorded as sent when there is no email', () => {
  const cases: [string, string, string][] = [
    ['apps/portal/lib/actions/workshop.ts', 'sendApprovalReminder', 'jobCard'],
    ['apps/portal/lib/actions/workshop.ts', 'notifyOverdueCancelledVehicle', 'jobCard'],
    ['apps/portal/lib/actions/workshop.ts', 'sendReadyForCollectionReminder', 'jobCard'],
  ];
  for (const [file, fn, v] of cases) {
    const src = read(file);
    const start = src.indexOf(`export async function ${fn}(`);
    assert.ok(start >= 0, fn);
    const body = src.slice(start, src.indexOf('\nexport ', start + 10));
    const guard = body.indexOf(`if (!${v}.customer.email) throw`);
    assert.ok(guard > 0, `${fn} checks for an email`);
    const firstWrite = body.search(/await (writeAuditLog|prisma\.\w+\.(update|create|upsert|updateMany))\(/);
    assert.ok(firstWrite > guard, `${fn}: the check comes before the first write`);
  }
});

test('portal access, broadcasts and sign-in never use a missing address', () => {
  assert.match(read('apps/portal/lib/customer-access.ts'), /if \(!hasEmail\(customer\.email\)\) return \{ sent: false, reason: NO_CUSTOMER_EMAIL \};/);
  assert.match(read('apps/portal/lib/broadcast-delivery.ts'), /notifyByEmail: true, email: \{ not: null \}/);
  assert.match(read('apps/website/lib/auth-customer.ts'), /if \(!customer\.email\) return;/);
  assert.match(read('apps/website/lib/customer-portal/session.ts'), /if \(!c\.email\) return \{ state: 'none' \};/);
  // An email already on file can be changed but never removed (the customer signs in with it).
  assert.match(read('apps/portal/lib/actions/crm.ts'), /email: !before\.email && !\(input\.email \?\? ''\)\.trim\(\) \? null : cleanEmail\(input\.email\),/);
});

test('no made-up placeholder addresses anywhere in the app code', () => {
  for (const f of ['apps/portal/lib/actions/crm.ts', 'apps/portal/lib/actions/workshop.ts', 'apps/portal/lib/customer-access.ts']) {
    assert.doesNotMatch(read(f), /@(noemail|no-email|placeholder|example)\.(ng|com|invalid)/i, f);
  }
});
