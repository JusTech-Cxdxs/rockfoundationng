import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { oldNumberQuery } from '../lib/search-plan';
import { isFiltered, lagosDayBound, matchesSource, normaliseImportNumber, parseSourceFilter, sourceWhere } from '../lib/source-filter';
import { checkInvoiceRow } from '../lib/data-exchange/check-history';
import { autoMap } from '../lib/data-exchange/fields';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

test('an old-system number is recognised as typed, with leading zeros, and narrowed by year', () => {
  assert.deepEqual(oldNumberQuery('125262'), { number: '125262', year: null, forms: ['125262'] });
  assert.deepEqual(oldNumberQuery('0000125262')?.forms, ['0000125262', '125262']);
  assert.deepEqual(oldNumberQuery('125262 2026'), { number: '125262', year: 2026, forms: ['125262'] });
  assert.equal(oldNumberQuery('125262/2025')?.year, 2025);
  assert.equal(oldNumberQuery('8-98123456-0')?.number, '8-98123456-0');
  assert.equal(oldNumberQuery('Ada Okafor'), null, 'names are not numbers');
  assert.equal(oldNumberQuery('ab'), null);
});

test('search lists every old-system match, labelled with its kind and year, inside the person’s reach', () => {
  const src = read('lib/actions/search.ts');
  for (const label of ['customer ${c.externalId}', 'vehicle ${v.externalId}', 'supplier ${x.externalId}', 'item ${p.externalId}', 'invoice ${i.invoiceNumber} · ${i.invoiceDate.getUTCFullYear()}']) assert.ok(src.includes(label), label);
  assert.match(src, /voidedAt: null, invoiceNumber: ext, \.\.\.\(n\.year \? \{ invoiceDate: \{ gte: new Date\(Date\.UTC\(n\.year, 0, 1\)\)/);
  assert.match(src, /ctx\.canCrm \? prisma\.historicalInvoice/);
  assert.match(src, /plan\.kind === 'reference' \|\| plan\.kind === 'prefix' \? \[\]/);
});

test('an old system\'s invoice is one invoice per number: loading the same number again is the same invoice', () => {
  const m = autoMap('invoices', ['Invoice number', 'Invoice date', 'Customer number', 'Amount']);
  const a = checkInvoiceRow(['0125262', '14/03/2025', '1000123', '1000'], m, '2026-11-01');
  const b = checkInvoiceRow(['125262', '14/03/2026', '1000123', '1000'], m, '2026-11-01');
  assert.deepEqual(a.keys, ['inv:125262'], 'leading zeros come off');
  assert.deepEqual(a.keys, b.keys, 'the same number is the same invoice: a duplicate in the file is flagged');
  const z = checkInvoiceRow(['INV-000123', '14/03/2024', '1000123', '1000'], m, '2026-11-01');
  assert.deepEqual(z.keys, ['inv:INV-000123']);
});

test('source and date filters: created here or imported, which import, when entered, original date', () => {
  assert.equal(normaliseImportNumber('imp 2026 12'), 'IMP-2026-000012');
  assert.equal(normaliseImportNumber('IMP-2026-000012'), 'IMP-2026-000012');
  assert.equal(normaliseImportNumber('JC-2026-1'), null);
  assert.equal(+lagosDayBound('2026-03-14')!, +new Date('2026-03-13T23:00:00Z'));
  assert.equal(+lagosDayBound('2026-03-14', true)!, +new Date('2026-03-14T23:00:00Z'));
  const f = parseSourceFilter({ source: 'legacy', enteredFrom: '2026-10-25', enteredTo: '2026-10-31', originalTo: '2018-12-31' });
  assert.equal(isFiltered(f), true);
  assert.equal(isFiltered(parseSourceFilter({ source: 'nonsense' })), false);
  assert.deepEqual(sourceWhere(parseSourceFilter({ source: 'ejo' }), { bySource: null, byNumber: null }), { AND: [{ importJobId: null }] });
  const sets = { bySource: new Set(['imp1']), byNumber: null };
  const row = { importJobId: 'imp1', createdAt: new Date('2026-10-28T10:00:00Z'), original: new Date('2014-06-02T00:00:00Z') };
  assert.equal(matchesSource(row, f, sets), true, '"customers since 2018 or before, imported from a spreadsheet last week"');
  assert.equal(matchesSource({ ...row, original: new Date('2020-01-01T00:00:00Z') }, f, sets), false);
  assert.equal(matchesSource({ ...row, importJobId: null }, f, sets), false);
  assert.equal(matchesSource({ ...row, createdAt: new Date('2026-11-01T10:00:00Z') }, f, sets), false);
});

test('dashboards can leave out the history from before EJO', () => {
  assert.match(read('lib/actions/crm.ts'), /WHERE \$\{history\} AND h\."voidedAt" IS NULL/);
  assert.match(read('lib/actions/master-analytics.ts'), /const rowsBefore = fence\.organisationId && withHistory/);
});
