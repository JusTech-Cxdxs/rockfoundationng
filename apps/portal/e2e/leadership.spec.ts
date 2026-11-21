import { test, expect } from '@playwright/test';
import { as, menuLinks, open, visitHealthy } from './helpers';

/**
 * Headquarters roles in a real browser: the branch bar on every page (all
 * branches, or one), Headquarters and Team performance following it, the IT
 * control room, Enyo's briefing buttons, and branch staff seeing none of it.
 */
test.describe.configure({ mode: 'serial' });

test('an executive chooses a branch in the bar; every page follows; All branches puts it back', async ({ page }) => {
  await as(page, 'executive');
  await visitHealthy(page, '/dashboard');
  const bar = page.getByTestId('branch-lens');
  await expect(bar).toBeVisible();
  const all = bar.getByRole('button', { name: /All branches/ });
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  const branch = bar.getByRole('button').nth(1);
  const name = ((await branch.textContent()) ?? '').trim();
  await branch.click();
  await expect(branch).toHaveAttribute('aria-pressed', 'true');
  await expect(bar).toContainText('only');

  await visitHealthy(page, '/headquarters');
  await expect(page.getByRole('status').filter({ hasText: 'only' }).first()).toBeVisible();
  await expect(page.getByTestId('branch-lens').getByRole('button', { pressed: true })).toContainText(name.slice(0, 6));
  await visitHealthy(page, '/headquarters/team');
  await expect(page.getByRole('heading', { name: 'Team performance', level: 1 })).toBeVisible();
  await visitHealthy(page, '/analytics');
  await visitHealthy(page, '/workshop');

  // Every branch in the bar can be chosen (whatever its id looks like) — on a page every branch has.
  await visitHealthy(page, '/dashboard');
  const chips = page.getByTestId('branch-lens').getByRole('button');
  const n = await chips.count();
  for (let i = 1; i < Math.min(n, 5); i += 1) {
    await chips.nth(i).click();
    await expect(chips.nth(i)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByTestId('branch-lens').getByRole('button', { name: /All branches/ }).click();
  await expect(page.getByTestId('branch-lens').getByRole('button', { name: /All branches/ })).toHaveAttribute('aria-pressed', 'true');
  await open(page, '/headquarters');
  await expect(page.getByRole('status').filter({ hasText: /Showing .* only/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Brief me' }).first()).toBeVisible();
});

const area = (page: import('@playwright/test').Page, name: string) => menuLinks(page).filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) });

test('branch staff see their own branch: no bar, no Headquarters, no IT control room', async ({ page }) => {
  await as(page, 'technician');
  await visitHealthy(page, '/dashboard');
  await expect(page.getByTestId('branch-lens')).toHaveCount(0);
  for (const url of ['/it', '/headquarters', '/headquarters/team']) {
    await page.goto(url);
    await expect(page, url).toHaveURL(/access-denied/);
  }
  await as(page, 'workshop-manager');
  await visitHealthy(page, '/dashboard');
  await expect(page.getByTestId('branch-lens')).toHaveCount(0);
});

test('the staff sign-in page says what the platform does', async ({ page }) => {
  await page.goto('/login');
  const panel = page.locator('main section').first();
  await expect(panel.getByText('One platform for every branch, every department, every role.')).toBeVisible();
  await expect(panel.getByText('Headquarters & analytics')).toBeVisible();
  await expect(panel.getByText('Nobody approves their own request')).toBeVisible();
});
