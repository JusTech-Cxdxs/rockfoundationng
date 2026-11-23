/**
 * Bringing in records from QuickBooks (Data Exchange, lib/data-exchange/fields.ts):
 * the lists QuickBooks Desktop exports (Customer Center → Export Customer
 * List, Item List, the invoice list) and QuickBooks Online's (Customers,
 * Products and Services, Invoices) map themselves by their own column
 * headers — as CSV and as an Excel workbook — and their rows check into the
 * same records any other spreadsheet gives. The workbook is built with the
 * importer's own Excel writer and read with its reader, exactly as a file
 * chosen in the browser is. All names here are invented.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../lib/data-exchange/csv-reader';
import { readXlsx } from '../lib/data-exchange/xlsx-reader';
import { writeXlsx } from '../lib/data-exchange/xlsx-writer';
import { autoMap, mappingProblems, sourceWords } from '../lib/data-exchange/fields';
import { checkCustomerRow } from '../lib/data-exchange/check';
import { checkInvoiceRow } from '../lib/data-exchange/check-history';
import { checkPartRow, checkStockRow } from '../lib/data-exchange/check-inventory';

const TODAY = '2026-11-21';
const sourceOf = (bytes: Uint8Array, size = 64) => () => (async function* () { for (let i = 0; i < bytes.length; i += size) yield bytes.slice(i, i + size); })();
async function viaExcel(rows: (string | number)[][]): Promise<string[][]> {
  const out: string[][] = [];
  await readXlsx(sourceOf(writeXlsx([{ name: 'Export', rows, header: true }])), (r) => { out.push(...r); });
  return out;
}

// ── QuickBooks Desktop: Customer Center → Excel → Export Customer List ────
const QBD_CUSTOMERS = [
  'Active Status,Customer,Balance,Company,First Name,Last Name,Main Phone,Alt. Phone,Main Email,Bill to 1,Bill to 2,Bill to 3,Bill to 4,Terms,Account No.,Credit Limit',
  'Active,Ogun Haulage Services,155875.00,Ogun Haulage Services Ltd,Babatunde,Olaniyan,0800 000 0301,0800 000 0311,fleet@ogunhaulage.example.com,Ogun Haulage Services Ltd,14 Example Industrial Road,Sango Ota,Ogun,Net 30,C-1001,2000000',
  'Active,Tolani Bamgbose,0.00,,Tolani,Bamgbose,0800 000 0101,,tolani@example.com,Tolani Bamgbose,7 Example Close,Ota,Ogun,Due on receipt,C-1002,',
].join('\n');

function checkDesktopCustomers(rows: string[][]) {
  const [headers, ...data] = rows;
  const m = autoMap('customers', headers!);
  assert.deepEqual(mappingProblems('customers', m), [], 'nothing to choose by hand');
  assert.equal(headers![m.externalId!], 'Account No.');
  assert.equal(headers![m.fullName!], 'Customer');
  assert.equal(headers![m.companyName!], 'Company');
  assert.equal(headers![m.email!], 'Main Email');
  assert.equal(headers![m.phone!], 'Main Phone');
  assert.equal(headers![m.altPhone!], 'Alt. Phone');
  assert.equal(headers![m.address!], 'Bill to 2', 'Bill to 1 is the name QuickBooks puts on the address block');
  assert.equal(headers![m.city!], 'Bill to 3');
  assert.equal(headers![m.state!], 'Bill to 4');
  assert.equal(headers![m.paymentTerms!], 'Terms');
  const [company, person] = data.map((cells) => checkCustomerRow(cells, m));
  assert.notEqual(company!.status, 'REJECTED', JSON.stringify(company!.issues));
  assert.equal(company!.values?.externalId, 'C-1001');
  assert.equal(company!.values?.fullName, 'Ogun Haulage Services');
  assert.equal(company!.values?.customerType, 'ORGANIZATION');
  assert.equal(company!.values?.email, 'fleet@ogunhaulage.example.com');
  assert.equal(company!.values?.address, '14 Example Industrial Road, Sango Ota');
  assert.ok(company!.issues.some((i) => i.field === 'paymentTerms' && /the Owner sets the terms/.test(i.message)), 'credit is set in EJO, not by the file');
  assert.notEqual(person!.status, 'REJECTED', JSON.stringify(person!.issues));
  assert.equal(person!.values?.customerType, 'INDIVIDUAL');
  assert.equal(person!.values?.fullName, 'Tolani Bamgbose');
}

test('QuickBooks Desktop customer list, as CSV: every column recognised; a company and a person check into customers', () => {
  checkDesktopCustomers(parseCsv(QBD_CUSTOMERS));
});

test('QuickBooks Desktop customer list, as an Excel workbook: the same mapping and the same customers', async () => {
  const rows = await viaExcel(parseCsv(QBD_CUSTOMERS));
  assert.equal(rows[0]![1], 'Customer');
  checkDesktopCustomers(rows);
});

test('QuickBooks Online customers export: Customer, Company, Phone, Email and the billing address', () => {
  const rows = parseCsv('Customer,Company,Phone,Mobile,Email,Billing Street,Billing City,Billing State,Open Balance\nMorenike Fadipe,,0800 000 0312,0800 000 0322,morenike@example.com,3 Example Street,Ota,Ogun,0.00');
  const m = autoMap('customers', rows[0]!);
  assert.deepEqual(mappingProblems('customers', m), []);
  const c = checkCustomerRow(rows[1]!, m);
  assert.notEqual(c.status, 'REJECTED', JSON.stringify(c.issues));
  assert.equal(c.values?.fullName, 'Morenike Fadipe');
  assert.equal(c.values?.phone, '0800 000 0312');
  assert.equal(c.values?.address, '3 Example Street, Ota');
});

// ── QuickBooks Desktop: the invoice list (Num, Date, Name, Amount, Open Balance) ──
test('QuickBooks invoice list: number, date, customer by name, amount, open balance and memo recognised', () => {
  const rows = parseCsv([
    'Type,Num,Date,Name,Due Date,Memo,Amount,Open Balance',
    'Invoice,4012,15/09/2026,Ogun Haulage Services,15/10/2026,Brake pads and labour,155875.00,155875.00',
    'Invoice,4031,02/10/2026,Tolani Bamgbose,02/10/2026,Routine service,105887.50,0.00',
  ].join('\n'));
  const [headers, ...data] = rows;
  const m = autoMap('invoices', headers!);
  assert.deepEqual(mappingProblems('invoices', m), []);
  assert.equal(headers![m.invoiceNumber!], 'Num');
  assert.equal(headers![m.invoiceDate!], 'Date');
  assert.equal(m.customerExternalId, null, 'QuickBooks gives the customer by name, never as a number');
  assert.equal(headers![m.customerName!], 'Name');
  assert.equal(headers![m.amount!], 'Amount');
  assert.equal(headers![m.balance!], 'Open Balance');
  assert.equal(headers![m.description!], 'Memo');
  assert.equal(headers![m.documentType!], 'Type');
  const [open, paid] = data.map((cells) => checkInvoiceRow(cells, m, TODAY));
  assert.notEqual(open!.status, 'REJECTED', JSON.stringify(open!.issues));
  assert.equal(open!.values?.invoiceNumber, '4012');
  assert.equal(open!.values?.invoiceDate, '2026-09-15');
  assert.equal(open!.values?.amount, 155875);
  assert.equal(open!.values?.customer.name, 'Ogun Haulage Services');
  assert.match(open!.values?.description ?? '', /Brake pads and labour/);
  assert.equal(paid!.values?.amount, 105887.5);
});

test('QuickBooks Online invoices export: Invoice No., Transaction Date, Customer', () => {
  const rows = parseCsv('Transaction Date,Invoice No.,Customer,Total,Balance,Due Date\n02/10/2026,1045,Tolani Bamgbose,105887.50,0.00,02/10/2026');
  const m = autoMap('invoices', rows[0]!);
  assert.deepEqual(mappingProblems('invoices', m), []);
  assert.equal(rows[0]![m.invoiceNumber!], 'Invoice No.');
  assert.equal(rows[0]![m.customerName!], 'Customer');
  const r = checkInvoiceRow(rows[1]!, m, TODAY);
  assert.notEqual(r.status, 'REJECTED', JSON.stringify(r.issues));
  assert.equal(r.values?.invoiceDate, '2026-10-02');
});

// ── Items: QuickBooks Desktop Item List and QuickBooks Online Products and Services ──
test('QuickBooks Desktop item list: Item, Description, Price, Reorder Pt (Min) into the parts catalogue', () => {
  const rows = parseCsv('Item,Description,Type,Account,On Hand,Price,Cost,Reorder Pt (Min),Preferred Vendor\n04465-02220,"Brake pad set, front (Toyota Corolla)",Inventory Part,Parts Sales,12,45000,32000,4,Example Parts Ltd');
  const m = autoMap('parts', rows[0]!);
  assert.deepEqual(mappingProblems('parts', m), []);
  assert.equal(rows[0]![m.partNumber!], 'Item');
  assert.equal(rows[0]![m.name!], 'Description');
  assert.equal(rows[0]![m.sellingPrice!], 'Price');
  assert.equal(rows[0]![m.reorderPoint!], 'Reorder Pt (Min)');
  const p = checkPartRow(rows[1]!, m);
  assert.notEqual(p.status, 'REJECTED', JSON.stringify(p.issues));
  assert.equal(p.values?.partNumber, '04465-02220');
  assert.equal(p.values?.sellingPrice, 45000);
  assert.equal(p.values?.reorderPoint, 4);
  // The same file is the opening stock: On Hand and Cost.
  const s = autoMap('stock', rows[0]!);
  assert.equal(rows[0]![s.partNumber!], 'Item');
  assert.equal(rows[0]![s.quantity!], 'On Hand');
  assert.equal(rows[0]![s.unitCost!], 'Cost', 'the cost, never the selling price');
  const st = checkStockRow(rows[1]!, s);
  assert.notEqual(st.status, 'REJECTED', JSON.stringify(st.issues));
  assert.equal(st.values?.quantity, 12);
  assert.equal(st.values?.unitCost, 32000);
});

test('QuickBooks Online products and services: Product/Service Name, Sales Description, Sales Price / Rate, Purchase Cost', () => {
  const rows = parseCsv('Product/Service Name,Sales Description,SKU,Type,Sales Price / Rate,Purchase Cost,Quantity On Hand\nOil filter Corolla,"Oil filter, Toyota Corolla 2010-2019",TY-90915,Inventory,6500,4200,12');
  const m = autoMap('parts', rows[0]!);
  assert.deepEqual(mappingProblems('parts', m), []);
  assert.equal(rows[0]![m.partNumber!], 'SKU', 'the SKU is the part number when there is one');
  assert.equal(rows[0]![m.name!], 'Sales Description');
  assert.equal(rows[0]![m.sellingPrice!], 'Sales Price / Rate');
  const s = autoMap('stock', rows[0]!);
  assert.equal(rows[0]![s.unitCost!], 'Purchase Cost');
  assert.equal(rows[0]![s.quantity!], 'Quantity On Hand');
});

test('imported records are said to come from QuickBooks, an old system or a spreadsheet', () => {
  assert.equal(sourceWords('LEGACY'), 'QuickBooks, an old system or a spreadsheet');
});
