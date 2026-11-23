import { test, expect, type Page } from '@playwright/test';
import { as, open } from './helpers';
import { db, freshVehicle } from './db';
import { CUSTOMER, ORGANISATION_SLUG } from './people';

/**
 * Who sees what, end to end in the browser:
 *  - a technician sees and opens only the Job Cards given to them (another
 *    technician's job is "not found", by the list and by its address);
 *  - with the Store Keeper switched off (Settings → Roles), Front Desk covers
 *    the parts store's counter sales and stock counts, the Store Keeper's
 *    holder gets nothing from the role, and switching it on gives it back.
 * Every optional role is on in the test organisation (e2e/seed.ts); the test
 * leaves it that way.
 */
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

async function jobCardFor(plate: string, techEmail: string | null): Promise<{ id: string; number: string }> {
  const prisma = db();
  const org = await prisma.organisation.findUniqueOrThrow({ where: { slug: ORGANISATION_SLUG }, select: { id: true } });
  const branch = await prisma.branch.findFirstOrThrow({ where: { businessUnit: { organisationId: org.id } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  const customer = await prisma.customer.findUniqueOrThrow({ where: { email: CUSTOMER.email }, select: { id: true } });
  const vehicle = await prisma.customerVehicle.findUniqueOrThrow({ where: { plateNumber: plate }, select: { id: true } });
  const front = await prisma.user.findUniqueOrThrow({ where: { email: 'frontdesk@e2e.test' }, select: { id: true } });
  const sup = await prisma.user.findUniqueOrThrow({ where: { email: 'supervisor@e2e.test' }, select: { id: true } });
  const tech = techEmail ? await prisma.user.findUniqueOrThrow({ where: { email: techEmail }, select: { id: true } }) : null;
  const number = `JC-FENCE-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
  const jc = await prisma.jobCard.create({ data: {
    jobNumber: number, branchId: branch.id, customerId: customer.id, vehicleId: vehicle.id, createdById: front.id, supervisorId: sup.id,
    assignedTechnicianId: tech?.id ?? null, technicianAcceptanceStatus: tech ? 'ACCEPTED' : null, status: 'IN_PROGRESS', approvalStatus: 'APPROVED', approvedById: sup.id, approvedAt: new Date(),
    workStartedAt: new Date(), complaint: 'Role fence fixture', jobType: 'REPAIR',
  }, select: { id: true } });
  return { id: jc.id, number };
}

test.describe('a technician sees only their own jobs', () => {
  test('their job is listed and opens; a job given to nobody else is neither listed nor opened by its address', async ({ page }) => {
    const mine = await jobCardFor((await freshVehicle('FNA')).plate, 'tech@e2e.test');
    const notMine = await jobCardFor((await freshVehicle('FNB')).plate, null);
    await as(page, 'technician');
    await open(page, `/workshop/job-cards?q=${encodeURIComponent('JC-FENCE')}`);
    await expect(page.getByRole('link', { name: mine.number })).toBeVisible();
    await expect(page.getByRole('link', { name: notMine.number })).toHaveCount(0);
    await page.goto(`/workshop/job-cards/${mine.id}`);
    await expect(page.getByRole('heading', { name: mine.number, level: 1 })).toBeVisible();
    await page.goto(`/workshop/job-cards/${notMine.id}`);
    await expect(page.getByRole('heading', { name: notMine.number })).toHaveCount(0);
    await expect(page.getByText(/not found|could not be found|outside what you can see/i).first()).toBeVisible();
  });
});

test.describe('the Store Keeper switched off: Front Desk covers the store', () => {
  test.describe.configure({ mode: 'serial' });
  const card = (page: Page) => page.getByTestId('optional-role-store-keeper');

  test('switched off: Front Desk records counter sales and stock counts; the Store Keeper gets nothing from the role', async ({ page }) => {
    test.setTimeout(240_000);
    await as(page, 'owner');
    await open(page, '/roles');
    await expect(card(page).getByText('On', { exact: true })).toBeVisible();
    await card(page).getByRole('button', { name: 'Switch Store Keeper off' }).click();
    await expect(card(page).getByText('Off', { exact: true })).toBeVisible();

    // The change reaches everyone within a minute (lib/authz/server.ts caches it briefly).
    await as(page, 'front-desk');
    await expect.poll(async () => {
      const res = await page.goto('/inventory/stock-counts/new');
      return res?.ok() && !/\/access-denied/.test(page.url());
    }, { timeout: 90_000, intervals: [5_000] }).toBe(true);
    await open(page, '/inventory/counter-sales/new');
    await expect(page).not.toHaveURL(/\/access-denied/);

    await as(page, 'store-keeper');
    await expect(nav(page).getByRole('link', { name: 'Parts store', exact: true })).toHaveCount(0);
    await page.goto('/inventory/stock-counts/new');
    await expect(page).toHaveURL(/\/access-denied/);
  });

  test('switched back on: the Store Keeper has the store again', async ({ page }) => {
    test.setTimeout(240_000);
    await as(page, 'owner');
    await open(page, '/roles');
    await card(page).getByRole('button', { name: 'Switch Store Keeper on' }).click();
    await expect(card(page).getByText('On', { exact: true })).toBeVisible();
    await as(page, 'store-keeper');
    await expect.poll(async () => {
      await page.goto('/dashboard');
      return nav(page).getByRole('link', { name: 'Parts store', exact: true }).count();
    }, { timeout: 90_000, intervals: [5_000] }).toBe(1);
    await open(page, '/inventory/stock-counts/new');
    await expect(page).not.toHaveURL(/\/access-denied/);
  });
});
