/**
 * An export comes straight back in: every list that Data Exchange can also
 * import is read back by the importer, with its numbers recognised, the
 * "About this file" sheet and the CSV's "#" lines passed over, and the
 * values unchanged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoMap, mappingProblems, type EntityKey } from '../lib/data-exchange/fields';
import { CsvReader, isBlankRow, isNoteRow, parseCsv } from '../lib/data-exchange/csv-reader';
import { readXlsx } from '../lib/data-exchange/xlsx-reader';
import { checkCustomerRow } from '../lib/data-exchange/check';
import { exportStream } from '../lib/exports/stream';
import type { ColumnType, ExportColumn } from '../lib/exports/format';

const ROOT = join(__dirname, '..', '..');
const KINDS = readFileSync(join(ROOT, 'lib/exports/kinds.ts'), 'utf8');

/** A list's columns as kinds.ts declares them (header and type), read from the source. */
function declared(kind: string): { header: string; type: ColumnType }[] {
  const at = KINDS.indexOf(`key: '${kind}', label:`);
  assert.ok(at >= 0, `export kind ${kind}`);
  const end = KINDS.indexOf('async *rows', at);
  return [...KINDS.slice(at, end).matchAll(/header: '([^']+)', type: '(\w+)'/g)].map((m) => ({ header: m[1]!, type: m[2] as ColumnType }));
}
const headers = (kind: string) => declared(kind).map((c) => c.header);

/** Export list → the import it comes back through, and the fields that must be recognised. */
const ROUND_TRIPS: [string, EntityKey, string[]][] = [
  ['customers', 'customers', ['externalId', 'fullName', 'customerType', 'email', 'phone', 'altPhone', 'address', 'taxId', 'customerSince']],
  ['vehicles', 'vehicles', ['customerExternalId', 'externalId', 'chassisNumber', 'plateNumber', 'engineNumber', 'make', 'model', 'year', 'mileage']],
  ['parts', 'parts', ['partNumber', 'name', 'category', 'baseUnit', 'trackingType', 'barcode', 'sellingPrice', 'reorderPoint', 'safetyStock']],
  ['suppliers', 'suppliers', ['externalId', 'name', 'phone', 'email', 'address', 'taxId']],
  ['history-invoices', 'invoices', ['invoiceNumber', 'invoiceDate', 'customerExternalId', 'amount', 'currency', 'vin', 'companyCode', 'fiscalYear', 'documentType', 'description']],
];

test('every export that can be imported comes back in, with its old-system numbers recognised', () => {
  for (const [kind, entity, must] of ROUND_TRIPS) {
    const h = headers(kind);
    const m = autoMap(entity, h);
    for (const f of must) assert.notEqual(m[f], null, `${kind}: ${f} is not recognised in ${JSON.stringify(h)}`);
    assert.deepEqual(mappingProblems(entity, m), [], kind);
  }
  // The customer's NAME never feeds the customer NUMBER (an invoice export has both).
  const inv = headers('history-invoices');
  assert.equal(inv[autoMap('invoices', inv).customerExternalId!], 'Customer number');
  // A file exported before these names changed still comes back in.
  // EJO's own invoices (one per Job Card) read back as invoice history: the total, not the subtotal, is the amount; the balance, due date and status come along.
  const own = headers('invoices');
  const ownMap = autoMap('invoices', own);
  for (const f of ['invoiceNumber', 'invoiceDate', 'customerExternalId', 'customerName', 'amount', 'balance', 'dueDate', 'invoiceStatus', 'currency', 'vin']) assert.notEqual(ownMap[f], null, `invoices: ${f} is not recognised in ${JSON.stringify(own)}`);
  assert.deepEqual(mappingProblems('invoices', ownMap), []);
  assert.equal(own[autoMap('invoices', own).amount!], 'Total');
  assert.equal(autoMap('invoices', own).tax, null, 'the total already holds the VAT');
  const old = autoMap('invoices', ['Invoice number (SAP)', 'Invoice date', 'Customer', 'Customer SAP number', 'Amount']);
  assert.equal(old.invoiceNumber, 0); assert.equal(old.customerExternalId, 3);
  assert.equal(autoMap('customers', ['SAP / old-system number', 'Name']).externalId, 0);
  assert.equal(autoMap('customers', ['Customer number (SAP or old system)', 'Name']).externalId, 0);
  assert.equal(autoMap('vehicles', ['Vehicle number (SAP or old system)', 'VIN']).externalId, 0);
  assert.equal(autoMap('suppliers', ['Supplier number (SAP)', 'Name']).externalId, 0);
});

