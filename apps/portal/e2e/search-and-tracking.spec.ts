import { test, expect, type Page } from '@playwright/test';
import { as, uniq, open } from './helpers';
import { db } from './db';
import { who } from './people';

/**
 * Search and tracking: a record is found by the number the old system gave
 * it, every match labelled with its kind (and, for invoices, its year); each
 * record says where it came from; the lists filter by source, import and
 * dates; Data Exchange shows its days; the analytics can leave the history
 * from before EJO out.
 */
test.describe.configure({ mode: 'serial' });

const T = uniq().replace(/[^A-Z0-9]/g, '').slice(-6);
const STAMP = String(Date.now()).slice(-7);
const custNo = `7${STAMP}`; // a fresh old-system customer number for this run
const invNo = `5${STAMP.slice(-6)}`; // an old-system invoice number
/** How search labels a number another system gave. */
const SRC = 'Old system';
/** How the customer page and the lists' Source filter name an import. */
const IMPORTED = 'Imported from the old system or a spreadsheet';
const SOURCE_KEY = 'legacy';
const NAME = `Tracked Haulage ${T}`;
const csv = (rows: string[][]) => rows.map((r) => r.join(',')).join('\r\n');

async function importFile(page: Page, entity: string, name: string, body: string, opts: { branchId?: string } = {}): Promise<string> {
  await as(page, 'owner');
  await open(page, `/data-exchange/new?entity=${entity}`);
  await expect(page.locator('#import-file')).toHaveCount(1);
  if (opts.branchId) await page.locator('#import-branch').selectOption(opts.branchId);
  await page.locator('#import-file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(body) });
  await page.waitForURL(/\/data-exchange\/imports\/[^/?]+$/, { timeout: 60_000 });
  const url = page.url();
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /Send for approval/ }).click();
  await as(page, 'owner');
  await open(page, url);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Start loading' }).click();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 90_000 });
  return url;
}

async function search(page: Page, q: string) {
  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill(q);
  const panel = box.locator('xpath=ancestor::div[2]');
  await expect(panel.getByRole('listbox', { name: 'Search results' }).or(panel.getByText(/^Nothing found for/)).first()).toBeVisible();
  await expect(panel.getByRole('status', { name: 'Searching' })).toHaveCount(0);
  return panel;
}

let customerId = '';
let importNumber = '';

test('imported from the old system: the customer and two of their invoices', async ({ page }) => {
  const url = await importFile(page, 'customers', `customers-${T}.csv`, csv([
    ['Customer number', 'Name', 'Phone', 'Address', 'City', 'Customer since'],
    [`000${custNo}`, NAME, `0815 ${STAMP.slice(0, 3)} ${STAMP.slice(3, 7)}`, '4 Idiroko Road', 'Ota', '15/09/2011'],
  ]));
  const job = await db().importJob.findUniqueOrThrow({ where: { id: url.split('/').pop()! }, select: { number: true } });
  importNumber = job.number;
  customerId = (await db().customer.findFirstOrThrow({ where: { externalId: custNo }, select: { id: true } })).id;
  const branchId = (await db().user.findUniqueOrThrow({ where: { email: who('owner').email }, select: { branchId: true } })).branchId!;
  await importFile(page, 'invoices', `invoices-${T}.csv`, csv([
    ['Invoice number', 'Invoice date', 'Customer number', 'Amount (₦)', 'Description'],
    [invNo, '10/05/2024', custNo, '125000.00', 'Service 20,000 km'],
    [`${invNo}1`, '12/06/2025', custNo, '98000.00', 'Brake pads'],
  ]), { branchId });
  expect(await db().historicalInvoice.count({ where: { customerId, voidedAt: null } })).toBe(2);
});

test('search by the old number: every match labelled; a year narrows it; leading zeros are understood', async ({ page }) => {
  await as(page, 'owner');
  await open(page, '/dashboard');
  let panel = await search(page, `000${custNo}`);
  await expect(panel.getByText(`${SRC} customer ${custNo}`)).toBeVisible();
  await expect(panel.getByText(NAME).first()).toBeVisible();
  panel = await search(page, invNo);
  await expect(panel.getByText(`${SRC} invoice ${invNo} · 2024`)).toBeVisible();
  panel = await search(page, `${invNo} 2025`);
  await expect(panel.getByText(`${SRC} invoice ${invNo} · 2024`)).toHaveCount(0);
  panel = await search(page, `${invNo} 2024`);
  await expect(panel.getByText(`${SRC} invoice ${invNo} · 2024`)).toBeVisible();
  // The front desk without the CRM still finds the customer; the invoices are for the CRM.
  await as(page, 'front-desk');
  await open(page, '/dashboard');
  panel = await search(page, custNo);
  await expect(panel.getByText(`${SRC} customer ${custNo}`)).toBeVisible();
  await expect(panel.getByText(`${SRC} invoice ${invNo}`)).toHaveCount(0);
});

test('the customer page says where it came from: imported by IMP-…, with its old number and customer-since date', async ({ page }) => {
  await as(page, 'owner');
  await open(page, `/crm/customers/${customerId}`);
  const box = page.getByRole('region', { name: 'Where this came from' }).or(page.locator('section[aria-labelledby="provenance"]'));
  await expect(box.getByText(IMPORTED)).toBeVisible();
  await expect(box.getByRole('link', { name: importNumber })).toBeVisible();
  await expect(box.getByText(custNo)).toBeVisible();
  await expect(box.getByText('15/09/2011')).toBeVisible();
});

test('the customer list filters by source, import, and both dates', async ({ page }) => {
  await as(page, 'owner');
  await open(page, `/crm?source=${SOURCE_KEY}&imp=${encodeURIComponent(importNumber.toLowerCase())}&originalTo=2012-12-31`);
  await expect(page.getByText(NAME)).toBeVisible();
  await open(page, `/crm?source=ejo&q=${encodeURIComponent(NAME)}`);
  await expect(page.getByText(NAME)).toHaveCount(0);
  await open(page, `/crm?source=${SOURCE_KEY}&originalFrom=2015-01-01&q=${encodeURIComponent(NAME)}`);
  await expect(page.getByText(NAME)).toHaveCount(0);
});

test('Data Exchange, day by day; the analytics with or without the history from before EJO', async ({ page }) => {
  await as(page, 'owner');
  await open(page, '/data-exchange/timeline');
  await expect(page.getByRole('link', { name: importNumber }).first()).toBeVisible();
  await open(page, '/analytics?period=this_year');
  await expect(page.getByRole('link', { name: 'EJO only' })).toBeVisible();
  await page.getByRole('link', { name: 'EJO only' }).click();
  await expect(page).toHaveURL(/history=exclude/);
  await expect(page.getByText(/Includes invoices from the old system before EJO/)).toHaveCount(0);
});
