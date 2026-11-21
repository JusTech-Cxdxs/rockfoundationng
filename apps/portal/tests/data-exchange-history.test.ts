import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoMap, mappingProblems } from '../lib/data-exchange/fields';
import { parseDay } from '../lib/data-exchange/dates';
import { checkInvoiceRow, checkJobRow, jobKind, jobStatus, parseKm } from '../lib/data-exchange/check-history';
import { checkCustomerRow } from '../lib/data-exchange/check';
import { customerMoney, monthlySpend, sortCrmRows } from '../lib/crm';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

test('dates as accounting systems, Excel and people write them', () => {
  assert.equal(parseDay('20190314'), '2019-03-14'); // a raw export
  assert.equal(parseDay('14.03.2019'), '2019-03-14'); // European
  assert.equal(parseDay('14/03/2019'), '2019-03-14'); // Nigerian, day first
  assert.equal(parseDay('03/14/2019'), '2019-03-14'); // month first only when the day cannot be a month
  assert.equal(parseDay('2019-03-14'), '2019-03-14'); // ISO and Excel dates
  assert.equal(parseDay('2019-03-14 10:30'), '2019-03-14');
  assert.equal(parseDay('14-MAR-19'), '2019-03-14');
  assert.equal(parseDay('14 March 2019'), '2019-03-14');
  assert.equal(parseDay('March 14, 2019'), '2019-03-14');
  assert.equal(parseDay('31.06.2019'), null, 'no 31 June');
  assert.equal(parseDay('00000000'), null, 'an empty date');
  assert.equal(parseDay('soon'), null);
});

test('customers: the old system’s date becomes “customer since”; a bad date is a note, not a rejection', () => {
  const m = autoMap('customers', ['Customer number', 'Name', 'Phone', 'Customer since']);
  assert.equal(m.customerSince, 3);
  const ok = checkCustomerRow(['0001000123', 'Ada Okafor', '0803 123 4567', '20140602'], m);
  assert.equal(ok.values?.customerSince, '2014-06-02');
  const bad = checkCustomerRow(['0001000124', 'Bayo Ade', '0803 123 4568', 'last year'], m);
  assert.equal(bad.status, 'WARNING');
  assert.equal(bad.values?.customerSince, null);
});