// ── The whole way: a customers file written by the export, read by the importer ─

type Cust = Record<string, unknown>;
const CUSTOMERS: Cust[] = [
  { 'Customer number': '1000101', Name: 'Babatunde Eze', Type: 'Individual', Email: 'babatunde.eze@example.ng', Phone: '+234 804 201 4007', 'Second phone': null, Address: '14 Oshodi-Apapa Expressway, Ikeja', 'Tax ID': null, Tags: 'Fleet', 'Customer since': '2013-02-11', 'Customer portal': false, 'EJO record': 'ckx1' },
  { 'Customer number': null, Name: 'Eko Cold Chain Ltd', Type: 'Organisation', 'Company name': 'Eko Cold Chain Ltd', Email: null, Phone: '0806 218 4126', Address: '7 Adeniyi Jones Avenue', 'Tax ID': '10000018-0001', Tags: '', 'Customer since': null, 'Customer portal': false, 'EJO record': 'ckx2' },
];
const custColumns = (): ExportColumn<Cust>[] => declared('customers').map((c) => ({ header: c.header, type: c.type, get: (r: Cust) => r[c.header] ?? null }));

async function text(s: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = []; const r = s.getReader();
  for (;;) { const { value, done } = await r.read(); if (done) break; parts.push(value); }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
async function* once<R>(rows: R[]) { yield rows; }
/** Rows as the uploader reads them: blank rows and "#" notes above the header left out. */
function readCsv(bytes: Uint8Array, pieces = 13): string[][] {
  const t = new TextDecoder().decode(bytes); const r = new CsvReader(); const all: string[][] = [];
  for (let i = 0; i < t.length; i += pieces) all.push(...r.push(t.slice(i, i + pieces)));
  all.push(...r.end());
  const out: string[][] = []; let header = false;
  for (const row of all) { if (isBlankRow(row)) continue; if (!header && isNoteRow(row)) continue; header = true; out.push(row); }
  return out;
}

for (const format of ['csv', 'xlsx'] as const) {
  test(`customers exported (${format}) are read back by the importer, unchanged`, async () => {
    const columns = custColumns();
    const about: [string, string][] = [['List', 'Customers'], ['Filters', 'Search: a, b; c | d']];
    const bytes = await text(exportStream({ format, sheetName: 'Customers', columns, rows: once(CUSTOMERS), about }));
    let rows: string[][];
    if (format === 'csv') rows = readCsv(bytes);
    else { rows = []; await readXlsx(() => (async function* () { yield bytes; })(), (r) => { rows.push(...r.filter((x) => !isBlankRow(x))); }); }
    assert.deepEqual(rows[0], columns.map((c) => c.header), 'the header is the first row read (not the About sheet or lines)');
    const mapping = autoMap('customers', rows[0]!);
    const back = rows.slice(1).map((cells) => checkCustomerRow(cells, mapping).values!);
    assert.equal(back[0]!.externalId, '1000101');
    assert.equal(back[0]!.fullName, 'Babatunde Eze');
    assert.equal(back[0]!.email, 'babatunde.eze@example.ng');
    assert.match(String(back[0]!.phone), /804\s?201\s?4007/);
    assert.equal(back[0]!.customerSince, '2013-02-11');
    assert.equal(back[1]!.externalId, null, 'a customer with no old-system number');
    assert.equal(back[1]!.customerType, 'ORGANIZATION');
    assert.equal(back[1]!.taxId, '10000018-0001');
  });
}

test('a leading apostrophe (text, not a formula) is not part of the value: +234 phones come back', () => {
  const m = autoMap('customers', ['Name', 'Phone']);
  assert.match(String(checkCustomerRow(['Ada Okafor', "'+234 803 123 4567"], m).values!.phone), /803/);
  assert.equal(checkCustomerRow(["'=HYPERLINK(1)", ''], m).values!.fullName, '=HYPERLINK(1)', 'kept as text; any export writes the guard again');
});

test('an export’s CSV with notes that hold separators still reads with commas', () => {
  const t = '﻿"# Filters: Region; Lagos | Ikeja"\r\n"# List: Parts"\r\n"Part number","Description"\r\n"8-98100000-0","Brake pad set; NQR"\r\n';
  const rows = parseCsv(t).filter((r) => !isNoteRow(r));
  assert.deepEqual(rows, [['Part number', 'Description'], ['8-98100000-0', 'Brake pad set; NQR']]);
});
