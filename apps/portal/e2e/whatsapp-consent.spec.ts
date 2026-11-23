import { test, expect } from '@playwright/test';
import { as, uniq } from './helpers';
import { db } from './db';

/**
 * WhatsApp consent at registration (Customers → Register): the tick box
 * "The customer agrees to receive updates on WhatsApp" is ticked once a
 * phone number is typed, and what the colleague leaves is what is kept —
 * recorded with who ticked it and when, shown on the customer's page, and
 * changeable there (Edit details). Unticked, nothing is recorded. Numbers
 * are on the reserved 0800 000 range.
 */
test('registration records the WhatsApp agreement, with who and when, and it can be switched off', async ({ page }) => {
  const tag = uniq();
  const email = `wa.consent.${tag.toLowerCase()}@e2e.test`;
  await as(page, 'front-desk');
  await page.goto('/crm?register=1');
  const form = page.locator('#register');
  const consent = form.getByTestId('whatsapp-consent');
  await expect(consent).not.toBeChecked();
  await form.getByLabel('Full name').fill(`Ngozi Consent ${tag}`);
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Primary phone').fill('0800 000 0207');
  await expect(consent, 'ticked once a phone number is typed').toBeChecked();
  await form.getByLabel('Primary address').fill('12 Idiroko Road, Ota');
  await form.getByRole('button', { name: 'Register customer' }).click();
  await page.waitForURL(/\/crm\/customers\/[^/?]+\?status=registered/);
  await expect(page.getByTestId('customer-whatsapp-consent')).toContainText('Agreed');

  const saved = await db().customer.findUniqueOrThrow({ where: { email }, select: { id: true, whatsappOptIn: true, whatsappOptInAt: true, whatsappOptInById: true } });
  expect(saved.whatsappOptIn).toBe(true);
  expect(saved.whatsappOptInAt).not.toBeNull();
  expect(saved.whatsappOptInById, 'recorded with the colleague who ticked it').not.toBeNull();

  // Switched off on the customer's page: kept, and the change is audited.
  await page.getByRole('link', { name: 'Edit details' }).first().click();
  await page.getByTestId('edit-whatsapp-consent').uncheck();
  await page.getByRole('button', { name: /Save/ }).first().click();
  await page.waitForURL(/status=saved/);
  await expect(page.getByTestId('customer-whatsapp-consent')).toContainText('Not agreed');
  const after = await db().customer.findUniqueOrThrow({ where: { id: saved.id }, select: { whatsappOptIn: true } });
  expect(after.whatsappOptIn).toBe(false);
  const audit = await db().auditLog.findFirst({ where: { entityType: 'Customer', entityId: saved.id, action: { contains: 'updated' } }, orderBy: { createdAt: 'desc' }, select: { metadata: true } });
  expect(JSON.stringify(audit?.metadata ?? {})).toContain('whatsappOptIn');
});

test('unticked at registration: nothing is recorded', async ({ page }) => {
  const tag = uniq();
  const email = `wa.noconsent.${tag.toLowerCase()}@e2e.test`;
  await as(page, 'front-desk');
  await page.goto('/crm?register=1');
  const form = page.locator('#register');
  await form.getByLabel('Full name').fill(`Emeka Noconsent ${tag}`);
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Primary phone').fill('0800 000 0208');
  await form.getByTestId('whatsapp-consent').uncheck();
  await form.getByLabel('Primary address').fill('3 Sango Road, Ota');
  await form.getByRole('button', { name: 'Register customer' }).click();
  await page.waitForURL(/\/crm\/customers\/[^/?]+\?status=registered/);
  const saved = await db().customer.findUniqueOrThrow({ where: { email }, select: { whatsappOptIn: true, whatsappOptInAt: true } });
  expect(saved.whatsappOptIn).toBe(false);
  expect(saved.whatsappOptInAt).toBeNull();
});
