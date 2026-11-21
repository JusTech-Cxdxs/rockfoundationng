import { test, expect } from '@playwright/test';
import { CUSTOMER, SUPERMANAGER } from './people';
import { as, open, expectNoUrlError, latestMail } from './helpers';
import { db, freshVehicle } from './db';
import { jobCardInProgress, nextStep, recordPayment } from './workflows';

/**
 * D'Phoenix phase 3 — money and documents. A Job Card taken to completion
 * is invoiced once (INV-number on the Job Card page, the customer emailed),
 * the invoice prints on the letterhead with ₦ figures, and every payment
 * carries a receipt number with its own printable receipt.
 */
test.describe('Invoices and receipts', () => {
  test.describe.configure({ mode: 'serial' });
  const S = { url: '', id: '', number: '', invoiceId: '', invoiceNumber: '' };

  test('a Job Card in progress: its deposit has a receipt number', async ({ page }) => {
    const v = await freshVehicle('INV');
    const jc = await jobCardInProgress(page, {
      plate: v.plate,
      complaint: 'Brake noise',
      // 3 × ₦333.33: an awkward figure, rounded once to the kobo.
      lines: [{ type: 'LABOUR', description: 'Brake service labour', qty: 3, price: 333.33 }, { type: 'SUNDRY', description: 'Brake cleaner', price: 1500 }],
    });
    Object.assign(S, jc);
    const payment = await db().payment.findFirstOrThrow({ where: { jobCardId: S.id }, select: { id: true, receiptNumber: true } });
    expect(payment.receiptNumber).toMatch(/^RCT-\d{4}-\d{6}$/);
    await open(page, S.url);
    await expect(page.getByText(`Receipt ${payment.receiptNumber}`)).toBeVisible();
    const res = await page.goto(`/print/receipts/${payment.id}`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByText(payment.receiptNumber!).first()).toBeVisible();
    await expect(page.getByText(/₦[\d,]+\.\d{2}/).first()).toBeVisible();
  });

  test('completing the work issues the invoice once; the Job Card shows its number', async ({ page, request }) => {
    test.skip(!S.id, 'needs the Job Card from the previous step');
    await as(page, 'technician');
    await open(page, S.url);
    await nextStep(page, 'Work done — send to quality check', 'Quality Check');
    await as(page, SUPERMANAGER);
    await open(page, S.url);
    await nextStep(page, 'Passed quality check — mark Completed', 'Completed');
    const invoices = await db().invoice.findMany({ where: { jobCardId: S.id }, select: { id: true, invoiceNumber: true, total: true } });
    expect(invoices).toHaveLength(1);
    S.invoiceId = invoices[0]!.id;
    S.invoiceNumber = invoices[0]!.invoiceNumber;
    expect(S.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(Number(invoices[0]!.total)).toBe(2499.99);
    await expect(page.getByTestId('invoice-number')).toHaveText(S.invoiceNumber);
    await expect(page.getByRole('link', { name: 'Print invoice' })).toBeVisible();
    expectNoUrlError(page);
    await latestMail(request, CUSTOMER.email, new RegExp(`Invoice ${S.invoiceNumber}`));
  });

  test('the invoice prints on the letterhead, in ₦, with the balance due', async ({ page }) => {
    test.skip(!S.invoiceId, 'needs the invoice from the previous step');
    await as(page, 'finance-officer');
    const res = await page.goto(`/print/invoices/${S.invoiceId}`);
    expect(res?.status()).toBeLessThan(400);
    const organisation = await db().organisation.findFirstOrThrow({ where: { invoices: { some: { id: S.invoiceId } } }, select: { name: true } });
    await expect(page.getByRole('img', { name: organisation.name }).first()).toBeVisible();
    await expect(page.getByText(S.invoiceNumber).first()).toBeVisible();
    await expect(page.getByText(S.number).first()).toBeVisible();
    await expect(page.getByText('₦2,499.99').first()).toBeVisible();
    await expect(page.getByText(/Balance due/).first()).toBeVisible();
    await expect(page.getByText(`Thank you for choosing ${organisation.name}.`)).toBeVisible();
  });

  test('the balance is paid; a second receipt; the invoice is never issued twice', async ({ page }) => {
    test.skip(!S.invoiceId, 'needs the invoice from the previous step');
    await as(page, SUPERMANAGER);
    await open(page, S.url);
    await nextStep(page, 'Mark Ready for Collection', 'Ready for Collection');
    await as(page, 'finance-officer');
    await open(page, S.url);
    await recordPayment(page, 'REMAINING', 'CASH', 'Balance at collection');
    await expect(page.getByText('Paid in full — nothing further to record.')).toBeVisible();
    const receipts = await db().payment.findMany({ where: { jobCardId: S.id }, select: { receiptNumber: true } });
    expect(receipts).toHaveLength(2);
    expect(new Set(receipts.map((r) => r.receiptNumber)).size).toBe(2);
    expect(await db().invoice.count({ where: { jobCardId: S.id } })).toBe(1);
    await page.goto(`/print/invoices/${S.invoiceId}`);
    await expect(page.getByText('Paid in full').first()).toBeVisible();
  });
});
