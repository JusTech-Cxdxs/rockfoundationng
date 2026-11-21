/**
 * The D'Phoenix Autocare edition of the customer portal: the workshop is
 * on; inventory, warranty and the assembly plant are off
 * (apps/portal/lib/modules.ts), and the app is the customer portal only.
 * Checks: the website's copy of the module switches agrees with the
 * portal's, the root opens the customer portal sign-in and no marketing
 * page is left, and every warranty page, card and tool is gated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EDITION_MODULES, moduleOn } from '../lib/edition';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const KEYS = ['workshop', 'inventory', 'warranty', 'plant'] as const;

// ------------------------------------------------------------------ the rule

test('EDITION_MODULES follows the portal module registry: both files say the same thing about workshop, inventory, warranty and plant', () => {
  const portal = read(join('..', 'portal', 'lib', 'modules.ts'));
  assert.match(portal, /export function moduleIsOn\(key: string\): boolean \{\s*return platformModules\.find\(\(m\) => m\.key === key\)\?\.status !== 'DISABLED';/, 'the portal rule is "not DISABLED"');
  for (const key of KEYS) {
    const status = new RegExp(`\\{\\s*key: '${key}'[^}]*status: '([A-Z_]+)'`).exec(portal)?.[1];
    assert.ok(status, `apps/portal/lib/modules.ts lists the ${key} module with a status`);
    assert.equal(EDITION_MODULES[key], status !== 'DISABLED', `apps/website/lib/edition.ts must agree with apps/portal/lib/modules.ts about ${key} (${status})`);
    assert.equal(moduleOn(key), EDITION_MODULES[key]);
  }
  assert.match(read('lib/edition.ts'), /apps\/portal\/lib\/modules\.ts/, 'the copy says where the rule lives');
  // The D'Phoenix Autocare edition.
  assert.deepEqual({ ...EDITION_MODULES }, { workshop: true, inventory: false, warranty: false, plant: false });
});

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

// ------------------------------------------------------------------ warranty off

test('warranties: the routes are "not found", and the menu, cards, notices and Enyo tool are gated on the warranty module', () => {
  for (const page of ['warranties/page.tsx', 'warranties/[id]/page.tsx']) {
    const src = read(`app/customer-portal/dashboard/${page}`);
    const gate = src.indexOf("  if (!moduleOn('warranty')) notFound();\n  const me = await requireCustomer();");
    assert.ok(gate > 0, `${page} returns notFound() before anything else`);
    assert.ok(src.indexOf('loadWarranties(me.id)') > gate, `${page} reads nothing before the gate`);
  }
  assert.match(read('components/customer/PortalShell.tsx'), /ALL_NAV\.filter\(\(n\) => n\.href !== `\$\{BASE\}\/warranties` \|\| moduleOn\('warranty'\)\)/);
  assert.match(read('app/customer-portal/dashboard/page.tsx'), /moduleOn\('warranty'\) \? loadWarranties\(me\.id\) : Promise\.resolve\(\[\]/);
  assert.match(read('app/customer-portal/dashboard/vehicles/[id]/page.tsx'), /warrantyOn \? loadWarranties\(me\.id\) : Promise\.resolve\(\[\]/);
  assert.match(read('app/customer-portal/dashboard/vehicles/[id]/page.tsx'), /\{warrantyOn \? \(\n\s*<section>\n\s*<SectionTitle icon="shield" title="Warranties" \/>/);
  assert.match(read('components/customer/ServiceDetail.tsx'), /\{moduleOn\('warranty'\) && warranties\.length \? \(/);
  assert.match(read('lib/customer-portal/notifications.ts'), /moduleOn\('warranty'\) \? loadWarranties\(customer\.id\) : Promise\.resolve\(\[\]/);
  assert.match(read('lib/enyo/customer-tools.ts'), /\.\.\.\(moduleOn\('warranty'\) \? \[myWarranties\] : \[\]\)/);
});

// ------------------------------------------------------------------ D'Phoenix Autocare facts

test('the pages and the assistant use D\'Phoenix Autocare\'s own facts', () => {
  const facts = read('lib/content/dphoenix.ts');
  for (const fact of ['D\\\'PHOENIX AUTOCARE LIMITED', 'Restore Life To Your Vehicle', 'Plot 1 Muri Okunola Street', '+234 811 496 6212', '+234 807 654 4837', 'dphoenixautocare@gmail.com', 'https://www.dphoenixautocare.com']) {
    assert.ok(facts.includes(fact), fact);
  }
  assert.match(read('lib/enyo/company.ts'), /about: \{\n\s*company: `\$\{DPHOENIX\.legalName\}/);
  assert.match(read('app/privacy/page.tsx'), /const address = DPHOENIX\.address;/);
});
