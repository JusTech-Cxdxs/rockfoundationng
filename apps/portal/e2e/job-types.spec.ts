import { test, expect } from '@playwright/test';
import { as, open, expectNoUrlError, eventually } from './helpers';
import { db, freshVehicle } from './db';
import { openJobCard } from './workflows';

/**
 * Job types at check-in: the front desk says what the visit is for, and the
 * Job Card is filed under the department that does that work. A spraying job
 * carries its colour, paint code and panels; a car wash is a quick check-in
 * (the package, no complaint needed). Fuel, items left in the vehicle and
 * photos of its condition are recorded at check-in.
 */
// An 8×8 PNG, enough for the browser to resize and upload as a JPEG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGOwc5iKFTEMLQkAx45EwTPtSBcAAAAASUVORK5CYII=', 'base64');

const departmentOf = async (id: string) =>
  (await db().jobCard.findUniqueOrThrow({ where: { id }, select: { department: { select: { slug: true } } } })).department?.slug;

test.describe('Job types at check-in', () => {
  test.describe.configure({ mode: 'serial' });
  const S = { spraying: '' };

  test('a spraying job keeps its colour, code, panels, fuel and items, and is filed under Body and spraying', async ({ page }) => {
    await as(page, 'front-desk');
    const { plate } = await freshVehicle('SPR');
    const url = await openJobCard(page, {
      plate, jobType: 'SPRAYING', complaint: 'Scratches on the bonnet and front bumper', mileage: 61250,
      fill: async (form) => {
        await form.locator('input[name="sprayColour"]').fill('Pearl white');
        await form.locator('input[name="sprayColourCode"]').fill('070');
        await form.getByLabel('Bonnet').check();
        await form.getByLabel('Front bumper').check();
        await form.locator('select[name="fuelLevel"]').selectOption('4');
        await form.locator('input[name="itemsInVehicle"]').fill('Spare tyre, jack, car documents');
      },
    });
    S.spraying = url.split('/').pop()!;
    expectNoUrlError(page);
    await expect(page.getByTestId('job-card-type-badge').first()).toHaveAttribute('data-job-type', 'SPRAYING');
    await expect(page.getByTestId('job-card-spraying')).toContainText('Pearl white');
    await expect(page.getByTestId('job-card-spraying')).toContainText('070');
    const row = await db().jobCard.findUniqueOrThrow({ where: { id: S.spraying }, select: { jobType: true, sprayPanels: true, fuelLevel: true, itemsInVehicle: true } });
    expect(row.jobType).toBe('SPRAYING');
    expect([...row.sprayPanels].sort()).toEqual(['BONNET', 'FRONT_BUMPER']);
    expect(row.fuelLevel).toBe(4);
    expect(row.itemsInVehicle).toContain('Spare tyre');
    expect(await departmentOf(S.spraying)).toBe('body-spray');
  });

  test('a photo of the vehicle is added at check-in and shown on the Job Card', async ({ page }) => {
    test.skip(!S.spraying, 'needs the spraying Job Card');
    await as(page, 'front-desk');
    await open(page, `/workshop/job-cards/${S.spraying}`);
    await page.getByTestId('job-card-photo-input').setInputFiles({ name: 'bonnet.png', mimeType: 'image/png', buffer: PNG });
    await eventually(page, async () => {
      expect(await db().jobCardPhoto.count({ where: { jobCardId: S.spraying } })).toBe(1);
    });
    const photo = await db().jobCardPhoto.findFirstOrThrow({ where: { jobCardId: S.spraying }, select: { contentType: true, stage: true } });
    expect(photo.stage).toBe('CHECK_IN');
    expect(photo.contentType).toMatch(/^image\/(jpeg|png|webp)$/);
  });

  test('a technician who is not on the job cannot fetch its photos', async ({ page }) => {
    test.skip(!S.spraying, 'needs the spraying Job Card');
    const photo = await db().jobCardPhoto.findFirstOrThrow({ where: { jobCardId: S.spraying }, select: { id: true } });
    await as(page, 'technician');
    const res = await page.request.get(`/api/job-cards/${S.spraying}/photos/${photo.id}`);
    expect(res.status()).toBe(404);
  });

  test('a car wash is a quick check-in: the package, no complaint, filed under Car wash', async ({ page }) => {
    await as(page, 'front-desk');
    const { plate } = await freshVehicle('CWS');
    const url = await openJobCard(page, {
      plate, jobType: 'CAR_WASH',
      fill: async (form) => { await form.locator('select[name="washPackage"]').selectOption('FULL'); },
    });
    const id = url.split('/').pop()!;
    await expect(page.getByTestId('job-card-type-badge').first()).toHaveAttribute('data-job-type', 'CAR_WASH');
    const row = await db().jobCard.findUniqueOrThrow({ where: { id }, select: { jobType: true, washPackage: true, isService: true, complaints: { select: { description: true } } } });
    expect(row.jobType).toBe('CAR_WASH');
    expect(row.washPackage).toBe('FULL');
    expect(row.isService).toBe(false);
    expect(row.complaints.length).toBeGreaterThan(0); // the reason is written for it
    expect(await departmentOf(id)).toBe('car-wash');
  });
});
