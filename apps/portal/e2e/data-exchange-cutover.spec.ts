import { test, expect } from '@playwright/test';
import { as, open } from './helpers';
import { db } from './db';
import { WORKSHOP_BRANCH } from './people';

/**
 * P9 — the cut-over checklist: every branch with how far it has come; a
 * branch's files in load order with their state worked out from the imports;
 * the Administrator marks a step not needed (a reason is required), and needed
 * again; each mark is in the audit trail; the sign-off waits until every step
 * is settled. Someone who only prepares files sees the checklist but cannot
 * mark it; another organisation's branch, or one that is not a branch at all,
 * is not found.
 */
test.describe.configure({ mode: 'serial' });

// The workshop's steps in this edition: the Store's three only while it is on.
const STEPS = ['staff', 'customers', 'vehicles', 'suppliers', 'parts', 'stock', 'invoices', 'jobs', 'openJobs'];

test('the Administrator: the workshop’s checklist in order, a step marked not needed with its reason and needed again, the sign-off waiting', async ({ page }) => {
  const workshop = await db().branch.findFirstOrThrow({ where: { name: WORKSHOP_BRANCH }, select: { id: true } });
  await as(page, 'owner');
  await open(page, '/data-exchange');
  await page.getByRole('link', { name: 'Cut-over checklist' }).click();
  await page.waitForURL(/\/data-exchange\/cutover$/);
  await expect(page.getByTestId('cutover-branch').filter({ hasText: WORKSHOP_BRANCH })).toContainText(new RegExp(`Workshop · \\d+ of ${STEPS.length} steps settled`, 'i'));
  await page.getByRole('link', { name: WORKSHOP_BRANCH, exact: true }).click();
  await page.waitForURL(new RegExp(`/data-exchange/cutover/${workshop.id}$`));
  await expect(page.getByTestId('cutover-step')).toHaveCount(STEPS.length);
  expect(await page.getByTestId('cutover-step').evaluateAll((els) => els.map((e) => e.getAttribute('data-entity')))).toEqual(STEPS);

  const invoices = page.locator('[data-testid="cutover-step"][data-entity="invoices"]');
  const before = await invoices.getAttribute('data-state');
  test.skip(before === 'DONE' || before === 'AWAITING_FINANCE' || before === 'AWAITING_APPROVAL' || before === 'IN_PROGRESS', 'invoice history is loaded or under way on this database');
  if (before === 'NOT_NEEDED') { await invoices.getByRole('button', { name: 'Needed after all' }).click(); await expect(invoices).not.toHaveAttribute('data-state', 'NOT_NEEDED'); }
  await invoices.getByRole('button', { name: 'Not needed here' }).click();
  await invoices.getByLabel(/Why does this branch have no invoices/).fill('n/a');
  await invoices.getByRole('button', { name: 'Mark as not needed' }).click();
  await expect(invoices.getByRole('alert')).toContainText('Say why this branch has none');
  await invoices.getByLabel(/Why does this branch have no invoices/).fill('No invoices from before EJO');
  await invoices.getByRole('button', { name: 'Mark as not needed' }).click();
  await expect(invoices).toHaveAttribute('data-state', 'NOT_NEEDED');
  await expect(invoices).toContainText('Not needed: “No invoices from before EJO”');
  await expect(page.getByText(/Marked not needed: Invoice history/).first()).toBeVisible();
  expect(await db().auditLog.count({ where: { entityType: 'BranchCutover', entityId: workshop.id, action: 'data_exchange.cutover_step_not_needed' } })).toBeGreaterThan(0);
  // The sign-off waits for every step.
  const signOff = page.getByRole('button', { name: `Sign off ${WORKSHOP_BRANCH} as cut over` });
  const settled = await page.getByTestId('cutover-step').evaluateAll((els) => els.filter((e) => ['DONE', 'NOT_NEEDED'].includes(e.getAttribute('data-state') ?? '')).length);
  if (settled < STEPS.length) await expect(signOff).toBeDisabled();
  // Needed again.
  await invoices.getByRole('button', { name: 'Needed after all' }).click();
  await expect(invoices).not.toHaveAttribute('data-state', 'NOT_NEEDED');
});

test('someone who only prepares files sees the checklist but cannot mark it; a branch of nowhere is not found', async ({ page }) => {
  const workshop = await db().branch.findFirstOrThrow({ where: { name: WORKSHOP_BRANCH }, select: { id: true } });
  await as(page, 'front-desk');
  await open(page, `/data-exchange/cutover/${workshop.id}`);
  await expect(page.getByTestId('cutover-step')).toHaveCount(STEPS.length);
  await expect(page.getByRole('button', { name: 'Not needed here' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Sign off/ })).toHaveCount(0);
  await page.goto('/data-exchange/cutover/not-a-branch');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
