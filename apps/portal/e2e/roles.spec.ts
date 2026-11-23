import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, MASTER, who } from './people';
import { as, open, signIn } from './helpers';

/**
 * What each of the seven roles is shown in the menu, and that typing an
 * address the menu does not offer is refused just the same. Every optional
 * role is on for the test organisation (e2e/seed.ts).
 */
const CASES: { role: string; sees: string[]; hidden: string[]; refused: string[] }[] = [
  { role: 'owner', sees: ['Dashboard', 'Workshop', 'Customers', 'Parts store', 'Gate', 'Business Analytics', 'Staff', 'Roles', 'Permissions', 'Business details', 'Departments', 'Settings', 'Audit Logs', 'Recycle bin'], hidden: [], refused: [] },
  { role: 'front-desk', sees: ['Dashboard', 'Workshop', 'Customers', 'Parts store'], hidden: ['Staff', 'Roles', 'Settings', 'Business Analytics', 'Gate'], refused: ['/users', '/permissions', '/analytics', '/security', '/settings'] },
  { role: 'workshop-supervisor', sees: ['Workshop', 'Customers', 'Parts store'], hidden: ['Staff', 'Roles', 'Gate', 'Business Analytics'], refused: ['/users', '/security', '/analytics'] },
  { role: 'technician', sees: ['Dashboard', 'Workshop', 'Parts store'], hidden: ['Customers', 'Staff', 'Roles', 'Business Analytics', 'Settings', 'Gate'], refused: ['/users', '/roles', '/analytics', '/settings', '/crm'] },
  { role: 'store-keeper', sees: ['Parts store', 'Workshop'], hidden: ['Customers', 'Staff', 'Roles', 'Gate'], refused: ['/users', '/crm', '/security'] },
  { role: 'accounts', sees: ['Workshop', 'Customers', 'Parts store'], hidden: ['Staff', 'Roles', 'Gate', 'Business Analytics'], refused: ['/users', '/settings', '/security', '/analytics'] },
  { role: 'security', sees: ['Gate'], hidden: ['Workshop', 'Customers', 'Parts store', 'Staff', 'Business Analytics'], refused: ['/workshop', '/crm', '/inventory', '/users'] },
];

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

for (const c of CASES) {
  test(`${c.role}: menu and direct addresses agree`, async ({ page }) => {
    await signIn(page, who(c.role).email, E2E_PASSWORD);
    for (const s of c.sees) await expect(nav(page).getByRole('link', { name: s, exact: true }), s).toBeVisible();
    for (const h of c.hidden) await expect(nav(page).getByRole('link', { name: h, exact: true }), h).toHaveCount(0);
    for (const url of c.refused) {
      await page.goto(url);
      await expect(page, url).toHaveURL(/\/access-denied/);
      await expect(page.getByRole('heading', { name: /don.t have access/ })).toBeVisible();
    }
  });
}

test('only the Owner sees cost prices: the Store Keeper is refused the pricing page', async ({ page }) => {
  await as(page, 'store-keeper');
  await page.goto('/inventory/pricing');
  await expect(page).toHaveURL(/\/access-denied/);
  await as(page, 'owner');
  await open(page, '/inventory/pricing');
  await expect(page).not.toHaveURL(/\/access-denied/);
});

test('the Master Administrator signs in and sees the platform', async ({ page }) => {
  await signIn(page, MASTER.email, MASTER.password);
  await expect(nav(page).getByRole('link', { name: 'Staff', exact: true })).toBeVisible();
});

test.describe('optional roles', () => {
  test.describe.configure({ mode: 'serial' });
  const securityCard = (page: Page) => page.getByTestId('optional-role-security');

  test('switching Security off: its holder gets nothing from it, and Front Desk covers the gate', async ({ page }) => {
    test.setTimeout(240_000);
    await as(page, 'owner');
    await open(page, '/roles');
    await expect(page.getByRole('heading', { name: 'Roles in use' })).toBeVisible();
    await expect(securityCard(page).getByText('On', { exact: true })).toBeVisible();
    await securityCard(page).getByRole('button', { name: 'Switch Security off' }).click();
    await expect(securityCard(page).getByText('Off', { exact: true })).toBeVisible();

    // The change reaches everyone within a minute (lib/authz/server.ts caches it briefly).
    await as(page, 'front-desk');
    await expect.poll(async () => {
      await page.goto('/dashboard');
      return nav(page).getByRole('link', { name: 'Gate', exact: true }).count();
    }, { timeout: 90_000, intervals: [5_000] }).toBe(1);
    await open(page, '/security');
    await expect(page).not.toHaveURL(/\/access-denied/);

    await as(page, 'security');
    await expect(nav(page).getByRole('link', { name: 'Gate', exact: true })).toHaveCount(0);
    await page.goto('/security');
    await expect(page).toHaveURL(/\/access-denied/);
  });

  test('switching Security back on gives the gate back to its holder; Front Desk no longer covers it', async ({ page }) => {
    test.setTimeout(240_000);
    await as(page, 'owner');
    await open(page, '/roles');
    await securityCard(page).getByRole('button', { name: 'Switch Security on' }).click();
    await expect(securityCard(page).getByText('On', { exact: true })).toBeVisible();
    await as(page, 'security');
    await expect.poll(async () => {
      await page.goto('/dashboard');
      return nav(page).getByRole('link', { name: 'Gate', exact: true }).count();
    }, { timeout: 90_000, intervals: [5_000] }).toBe(1);
    await as(page, 'front-desk');
    await expect(nav(page).getByRole('link', { name: 'Gate', exact: true })).toHaveCount(0);
  });

  test('the switches are the Owner’s alone', async ({ page }) => {
    await as(page, 'front-desk');
    await page.goto('/roles');
    await expect(page).toHaveURL(/\/access-denied/);
  });
});
