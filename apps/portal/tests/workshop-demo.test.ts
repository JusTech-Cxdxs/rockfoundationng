/**
 * The workshop demo plan (lib/workshop/demo/plan.ts): seven invented months
 * of Rock Foundation Automobile's Ota Workshop, the same every run, cut
 * at "now", with every stage present and every rule the portal enforces
 * holding inside it — so the demo never shows a thing EJO itself would
 * refuse.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OLD_ORGANISATION, PLANT_MAKE } from './leftovers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { billingTotals, depositOf } from '@ejo/utils/billing';
import { DEMO_DEPOSIT_FRACTION, DEMO_VAT_RATE, estimateTotals, planWorkshopDemo, type JobCardStatus } from '../lib/workshop/demo/plan';
import { COMPANIES, JOB_LINES, MODELS } from '../lib/workshop/demo/catalogue';
import { DEMO_CUSTOMERS, DEMO_STAFF, isDemoEmail } from '../lib/demo/people';
import { REWORK_FROM_STATUSES } from '../lib/job-card-status-rules';

const NOW = new Date('2026-11-03T09:30:00Z');
const plan = planWorkshopDemo(NOW);
const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const STATUSES: JobCardStatus[] = ['CHECKED_IN', 'AWAITING_CUSTOMER_APPROVAL', 'IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'CHECKED_OUT', 'CANCELLED'];
const paidOn = (j: (typeof plan.jobCards)[number]) => j.payments.reduce((s, p) => s + p.amount, 0);

test('the same plan every run; nothing dated after now; seven months back', () => {
  const again = planWorkshopDemo(NOW);
  assert.equal(JSON.stringify(again.figures), JSON.stringify(plan.figures));
  assert.equal(again.jobCards[40]!.openedAt.toISOString(), plan.jobCards[40]!.openedAt.toISOString());
  // Every date is in the past except the ones that are meant to be ahead: due, expiry, end and expected times.
  const AHEAD = new Set(['endsAt', 'dueDate', 'validUntil', 'expiresAt', 'expectedAt', 'expectedReturnAt', 'expectedOutAt', 'dueFirstResponseAt', 'dueResolutionAt', 'startsAt']);
  const dates: [string, Date][] = [];
  const walk = (v: unknown, key: string) => { if (v instanceof Date) dates.push([key, v]); else if (Array.isArray(v)) v.forEach((x) => walk(x, key)); else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, k)); };
  walk({ ...plan, figures: undefined }, '');
  for (const [key, d] of dates) if (!AHEAD.has(key)) assert.ok(d <= NOW, `${key} ${d.toISOString()} is after now`);
  assert.ok(NOW.getTime() - plan.from.getTime() >= 200 * 86_400_000);
});

test('every Job Card status today, repairs and services, at any hour of any day; the sign-ins have their stories', () => {
  // Monday first thing, a Saturday afternoon and a Wednesday evening: the stages are still all there.
  for (const when of [NOW, new Date('2026-11-09T06:40:00Z'), new Date('2026-11-07T14:00:00Z'), new Date('2026-11-18T19:30:00Z')]) {
    const p = planWorkshopDemo(when);
    for (const st of STATUSES) assert.ok(p.jobCards.some((j) => j.status === st), `${when.toISOString()}: a job card at ${st}`);
    assert.ok(p.jobCards.some((j) => j.service && j.status === 'CHECKED_OUT') && p.jobCards.some((j) => j.service && !j.checkedOutAt), `${when.toISOString()}: services done and open`);
    assert.ok(p.figures.serviceDueSoon! >= 1 && p.figures.serviceOverdue! >= 1, `${when.toISOString()}: the Service Tracker has vehicles due and overdue`);
    assert.ok(p.figures.invoicesOverdue! >= 1, `${when.toISOString()}: a fleet invoice past its due date`);
  }
  const services = plan.jobCards.filter((j) => j.service).length;
  assert.ok(services >= plan.jobCards.length * 0.3 && services <= plan.jobCards.length * 0.7, `a mix of repairs and services: ${services} of ${plan.jobCards.length}`);
  assert.ok(plan.jobCards.some((j) => j.rework) && plan.jobCards.some((j) => j.refund), 'rework and a refund');
  assert.ok(plan.jobCards.some((j) => j.estimate?.declined), 'an estimate the customer declined');
  for (const c of DEMO_CUSTOMERS) {
    const key = c.email.split('@')[0]!;
    assert.ok(plan.customers.some((x) => x.key === key && x.email === c.email), key);
    assert.ok(plan.vehicles.some((v) => v.customerKey === key), `${key} has a vehicle`);
  }
  assert.ok(plan.jobCards.some((j) => j.customerKey === 'customer.individual' && j.status === 'AWAITING_CUSTOMER_APPROVAL' && j.estimate?.link && !j.estimate.link.usedAt), 'the individual’s estimate waiting for approval, its link sent');
  assert.ok(plan.jobCards.some((j) => j.customerKey === 'customer.individual' && j.service && j.invoice && j.payments.length >= 2), 'the individual’s last service: invoice and receipts');
  assert.ok(plan.jobCards.some((j) => j.customerKey === 'customer.fleet' && j.invoice?.dueDate && j.invoice.dueDate < NOW && paidOn(j) < j.estimate!.totals.total), 'the fleet’s invoice past its due date');
  assert.ok(plan.jobCards.some((j) => j.customerKey === 'customer.fleet' && ['CHECKED_IN', 'IN_PROGRESS'].includes(j.status)), 'the fleet’s job cards open today');
  assert.ok(plan.figures.jobCards! >= 100 && plan.figures.customers! >= 15);
});

test('the three invented fleets, on credit, with their contacts; fleet makes and models from 2006 to date; individuals with their own cars', () => {
  assert.deepEqual(plan.customers.filter((c) => c.type === 'ORGANIZATION').map((c) => c.name), ['Bolaji Haulage Services', 'Greenfield Agro Logistics', 'Sunrise Staff Bus Company']);
  for (const c of plan.customers.filter((x) => x.type === 'ORGANIZATION')) {
    assert.ok(c.credit && c.credit.days > 0 && c.credit.limit > 0 && c.credit.approvedAt <= NOW, `${c.name} on credit`);
    assert.ok(c.contacts.some((k) => k.role === 'Fleet Owner'), `${c.name} has a Fleet Owner on the account`);
    const fleet = plan.vehicles.filter((v) => v.customerKey === c.key);
    assert.ok(fleet.length >= 3 && fleet.length <= 6, `${c.name}: a handful of vehicles`);
  }
  for (const v of plan.vehicles) assert.ok(v.year >= 2006 && v.year <= 2026, `${v.make} ${v.model} ${v.year}`);
  const fleetModels = new Set(plan.vehicles.filter((v) => plan.customers.find((c) => c.key === v.customerKey)!.type === 'ORGANIZATION').map((v) => `${v.make} ${v.model}`));
  for (const m of ['Toyota Hilux', 'Toyota Hiace', 'Toyota Land Cruiser', 'Ford Ranger', 'Mitsubishi L200']) assert.ok(fleetModels.has(m), m);
  assert.ok(plan.customers.filter((c) => c.type === 'INDIVIDUAL').length >= 8);
  assert.equal(COMPANIES[0]!.key, 'customer.fleet');
  for (const m of MODELS) assert.ok(m.years[0] >= 2006, m.model);
});

test('the workshop’s rules hold in every job card: stages in order with their stamps; the customer’s answer, and an individual’s deposit, before work; VAT fixed at the Owner’s approval; large discounts approved by the Owner; an individual paid in full before closing; a fleet on credit leaves only with its invoice; refunds only after a cancellation', () => {
  const order = ['CHECKED_IN', 'AWAITING_CUSTOMER_APPROVAL', 'IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'CHECKED_OUT'];
  for (const j of plan.jobCards) {
    const est = j.estimate;
    const customer = plan.customers.find((c) => c.key === j.customerKey)!;
    const org = customer.type === 'ORGANIZATION';
    if (est) {
      for (const l of est.lines) { assert.equal(l.amount, l.quantity * l.unitPrice, `${j.key} line amount`); assert.ok(l.unitPrice > 0 && l.discount >= 0 && l.discount <= l.amount); assert.ok(['LABOUR', 'EXTERNAL_PART', 'EXTERNAL_JOB', 'SUNDRY'].includes(l.type), `${j.key}: no Store parts (${l.type})`); }
      assert.deepEqual(est.totals, estimateTotals(est), `${j.key} totals are the one rule`);
      if (est.status !== 'DRAFT') assert.ok(est.submittedAt && est.submittedAt >= est.createdAt);
      if (est.status === 'MANAGER_APPROVED') assert.equal(est.vatRate, DEMO_VAT_RATE, `${j.key}: VAT fixed`); else assert.equal(est.vatRate, null);
      if (est.discountAmount * 100 > est.totals.subtotal * 10 && est.status === 'MANAGER_APPROVED') assert.ok(est.discountApprovedAt, `${j.key}: a discount above 10% approved by the Owner`);
      if (est.customerNotifiedAt) { assert.equal(est.status, 'MANAGER_APPROVED'); assert.ok(est.managerApprovedAt! <= est.customerNotifiedAt && est.approvedAt! <= est.managerApprovedAt!); }
      if (est.approval) { assert.ok(est.customerNotifiedAt && est.approval.at >= est.customerNotifiedAt, `${j.key}: answered after being told`); if (est.approval.via === 'PHONE') assert.ok(est.approval.byStaffKey); if (est.approval.via === 'DEPOSIT') assert.ok(!org); }
      if (est.link) { assert.ok(est.link.expiresAt > est.link.createdAt); assert.ok(!(est.link.usedAt && est.link.revokedAt)); if (est.approval?.via === 'LINK') assert.ok(est.link.usedAt); }
    }
    const paid = paidOn(j);
    if (j.workStartedAt) {
      assert.ok(est?.approval && est.approval.at <= j.workStartedAt, `${j.key} work after the customer’s answer`);
      const deposit = org ? 0 : depositOf(est!.totals.total, DEMO_DEPOSIT_FRACTION);
      if (deposit > 0) assert.ok(j.payments[0] && j.payments[0].at <= j.workStartedAt && j.payments[0].amount >= deposit, `${j.key} deposit before work`);
      else assert.ok(!j.payments.some((p) => p.at <= j.workStartedAt!), `${j.key}: a fleet pays no deposit`);
    }
    if (j.cancellation?.status === 'APPROVED') { assert.ok(['CANCELLED', 'CHECKED_OUT'].includes(j.status) && !j.completedAt, `${j.key} cancelled: ${j.status}`); if (j.status === 'CHECKED_OUT') assert.ok(j.checkedOutAt && j.gateExit); if (j.refund) { assert.ok(j.refund.at >= j.cancellation.decidedAt!); assert.equal(j.refund.amount, paid); } continue; }
    if (order.indexOf(j.status) >= order.indexOf('IN_PROGRESS')) assert.ok(j.workStartedAt, `${j.key} ${j.status} has workStartedAt`);
    if (['COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'CHECKED_OUT'].includes(j.status)) {
      assert.ok(j.completedAt && j.completedAt >= j.workStartedAt!, `${j.key} completedAt`);
      assert.ok(j.invoice && j.invoice.issuedAt.getTime() === j.completedAt.getTime(), `${j.key}: the invoice is issued on completion`);
      assert.equal(Boolean(j.invoice.dueDate), j.onCredit, `${j.key}: a due date only on credit`);
      assert.ok(Math.abs(j.invoice.amountPaidAtIssue - j.payments.filter((p) => p.at <= j.invoice!.issuedAt).reduce((s, p) => s + p.amount, 0)) < 0.01);
    } else assert.equal(j.invoice, null, `${j.key}: no invoice before the work is finished`);
    if (['READY_FOR_COLLECTION', 'CLOSED', 'CHECKED_OUT'].includes(j.status)) assert.ok(j.readyForCollectionAt && j.readyForCollectionAt >= j.completedAt!);
    if (['CLOSED', 'CHECKED_OUT'].includes(j.status)) {
      assert.ok(j.close?.status === 'APPROVED' && j.closedAt && j.closedAt >= j.readyForCollectionAt!, `${j.key} closed through an approved request`);
      const paidAtClose = j.payments.filter((p) => p.at <= j.closedAt!).reduce((s, p) => s + p.amount, 0);
      if (!j.onCredit) assert.ok(Math.abs(paidAtClose - est!.totals.total) < 0.01, `${j.key} paid in full before closing`);
      else assert.ok(paidAtClose <= est!.totals.total + 0.01 && paid <= est!.totals.total + 0.01, `${j.key}: a fleet never pays more than the invoice`);
    }
    if (j.status === 'CHECKED_OUT') assert.ok(j.checkedOutAt && j.collectedByName && j.gateExit && j.gateExit.at >= j.checkedOutAt);
    if (j.status === 'CANCELLED') assert.equal(j.cancellation?.status, 'APPROVED');
    assert.equal(j.refund, null, `${j.key}: a refund only after a cancellation`);
    if (j.cancellation && j.cancellation.status === 'PENDING') assert.ok(!['CANCELLED', 'CHECKED_OUT'].includes(j.status));
    if (j.rework) { assert.ok(j.workStartedAt && j.rework.at > j.workStartedAt); assert.ok(REWORK_FROM_STATUSES.includes('QUALITY_CHECK')); assert.ok(j.audit.some((a) => a.action === 'job_card.rework_requested')); }
    assert.ok(j.audit.length >= 1 && j.audit[0]!.action === 'job_card.created');
    assert.ok(j.technicianKey !== j.supervisorKey);
    const sup = DEMO_STAFF.find((s) => s.email === j.supervisorKey)!; assert.equal(sup.role, 'workshop-supervisor', `${j.key}: supervised by the Service Advisor`);
    const tech = DEMO_STAFF.find((s) => s.email === j.technicianKey)!; assert.equal(tech.role, 'technician', `${j.key}: worked by a technician`);
    if (org) assert.ok(j.onCredit, `${j.key}: the fleet is on credit`);
  }
  assert.deepEqual([...REWORK_FROM_STATUSES], ['QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION']);
  // Every way the customer answers is in the story; and some discounts.
  for (const k of ['approvedByLink', 'approvedInPortal', 'approvedByPhone', 'approvedByDeposit', 'discounts']) assert.ok(plan.figures[k]! >= 3, `${k}: ${plan.figures[k]}`);
});

test('prices in naira at Lagos rates; totals with VAT to the kobo; a vehicle never in the workshop twice at once; mileage only ever goes up', () => {
  for (const [kind, lines] of Object.entries(JOB_LINES)) {
    const t = billingTotals({ lines: lines.map((l) => ({ amount: (l.qty ?? 1) * l.price })), vat: { vatEnabled: true, vatRate: DEMO_VAT_RATE } });
    assert.ok(t.total >= 40_000 && t.total <= 1_000_000, `${kind}: ₦${t.total}`);
    assert.equal(t.vatAmount, Math.round(t.subtotal * DEMO_VAT_RATE) / 100, `${kind}: VAT`);
  }
  for (const v of plan.vehicles) {
    const jobs = plan.jobCards.filter((j) => j.vehicleKey === v.key).sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
    for (let i = 1; i < jobs.length; i += 1) {
      const prev = jobs[i - 1]!;
      const left = prev.checkedOutAt ?? prev.cancellation?.decidedAt ?? null;
      assert.ok(left && left <= jobs[i]!.openedAt, `${v.plate}: ${prev.key} still in when ${jobs[i]!.key} opened`);
      assert.ok(jobs[i]!.mileage >= prev.mileage, `${v.plate}: mileage goes up`);
    }
    assert.ok(v.mileage >= Math.max(0, ...jobs.map((j) => j.mileage)));
  }
});

test('the Service Tracker: services anchor the count, reminders only for vehicles due or overdue, sent after the last service', () => {
  for (const rm of plan.reminders) {
    const last = plan.jobCards.filter((j) => j.vehicleKey === rm.vehicleKey && j.service && j.checkedOutAt).sort((a, b) => b.checkedOutAt!.getTime() - a.checkedOutAt!.getTime())[0]!;
    assert.ok(last && rm.sentAt >= last.checkedOutAt!, `${rm.vehicleKey} reminder after the last service`);
    assert.equal(rm.dueOdometer, last.mileage + 5000);
    const daysLeft = (rm.dueDate.getTime() - NOW.getTime()) / 86_400_000;
    const v = plan.vehicles.find((x) => x.key === rm.vehicleKey)!;
    assert.ok(daysLeft <= 30 || rm.dueOdometer - v.mileage <= 1000, `${rm.vehicleKey} is due`);
  }
  assert.ok(plan.reminders.length >= 1);
});

test('support and Data Exchange: open complaints, the spreadsheet imports and exports, broadcasts', () => {
  assert.ok(plan.tickets.filter((t) => t.tags.includes('complaint') && t.status === 'OPEN').length >= 1);
  for (const t of plan.tickets) { if (t.firstResponseAt) assert.ok(t.firstResponseAt >= t.createdAt); if (t.customerKey) assert.ok(plan.customers.some((c) => c.key === t.customerKey), `${t.key} customer`); }
  assert.deepEqual(plan.imports.map((i) => i.entity).sort(), ['customers', 'invoices', 'jobs', 'staff', 'vehicles']);
  assert.ok(plan.imports.some((i) => /quickbooks/i.test(i.fileName)) && plan.imports.every((i) => i.created + i.rejected <= i.rows));
  assert.ok(!plan.imports.some((i) => /zoho|sap/i.test(i.fileName)), 'the old systems are QuickBooks and spreadsheets');
  assert.ok(plan.exports.some((e) => e.kind === 'invoices'));
  assert.ok(plan.broadcasts.length >= 5 && plan.broadcasts.every((b) => b.endsAt > b.startsAt));
});

test('nothing real: every phone on the 0800 000 range, every email on a reserved domain, people by role name only, plates and VINs unique, every person a demo sign-in', () => {
  const reserved = (e: string) => isDemoEmail(e) || /@([a-z0-9-]+\.)*example\.com$/.test(e);
  for (const c of plan.customers) {
    assert.match(c.phone, /^0800 000 \d{4}$/);
    if (c.email) assert.ok(reserved(c.email), c.email);
    for (const k of c.contacts) { assert.match(k.phone, /^0800 000 \d{4}$/); assert.ok(reserved(k.email), k.email); }
  }
  assert.equal(new Set(plan.vehicles.map((v) => v.plate)).size, plan.vehicles.length);
  assert.equal(new Set(plan.vehicles.map((v) => v.vin)).size, plan.vehicles.length);
  for (const v of plan.vehicles) { assert.ok(v.vin.length === 17 && !/[IOQ]/.test(v.vin), v.vin); assert.match(v.plate, /^[A-Z]{3} \d{3} [A-Z]{2}$/); }
  const people = new Set(DEMO_STAFF.map((s) => s.email));
  const keys = [...plan.jobCards.flatMap((j) => [j.technicianKey, j.supervisorKey, ...j.payments.map((p) => p.byKey), ...j.audit.map((a) => a.byKey).filter((k): k is string => Boolean(k))])];
  for (const k of keys) assert.ok(people.has(k), `${k} is a demo person`);
  const text = JSON.stringify(plan);
  assert.doesNotMatch(text, OLD_ORGANISATION);
  assert.doesNotMatch(text, PLANT_MAKE);
  for (const gone of ['Isuzu', 'warranty', 'Leadway']) assert.ok(!text.includes(gone), `nothing of ${gone}`);
});

test('the loader removes exactly what it made, in an order the foreign keys allow, and the trail under the recorded maintenance switch; only a demo organisation, never the real one; the reset loads people, then the workshop; demo_records is declared', () => {
  const src = read('apps/portal/lib/workshop/demo/load.ts');
  assert.match(src, /prisma\.demoRecord\.findMany\(\{ where: \{ organisationId \}/);
  assert.match(src, /SET LOCAL ejo\.audit_maintenance = 'on'/);
  assert.ok(src.indexOf("'Invoice'") < src.indexOf("'JobCard'") && src.indexOf("'EstimateApprovalLink'") < src.indexOf("'Estimate'") && src.indexOf("'Payment'") < src.indexOf("'JobCard'") && src.indexOf("'JobCard'") < src.indexOf("'Customer'") && src.indexOf("'CustomerVehicle'") < src.indexOf("'Customer',"));
  assert.match(src, /if \(!org\.isDemo\) throw/);
  assert.match(src, /if \(org\.slug === REAL_ORG_SLUG\) throw/);
  const reset = read('apps/portal/scripts/demo-reset.ts');
  assert.ok(reset.indexOf('loadDemoPeople(') < reset.indexOf('loadWorkshopDemo('));
  assert.match(read('apps/portal/lib/governance/data-inventory.ts'), /DemoRecord: \{ tenancy: 'ORGANISATION'/);
  assert.match(read('packages/database/prisma/schema.prisma'), /model DemoRecord \{[\s\S]*?@@map\("demo_records"\)/);
});
