import { test, expect, type Page } from '@playwright/test';
import { who } from './people';
import { as, open, eventually, bellText, countMail, latestMail, uniq, visitHealthy, waitOutcome } from './helpers';
import { publishBroadcast } from './workflows';

/**
 * Broadcasts reach exactly the people they are for: one to everyone, one
 * only to Accounts (also emailed). People mark them read; the
 * analytics count the reads. A broadcast meant for others is never shown.
 */
test.describe.configure({ mode: 'serial' });

const tag = uniq();
const S = { all: `Fire drill at 2 pm ${tag}`, role: `Accounts: month-end close ${tag}`, allUrl: '', roleUrl: '' };

const publish = publishBroadcast;

test('the Owner publishes one notice to everyone and one to Accounts', async ({ page, request }) => {
  await as(page, 'owner');
  S.allUrl = await publish(page, { category: /Security alert/, title: S.all, message: 'Assemble at the car park.', audience: 'ALL', email: false });
  S.roleUrl = await publish(page, { category: /Important/, title: S.role, message: 'Bring the payment figures for the month.', audience: 'ROLE', role: 'Accounts', email: true });
  const mail = await latestMail(request, who('accounts').email, new RegExp(tag));
  expect(mail.html).toContain('Bring the payment figures for the month.');
  // Not emailed to someone it is not for.
  expect(await countMail(request, who('technician').email, new RegExp(tag))).toBe(0);
});

test('a technician sees the one for everyone, never the Accounts one', async ({ page }) => {
  await as(page, 'technician');
  await eventually(page, async () => expect(await bellText(page)).toContain(S.all));
  expect(await bellText(page)).not.toContain(S.role);
  await page.goto('/notifications?tab=broadcasts');
  await expect(page.getByRole('heading', { name: S.all })).toBeVisible();
  await expect(page.getByRole('heading', { name: S.role })).toHaveCount(0);
});

test('Accounts sees both and marks one read', async ({ page }) => {
  await as(page, 'accounts');
  await open(page, '/notifications?tab=broadcasts');
  await eventually(page, async () => {
    await expect(page.getByRole('heading', { name: S.all })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('heading', { name: S.role })).toBeVisible({ timeout: 5_000 });
  });
  const cardOf = (title: string) => page.locator('div[id]').filter({ has: page.getByRole('heading', { name: title }) }).first();
  // The button flips at once; the read is saved in the background — wait for that before reloading.
  const saved = page.waitForResponse((r) => r.request().method() === 'POST' && Boolean(r.request().headers()['next-action']));
  await cardOf(S.role).getByRole('button', { name: 'Mark read' }).click();
  await expect(cardOf(S.role).getByRole('button', { name: 'Mark unread' })).toBeVisible();
  await saved;
  await page.reload();
  await expect(cardOf(S.role).getByRole('button', { name: 'Mark unread' })).toBeVisible();
  // The bell follows (its summary is cached briefly on the server).
  await eventually(page, async () => expect(await bellText(page)).not.toContain(S.role), 75_000);
});

test('the reads are counted; broadcast analytics open', async ({ page }) => {
  await as(page, 'owner');
  await page.goto(S.roleUrl);
  await expect(page.locator('main')).toContainText(/Read by\s*1 person/);
  await visitHealthy(page, '/notifications/broadcasts/analytics');
  await expect(page.getByRole('heading', { name: 'Broadcast analytics' })).toBeVisible();
  await visitHealthy(page, '/notifications/broadcasts?tab=all');
  await expect(page.getByText(S.role).first()).toBeVisible();
});

test('a broadcast meant for managers stays hidden from a technician everywhere', async ({ page }) => {
  await as(page, 'technician');
  await page.goto('/notifications/broadcasts?tab=all');
  await expect(page.getByText(S.role)).toHaveCount(0);
  await page.goto(S.roleUrl);
  await expect(page.getByText('Bring the Q3 workshop figures.')).toHaveCount(0);
});
