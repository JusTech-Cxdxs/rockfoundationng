import { test, expect } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { as, open } from './helpers';
import { db, freshVehicle } from './db';
import { who } from './people';

/**
 * Customer documents in bulk: Finance chooses the kind, the workshop and the
 * period, sees how many documents there are, and downloads the zip — real
 * PDFs named by their numbers, with index.csv, the checksum in the header and
 * the download in the audit trail. A Job Card estimate; a period with
 * nothing; a period too long; and someone without the right is refused.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = String(Date.now()).slice(-8);
const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const ids = { branch: '', job: `JC-E2E-DOC-${STAMP}` };
const url = (kind: string, from = today, to = today, part = 1) => `/data-exchange/documents/download?kind=${kind}&branch=${ids.branch}&from=${from}&to=${to}&part=${part}`;
const isPdf = (b: Uint8Array) => strFromU8(b.subarray(0, 5)) === '%PDF-' && b.byteLength > 1500;

test('set up: an estimate sent for a Job Card', async () => {
  const fin = await db().user.findUniqueOrThrow({ where: { email: who('finance-officer').email }, select: { id: true, branchId: true } });
  ids.branch = fin.branchId!;
  const v = await freshVehicle(`DOC${STAMP.slice(-4)}`);
  const { customerId } = await db().customerVehicle.findUniqueOrThrow({ where: { id: v.id }, select: { customerId: true } });
  const now = new Date();
  const job = await db().jobCard.create({ data: { jobNumber: ids.job, branchId: ids.branch, customerId, vehicleId: v.id, createdById: fin.id }, select: { id: true } });
  await db().estimate.create({ data: { jobCardId: job.id, status: 'MANAGER_APPROVED', createdById: fin.id, customerNotifiedAt: now, customerNotifiedById: fin.id, lineItems: { create: [
    { type: 'EXTERNAL_PART', description: 'Oil filter', quantity: 2, amount: 5000, unitOfMeasure: 'piece', enteredById: fin.id },
    { type: 'LABOUR', description: 'Fitting', quantity: 1, amount: 3000, enteredById: fin.id },
  ] } } });
});

test('Finance finds the Job Card estimates of the period and downloads the zip: real PDFs, the index, the checksum, the audit entry', async ({ page }) => {
  await as(page, 'finance-officer');
  await open(page, '/data-exchange/documents');
  const form = page.getByTestId('documents-form');
  await form.getByLabel(/Job Card estimates/).check();
  await form.locator('select').selectOption(ids.branch);
  await form.getByLabel('From', { exact: true }).fill(today);
  await form.getByLabel(/^To/).fill(today);
  await form.getByRole('button', { name: 'Find the documents' }).click();
  const found = page.getByTestId('documents-found');
  await expect(found).toContainText(/\d+ documents? at /, { timeout: 30_000 });
  const count = Number(((await found.textContent()) ?? '').match(/([\d,]+) documents?/)![1]!.replace(/,/g, ''));
  const parts = Math.ceil(count / 40);
  await expect(found.getByTestId('documents-zip')).toHaveCount(parts);

  // The document made in set-up is the newest: in the last zip.
  const res = await page.request.get(url('JOB_ESTIMATE', today, today, parts), { timeout: 60_000 });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/zip');
  const bytes = await res.body();
  const sum = createHash('sha256').update(bytes).digest('hex');
  expect(res.headers()['x-checksum-sha256']).toBe(sum);
  const files = unzipSync(new Uint8Array(bytes));
  const name = `Estimate-${ids.job}.pdf`;
  expect(Object.keys(files)).toContain(name);
  expect(isPdf(files[name]!)).toBe(true);
  for (const [n, b] of Object.entries(files)) if (n.endsWith('.pdf')) expect(isPdf(b), n).toBe(true);
  const index = strFromU8(files['index.csv']!);
  expect(index).toContain(`"${name}","${ids.job}"`);
  expect(index.split('\r\n').filter(Boolean)).toHaveLength(Object.keys(files).length);
  expect(Number(res.headers()['x-document-count'])).toBe(Object.keys(files).length - 1);
  const audit = await db().auditLog.findFirstOrThrow({ where: { action: 'data_exchange.documents_downloaded', entityId: ids.branch }, orderBy: { createdAt: 'desc' } });
  expect(audit.metadata).toMatchObject({ kind: 'JOB_ESTIMATE', from: today, to: today, checksum: sum });
  expect((audit.metadata as { numbers: string[] }).numbers).toContain(ids.job);
});

test('nothing in the period, a period too long, a part that does not exist; someone without the right is refused', async ({ page }) => {
  await as(page, 'finance-officer');
  await open(page, '/data-exchange/documents');
  const form = page.getByTestId('documents-form');
  await form.getByLabel(/Job Card estimates/).check();
  await form.getByLabel('From', { exact: true }).fill('2019-01-01');
  await form.getByLabel(/^To/).fill('2019-01-31');
  await form.getByRole('button', { name: 'Find the documents' }).click();
  await expect(page.getByTestId('documents-found')).toContainText('No job card estimates at', { timeout: 30_000 });
  await form.getByLabel(/^To/).fill('2019-06-30');
  await form.getByRole('button', { name: 'Find the documents' }).click();
  await expect(form.getByRole('alert')).toContainText('at most 92 days');
  expect((await page.request.get(url('JOB_ESTIMATE', '2019-01-01', '2019-01-31'))).status()).toBe(404);
  expect((await page.request.get(url('JOB_ESTIMATE', today, today, 999))).status()).toBe(400);
  expect((await page.request.get(url('PAYSLIPS'))).status()).toBe(400);

  await as(page, 'receptionist');
  expect((await page.request.get(url('JOB_ESTIMATE'))).status()).toBe(403);
});
