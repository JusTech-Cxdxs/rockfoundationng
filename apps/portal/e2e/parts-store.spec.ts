import { test, expect } from '@playwright/test';
import { as, expectNoUrlError, readStock, waitOutcome } from './helpers';
import { SEED_PARTS } from './people';

/**
 * The parts store's own day (Phase 4): the Store Keeper sells over the
 * counter (stock comes off at once, a receipt with VAT), counts the shelf
 * and sends the difference to the Owner, who approves it; the Store Keeper
 * never sees a cost, and nobody approves their own count.
 */
test.describe.configure({ mode: 'serial' });

const part = SEED_PARTS.screenWash;
const S = { partUrl: '', countUrl: '', onHand: 0 };

test('the Store Keeper sells over the counter to a walk-in buyer', async ({ page }) => {
  await as(page, 'store-keeper');
  await page.goto('/inventory/parts');
  await page.getByRole('link', { name: part.name }).first().click();
  await page.waitForURL(/\/inventory\/parts\/[^/?]+/);
  S.partUrl = page.url().split('?')[0]!;
  S.onHand = (await readStock(page, S.partUrl)).onHand;

  await page.goto('/inventory/counter-sales/new');
  await page.locator('#buyerName').fill('Musa Ibrahim');
  await page.locator('#buyerPhone').fill('0803 555 0142');
  await page.getByTestId('counter-sale-part-search').fill(part.number);
  await page.getByRole('button', { name: `Add ${part.name}` }).click();
  await page.getByTestId('counter-sale-lines').locator('input[type=number]').fill('3');
  await expect(page.getByTestId('counter-sale-total')).toContainText('₦');
  await page.getByRole('button', { name: 'Record the sale' }).click();
  await waitOutcome(page, /\/inventory\/counter-sales\/[^/?]+\?status=sold/);
  expectNoUrlError(page);
  await expect(page.getByRole('heading', { name: /Sales receipt CS-\d{4}-\d{6}/ })).toBeVisible();
  await expect(page.getByText('Musa Ibrahim').first()).toBeVisible();
  await expect(page.getByText('₦7,500').first()).toBeVisible();
  // The receipt downloads as a PDF.
  const pdf = await page.request.get(`${page.url().split('?')[0]!.replace('/inventory/counter-sales/', '/api/counter-sales/')}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await readStock(page, S.partUrl)).onHand).toBe(S.onHand - 3);
});

test('more than is free in stock cannot be sold', async ({ page }) => {
  await as(page, 'store-keeper');
  await page.goto('/inventory/counter-sales/new');
  await page.locator('#buyerName').fill('Musa Ibrahim');
  await page.getByTestId('counter-sale-part-search').fill(part.number);
  await page.getByRole('button', { name: `Add ${part.name}` }).click();
  const qty = page.getByTestId('counter-sale-lines').locator('input[type=number]');
  await qty.evaluate((el) => el.removeAttribute('max'));
  await qty.fill('100000');
  await page.getByRole('button', { name: 'Record the sale' }).click();
  // Refused: back on the form with the reason (waitOutcome is for successes only).
  await page.waitForURL(/\/inventory\/counter-sales\/new\?error=/);
  await expect(page.getByText(/can be sold: the rest is not in stock or is kept for a job/)).toBeVisible();
});

test('the Store Keeper counts the shelf; a difference needs a reason and waits for the Owner', async ({ page }) => {
  await as(page, 'store-keeper');
  await page.goto('/inventory/stock-counts/new');
  const now = (await readStock(page, S.partUrl)).onHand;
  await page.goto('/inventory/stock-counts/new');
  await page.getByLabel(`On the shelf: ${part.name}`).fill(String(now - 2));
  await page.getByLabel(`Why: ${part.name}`).selectOption('Damaged');
  await page.getByRole('button', { name: 'Send the count' }).click();
  await waitOutcome(page, /\/inventory\/stock-counts\/[^/?]+\?status=recorded/);
  S.countUrl = page.url().split('?')[0]!;
  await expect(page.getByText('Waiting for the Owner').first()).toBeVisible();
  // The person who counted is never offered the decision.
  await expect(page.getByRole('button', { name: 'Approve the differences' })).toHaveCount(0);
  // Nothing moved yet.
  expect((await readStock(page, S.partUrl)).onHand).toBe(now);
  S.onHand = now;
});

test('the Owner approves the count from Approvals and the stock follows', async ({ page }) => {
  await as(page, 'owner');
  await page.goto('/approvals');
  await expect(page.getByText(/Approve the stock count — SC-/).first()).toBeVisible();
  // Settled first: the decision is clicked once the page is interactive.
  await page.goto(S.countUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Approve the differences' }).click();
  await waitOutcome(page, /status=approved/);
  await expect(page.getByText('Approved. The stock now matches the count.')).toBeVisible();
  expect((await readStock(page, S.partUrl)).onHand).toBe(S.onHand - 2);
});

test('the Store Keeper’s report has quantities and selling prices, never a cost', async ({ page }) => {
  await as(page, 'store-keeper');
  await page.goto('/inventory/reports');
  await expect(page.getByRole('heading', { name: 'Parts store report' })).toBeVisible();
  await expect(page.getByText(part.name).first()).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Cost' })).toHaveCount(0);
  await expect(page.getByText('Gross profit on parts')).toHaveCount(0);
  await as(page, 'owner');
  await page.goto('/inventory/reports');
  await expect(page.getByRole('columnheader', { name: 'Cost' })).toBeVisible();
});
