import { test, expect } from '@playwright/test';
import { as, open, expectNoUrlError } from './helpers';
import { db, freshVehicle } from './db';
import { openJobCard, jobNumber } from './workflows';
import { SEPARATE_VEHICLE_SERVICE } from './edition';

/**
 * One Job Card for repairs and services: the front desk chooses "Service"
 * under "What is this visit for?", and the Job Card carries a Service badge
 * on its page and in the list. Once checked out it starts the vehicle's
 * next-service count (Service Tracker, reminders, the customer's "next
 * service"), like a Vehicle Service did. Without a separate Vehicle Service
 * (the D'Phoenix edition) its booking page is not found and the Workshop
 * page has no Vehicle Service tile.
 */
test.describe('Job Card — opened as a service', () => {
  test.describe.configure({ mode: 'serial' });
  const S = { url: '', id: '', number: '', plate: '' };
  test.beforeAll(async () => {
    S.plate = (await freshVehicle('JCS')).plate;
  });

  test('the front desk opens a Job Card with Service chosen; it carries the Service badge', async ({ page }) => {
    await as(page, 'receptionist');
    S.url = await openJobCard(page, { plate: S.plate, complaint: 'Routine 10,000 km service', mileage: 40000, service: true });
    S.id = S.url.split('/').pop()!;
    S.number = await jobNumber(page);
    await expect(page.getByTestId('job-card-service-badge').first()).toBeVisible();
    expectNoUrlError(page);
    const row = await db().jobCard.findUniqueOrThrow({ where: { id: S.id }, select: { isService: true, serviceAttendedAt: true } });
    expect(row.isService).toBe(true);
    expect(row.serviceAttendedAt).toBeNull();
  });

  test('the Job Cards list shows the badge beside the number', async ({ page }) => {
    test.skip(!S.number, 'needs the Job Card from the previous step');
    await as(page, 'receptionist');
    await open(page, `/workshop/job-cards?q=${encodeURIComponent(S.number)}`);
    const row = page.locator('tr', { has: page.getByRole('link', { name: S.number }) });
    await expect(row.getByTestId('job-card-service-badge')).toBeVisible();
  });

  test('"Open a service Job Card" from a vehicle chooses Service', async ({ page }) => {
    await as(page, 'receptionist');
    const v = await freshVehicle('JCP');
    await open(page, `/workshop/job-cards?service=1&vehicle=${v.id}`);
    await expect(page.getByTestId('visit-type-service')).toBeChecked();
  });

  test('without a separate Vehicle Service, its booking page and tile are gone', async ({ page }) => {
    await as(page, 'receptionist');
    const v = await freshVehicle('JCB');
    // The staff area streams behind a loading screen, so "not found" shows as the page, not as the HTTP status.
    await page.goto(`/workshop/vehicle-service/book?vehicleId=${v.id}`);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await open(page, '/workshop');
    await expect(page.getByRole('link', { name: /^Vehicle Service/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Service Tracker/ })).toBeVisible();
  });
});
