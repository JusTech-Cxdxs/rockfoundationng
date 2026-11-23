import { test, expect } from '@playwright/test';
import { as, open, uniq } from './helpers';
import { db, freshVehicle } from './db';
import { CUSTOMER, who } from './people';

/**
 * Workshop bookings: a visitor books a service on the website (no sign-in);
 * front desk sees it waiting, confirms it; a registered customer's booking
 * opens the Job Card already filled when the vehicle arrives, and the
 * booking is marked arrived. A full day is not offered.
 */
const WEBSITE = process.env.E2E_WEBSITE_URL ?? 'http://localhost:3002';
const lagosDay = (d: Date) => new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10);

test.describe('Workshop bookings', () => {
  test.describe.configure({ mode: 'serial' });
  const S = { number: '', day: '' };

  test('a visitor books a service on the website; it waits for front desk', async ({ page }) => {
    const name = uniq('Booker ');
    await page.goto(`${WEBSITE}/book`);
    await page.getByTestId('booking-visits').getByRole('link', { name: /^Service/ }).first().click();
    await expect(page.getByTestId('booking-form')).toBeVisible();
    await page.locator('input[name="name"]').fill(name);
    await page.locator('input[name="phone"]').fill('0803 555 0142');
    await page.locator('input[name="vehicle"]').fill('Toyota Corolla 2016');
    await page.locator('input[name="plate"]').fill('KJA 901 XY');
    await page.locator('textarea[name="note"]').fill('Oil change and brake check');
    await page.getByRole('button', { name: 'Book this visit' }).click();
    await expect(page.getByTestId('booking-done')).toContainText(/APT-\d{4}-\d{6}/);
    const row = await db().appointment.findFirstOrThrow({ where: { name }, select: { number: true, status: true, source: true, jobType: true, day: true, phone: true, plateNumber: true } });
    expect(row).toMatchObject({ status: 'REQUESTED', source: 'WEBSITE', jobType: 'SERVICE', phone: '08035550142', plateNumber: 'KJA 901 XY' });
    S.number = row.number;
    S.day = row.day;
  });

  test('front desk confirms it', async ({ page }) => {
    test.skip(!S.number, 'needs the booking from the previous step');
    await as(page, 'front-desk');
    await open(page, `/workshop/bookings?day=${S.day}`);
    const card = page.getByTestId('appointment').filter({ hasText: S.number });
    await expect(card.getByTestId('appointment-status')).toHaveText('To confirm');
    await card.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Booking confirmed. The customer has been told.')).toBeVisible();
    expect((await db().appointment.findUniqueOrThrow({ where: { number: S.number }, select: { status: true } })).status).toBe('CONFIRMED');
  });

  test('a registered customer’s booking opens the Job Card already filled; the booking is marked arrived', async ({ page }) => {
    const v = await freshVehicle('APT');
    const customer = await db().customer.findUniqueOrThrow({ where: { email: CUSTOMER.email }, select: { id: true, organisationId: true, fullName: true, phone: true } });
    const today = lagosDay(new Date());
    const appt = await db().appointment.create({
      data: { number: `APT-E2E-${Date.now()}`, organisationId: customer.organisationId, customerId: customer.id, vehicleId: v.id, jobType: 'REPAIR', day: today, slot: '14:00', name: customer.fullName, phone: customer.phone ?? '08030000000', note: 'Brakes squeal when stopping', source: 'STAFF', status: 'CONFIRMED', confirmedAt: new Date() },
      select: { id: true, number: true },
    });
    await as(page, 'front-desk');
    await open(page, `/workshop/job-cards?appointment=${appt.id}`);
    await expect(page.getByTestId('from-booking')).toContainText(appt.number);
    const form = page.locator('form', { has: page.getByRole('button', { name: 'Open Job Card' }) });
    await expect(form.locator('select[name="vehicleId"] option:checked')).toContainText(v.plate);
    await expect(form.locator('input[name="complaints"]').first()).toHaveValue('Brakes squeal when stopping');
    await form.locator('select[name="supervisorId"]').selectOption({ label: who('workshop-supervisor').name });
    await form.locator('input[name="mileageAtCheckIn"]').fill('61000');
    await form.getByRole('button', { name: 'Open Job Card' }).click();
    await page.waitForURL(/\/workshop\/job-cards\/[^/?]+\?status=job_card_created/);
    const after = await db().appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { status: true, jobCardId: true } });
    expect(after.status).toBe('ARRIVED');
    expect(after.jobCardId).toBe(page.url().split('/').pop()!.split('?')[0]);
  });

  test('a full day is not offered on the website', async ({ page }) => {
    const org = await db().organisation.findFirstOrThrow({ where: { customers: { some: { email: CUSTOMER.email } } }, select: { id: true } });
    // Two spraying bookings fill tomorrow (two places a day by default).
    const tomorrow = lagosDay(new Date(Date.now() + 86_400_000));
    const weekday = new Date(`${tomorrow}T00:00:00Z`).getUTCDay();
    test.skip(weekday === 0, 'tomorrow is a Sunday: closed anyway');
    const existing = await db().appointment.count({ where: { organisationId: org.id, day: tomorrow, jobType: 'SPRAYING', status: { in: ['REQUESTED', 'CONFIRMED', 'ARRIVED'] } } });
    for (let i = existing; i < 2; i++) {
      await db().appointment.create({ data: { number: `APT-E2E-FULL-${Date.now()}-${i}`, organisationId: org.id, jobType: 'SPRAYING', day: tomorrow, slot: '08:00', name: 'Full Day Test', phone: '08030000001', source: 'WEBSITE' } });
    }
    await page.goto(`${WEBSITE}/book?visit=SPRAYING`);
    const day = page.locator('label', { has: page.locator(`input[name="day"][value="${tomorrow}"]`) });
    await expect(day).toContainText('Full');
    await expect(page.locator(`input[name="day"][value="${tomorrow}"]`)).toBeDisabled();
  });
});
