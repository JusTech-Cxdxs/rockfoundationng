import { test, expect, type Page } from '@playwright/test';
import { as, expectHealthy, open } from './helpers';

/**
 * Each role sees its own job (docs/ROLES_AND_ACCESS.md): every dashboard
 * shows that person's own numbers and, for those who decide things, the
 * Approvals list; the gate is Security's; cost prices and the set-up are the
 * Owner's; Front Desk works the Support centre but not its set-up.
 */

const main = (page: Page) => page.getByRole('navigation', { name: 'Main' });

const DASHBOARDS: { role: string; tiles: string[]; jobs?: boolean; approvals?: boolean }[] = [
  { role: 'owner', tiles: ['Jobs in the workshop', 'Closed this month'], jobs: true, approvals: true },
  { role: 'front-desk', tiles: ['Ready for collection', 'Opened by me this month', 'Payments I recorded this month'] },
  { role: 'workshop-supervisor', tiles: ['Jobs I supervise', 'My jobs in progress'], jobs: true, approvals: true },
  { role: 'technician', tiles: ['My jobs in progress', 'Completed this month', 'Average time per job', 'My parts requests open'], jobs: true },
  { role: 'store-keeper', tiles: ['Parts requests for the Store', 'Parts at or below reorder point'], approvals: true },
  { role: 'accounts', tiles: ['Payments I recorded this month'] },
  { role: 'security', tiles: ['Vehicles ready to leave'] },
];

for (const d of DASHBOARDS) {
  test(`dashboard: ${d.role} sees their own numbers`, async ({ page }) => {
    await as(page, d.role);
    await open(page, '/dashboard');
    const numbers = page.locator('[aria-label="My numbers"]');
    await expect(numbers).toBeVisible();
    for (const t of d.tiles) await expect(numbers.getByText(t, { exact: true }), t).toBeVisible();
    await expect(page.locator('#my-jobs')).toHaveCount(d.jobs ? 1 : 0);
    if (d.approvals) await expect(page.getByRole('link', { name: /Open Approvals/ })).toBeVisible();
    else await expect(page.getByRole('link', { name: /Open Approvals/ })).toHaveCount(0);
    await expectHealthy(page, `/dashboard (${d.role})`);
  });
}

test('the gate is Security’s: a technician is not offered it and is refused it', async ({ page }) => {
  await as(page, 'technician');
  await expect(main(page).getByRole('link', { name: 'Gate', exact: true })).toHaveCount(0);
  for (const url of ['/security', '/security/vehicles', '/security/vehicles-inside']) {
    await page.goto(url);
    await expect(page, url).toHaveURL(/\/access-denied/);
  }
  await as(page, 'security');
  await open(page, '/security');
  await expect(page.getByRole('heading', { name: 'Gate', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cleared to leave' })).toBeVisible();
});

test('the workshop floor never sees what parts cost', async ({ page }) => {
  for (const role of ['technician', 'workshop-supervisor', 'front-desk', 'store-keeper', 'accounts']) {
    await as(page, role);
    for (const url of ['/inventory/pricing', '/inventory/analytics', '/analytics']) {
      await page.goto(url);
      await expect(page, `${role} ${url}`).toHaveURL(/\/access-denied/);
    }
  }
});

test('the Roles page explains each role before it is given', async ({ page }) => {
  await as(page, 'owner');
  await open(page, '/roles');
  const card = (name: string) => page.locator('main li').filter({ has: page.getByRole('heading', { name, exact: true, level: 3 }) }).last();
  await expect(card('Technician')).toContainText('Sees and works only on the jobs assigned to them');
  await expect(card('Technician')).toContainText('can do');
  await expect(card('Owner / GMD')).toContainText('can approve');
  await expect(card('Front Desk / Customer Care')).toContainText('Always on');
});

test('Front Desk works the Support centre but never its set-up', async ({ page }) => {
  await as(page, 'front-desk');
  await open(page, '/crm/support');
  await expect(page.getByRole('heading', { name: /Support centre/, level: 1 })).toBeVisible();
  await page.goto('/settings/support');
  await expect(page).toHaveURL(/\/access-denied/);
});

test('the Owner sees the whole business and every setting', async ({ page }) => {
  await as(page, 'owner');
  for (const url of ['/dashboard', '/analytics', '/approvals', '/users', '/roles', '/settings', '/organisation', '/audit-logs', '/recycle-bin', '/integrity', '/inventory/pricing']) {
    await open(page, url);
    await expect(page, url).not.toHaveURL(/\/access-denied/);
    await expectHealthy(page, url);
  }
  // The top bar names the role as people say it.
  await expect(page.getByText(/^Owner( · .+)?$/).first()).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  for (const { role, urls } of [
    { role: 'technician', urls: ['/dashboard', '/workshop/job-cards'] },
    { role: 'front-desk', urls: ['/dashboard', '/workshop/job-cards', '/crm'] },
    { role: 'owner', urls: ['/dashboard', '/approvals', '/roles'] },
    { role: 'security', urls: ['/dashboard', '/security'] },
  ]) {
    test(`${role}: no sideways scroll`, async ({ page }) => {
      await as(page, role);
      for (const url of urls) {
        await page.goto(url);
        await page.locator('main h1').first().waitFor({ timeout: 20_000 });
        await expectHealthy(page, url);
        const { scroll, inner } = await page.evaluate(() => ({ scroll: document.scrollingElement!.scrollWidth, inner: window.innerWidth }));
        expect(scroll, `${url}: page scrolls sideways (${scroll} > ${inner})`).toBeLessThanOrEqual(inner + 1);
      }
    });
  }
});
