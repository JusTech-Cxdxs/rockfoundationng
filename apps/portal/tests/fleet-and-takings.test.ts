/**
 * The fleet report's figures (@ejo/utils/fleet-report, shared by the staff
 * PDF and the customer portal), and Enyo's takings for Accounts: money in
 * without revenue, costs or profit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fleetPeriod, fleetReport, type FleetJob } from '@ejo/utils/fleet-report';
import { ROLE_GRANTS } from '../lib/authz/catalogue';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const d = (s: string) => new Date(`${s}T10:00:00+01:00`);
const job = (o: Partial<FleetJob>): FleetJob => ({ vehicleId: 'v1', jobNumber: 'JC-1', jobType: 'SERVICE', status: 'CHECKED_OUT', openedAt: d('2026-11-05'), checkedOutAt: d('2026-11-06'), charged: 50_000, paid: 50_000, credited: 0, comeback: false, ...o });

test('fleet report: the period counts visits and charges; owed is the whole account after payments and credit notes', () => {
  const jobs = [
    job({}),
    job({ vehicleId: 'v2', jobNumber: 'JC-2', jobType: 'REPAIR', charged: 120_000, paid: 70_000, credited: 10_000 }),
    job({ vehicleId: 'v2', jobNumber: 'JC-3', jobType: 'REPAIR', comeback: true, charged: 0, paid: 0 }),
    job({ jobNumber: 'JC-0', openedAt: d('2026-09-01'), charged: 30_000, paid: 20_000 }), // before the period: owed still counts
    job({ jobNumber: 'JC-X', status: 'CANCELLED', charged: 99_000, paid: 0 }), // cancelled: nothing owed or charged
  ];
  const vehicles = [
    { id: 'v1', label: 'Toyota Hilux', plate: 'KJA 1', nextServiceDate: d('2026-12-10'), nextServiceKm: 90_000 },
    { id: 'v2', label: 'Toyota Hiace', plate: 'KJA 2', nextServiceDate: d('2027-03-01'), nextServiceKm: null },
    { id: 'v3', label: 'Nissan Urvan', plate: 'KJA 3', nextServiceDate: null, nextServiceKm: null },
  ];
  const r = fleetReport(jobs, vehicles, d('2026-11-01'), d('2026-11-30'));
  assert.equal(r.visits, 3);
  assert.equal(r.vehiclesSeen, 2);
  assert.equal(r.charged, 170_000);
  assert.equal(r.comebacks, 1);
  assert.equal(r.owed, 50_000, '40,000 on JC-2 and 10,000 on JC-0');
  assert.deepEqual(r.byType.map((t) => [t.jobType, t.visits, t.charged]), [['REPAIR', 2, 120_000], ['SERVICE', 1, 50_000]]);
  assert.equal(r.vehicles[0]!.id, 'v2', 'most charged first');
  assert.equal(r.vehicles.find((v) => v.id === 'v1')!.owed, 10_000);
  assert.equal(r.dueForService, 1, 'v1 is due within 30 days of the period end');
  assert.equal(r.vehicles.find((v) => v.id === 'v3')!.visits, 0, 'a vehicle with no visit is still listed');
});

test('fleet periods are Lagos calendar months; a bad custom range falls back to this month', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const last = fleetPeriod('last-month', now);
  assert.equal(last.label, '01/10/2026 to 31/10/2026');
  assert.equal(last.from.toISOString(), '2026-09-30T23:00:00.000Z');
  assert.equal(fleetPeriod('this-month', now).label, '01/11/2026 to 23/11/2026');
  assert.equal(fleetPeriod('custom', now, { from: '2026-11-10', to: '2026-11-01' }).label, '01/11/2026 to 23/11/2026');
  assert.equal(fleetPeriod('custom', now, { from: '2026-01-01', to: '2026-03-31' }).label, '01/01/2026 to 31/03/2026');
});

test('fleet report: downloaded by front desk, Accounts and the Owner, inside their organisation, and recorded', () => {
  for (const r of ['front-desk', 'accounts']) assert.ok('money.fleet_report.view' in ROLE_GRANTS[r]!, r);
  for (const r of ['technician', 'store-keeper', 'security', 'workshop-supervisor']) assert.ok(!('money.fleet_report.view' in (ROLE_GRANTS[r] ?? {})), r);
  const route = read('app/api/customers/[id]/fleet-report/route.ts');
  assert.match(route, /await authorize\('money\.fleet_report\.view'/);
  assert.match(route, /fleetReportPdfFor\(id, organisationId, period\)/);
  assert.match(route, /action: 'customer\.fleet_report_downloaded'/);
  assert.match(read('lib/fleet/server.ts'), /prisma\.customer\.findFirst\(\{\s*where: \{ id: customerId, organisationId \}/);
  // The customer portal: a company's own account only (the signed-in customer, never an id from the address).
  const page = read('../website/app/customer-portal/dashboard/fleet-report/page.tsx');
  assert.match(page, /if \(me\.customerType !== 'ORGANIZATION'\) notFound\(\);/);
  assert.match(page, /loadServices\(me\.id, 2000\), loadVehicles\(me\.id\)/);
});

test('Enyo takings for Accounts: money in, never revenue, cost or profit', () => {
  assert.ok('money.takings.view' in ROLE_GRANTS.accounts!);
  assert.ok(!('analytics.business.view' in ROLE_GRANTS.accounts!), 'Accounts still does not see business analytics (profit)');
  const src = read('lib/enyo/tools/business.ts');
  const start = src.indexOf("name: 'takings_summary'");
  const block = src.slice(start, src.indexOf("name: 'business_summary'"));
  assert.ok(start > 0);
  assert.match(block, /if \(!\(await allows\('money\.takings\.view'\)\)\) return refused\(TAKINGS_WHO\);/);
  assert.doesNotMatch(block, /grossProfit|grossMargin|partsCost|costOf|unitCost|revenue:|sales:/, 'no profit, cost or revenue in the answer');
  assert.match(block, /await reachWhere\('money\.takings\.view'\)/);
  // Enyo is offered the tool for takings questions.
  assert.match(read('lib/enyo/tool-select.ts'), /tools: \['takings_summary', 'business_summary'/);
});

test('the Owner\'s receivables: against the invoice (VAT included) less credit notes; counter sales in sales but not jobs', () => {
  const src = read('lib/master-analytics.ts');
  assert.match(src, /const billed = j\.billed \?\? customer;/);
  assert.match(src, /owed: r2\(billed - paid - \(j\.credited \?\? 0\)\)/);
  assert.match(src, /jobsCompleted: doneJobs\.length,/);
  assert.doesNotMatch(src, /vehicle-service/, 'no route of a removed module');
  assert.match(read('lib/actions/master-analytics.ts'), /kind: 'CS' as const/);
});

test('the letterhead never prints a prefix twice', async () => {
  const { registrationLine } = await import('../lib/utils/registration-line');
  assert.equal(registrationLine({ poBox: 'P.O. Box 257, Ota, Ogun State', rcNumber: 'RC 1772429' }), 'P.O. Box 257, Ota, Ogun State   ·   RC Number: 1772429');
  assert.equal(registrationLine({ poBox: '257, Ota', rcNumber: '1772429' }), 'P.O. Box 257, Ota   ·   RC Number: 1772429');
  assert.equal(registrationLine({ poBox: null, rcNumber: 'RC Number: 1772429' }), 'RC Number: 1772429');
  assert.equal(registrationLine({}), '');
});
