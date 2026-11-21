import { test, expect } from '@playwright/test';
import { as, open, latestMail, linkIn, expectNoUrlError } from './helpers';
import { db, freshVehicle } from './db';
import { CUSTOMER, ORGANISATION_SLUG } from './people';
import { WEB } from './customer';
import {
  addLine, expectStatus, jobCardReadyForEstimate, managerApprovesEstimate, notifyCustomer, statusPanel, submitEstimate, supervisorApprovesEstimate,
} from './workflows';

/**
 * D'Phoenix phase 4 — the customer's approval of the estimate.
 *
 *  1. An organisation (company or fleet) customer never pays a deposit: the
 *     front desk records "Customer approved by phone" (who they spoke with)
 *     and the Job Card moves straight to In Progress.
 *  2. The secure link in the estimate email: the customer opens it (nothing
 *     changes on opening), approves once, and the same link is refused the
 *     second time with a plain message.
 *
 * Fixtures (the organisation customer and fresh vehicles) are made in the
 * database; every business step goes through the browser, as the right person.
 */
test.describe.configure({ mode: 'serial' });

const FLEET = { name: 'E2E Fleet Services Limited', email: 'fleet.approvals@e2e.test' };
const S = { fleetPlate: '', individualPlate: '' };

test.beforeAll(async () => {
  const prisma = db();
  const org = await prisma.organisation.findUniqueOrThrow({ where: { slug: ORGANISATION_SLUG } });
  const fleet = await prisma.customer.upsert({
    where: { email: FLEET.email },
    update: { customerType: 'ORGANIZATION' },
    create: { organisationId: org.id, customerType: 'ORGANIZATION', fullName: FLEET.name, email: FLEET.email, phone: '08031234567', address: '5 Fleet Road, Apapa' },
  });
  await prisma.customerCompany.upsert({ where: { customerId: fleet.id }, update: {}, create: { customerId: fleet.id, companyName: FLEET.name } });
  S.fleetPlate = (await freshVehicle('FLT', { customerEmail: FLEET.email })).plate;
  S.individualPlate = (await freshVehicle('LNK')).plate;
});

/** From check-in to Awaiting Customer Approval: one priced labour line, both approvals, the customer told. */
async function awaitingApproval(page: import('@playwright/test').Page, plate: string, customer?: string): Promise<string> {
  const url = await jobCardReadyForEstimate(page, { plate, customer, complaint: 'Service and brake check' });
  await as(page, 'workshop-supervisor');
  await open(page, url);
  await addLine(page, { type: 'LABOUR', description: 'Labour for Service', price: 25000 });
  await submitEstimate(page);
  await supervisorApprovesEstimate(page);
  await as(page, 'workshop-manager');
  await open(page, url);
  await managerApprovesEstimate(page);
  await as(page, 'receptionist');
  await open(page, url);
  await notifyCustomer(page);
  return url;
}

test('an organisation pays no deposit: approval by phone moves the Job Card to In Progress', async ({ page }) => {
  const url = await awaitingApproval(page, S.fleetPlate, FLEET.name);
  await expect(statusPanel(page).getByText(/as soon as the customer approves/)).toBeVisible();
  await page.getByText('Customer approved by phone').click();
  await page.locator('input[name="spokeWith"]').fill('Fleet manager on the phone');
  await page.getByRole('button', { name: 'Record approval by phone' }).click();
  await expectStatus(page, 'In Progress');
  await expect(page.getByTestId('customer-approval')).toContainText('Approved by the customer');
  await expect(page.getByTestId('customer-approval')).toContainText('by phone');
  expectNoUrlError(page);
});

test('the link in the estimate email approves once and refuses a second time', async ({ page, request }) => {
  const url = await awaitingApproval(page, S.individualPlate);
  const mail = await latestMail(request, CUSTOMER.email, new RegExp(`^Estimate ready for .*\\(${S.individualPlate}\\)`));
  const link = linkIn(mail.html, /\/estimate\/approve\/[A-Za-z0-9_-]{43}$/);
  const path = new URL(link).pathname;

  await test.step('opening the link changes nothing', async () => {
    await page.goto(`${WEB}${path}`);
    await expect(page.getByRole('heading', { name: /Your estimate — Job Card/ })).toBeVisible();
    await as(page, 'receptionist');
    await open(page, url);
    await expectStatus(page, 'Awaiting Customer Approval');
  });

  await test.step('the customer approves with the link', async () => {
    await page.goto(`${WEB}${path}`);
    await page.getByRole('button', { name: 'Approve the estimate' }).click();
    await expect(page.getByTestId('estimate-answer-done')).toContainText('your estimate is approved');
  });

  await test.step('the same link is refused the second time', async () => {
    await page.goto(`${WEB}${path}`);
    await expect(page.getByTestId('estimate-link-problem')).toContainText('already been used');
    await expect(page.getByTestId('estimate-link-problem')).toContainText('You approved this estimate');
  });

  await test.step('staff see who approved, and how', async () => {
    await as(page, 'receptionist');
    await open(page, url);
    await expect(page.getByTestId('customer-approval')).toContainText('by link');
  });
});
