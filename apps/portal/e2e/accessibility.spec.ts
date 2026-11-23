import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { as, visitHealthy } from './helpers';
import { customerSignedIn, portal, websiteUp } from './customer';
import { PORTAL_CUSTOMER } from './people';

/**
 * Accessibility (docs/ACCESSIBILITY.md): axe's WCAG 2.0, 2.1 and 2.2 A/AA
 * rules and its best practices find nothing on the pages each role uses
 * most, in light and in dark. A failure lists each rule, what to fix and the
 * elements, so the cause is plain from the report.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function noViolations(page: Page, where: string) {
  for (const scheme of ['light', 'dark'] as const) {
    // Reduced motion: cards appear at once (they fade in otherwise), so axe sees the settled page.
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    // Both apps choose the theme before the first paint, so load the page again in it.
    await page.reload({ waitUntil: 'networkidle' });
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const report = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 5).map((n) => `    ${n.target.join(' ')} — ${n.failureSummary?.split('\n').slice(1, 2).join('').trim()}`).join('\n')}`).join('\n');
    expect(violations, `${where} [${scheme}]\n${report}`).toEqual([]);
  }
}

// Each role's everyday pages (the optional roles are all switched on in the test organisation).
const STAFF: [string, string[]][] = [
  ['owner', ['/dashboard', '/approvals', '/analytics', '/money/statements', '/warranty', '/roles']],
  ['front-desk', ['/dashboard', '/workshop/job-cards', '/workshop/bookings', '/crm/callbacks', '/crm/complaints', '/inventory/counter-sales/new']],
  ['workshop-supervisor', ['/dashboard', '/workshop/job-cards']],
  ['technician', ['/dashboard', '/workshop/job-cards']],
  ['store-keeper', ['/dashboard', '/inventory', '/inventory/parts', '/inventory/goods-receipts', '/inventory/stock-counts']],
  ['accounts', ['/dashboard', '/money/statements', '/money/credit-notes', '/money/quickbooks']],
  ['security', ['/security']],
];

for (const [role, urls] of STAFF) {
  test(`${role}: no accessibility violations on their main pages`, async ({ page }) => {
    await as(page, role);
    for (const url of urls) {
      await visitHealthy(page, url);
      await noViolations(page, url);
    }
  });
}

test('customer portal: no accessibility violations, signed out and in', async ({ page, request }) => {
  test.skip(!(await websiteUp(request)), 'the customer website is not running');
  await page.goto(portal(''));
  await noViolations(page, 'customer sign-in');
  await customerSignedIn(page, PORTAL_CUSTOMER);
  for (const path of ['/dashboard', '/dashboard/vehicles', '/dashboard/services', '/dashboard/payments', '/dashboard/profile']) {
    await page.goto(portal(path), { waitUntil: 'networkidle' });
    await noViolations(page, `customer ${path}`);
  }
});
