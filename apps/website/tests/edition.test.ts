/**
 * This edition of the customer portal: the app is the customer portal only.
 * Checks: the root opens the customer portal sign-in and no marketing page
 * is left, and no warranty page is left.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

// ------------------------------------------------------------------ customer portal only

test('the root opens the customer portal sign-in; no marketing page, store, news or website search is left', () => {
  assert.match(read('app/page.tsx'), /redirect\('\/customer-portal'\);/);
  for (const p of ['about', 'businesses', 'careers', 'contact', 'investors', 'news', 'products', 'services', 'store', 'sustainability']) {
    assert.equal(existsSync(join(ROOT, 'app', p)), false, `app/${p} is gone`);
  }
  for (const f of ['lib/content/group.ts', 'lib/news', 'lib/store', 'lib/search-index.ts', 'lib/enyo/site-knowledge.ts', 'components/store']) {
    assert.equal(existsSync(join(ROOT, f)), false, `${f} is gone`);
  }
  const mw = read('middleware.ts');
  assert.doesNotMatch(mw, /MARKETING/);
  assert.match(mw, /matcher: \['\/customer-portal', '\/customer-portal\/:path\*', '\/api\/customer\/:path\*'\]/);
  // The header: the wordmark, the theme switch and the customer sign-in; no staff sign-in, language or page list.
  const header = read('components/Header.tsx');
  assert.match(header, /<ThemeToggle \/>/);
  assert.doesNotMatch(header, /employeeLogin|getPortalLoginUrl|LanguageSelector|siteNav|SearchModal/);
  const tools = read('lib/enyo/public-tools.ts') + read('lib/enyo/customer-tools.ts');
  assert.doesNotMatch(tools, /searchWebsiteTool/, 'Enyo has no website search');
});

// ------------------------------------------------------------------ no warranty

test('warranties are not part of this edition: no pages, menu entry, cards, notices or Enyo tool', () => {
  assert.equal(existsSync(join(ROOT, 'app', 'customer-portal', 'dashboard', 'warranties')), false);
  for (const f of ['components/customer/PortalShell.tsx', 'app/customer-portal/dashboard/page.tsx', 'app/customer-portal/dashboard/vehicles/[id]/page.tsx', 'components/customer/ServiceDetail.tsx', 'lib/customer-portal/notifications.ts', 'lib/customer-portal/data.ts', 'lib/enyo/customer-tools.ts']) {
    assert.doesNotMatch(read(f), /warrant/i, f);
  }
});

// ------------------------------------------------------------------ Rock Foundation Automobile facts

test('the pages and the assistant use Rock Foundation Automobile’s own published facts, and nothing invented', () => {
  const facts = read('lib/content/workshop.ts');
  for (const fact of ['ROCK FOUNDATION AUTOMOBILE INVESTMENT LTD', 'RC 1772429', 'Trust your vehicle to the certified service experts.', '1, Heal The World Avenue, Opp. Gateway Hotel, Ota, Ogun State', 'P.O. Box 257, Ota, Ogun State', '+234 803 304 9194', '+234 802 389 1766', 'https://rockfoundationng.com']) {
    assert.ok(facts.includes(fact), fact);
  }
  // No email or opening hours are published, so none are made up.
  assert.match(facts, /email: null as string \| null/);
  assert.match(facts, /hours: null as string \| null/);
  assert.match(read('lib/enyo/company.ts'), /about: \{\n\s*company: `\$\{WORKSHOP\.legalName\}, \$\{WORKSHOP\.rcNumber\}/);
  assert.match(read('app/privacy/page.tsx'), /const address = WORKSHOP\.address;/);
});
