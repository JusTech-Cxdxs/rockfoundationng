import { test, expect } from '@playwright/test';
import { as, open } from './helpers';
import { db } from './db';
import { CUSTOMER } from './people';

/**
 * The fleet report: front desk downloads a company's report as a PDF; a
 * technician cannot; an individual customer has none.
 */
const FLEET_EMAIL = 'fleet-report@e2e.test';

test.describe('Fleet report', () => {
  test.beforeAll(async () => {
    const base = await db().customer.findUniqueOrThrow({ where: { email: CUSTOMER.email }, select: { organisationId: true } });
    const c = await db().customer.upsert({
      where: { email: FLEET_EMAIL },
      update: { customerType: 'ORGANIZATION' },
      create: { organisationId: base.organisationId, customerType: 'ORGANIZATION', fullName: 'Ota Haulage Fleet', email: FLEET_EMAIL, phone: '08031112233', address: '3 Idiroko Road, Ota' },
      select: { id: true, _count: { select: { vehicles: true } } },
    });
    if (!c._count.vehicles) {
      await db().customerVehicle.create({ data: { customerId: c.id, make: 'Toyota', model: 'Hiace', year: 2019, vehicleType: 'COMMERCIAL', plateNumber: `FLT-${Date.now().toString(36).toUpperCase().slice(-5)}`, mileage: 120000 } });
    }
  });

  test('front desk downloads a company’s fleet report as a PDF', async ({ page }) => {
    const c = await db().customer.findUniqueOrThrow({ where: { email: FLEET_EMAIL }, select: { id: true } });
    await as(page, 'front-desk');
    await open(page, `/crm/customers/${c.id}`);
    await expect(page.getByTestId('fleet-report-links')).toBeVisible();
    const res = await page.request.get(`/api/customers/${c.id}/fleet-report?period=this-year`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/pdf');
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('a technician cannot download it', async ({ page }) => {
    const c = await db().customer.findUniqueOrThrow({ where: { email: FLEET_EMAIL }, select: { id: true } });
    await as(page, 'technician');
    expect((await page.request.get(`/api/customers/${c.id}/fleet-report`)).status()).toBe(404);
  });

  test('an individual customer has no fleet report on their page', async ({ page }) => {
    const c = await db().customer.findUniqueOrThrow({ where: { email: CUSTOMER.email }, select: { id: true } });
    await as(page, 'front-desk');
    await open(page, `/crm/customers/${c.id}`);
    await expect(page.getByTestId('fleet-report-links')).toHaveCount(0);
  });
});