test('invoices from the old system: the file maps itself; net plus tax; credit notes; naira only', () => {
  const m = autoMap('invoices', ['Invoice number', 'Invoice date', 'Customer number', 'Amount', 'Tax', 'Currency', 'VIN', 'Document type']);
  assert.deepEqual([m.invoiceNumber, m.invoiceDate, m.customerExternalId, m.amount, m.tax, m.currency, m.vin, m.documentType], [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(mappingProblems('invoices', m), []);
  const r = checkInvoiceRow(['0090001234', '14/03/2023', '0001000123', '450,000.00', '33,750.00', 'NGN', 'jaanlr85el7100001', 'Invoice'], m, '2026-11-01');
  assert.equal(r.status, 'GOOD', JSON.stringify(r.issues));
  assert.deepEqual(r.values, { invoiceNumber: '90001234', invoiceDate: '2023-03-14', amount: 483750, customer: { externalId: '1000123', phone: null }, vin: 'jaanlr85el7100001', vinKey: 'JAANLR85EL7100001', documentType: 'Invoice', description: null });
  assert.deepEqual(r.keys, ['inv:90001234']);
  const credit = checkInvoiceRow(['90001299', '20230401', '1000123', '12000-', '', '', '', 'Credit note'], m, '2026-11-01');
  assert.equal(credit.values?.amount, -12000);
  assert.match(credit.issues[0]!.message, /credit note/);
  assert.match(checkInvoiceRow(['1', '20230401', '1000123', '100', '', 'USD', '', ''], m, '2026-11-01').issues.map((i) => i.message).join(' '), /Only naira/);
  assert.match(checkInvoiceRow(['1', '20300101', '1000123', '100', '', '', '', ''], m, '2026-11-01').issues[0]!.message, /in the future/);
  assert.equal(checkInvoiceRow(['', '20230401', '1000123', '100', '', '', '', ''], m).status, 'REJECTED');
  assert.equal(checkInvoiceRow(['9', '20230401', '', '100', '', '', '', ''], m).status, 'REJECTED', 'whose invoice is it?');
});

test('job card history: the old system’s list maps itself; every row is a job card; “carry out service” makes it a service; dates, mileage and status read as written', () => {
  const h = ['Job number', 'Customer number', 'VIN', 'Opened on', 'Completed on', 'Mileage', 'Complaint / work requested', 'Work done', 'Technician', 'Total', 'Invoice number', 'Status', 'Branch'];
  const m = autoMap('jobs', h);
  assert.deepEqual([m.jobNumber, m.customerExternalId, m.vin, m.openedAt, m.completedAt, m.mileage, m.description, m.workDone, m.technician, m.totalAmount, m.invoiceNumber, m.status, m.branch], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(mappingProblems('jobs', m), []);
  assert.deepEqual(mappingProblems('jobs', { ...m, customerExternalId: null, vin: null }), ['Choose how to find each job’s customer: their customer number, phone or email — or the vehicle’s chassis number or plate.']);
  const row = ['000000482913', '0001000123', 'JAANLR85EL7100001', '20230312', '14/03/2023', '40.120', 'Carry out service 40,000 km', 'Oil and filters', 'E. Okoro', '430000.00', '0090001234', 'Closed', 'Ota Workshop'];
  const c = checkJobRow(row, m, '2026-11-02');
  assert.equal(c.status, 'GOOD', JSON.stringify(c.issues));
  assert.equal(c.values?.jobNumber, '482913', 'leading zeros come off the 6-digit number');
  assert.equal(c.values?.kind, 'SERVICE');
  assert.equal(c.values?.openedAt, '2023-03-12');
  assert.equal(c.values?.completedAt, '2023-03-14');
  assert.equal(c.values?.mileage, 40120, 'a thousands dot is understood');
  assert.equal(c.values?.customer.externalId, '1000123');
  assert.equal(c.values?.invoiceNumber, '90001234');
  assert.equal(c.values?.status, 'CLOSED');
  assert.deepEqual(c.keys, ['job:482913']);
  // A repair is a job card; so is anything with no words about a service.
  assert.equal(checkJobRow([row[0], row[1], row[2], row[3], row[4], '61870', 'Brakes squeal when stopping', '', '', '', '', 'Closed', ''], m, '2026-11-02').values?.kind, 'JOB_CARD');
  assert.equal(jobKind('Carry out service'), 'SERVICE');
  assert.equal(jobKind('20,000 km service'), 'SERVICE');
  assert.equal(jobKind('Periodic maintenance'), 'SERVICE');
  assert.equal(jobKind('Brakes squeal'), 'JOB_CARD');
  assert.equal(jobStatus('Closed'), 'CLOSED'); assert.equal(jobStatus('Invoiced'), 'CLOSED'); assert.equal(jobStatus(''), 'CLOSED'); assert.equal(jobStatus('Cancelled'), 'CANCELLED'); assert.equal(jobStatus('Void'), 'CANCELLED'); assert.equal(jobStatus('Open'), null);
  assert.equal(parseKm('41,200 km'), 41200); assert.equal(parseKm('41.200'), 41200); assert.equal(parseKm('abc'), null);
  // Refusals: no number, completed before opened, still open, nobody to hang it on, a future date.
  const bad = (cells: (string | null)[]) => checkJobRow(cells, m, '2026-11-02');
  assert.deepEqual(bad(['', ...row.slice(1)]).issues.filter((i) => i.level === 'error').map((i) => i.message), ['Job number is required (the old job card number).']);
  assert.match(bad([row[0]!, row[1]!, row[2]!, '20/09/2024', '18/09/2024', '', 'x', '', '', '', '', 'Closed', '']).issues[0]!.message, /is before it was opened/);
  assert.match(bad([row[0]!, row[1]!, row[2]!, '20/09/2024', '', '', 'x', '', '', '', '', 'Open', '']).issues.find((i) => i.level === 'error')!.message, /still open belongs in the open job cards file/);
  assert.match(bad([row[0]!, '', '', '20/09/2024', '21/09/2024', '', 'x', '', '', '', '', 'Closed', '']).issues.find((i) => i.level === 'error')!.message, /Whose job is it\?/);
  assert.match(bad([row[0]!, row[1]!, row[2]!, '20/09/2027', '', '', 'x', '', '', '', '', 'Closed', '']).issues[0]!.message, /is in the future/);
  // No completion date: kept, with a note that the clock counts from the opening day.
  const open = checkJobRow([row[0]!, row[1]!, row[2]!, '20/09/2024', '', '', 'Carry out service', '', '', '', '', 'Closed', ''], m, '2026-11-02');
  assert.equal(open.status, 'WARNING'); assert.equal(open.values?.completedAt, null);
});

test('the CRM counts an old job card as a visit once with the invoice it was billed on', () => {
  const before = [{ at: new Date('2023-03-14T11:00:00Z'), amount: 430000, invoiceNumber: '0090001234' }, { at: new Date('2024-09-05T11:00:00Z'), amount: 250000, invoiceNumber: '90001235' }];
  const jobs = [{ at: new Date('2023-03-14T11:00:00Z'), invoiceNumber: '90001234' }, { at: new Date('2025-01-10T11:00:00Z'), invoiceNumber: null }];
  const money = customerMoney([], new Date('2026-11-02T10:00:00Z'), before, jobs);
  assert.equal(money.visits, 3, 'invoice 90001234 and its job card are one visit; the other invoice and the other job card one each');
  assert.equal(money.pastJobs, 2);
  assert.equal(money.netPaid, 680000, 'money comes from the invoices only, never twice');
  assert.equal(money.lastVisit?.toISOString().slice(0, 10), '2025-01-10');
});

test('the CRM counts invoices from before EJO as spend and visits, never as owed; averages stay EJO’s', () => {
  const now = new Date('2026-10-15T12:00:00+01:00');
  const jobs = [{ kind: 'JC' as const, id: 'j', receivedAt: new Date('2026-09-01T09:00:00+01:00'), finishedAt: new Date('2026-09-03T09:00:00+01:00'), cancelled: false, customerBilled: 100000, payments: [{ at: new Date('2026-09-03T10:00:00+01:00'), amount: 100000 }], refunds: [] }];
  const before = [{ at: new Date('2024-05-10T12:00:00+01:00'), amount: 250000 }, { at: new Date('2026-02-10T12:00:00+01:00'), amount: 50000 }];
  const m = customerMoney(jobs, now, before);
  assert.equal(m.netPaid, 400000);
  assert.equal(m.fromBefore, 300000);
  assert.equal(m.visits, 3);
  assert.equal(m.outstanding, 0);
  assert.equal(m.averageJob, 100000, 'average job is EJO’s own');
  assert.equal(m.netPaidThisYear, 150000);
  assert.equal(+m.lastVisit!, +new Date('2026-09-01T09:00:00+01:00'));
  const months = monthlySpend(jobs, now, 12, before);
  assert.equal(months.find((x) => x.key === '2026-02')?.before, 50000);
  assert.equal(months.find((x) => x.key === '2026-02')?.net, 50000);
  // Newest customers by when they became customers, not when they were imported.
  const rows = [
    { id: 'old', fullName: 'Old', customerType: 'INDIVIDUAL', tags: [], isActive: true, createdAt: new Date('2026-10-01'), customerSince: new Date('2012-01-01'), address: null, phone: null, hasPortalAccount: false, lastLoginAt: null, vehicles: 0, openJobs: 0, netPaid: 0, lastVisit: null },
    { id: 'new', fullName: 'New', customerType: 'INDIVIDUAL', tags: [], isActive: true, createdAt: new Date('2026-09-01'), customerSince: null, address: null, phone: null, hasPortalAccount: false, lastLoginAt: null, vehicles: 0, openJobs: 0, netPaid: 0, lastVisit: null },
  ];
  assert.deepEqual(sortCrmRows(rows, 'recent').map((r) => r.id), ['new', 'old']);
});

test('history is read-only and recoverable: undo voids, a reload restores, nothing is deleted', () => {
  const src = read('lib/data-exchange/history-server.ts');
  assert.doesNotMatch(src, /\.delete(Many)?\(/);
  assert.match(src, /historicalInvoice\.updateMany\(\{ where: \{ importJobId: jobId, voidedAt: null \}, data: \{ voidedAt: at \} \}\)/);
  assert.match(src, /data: \{ voidedAt: null, importJobId: job\.id \}/);
  // The CRM and analytics read only invoices that are not voided.
  for (const f of ['lib/actions/crm.ts', 'lib/actions/master-analytics.ts', 'lib/actions/vehicle-history.ts']) {
    const s = read(f);
    for (const q of s.matchAll(/historicalInvoice\.(findMany|groupBy|aggregate)\(\{[\s\S]{0,400}?\}/g)) assert.match(q[0], /voidedAt: null/, `${f}: ${q[0].slice(0, 80)}`);
  }
  assert.match(read('lib/actions/crm.ts'), /WHERE \$\{history\} AND h\."voidedAt" IS NULL/);
  // Never shown to customers: the customer portal does not read the history from before EJO.
  assert.doesNotMatch(read('../website/lib/customer-portal/data.ts'), /historicalInvoice/);
});

test('new customers are new to the business: the old system’s date when known', () => {
  assert.match(read('lib/actions/crm.ts'), /newThisMonth: all\.filter\(\(r\) => \+\(r\.customerSince \?\? r\.createdAt\) >= \+monthStart\)/);
});
