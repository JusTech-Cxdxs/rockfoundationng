import { test, expect } from '@playwright/test';
import { as, open, expectNoUrlError } from './helpers';
import { db, freshVehicle } from './db';
import { CUSTOMER } from './people';
import { openJobCard, nextStep, recordPayment, statusPanel, jcForm, jobCardReadyForEstimate, addLine, submitEstimate } from './workflows';

/**
 * Phase 5, money and the workshop warranty, end to end:
 *  - a car wash at the list price is a quick check-in: started at once,
 *    finished, paid by POS (with its reference) and checked out without a
 *    close request;
 *  - a credit note is asked for on the invoice, approved by the Owner
 *    (numbered CN-), lowers the balance, and opens as a PDF;
 *  - what customers owe (statements and ageing) and the statement PDF;
 *  - a vehicle back under the workshop's guarantee is opened as a comeback;
 *  - "The Owner approves every estimate" off: the supervisor's check is final.
 */
test.describe('Money and the workshop warranty', () => {
  test.describe.configure({ mode: 'serial' });
  const S = { washId: '', washUrl: '', plate: '', vehicleId: '' };

  test('a quick car wash: started at check-in, finished, paid by POS and checked out', async ({ page }) => {
    await as(page, 'front-desk');
    const v = await freshVehicle('QCW');
    S.plate = v.plate; S.vehicleId = v.id;
    S.washUrl = await openJobCard(page, { plate: v.plate, jobType: 'CAR_WASH', fill: async (form) => { await form.locator('select[name="washPackage"]').selectOption('FULL'); } });
    S.washId = S.washUrl.split('/').pop()!;
    const jc = await db().jobCard.findUniqueOrThrow({ where: { id: S.washId }, select: { status: true, approvalStatus: true, estimate: { select: { status: true, customerApprovedVia: true, lineItems: { select: { amount: true, description: true } } } } } });
    expect(jc.status).toBe('IN_PROGRESS');
    expect(jc.approvalStatus).toBe('APPROVED');
    expect(jc.estimate?.status).toBe('MANAGER_APPROVED');
    expect(jc.estimate?.customerApprovedVia).toBe('COUNTER');
    expect(Number(jc.estimate?.lineItems[0]?.amount)).toBe(5000);
    await open(page, S.washUrl);
    await nextStep(page, 'Wash done — mark Completed', 'Completed');
    await expect(page.getByTestId('invoice-number')).toHaveText(/^INV-\d{4}-\d{6}$/);
  });

  test('a credit note: asked for on the invoice, approved by the Owner, lowers the balance', async ({ page }) => {
    test.skip(!S.washId, 'needs the car wash');
    await as(page, 'front-desk');
    await open(page, S.washUrl);
    const panel = page.getByTestId('credit-notes-panel');
    await panel.getByText('Ask for a credit note').click();
    const form = page.getByTestId('credit-note-form');
    // More than the invoice is refused.
    await form.locator('input[name="amount"]').fill('999999');
    await form.locator('input[name="reason"]').fill('Testing the limit on credit notes');
    await form.getByRole('button', { name: 'Ask the Owner' }).click();
    await expect(page.getByText(/At most ₦/)).toBeVisible();
    await open(page, S.washUrl);
    await page.getByTestId('credit-notes-panel').getByText('Ask for a credit note').click();
    await page.getByTestId('credit-note-form').locator('input[name="amount"]').fill('1,000');
    await page.getByTestId('credit-note-form').locator('input[name="reason"]').fill('Interior vacuum was not done');
    await page.getByTestId('credit-note-form').getByRole('button', { name: 'Ask the Owner' }).click();
    await expect.poll(async () => db().creditNote.count({ where: { jobCardId: S.washId, status: 'PENDING' } })).toBe(1);
    // Front desk cannot approve it.
    await open(page, '/money/credit-notes?show=pending');
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);

    await as(page, 'owner');
    await open(page, '/approvals');
    await expect(page.getByText(/Approve the credit note — INV-/).first()).toBeVisible();
    await open(page, '/money/credit-notes?show=pending');
    const note = page.getByTestId('credit-note').filter({ hasText: 'Interior vacuum was not done' });
    await note.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Credit note approved and numbered.')).toBeVisible();
    const cn = await db().creditNote.findFirstOrThrow({ where: { jobCardId: S.washId }, select: { id: true, number: true, status: true, amount: true } });
    expect(cn.status).toBe('APPROVED');
    expect(cn.number).toMatch(/^CN-\d{4}-\d{6}$/);
    expect(Number(cn.amount)).toBe(1000);
    const pdf = await page.request.get(`/api/credit-notes/${cn.id}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

    // The balance is now the price less the credit: Accounts takes the rest by POS, then front desk checks it out.
    await as(page, 'accounts');
    await open(page, S.washUrl);
    await recordPayment(page, 'REMAINING', 'POS', undefined, '012345678901');
    const pay = await db().payment.findFirstOrThrow({ where: { jobCardId: S.washId }, select: { amount: true, method: true, posReference: true } });
    expect(pay).toMatchObject({ method: 'POS', posReference: '012345678901' });
    const inv = await db().invoice.findUniqueOrThrow({ where: { jobCardId: S.washId }, select: { total: true } });
    expect(Number(pay.amount)).toBe(Math.round((Number(inv.total) - 1000) * 100) / 100);
    await as(page, 'front-desk');
    await open(page, S.washUrl);
    const checkout = jcForm(page, 'Check out vehicle');
    await checkout.getByRole('button', { name: 'Check out vehicle' }).click();
    await expect(statusPanel(page).locator('span').first()).toHaveText('Checked Out', { timeout: 30_000 });
    expectNoUrlError(page);
  });

  test('a POS payment without its reference is refused', async ({ page }) => {
    await as(page, 'front-desk');
    const v = await freshVehicle('POS');
    const url = await openJobCard(page, { plate: v.plate, jobType: 'CAR_WASH', fill: async (form) => { await form.locator('select[name="washPackage"]').selectOption('EXTERIOR'); } });
    await as(page, 'accounts');
    await open(page, url);
    const form = jcForm(page, 'Record payment');
    await form.locator('select').first().selectOption('FULL');
    await form.locator('select[name="method"]').selectOption('POS');
    await form.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByText(/Enter the POS transaction reference/)).toBeVisible();
    expect(await db().payment.count({ where: { jobCardId: url.split('/').pop()! } })).toBe(0);
  });

  test('what customers owe: the ageing, one customer’s statement and its PDF', async ({ page }) => {
    // An unpaid quick wash leaves the customer owing.
    await as(page, 'front-desk');
    const v = await freshVehicle('STM');
    const url = await openJobCard(page, { plate: v.plate, jobType: 'CAR_WASH', fill: async (form) => { await form.locator('select[name="washPackage"]').selectOption('FULL'); } });
    await open(page, url);
    await nextStep(page, 'Wash done — mark Completed', 'Completed');
    await open(page, '/money/statements');
    const customer = await db().customer.findUniqueOrThrow({ where: { email: CUSTOMER.email }, select: { id: true } });
    await expect(page.getByTestId('ageing-table').getByRole('link', { name: CUSTOMER.name })).toBeVisible();
    await open(page, `/money/statements/${customer.id}`);
    await expect(page.getByTestId('statement-table')).toContainText(/INV-\d{4}-\d{6}/);
    const pdf = await page.request.get(`/api/customers/${customer.id}/statement`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    // The technician has no statements.
    await as(page, 'technician');
    expect((await page.request.get(`/api/customers/${customer.id}/statement`)).status()).toBe(404);
  });

  test('a vehicle back under the guarantee is opened as a comeback', async ({ page }) => {
    test.skip(!S.washId, 'needs the checked-out job');
    // The checked-out job carries a running guarantee (as a repair would).
    await db().jobCard.update({ where: { id: S.washId }, data: { warrantyUntil: new Date(Date.now() + 30 * 86_400_000), warrantyUntilKm: null } });
    await as(page, 'front-desk');
    const url = await openJobCard(page, {
      plate: S.plate, complaint: 'The same noise is back',
      fill: async (form) => {
        const choice = form.getByTestId('comeback-choice');
        await expect(choice).toBeVisible();
        await choice.locator('select[name="comebackOfId"]').selectOption(S.washId);
      },
    });
    const id = url.split('/').pop()!;
    await expect(page.getByTestId('job-card-comeback')).toContainText('Putting right the work on');
    expect((await db().jobCard.findUniqueOrThrow({ where: { id }, select: { comebackOfId: true } })).comebackOfId).toBe(S.washId);
    // The Owner sees it in the warranty report.
    await as(page, 'owner');
    await open(page, '/warranty');
    await expect(page.getByTestId('warranty-tiles')).toContainText('Comebacks');
    await expect(page.getByRole('link', { name: (await db().jobCard.findUniqueOrThrow({ where: { id }, select: { jobNumber: true } })).jobNumber }).first()).toBeVisible();
  });

  test('with the Owner’s approval switched off, the supervisor’s check is final', async ({ page }) => {
    const org = await db().organisation.findFirstOrThrow({ where: { slug: 'rock-foundation' }, select: { id: true } });
    await as(page, 'owner');
    await open(page, '/settings/money');
    await page.getByTestId('estimate-approval-form').locator('input[name="ownerApprovesEstimates"]').uncheck();
    await page.getByTestId('estimate-approval-form').getByRole('button', { name: 'Save estimate approval' }).click();
    await expect(page.getByText('Estimate approval saved.')).toBeVisible();
    expect((await db().organisation.findUniqueOrThrow({ where: { id: org.id }, select: { ownerApprovesEstimates: true } })).ownerApprovesEstimates).toBe(false);
    try {
      const v = await freshVehicle('SAP');
      const url = await jobCardReadyForEstimate(page, { plate: v.plate });
      const id = url.split('/').pop()!;
      await as(page, 'workshop-supervisor');
      await open(page, url);
      await addLine(page, { type: 'LABOUR', description: 'Labour for brake pads', price: 15000 });
      await submitEstimate(page);
      // With the switch off, the supervisor's check is the final approval.
      await page.getByRole('button', { name: 'Approve estimate' }).click();
      await expect.poll(async () => (await db().estimate.findUniqueOrThrow({ where: { jobCardId: id }, select: { status: true } })).status).toBe('MANAGER_APPROVED');
      expectNoUrlError(page);
      const est = await db().estimate.findUniqueOrThrow({ where: { jobCardId: id }, select: { status: true, approvedById: true, managerApprovedById: true } });
      expect(est.status).toBe('MANAGER_APPROVED');
      expect(est.managerApprovedById).toBe(est.approvedById);
    } finally {
      await db().organisation.update({ where: { id: org.id }, data: { ownerApprovesEstimates: true } });
    }
  });
});
