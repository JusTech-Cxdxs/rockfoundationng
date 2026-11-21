/**
 * Bringing in records from Zoho (Data Exchange, lib/data-exchange/fields.ts):
 * the files Zoho Books and Zoho Invoice export (Contacts, Invoices), Zoho
 * CRM's (Contacts, Accounts) and a Zoho People staff list map themselves by
 * their own column headers — as CSV and as an Excel workbook — and their
 * rows check into the same records any other spreadsheet gives. The
 * workbook is built here with the importer's own Excel writer and read with
 * its reader, exactly as a file chosen in the browser is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../lib/data-exchange/csv-reader';
import { readXlsx } from '../lib/data-exchange/xlsx-reader';
import { writeXlsx } from '../lib/data-exchange/xlsx-writer';
import { autoMap, mappingProblems, sourceWords } from '../lib/data-exchange/fields';
import { checkCustomerRow } from '../lib/data-exchange/check';
import { checkInvoiceRow } from '../lib/data-exchange/check-history';
import { checkStaffRow } from '../lib/data-exchange/check-staff';

const TODAY = '2026-11-21';
const sourceOf = (bytes: Uint8Array, size = 64) => () => (async function* () { for (let i = 0; i < bytes.length; i += size) yield bytes.slice(i, i + size); })();
async function viaExcel(rows: (string | number)[][]): Promise<string[][]> {
  const out: string[][] = [];
  await readXlsx(sourceOf(writeXlsx([{ name: 'Export', rows, header: true }])), (r) => { out.push(...r); });
  return out;
}

// ── Zoho Books / Zoho Invoice: Contacts → Export ──────────────────────────
const CONTACTS_CSV = [
  'Contact ID,Display Name,Company Name,First Name,Last Name,EmailID,Phone,Mobile Phone,Billing Address,Billing City,Billing State,Customer Sub Type,Payment Terms,Payment Terms Label,Created Time,Contact Type',
  '4627000000081011,RCL Africa,RCL Africa,Babatunde,Olaniyan,fleet@rclafrica.example.com,0800 000 0301,0800 000 0311,14 Idowu Taylor Street,Victoria Island,Lagos,business,30,Net 30,2023-05-12 14:23:45,customer',
  '4627000000081029,Tolani Bamgbose,,Tolani,Bamgbose,tolani@example.com,0800 000 0101,,7 Ajose Adeogun Street,Victoria Island,Lagos,individual,0,Due on Receipt,2024-01-08 09:10:00,customer',
].join('\n');

function checkContacts(rows: string[][]) {
  const [headers, ...data] = rows;
  const m = autoMap('customers', headers!);
  assert.deepEqual(mappingProblems('customers', m), [], 'nothing to choose by hand');
  assert.equal(headers![m.externalId!], 'Contact ID');
  assert.equal(headers![m.fullName!], 'Display Name');
  assert.equal(headers![m.companyName!], 'Company Name');
  assert.equal(headers![m.email!], 'EmailID');
  assert.equal(headers![m.phone!], 'Phone');
  assert.equal(headers![m.altPhone!], 'Mobile Phone');
  assert.equal(headers![m.address!], 'Billing Address');
  assert.equal(headers![m.city!], 'Billing City');
  assert.equal(headers![m.state!], 'Billing State');
  assert.equal(headers![m.customerType!], 'Customer Sub Type', 'not "Contact Type" (customer or vendor)');
  assert.equal(headers![m.paymentTerms!], 'Payment Terms');
  assert.equal(headers![m.customerSince!], 'Created Time');
  const [company, person] = data.map((cells) => checkCustomerRow(cells, m));
  assert.notEqual(company!.status, 'REJECTED', JSON.stringify(company!.issues));
  assert.equal(company!.values?.externalId, '4627000000081011');
  assert.equal(company!.values?.fullName, 'RCL Africa');
  assert.equal(company!.values?.customerType, 'ORGANIZATION');
  assert.equal(company!.values?.companyName, 'RCL Africa');
  assert.equal(company!.values?.email, 'fleet@rclafrica.example.com');
  assert.equal(company!.values?.address, '14 Idowu Taylor Street, Victoria Island');
  assert.equal(company!.values?.customerSince, '2023-05-12');
  assert.ok(company!.values?.tags.includes('Terms 30'), JSON.stringify(company!.values?.tags));
  assert.ok(company!.issues.some((i) => i.field === 'paymentTerms' && /Finance or the Manager/.test(i.message)), 'credit is set in EJO, not by the file');
  assert.equal(person!.status, 'GOOD', JSON.stringify(person!.issues));
  assert.equal(person!.values?.customerType, 'INDIVIDUAL');
  assert.equal(person!.values?.fullName, 'Tolani Bamgbose');
  assert.deepEqual(person!.values?.tags, [], 'due on receipt is no credit term');
}

test('Zoho Books contacts, as CSV: every column recognised; a company and a person check into customers', () => {
  checkContacts(parseCsv(CONTACTS_CSV));
});

test('Zoho Books contacts, as an Excel workbook: the same mapping and the same customers', async () => {
  const rows = await viaExcel(parseCsv(CONTACTS_CSV));
  assert.equal(rows[0]![1], 'Display Name');
  checkContacts(rows);
});

test('Zoho CRM: Contacts give the person from First and Last Name with their Account; Accounts give the organisation from Account Name', () => {
  const contacts = parseCsv('Record Id,First Name,Last Name,Account Name,Email,Phone,Mobile,Mailing Street,Mailing City,Mailing State\nzcrm_101,Morenike,Fadipe,Nairda Limited,transport@nairda.example.com,0800 000 0312,0800 000 0322,3 Akin Adesola Street,Victoria Island,Lagos');
  const cm = autoMap('customers', contacts[0]!);
  assert.deepEqual(mappingProblems('customers', cm), [], 'no name column needed: first and last name make it');
  const c = checkCustomerRow(contacts[1]!, cm);
  assert.notEqual(c.status, 'REJECTED', JSON.stringify(c.issues));
  assert.equal(c.values?.fullName, 'Morenike Fadipe');
  assert.equal(c.values?.companyName, 'Nairda Limited');
  assert.equal(c.values?.externalId, 'zcrm_101');
  assert.equal(c.values?.address, '3 Akin Adesola Street, Victoria Island');
  const accounts = parseCsv('Record Id,Account Name,Phone,Account Type,Billing Street,Billing City,Billing State\nzcrm_201,Desicon Engineering,0800 000 0303,Customer,22 Kofo Abayomi Street,Victoria Island,Lagos');
  const am = autoMap('customers', accounts[0]!);
  assert.deepEqual(mappingProblems('customers', am), []);
  const a = checkCustomerRow(accounts[1]!, am);
  assert.equal(a.values?.fullName, 'Desicon Engineering');
  assert.equal(a.values?.customerType, 'ORGANIZATION');
});

// ── Zoho Books / Zoho Invoice: Invoices → Export (one row per item) ───────
const INVOICES_CSV = [
  'Invoice Date,Invoice ID,Invoice Number,Invoice Status,Customer ID,Customer Name,Due Date,Item Name,Quantity,Item Price,Item Total,SubTotal,Total,Balance,Currency Code',
  '2026-09-15,46270000001234,INV-000412,Overdue,4627000000081011,RCL Africa,2026-10-15,Brake pad set front,1,55000,55000,145000,155875,155875,NGN',
  '2026-09-15,46270000001234,INV-000412,Overdue,4627000000081011,RCL Africa,2026-10-15,Labour: brakes,1,45000,45000,145000,155875,155875,NGN',
  '2026-10-02,46270000001301,INV-000431,Paid,4627000000081029,Tolani Bamgbose,2026-10-02,Routine service,1,98500,98500,98500,105887.50,0,NGN',
  '2026-10-03,46270000001302,INV-000432,Void,4627000000081029,Tolani Bamgbose,2026-10-03,Routine service,1,98500,98500,98500,105887.50,0,NGN',
].join('\n');

function checkInvoices(rows: string[][]) {
  const [headers, ...data] = rows;
  const m = autoMap('invoices', headers!);
  assert.deepEqual(mappingProblems('invoices', m), []);
  assert.equal(headers![m.invoiceNumber!], 'Invoice Number', 'not Zoho’s internal Invoice ID');
  assert.equal(headers![m.invoiceDate!], 'Invoice Date');
  assert.equal(headers![m.customerExternalId!], 'Customer ID');
  assert.equal(headers![m.customerName!], 'Customer Name');
  assert.equal(headers![m.amount!], 'Total', 'the invoice total, not the item total');
  assert.equal(headers![m.balance!], 'Balance');
  assert.equal(headers![m.dueDate!], 'Due Date');
  assert.equal(headers![m.invoiceStatus!], 'Invoice Status');
  assert.equal(headers![m.description!], 'Item Name');
  assert.equal(headers![m.itemQuantity!], 'Quantity');
  assert.equal(headers![m.itemPrice!], 'Item Price');
  assert.equal(headers![m.currency!], 'Currency Code');
  assert.equal(m.tax, null, 'Zoho’s Total already includes the tax');
  const [first, second, paid, voided] = data.map((cells) => checkInvoiceRow(cells, m, TODAY));
  assert.equal(first!.status, 'GOOD', JSON.stringify(first!.issues));
  assert.equal(first!.values?.invoiceNumber, 'INV-000412');
  assert.equal(first!.values?.invoiceDate, '2026-09-15');
  assert.equal(first!.values?.amount, 155875);
  assert.deepEqual(first!.values?.customer, { externalId: '4627000000081011', phone: null, name: 'RCL Africa' });
  assert.equal(first!.values?.description, 'Brake pad set front @ ₦55,000.00 (Overdue, balance ₦155,875.00, due 15.10.2026)');
  // The same invoice's other item: the same key, so the importer reports it as the same invoice and loads the first only.
  assert.deepEqual(second!.keys, first!.keys);
  assert.equal(paid!.values?.amount, 105887.5);
  assert.match(paid!.values?.description ?? '', /\(Paid, balance ₦0\.00, due 02\.10\.2026\)/);
  assert.equal(voided!.status, 'REJECTED');
  assert.ok(voided!.issues.some((i) => i.field === 'invoiceStatus'));
}

test('Zoho invoices, as CSV: number, date, customer, total, balance, due date, status and items recognised; a void invoice is not loaded', () => {
  checkInvoices(parseCsv(INVOICES_CSV));
});

test('Zoho invoices, as an Excel workbook: the same', async () => {
  checkInvoices(await viaExcel(parseCsv(INVOICES_CSV)));
});

test('an invoice file with the customer’s name only is accepted (the name finds them when exactly one customer has it)', () => {
  const rows = parseCsv('Invoice Number,Invoice Date,Customer Name,Total\nINV-9,2026-08-01,Dori Construction,250000');
  const m = autoMap('invoices', rows[0]!);
  assert.deepEqual(mappingProblems('invoices', m), []);
  const r = checkInvoiceRow(rows[1]!, m, TODAY);
  assert.equal(r.status, 'GOOD', JSON.stringify(r.issues));
  assert.equal(r.values?.customer.name, 'Dori Construction');
  assert.deepEqual(mappingProblems('invoices', autoMap('invoices', ['Invoice Number', 'Invoice Date', 'Total'])), ['Choose how to find each invoice’s customer: their customer number, phone or name.']);
});

test('a Zoho People staff list: first and last name make the full name; Email ID and Work Phone recognised', () => {
  const rows = parseCsv('Employee ID,First Name,Last Name,Email ID,Work Phone,Location,Department\nDPA-014,Adaeze,Obi,adaeze.obi@example.com,0800 000 0401,Victoria Island Workshop,Cars and SUVs');
  const m = autoMap('staff', rows[0]!);
  assert.deepEqual(mappingProblems('staff', m), []);
  const r = checkStaffRow(rows[1]!, m);
  assert.notEqual(r.status, 'REJECTED', JSON.stringify(r.issues));
  assert.equal(r.values?.fullName, 'Adaeze Obi');
  assert.equal(r.values?.email, 'adaeze.obi@example.com');
});

test('a file comes from “Zoho, an old system or a spreadsheet”', () => {
  assert.equal(sourceWords('LEGACY'), 'Zoho, an old system or a spreadsheet');
});
