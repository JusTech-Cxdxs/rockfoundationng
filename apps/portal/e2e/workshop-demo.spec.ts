import { test, expect, type Page } from '@playwright/test';
import { db } from './db';
import { expectHealthy, gotoSettled, signIn, signOut, visitHealthy } from './helpers';
import { DEMO_E2E_PASSWORD } from './people';
import { customerSignedIn, websiteUp } from './customer';
import { DEMO_CUSTOMERS, demoPerson, type DemoBranch } from '../lib/demo/people';
import { DEMO_ORG_SLUG } from '../lib/demo/organisation';
import { DEMO_ENABLED, DEMO_OFF } from './edition';

/**
 * D2 — the workshop demo (lib/workshop/demo), in its own organisation
 * (rock-foundation-demo). The CI seed loaded it (`npm run demo:reset`), so every
 * page the demo people open is full: here, each of them signs in and walks
 * their own pages — nothing broken, the figures the demo promises on screen
 * — and the customer portal shows a customer's own vehicle, estimate and
 * invoice. The plan's rules are proved in tests/workshop-demo.test.ts; this
 * proves the portal renders what the plan made.
 */
test.skip(!DEMO_ENABLED, DEMO_OFF);
test.describe.configure({ mode: 'serial' });

const P = DEMO_E2E_PASSWORD;
const as = async (page: Page, role: string, branch?: DemoBranch) => { await signIn(page, demoPerson(role, branch).email, P); };
const walk = async (page: Page, urls: string[]) => { for (const u of urls) await visitHealthy(page, u); };

async function demoOrgId(): Promise<string> {
  return (await db().organisation.findUniqueOrThrow({ where: { slug: DEMO_ORG_SLUG }, select: { id: true } })).id;
}

test('the demo is in place, in its own organisation: records registered, job cards at every status, services and repairs, invoices and receipts; the real organisation holds none of it', async () => {
  const org = await demoOrgId();
  expect(await db().demoRecord.count({ where: { organisationId: org } })).toBeGreaterThan(2_000);
  const statuses = await db().jobCard.groupBy({ by: ['status'], where: { customer: { organisationId: org, externalSource: 'EJO-DEMO' } }, _count: true });
  for (const s of ['CHECKED_IN', 'AWAITING_CUSTOMER_APPROVAL', 'IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'CHECKED_OUT', 'CANCELLED']) expect(statuses.map((x) => x.status), s).toContain(s);
  expect(await db().jobCard.count({ where: { customer: { organisationId: org }, isService: true } })).toBeGreaterThan(20);
  expect(await db().invoice.count({ where: { organisationId: org } })).toBeGreaterThan(50);
  expect(await db().payment.count({ where: { jobCard: { customer: { organisationId: org } }, receiptNumber: { not: null } } })).toBeGreaterThan(50);
  const real = await db().organisation.findUnique({ where: { slug: 'rock-foundation' }, select: { id: true } });
  if (real) expect(await db().demoRecord.count({ where: { organisationId: real.id } })).toBe(0);
});

test('the Owner: the dashboard, every workshop page, a job card with its estimate, invoice, receipts and history, the Service Tracker, refunds, custody', async ({ page }) => {
  await as(page, 'owner');
  await expect(page).toHaveURL(/\/dashboard/);
  await expectHealthy(page);
  await walk(page, ['/workshop', '/workshop/job-cards', '/workshop/customers', '/workshop/vehicles', '/workshop/custody', '/workshop/refunds', '/workshop/service-tracker', '/approvals', '/analytics', '/crm']);
  const org = await demoOrgId();
  const jc = await db().jobCard.findFirstOrThrow({ where: { customer: { organisationId: org, externalSource: 'EJO-DEMO' }, status: 'CHECKED_OUT', invoice: { isNot: null }, payments: { some: {} } }, orderBy: { createdAt: 'desc' }, select: { id: true, jobNumber: true } });
  await visitHealthy(page, `/workshop/job-cards/${jc.id}`);
  await expect(page.getByText(jc.jobNumber).first()).toBeVisible();
  await expect(page.getByText(/Checked out/i).first()).toBeVisible();
  const waiting = await db().jobCard.findFirstOrThrow({ where: { customer: { organisationId: org, externalSource: 'EJO-DEMO' }, status: 'AWAITING_PARTS' }, select: { id: true } });
  await visitHealthy(page, `/workshop/job-cards/${waiting.id}`);
  const refunded = await db().refund.findFirstOrThrow({ where: { jobCard: { customer: { organisationId: org, externalSource: 'EJO-DEMO' } } }, select: { jobCardId: true, referenceNumber: true } });
  await visitHealthy(page, `/workshop/job-cards/${refunded.jobCardId}`);
  await visitHealthy(page, '/workshop/refunds');
  await expect(page.getByText(refunded.referenceNumber).first()).toBeVisible();
  await signOut(page);
});

test('the technician sees their own jobs; the front desk its pages; Accounts the money; Security the gate; the Owner the administration', async ({ page }) => {
  await as(page, 'technician', 'OTA');
  await walk(page, ['/workshop/job-cards']);
  await signOut(page);
  await as(page, 'front-desk');
  await walk(page, ['/workshop/customers', '/workshop/vehicles', '/workshop/service-tracker', '/crm', '/crm/support']);
  await signOut(page);
  await as(page, 'accounts');
  await walk(page, ['/workshop/job-cards', '/workshop/refunds']);
  await signOut(page);
  await as(page, 'security');
  await walk(page, ['/security', '/security/vehicles', '/security/vehicles-inside']);
  await signOut(page);
  await as(page, 'owner', 'BIZ');
  await walk(page, ['/users', '/roles', '/structure', '/audit-logs', '/data-exchange', '/data-exchange/exports', '/recycle-bin', '/organisation', '/analytics']);
  await signOut(page);
});

test('the customer portal: the individual sees their Corolla; the fleet company its vehicles', async ({ page, request }) => {
  test.skip(!(await websiteUp(request)), 'the customer portal (apps/website) is not running');
  const individual = DEMO_CUSTOMERS[0]!;
  await customerSignedIn(page, { email: individual.email, name: individual.name, password: P });
  await expect(page.getByText(/Corolla/).first()).toBeVisible();
  await page.context().clearCookies();
  const fleet = DEMO_CUSTOMERS[1]!;
  await customerSignedIn(page, { email: fleet.email, name: fleet.name, password: P });
  await expect(page.getByText(/Hilux|Hiace|Sienna/).first()).toBeVisible();
});
