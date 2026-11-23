import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { db } from './db';
import { expectHealthy, gotoSettled, signIn } from './helpers';
import { DEMO_E2E_PASSWORD } from './people';
import { DEMO_ORG_SLUG } from '../lib/demo/organisation';
import { DEMO_STAFF, demoPerson } from '../lib/demo/people';
import { tourFor } from '../lib/demo/tour';
import { DEMO_ENABLED, DEMO_OFF } from './edition';

/**
 * The role tour of docs/DEMO.md, in the browser: every demo
 * sign-in lands on its own dashboard, its three clicks open (never
 * "Access denied"), and every "must not" is refused when typed in. Then the
 * branch fences on real demo records, and the reset refusing a hosted
 * database. The catalogue side of each promise is checked in
 * tests/demo-tour.test.ts; the demo itself was loaded by the CI seed.
 */

// Each person is independent: spread over the workers.
test.skip(!DEMO_ENABLED, DEMO_OFF);
test.describe.configure({ mode: 'parallel' });

for (const person of DEMO_STAFF) {
  test(`tour — ${person.email.split('@')[0]} (${person.jobTitle})`, async ({ page }) => {
    test.setTimeout(150_000);
    const stop = tourFor(person.email)!;
    await signIn(page, person.email, DEMO_E2E_PASSWORD);
    await test.step('lands on their own dashboard, under their own name', async () => {
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.getByRole('button', { name: 'Account menu' })).toContainText(person.name);
      await expectHealthy(page, '/dashboard');
    });
    await test.step('the three clicks open', async () => {
      for (const c of stop.clicks) {
        const res = await gotoSettled(page, c.href);
        expect(res?.status() ?? 0, `${c.href} status`).toBeLessThan(500);
        await expect(page, `${person.email}: ${c.label}`).not.toHaveURL(/\/access-denied|\/login/);
        await expectHealthy(page, c.href);
      }
    });
    await test.step(`${stop.mustNot.length} "must not" pages are refused`, async () => {
      for (const m of stop.mustNot) {
        const res = await page.request.get(m.href);
        const body = await res.text();
        expect(res.status(), `${m.href} status`).toBeLessThan(500);
        expect(/\/access-denied/.test(res.url()) || body.includes('/access-denied'), `${person.email} must not ${m.label} (${m.href})`).toBe(true);
      }
    });
  });
}

async function demoJob(where: Record<string, unknown>) {
  const org = await db().organisation.findUniqueOrThrow({ where: { slug: DEMO_ORG_SLUG }, select: { id: true } });
  return db().jobCard.findFirstOrThrow({ where: { customer: { organisationId: org.id, externalSource: 'EJO-DEMO' }, ...where }, orderBy: { createdAt: 'desc' }, select: { id: true, jobNumber: true } });
}

test('fences on real demo records: a technician on the cars bay cannot work on the fleet bay’s job card; the calendar user cannot open it; the Managing Director can', async ({ page }) => {
  test.setTimeout(150_000);
  const fleetTech = await db().user.findUniqueOrThrow({ where: { email: DEMO_STAFF.find((s) => s.email.startsWith('tech.3@'))!.email }, select: { id: true } });
  const job = await demoJob({ assignedTechnicianId: fleetTech.id, status: { in: ['IN_PROGRESS', 'READY_FOR_COLLECTION', 'CHECKED_OUT'] } });
  await page.context().clearCookies();
  await signIn(page, demoPerson('security').email, DEMO_E2E_PASSWORD);
  await gotoSettled(page, `/workshop/job-cards/${job.id}`);
  await expect(page.getByText(job.jobNumber)).toHaveCount(0);
  await page.context().clearCookies();
  await signIn(page, demoPerson('owner', 'BIZ').email, DEMO_E2E_PASSWORD);
  await gotoSettled(page, `/workshop/job-cards/${job.id}`);
  await expect(page.getByText(job.jobNumber).first()).toBeVisible();
  await expectHealthy(page);
});

test('the reset refuses a hosted environment without the confirmation, and touches nothing', async () => {
  // A demo job card before; a reset that ran would have replaced it with a new id.
  const kept = await demoJob({ status: 'CHECKED_OUT' });
  let out = '';
  let code = 0;
  try {
    execFileSync('npx', ['tsx', 'apps/portal/scripts/demo-reset.ts'], { cwd: join(__dirname, '..', '..', '..'), env: { ...process.env, VERCEL_ENV: 'production', DEMO_RESET_CONFIRM: '' }, encoding: 'utf8', timeout: 120_000, stdio: 'pipe' });
  } catch (e) {
    const err = e as { status?: number; stderr?: string; stdout?: string };
    code = err.status ?? 1; out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
  expect(code).not.toBe(0);
  expect(out).toMatch(/Refused: this is a hosted environment/);
  expect(await db().jobCard.count({ where: { id: kept.id } })).toBe(1);
});
