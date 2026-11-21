import { test, expect, type Page } from '@playwright/test';
import { as, expectHealthy, uniq, waitOutcome } from './helpers';
import { db } from './db';
import { jcForm } from './workflows';

/**
 * How it behaves when people are people: double clicks, Back / Refresh
 * after saving, a session that expires while a form is open, very long
 * input, accents/emoji/markup in names — nothing duplicates, nothing
 * crashes, nothing is injected. Walked on the front desk's own reminders:
 * a form every member of staff has.
 */

async function fillReminder(page: Page, title: string, notes = 'Call the customer back about the estimate') {
  await page.goto('/reminders/new');
  const form = jcForm(page, 'Save reminder');
  await form.locator('input[name="title"]').fill(title);
  await form.locator('textarea[name="notes"]').fill(notes);
  return form;
}
const remindersTitled = (title: string) => db().reminder.count({ where: { title } });

test('a double click on a submit button records ONE reminder', async ({ page }) => {
  const title = `Call back ${uniq()}`;
  await as(page, 'receptionist');
  const form = await fillReminder(page, title);
  await form.getByRole('button', { name: 'Save reminder' }).dblclick();
  await waitOutcome(page, /\/reminders\?status=created/);
  await page.waitForTimeout(1500);
  expect(await remindersTitled(title)).toBe(1);
});

test('Back and Refresh after saving never save it again', async ({ page }) => {
  const title = `Follow up ${uniq()}`;
  await as(page, 'receptionist');
  const form = await fillReminder(page, title);
  await form.getByRole('button', { name: 'Save reminder' }).click();
  await waitOutcome(page, /status=created/);
  await page.reload();
  await expectHealthy(page);
  await page.goBack();
  await page.waitForLoadState('domcontentloaded');
  await expectHealthy(page);
  await page.goForward();
  await page.waitForLoadState('domcontentloaded');
  await page.reload();
  await expectHealthy(page);
  expect(await remindersTitled(title)).toBe(1);
});

test('a session that expires while a form is open: sent to sign in, nothing saved', async ({ page }) => {
  const title = `Expired ${uniq()}`;
  await as(page, 'receptionist');
  const form = await fillReminder(page, title);
  await page.context().clearCookies();
  await form.getByRole('button', { name: 'Save reminder' }).click();
  await page.waitForURL(/\/login|\/signed-out/, { timeout: 20_000 }).catch(() => undefined);
  if (!/\/login/.test(page.url())) {
    // The action may be refused in place; the next click must land on sign-in.
    await page.goto('/reminders');
  }
  await expect(page).toHaveURL(/\/login/);
  await expectHealthy(page);
  expect(await remindersTitled(title), 'nothing created without a session').toBe(0);
});

test('very long input is either saved whole or refused politely — never a crash', async ({ page }) => {
  const title = `Long ${uniq()}`;
  await as(page, 'receptionist');
  const form = await fillReminder(page, title);
  // Past the browser's own limits, as a script or an old browser would send it.
  await form.locator('input[name="title"], textarea[name="notes"]').evaluateAll((els) => els.forEach((e) => e.removeAttribute('maxlength')));
  await form.locator('textarea[name="notes"]').fill(`Long note. ${'The customer called again and again. '.repeat(250)}`);
  await form.locator('input[name="title"]').fill(`${title} ${'X'.repeat(2000)}`);
  await form.getByRole('button', { name: 'Save reminder' }).click();
  await page.waitForURL(/status=created|error=/);
  await expectHealthy(page);
  const error = new URL(page.url()).searchParams.get('error');
  const saved = await db().reminder.count({ where: { title: { startsWith: title } } });
  if (error) {
    expect(error, 'a plain message, not a stack trace').not.toMatch(/prisma|stack|at \w+ \(|invalid `/i);
    expect(saved).toBe(0);
  } else {
    expect(saved).toBe(1);
  }
});

test('accents, emoji and markup in a title are kept as typed and never run', async ({ page }) => {
  const title = `Ọlá Àdébáyọ̀ 🚗 <b>bold</b> ${uniq()}`;
  await as(page, 'receptionist');
  const form = await fillReminder(page, title);
  await form.getByRole('button', { name: 'Save reminder' }).click();
  await waitOutcome(page, /\/reminders\?status=created/);
  await expect(page.getByText(title).first()).toBeVisible();
  await expect(page.locator('main b', { hasText: 'bold' })).toHaveCount(0);
  expect(await remindersTitled(title)).toBe(1);
});
