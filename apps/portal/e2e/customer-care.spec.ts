import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { as, open, uniq } from './helpers';
import { db, freshVehicle } from './db';
import { CUSTOMER } from './people';
import { openJobCard } from './workflows';

/**
 * Customer care: the callback list, complaints and "How did we do?". A call
 * is added for a customer and closed with what came of it; a complaint is
 * logged and tracked in the Support centre; a low rating on the customer site
 * opens a complaint and a callback by itself.
 */
const WEBSITE = process.env.E2E_WEBSITE_URL ?? 'http://localhost:3002';
const CRON = { authorization: `Bearer ${process.env.CRON_SECRET ?? 'e2e-cron-secret'}` };
// The same signed link the portal sends (lib/customer-care/rules.ts ratingToken).
const ratingToken = (id: string) => `${id}.${createHmac('sha256', process.env.BETTER_AUTH_SECRET ?? '').update(`job-rating:${id}`, 'utf8').digest('base64url').slice(0, 32)}`;

test.describe('Customer care', () => {
  test.describe.configure({ mode: 'serial' });

  test('a call is added for a customer and closed with what came of it', async ({ page }) => {
    await as(page, 'front-desk');
    const customer = await db().customer.findUniqueOrThrow({ where: { email: CUSTOMER.email }, select: { id: true, fullName: true } });
    const note = uniq('Wants a quote for brake pads ');
    await open(page, `/crm/callbacks?customer=${customer.id}&customerName=${encodeURIComponent(customer.fullName)}`);
    await page.locator('input[name="note"]').fill(note);
    await page.getByRole('button', { name: 'Add to the list' }).click();
    await expect.poll(async () => db().followUp.count({ where: { customerId: customer.id, note } }), { timeout: 30_000 }).toBe(1);
    const call = await db().followUp.findFirstOrThrow({ where: { customerId: customer.id, note }, select: { id: true } });
    await open(page, '/crm/callbacks?show=all');
    const item = page.locator('li', { has: page.locator(`input[name="id"][value="${call.id}"]`) }).first();
    await item.locator('input[name="outcome"]').fill('Quote sent on WhatsApp; booked for Tuesday');
    await item.getByRole('button', { name: 'Done' }).click();
    await expect.poll(async () => (await db().followUp.findUniqueOrThrow({ where: { id: call.id }, select: { status: true } })).status, { timeout: 30_000 }).toBe('DONE');
  });

  test('a complaint is logged and opens in the Support centre', async ({ page }) => {
    await as(page, 'front-desk');
    const customer = await db().customer.findUniqueOrThrow({ where: { email: CUSTOMER.email }, select: { id: true, fullName: true } });
    const details = uniq('The car was returned with grease on the seats ');
    await open(page, `/crm/complaints?customer=${customer.id}&customerName=${encodeURIComponent(customer.fullName)}`);
    await page.locator('select[name="category"]').selectOption({ index: 1 });
    await page.locator('textarea[name="details"]').fill(details);
    await page.getByRole('button', { name: 'Log the complaint' }).click();
    await expect.poll(async () => db().supportTicket.count({ where: { customerId: customer.id, kind: 'COMPLAINT', summary: { contains: details } } }), { timeout: 30_000 }).toBe(1);
    await open(page, '/crm/complaints');
    await expect(page.getByTestId('complaint').first()).toBeVisible();
  });

  test('a low rating on the customer site opens a complaint and a callback', async ({ page, request }) => {
    await as(page, 'front-desk');
    const { plate } = await freshVehicle('RTG');
    const jobCardId = (await openJobCard(page, { plate, complaint: 'Engine knocking at idle' })).split('/').pop()!;
    const job = await db().jobCard.findUniqueOrThrow({ where: { id: jobCardId }, select: { customerId: true, customer: { select: { organisationId: true } } } });
    const rating = await db().jobRating.create({ data: { organisationId: job.customer.organisationId, jobCardId, customerId: job.customerId, expiresAt: new Date(Date.now() + 7 * 86_400_000) }, select: { id: true } });
    // The customer answers from the link, signed out.
    const customerPage = await page.context().browser()!.newPage();
    await customerPage.goto(`${WEBSITE}/rate/${ratingToken(rating.id)}`);
    await expect(customerPage.getByTestId('rating-form')).toBeVisible();
    await customerPage.locator('label', { has: customerPage.locator('input[name="score"][value="2"]') }).click();
    await customerPage.locator('textarea[name="comment"]').fill('The car came back late and nobody called me');
    await customerPage.getByRole('button', { name: 'Send my rating' }).click();
    await expect(customerPage.getByTestId('rating-thanks')).toBeVisible();
    // A second answer is not taken.
    await customerPage.goto(`${WEBSITE}/rate/${ratingToken(rating.id)}`);
    await expect(customerPage.getByTestId('rating-form')).toHaveCount(0);
    // A link that was tampered with opens nothing.
    await customerPage.goto(`${WEBSITE}/rate/${rating.id}.forged`);
    await expect(customerPage.getByTestId('rating-link-problem')).toBeVisible();
    await customerPage.close();
    // The reminders run picks up low scores.
    expect((await request.get('/api/cron/reminders', { headers: CRON })).ok()).toBe(true);
    await expect.poll(async () => (await db().jobRating.findUniqueOrThrow({ where: { id: rating.id }, select: { ticketId: true } })).ticketId, { timeout: 30_000 }).not.toBeNull();
    const after = await db().jobRating.findUniqueOrThrow({ where: { id: rating.id }, select: { score: true, ticketId: true } });
    expect(after.score).toBe(2);
    const ticket = await db().supportTicket.findUniqueOrThrow({ where: { id: after.ticketId! }, select: { kind: true, channel: true, jobCardId: true } });
    expect(ticket).toMatchObject({ kind: 'COMPLAINT', channel: 'RATING', jobCardId });
    expect(await db().followUp.count({ where: { jobCardId, reason: 'LOW_RATING' } })).toBe(1);
  });
});
