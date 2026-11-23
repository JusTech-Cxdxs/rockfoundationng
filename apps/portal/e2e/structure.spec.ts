import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, who } from './people';
import { signIn } from './helpers';

test('organisation structure: departments are real, added and protected', async ({ page }) => {
  await signIn(page, who('owner').email, E2E_PASSWORD);
  await page.goto('/structure');
  await expect(page.getByRole('heading', { name: 'Organisation structure' })).toBeVisible();
  await expect(page.locator('article').getByText('Mechanical').first()).toBeVisible();
  const name = `Customer Care ${Date.now() % 10000}`;
  // Settings are read first: the add form opens on purpose.
  await page.getByText('+ Add a department').first().click();
  await page.getByRole('textbox', { name: /New department in/ }).first().fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).first().click();
  await expect(page.getByText('Department added.')).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();
  // A system department cannot be switched off (no button at all on the branch page): the Workshop.
  await page.getByRole('link', { name: 'Manage →' }).first().click();
  const workshop = page.getByRole('listitem').filter({ hasText: /^Workshop/ });
  await expect(workshop.getByRole('button', { name: 'Switch off' })).toHaveCount(0);
});
