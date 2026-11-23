import { test, expect } from '@playwright/test';
import { as, BROKEN_PAGE_TEXT } from './helpers';
import type { Page } from '@playwright/test';
import { db } from './db';

/**
 * Money → QuickBooks: the Owner and Accounts export the sales and money for
 * QuickBooks; Front Desk and the Store Keeper are refused. The IIF file is
 * downloaded, every transaction in it balances, and its invoice totals match
 * what the page showed. Downloads are recorded, and a second export leaves
 * out what the first carried. Settings → QuickBooks keeps the account names;
 * QuickBooks Online shows "Not connected" (off unless the server is set up).
 */
const FAR_BACK = '2025-12-01';
const today = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10); // Lagos day

/** The page rendered: its heading, and none of the error texts (works on a dev server too). */
async function rendered(page: Page, heading: string) {
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  const body = await page.locator('main').innerText();
  for (const t of BROKEN_PAGE_TEXT) expect(body, t).not.toContain(t);
}

/** Every TRNS block balances: its amount plus its splits is zero, to the kobo. */
function unbalanced(iif: string): string[] {
  const bad: string[] = [];
  let sum: number | null = null; let doc = '';
  for (const line of iif.split(/\r?\n/)) {
    const c = line.split('\t');
    if (c[0] === 'TRNS') { sum = Math.round(Number(c[6]) * 100); doc = c[7] ?? ''; }
    else if (c[0] === 'SPL' && sum !== null) sum += Math.round(Number(c[6]) * 100);
    else if (c[0] === 'ENDTRNS') { if (sum !== 0) bad.push(doc); sum = null; }
  }
  return bad;
}

test.describe('QuickBooks export', () => {
  test.describe.configure({ mode: 'serial' });

  test('Front Desk and the Store Keeper cannot open it; Money shows them no QuickBooks tab', async ({ page }) => {
    for (const role of ['front-desk', 'store-keeper']) {
      await as(page, role);
      await page.goto('/money/quickbooks');
      await expect(page).toHaveURL(/access-denied/);
      await page.goto('/settings/quickbooks');
      await expect(page).toHaveURL(/access-denied/);
      const res = await page.request.get('/api/quickbooks/connect', { maxRedirects: 0 });
      expect(res.headers().location ?? '').not.toContain('intuit.com');
    }
    await as(page, 'front-desk');
    await page.goto('/money/statements');
    await expect(page.getByRole('navigation', { name: 'Money' }).getByRole('link', { name: 'QuickBooks' })).toHaveCount(0);
  });

  test('Accounts checks the figures, makes the IIF file and downloads it: it balances and matches the page', async ({ page }) => {
    await as(page, 'accounts');
    await page.goto(`/money/quickbooks?from=${FAR_BACK}&to=${today()}&kind=invoices&kind=payments&kind=creditNotes&kind=refunds&kind=counterSales&format=IIF`);
    await rendered(page, 'QuickBooks');
    const preview = page.getByTestId('qb-preview');
    await expect(preview).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Money' }).getByRole('link', { name: 'QuickBooks' })).toHaveAttribute('aria-current', 'page');
    const create = page.getByRole('button', { name: 'Create the IIF file' });
    test.skip(!(await create.isVisible()), 'no invoices or payments in the test data for these days');
    await create.click();
    await page.waitForURL(/\/money\/quickbooks\/exports\/[a-z0-9]+\?status=created/);
    const id = new URL(page.url()).pathname.split('/').pop()!;
    const row = await db().quickBooksExport.findUniqueOrThrow({ where: { id }, select: { number: true, counts: true, totals: true, kinds: true, sensitive: true, _count: { select: { records: true } } } });
    expect(row.number).toMatch(/^QBX-\d{4}-\d{6}$/);
    expect(row.sensitive).toBe(false);
    const counts = row.counts as Record<string, number>;
    const totals = row.totals as Record<string, number>;
    expect(row._count.records).toBe(Object.values(counts).reduce((s, n) => s + n, 0));

    const download = page.waitForEvent('download');
    await page.getByTestId('qb-files').getByRole('link', { name: 'Download' }).first().click();
    const d = await download;
    expect(d.suggestedFilename()).toBe(`${row.number}.iif`);
    const text = await (await d.createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8'));
    expect(unbalanced(text)).toEqual([]);
    const invoiceTrns = text.split(/\r?\n/).map((l) => l.split('\t')).filter((c) => c[0] === 'TRNS' && c[2] === 'INVOICE');
    expect(invoiceTrns.length).toBe(counts.invoices ?? 0);
    const invoiceSum = invoiceTrns.reduce((s, c) => s + Math.round(Number(c[6]) * 100), 0) / 100;
    expect(invoiceSum).toBeCloseTo(totals.invoices ?? 0, 2);
    // Dates are DD/MM/YYYY; no customer contact details in a file without the customer list.
    expect(invoiceTrns.every((c) => /^\d{2}\/\d{2}\/\d{4}$/.test(c[3]!))).toBe(true);
    expect(text).not.toContain('!CUST');
    await expect.poll(() => db().auditLog.count({ where: { entityType: 'QuickBooksExport', entityId: id, action: 'quickbooks.export_downloaded' } })).toBe(1);

    // The same days again: what the first export carried is left out.
    await page.goto(`/money/quickbooks?from=${FAR_BACK}&to=${today()}&kind=invoices&kind=payments&kind=creditNotes&kind=refunds&kind=counterSales&format=IIF`);
    await expect(page.getByTestId('qb-already')).toContainText('already exported');
    await expect(page.getByText('Nothing to export for these days.').first()).toBeVisible();
    await expect(page.getByTestId('qb-history').getByRole('link', { name: row.number })).toBeVisible();
  });

  test('the Owner sets the QuickBooks names; QuickBooks Online is not connected on this server', async ({ page }) => {
    await as(page, 'owner');
    await page.goto('/settings/quickbooks');
    await rendered(page, 'QuickBooks');
    await expect(page.getByTestId('qbo-connection')).toContainText('Not connected');
    await expect(page.getByTestId('qbo-connection')).toContainText('QBO_CLIENT_ID');
    const form = page.getByTestId('qb-settings-form');
    await form.locator('input[name="account_bank"]').fill('Undeposited Funds');
    await form.getByRole('button', { name: 'Save QuickBooks names' }).click();
    await expect(page.getByText('four different accounts')).toBeVisible();
    await form.locator('input[name="account_bank"]').fill('GTBank Current Account');
    await form.getByRole('button', { name: 'Save QuickBooks names' }).click();
    await expect(page.getByText('QuickBooks names saved.')).toBeVisible();
    await expect(form.locator('input[name="account_bank"]')).toHaveValue('GTBank Current Account');
    // Connecting is refused while the server is not set up: back to Settings, never to Intuit.
    const res = await page.request.get('/api/quickbooks/connect', { maxRedirects: 0 });
    expect(res.headers().location ?? '').toContain('/settings/quickbooks?error=');
  });

  test('a file of another organisation, or a made-up one, is not found', async ({ page }) => {
    await as(page, 'accounts');
    const res = await page.request.get('/api/quickbooks/exports/cmnotarealexport00000000/QBX-2026-000001.iif');
    expect(res.status()).toBe(404);
  });
});
