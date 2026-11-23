import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ratingIdFromToken } from '../lib/job-rating';

// The staff portal makes the link (apps/portal/lib/customer-care/rules.ts, ratingToken); the website checks it.
const portalToken = (id: string, secret: string) => `${id}.${createHmac('sha256', secret).update(`job-rating:${id}`, 'utf8').digest('base64url').slice(0, 32)}`;

test('a rating link made by the staff portal opens here; a changed one does not', () => {
  const id = 'cmwqzmabp000lmv608nt4ykav';
  const token = portalToken(id, 'shared-secret');
  assert.equal(ratingIdFromToken(token, 'shared-secret'), id);
  assert.equal(ratingIdFromToken(token, 'another-secret'), null);
  assert.equal(ratingIdFromToken(`${id}.${'A'.repeat(32)}`, 'shared-secret'), null);
  assert.equal(ratingIdFromToken('<script>', 'shared-secret'), null);
  assert.equal(ratingIdFromToken(token, ''), null, 'no secret configured: no link works');
});

test('the staff portal signs links exactly as this file expects', () => {
  const portal = readFileSync(join(__dirname, '..', '..', '..', 'portal', 'lib', 'customer-care', 'rules.ts'), 'utf8');
  assert.match(portal, /createHmac\('sha256', secret\)\.update\(`job-rating:\$\{ratingId\}`, 'utf8'\)\.digest\('base64url'\)\.slice\(0, 32\)/);
});

test('the rating page is never indexed and leaks no referrer', () => {
  const page = readFileSync(join(__dirname, '..', '..', 'app', 'rate', '[token]', 'page.tsx'), 'utf8');
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /referrer: 'no-referrer'/);
});
