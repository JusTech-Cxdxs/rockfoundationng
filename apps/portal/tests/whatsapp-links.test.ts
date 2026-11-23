/**
 * "Send on WhatsApp" (lib/whatsapp-messages, @ejo/utils/whatsapp): next to
 * the emails where a customer is contacted — the service reminder on the
 * Service Tracker and the vehicle's page, "ready for collection", the
 * invoice and the payment receipt — a wa.me link with the message written,
 * for the colleague to send from their own phone. The server sends nothing,
 * and with no usable phone there is no button.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { whatsAppShareUrlFor } from '@ejo/utils/whatsapp';
import { customerWhatsAppUrl, invoiceMessage, nairaText, readyForCollectionMessage, receiptMessage, serviceReminderMessage, vehicleText } from '../lib/whatsapp-messages';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const workshop = { name: 'Rock Foundation Automobile', phone: '0800 000 0001' };
const decode = (url: string) => decodeURIComponent(url.split('?text=')[1]!);

test('the first usable phone wins; no usable phone, no link', () => {
  assert.equal(whatsAppShareUrlFor([null, '0803 123 4567'], 'Hi'), 'https://wa.me/2348031234567?text=Hi');
  assert.equal(whatsAppShareUrlFor(['01 234 5678', '+234 803 123 4567'], 'Hi'), 'https://wa.me/2348031234567?text=Hi');
  assert.equal(whatsAppShareUrlFor(['', 'not a phone', null, undefined], 'Hi'), null);
  assert.equal(customerWhatsAppUrl({ phone: null, altPhone: null }, 'Hi'), null);
  assert.match(customerWhatsAppUrl({ phone: '0800 000 0101' }, 'Hello') ?? '', /^https:\/\/wa\.me\/2348000000101\?text=Hello$/);
});

test('money as ₦ with two decimals; the vehicle with its plate', () => {
  assert.equal(nairaText(125000), '₦125,000.00');
  assert.equal(nairaText('9876.5'), '₦9,876.50');
  assert.equal(nairaText(null), '₦0.00');
  assert.equal(vehicleText({ make: 'Toyota', model: 'Hilux', plateNumber: 'EKY 123 AB' }), 'Toyota Hilux (EKY 123 AB)');
});

test('the service reminder: the vehicle, the plate, the due km and date, the workshop’s number; overdue says so; a company is greeted by its name', () => {
  const due = new Date('2026-12-04T09:00:00Z');
  const m = serviceReminderMessage({ customerName: 'Tolani Bamgbose', vehicle: { make: 'Toyota', model: 'Camry', plateNumber: 'EKY 482 KJ' }, dueOdometer: 85250, dueDate: due, overdue: false, workshop });
  assert.match(m, /^Hello Tolani,/);
  assert.match(m, /Toyota Camry \(EKY 482 KJ\) is due for its service at 85,250 km or 4 December 2026, whichever comes first/);
  assert.match(m, /Call or WhatsApp us: 0800 000 0001/);
  const late = serviceReminderMessage({ customerName: 'Bolaji Haulage Services', organisation: true, vehicle: { make: 'Ford', model: 'Ranger', plateNumber: 'LND 100 AA' }, dueOdometer: 120000, dueDate: null, overdue: true, workshop });
  assert.match(late, /^Hello Bolaji Haulage Services,/);
  assert.match(late, /past its service \(it was due at 120,000 km/);
});

test('ready for collection, the invoice and the receipt carry their numbers and amounts; the invoice links to the customer portal', () => {
  const ready = readyForCollectionMessage({ customerName: 'Tolani Bamgbose', vehicle: { make: 'Toyota', model: 'Camry', plateNumber: 'EKY 482 KJ' }, jobNumber: 'JC-2026-000123', balance: 54_312.5, workshop: { ...workshop, address: 'Ota, Ogun State' } });
  assert.match(ready, /ready for collection \(Job Card JC-2026-000123\)/);
  assert.match(ready, /balance to pay on collection is ₦54,312\.50/);
  assert.match(ready, /Collect it from Ota, Ogun State/);
  assert.match(readyForCollectionMessage({ customerName: 'Greenfield Agro Logistics', organisation: true, vehicle: {}, jobNumber: 'JC-1', balance: 10, onCredit: true, workshop }), /goes on your account/);
  const inv = invoiceMessage({ customerName: 'Greenfield Agro Logistics', organisation: true, invoiceNumber: 'INV-2026-000045', jobNumber: 'JC-2026-000123', total: 403_125, balance: 403_125, dueOn: new Date('2026-12-20T10:00:00Z'), portalUrl: 'https://portal.example.com/customer-portal/dashboard/services/jc/abc/invoice', workshop });
  assert.match(inv, /invoice INV-2026-000045 for Job Card JC-2026-000123 is ₦403,125\.00/);
  assert.match(inv, /Balance to pay: ₦403,125\.00, by 20 December 2026/);
  assert.match(inv, /customer portal: https:\/\/portal\.example\.com\/customer-portal\/dashboard\/services\/jc\/abc\/invoice/);
  const rct = receiptMessage({ customerName: 'Tolani Bamgbose', receiptNumber: 'RCT-2026-000077', amount: 50_000, jobNumber: 'JC-2026-000123', paidAt: new Date('2026-11-20T10:00:00Z'), balance: 0, workshop });
  assert.match(rct, /received ₦50,000\.00 on 20 November 2026 for Job Card JC-2026-000123\. Your receipt number is RCT-2026-000077/);
  assert.match(rct, /Nothing more is owed/);
  // The whole message survives the link.
  assert.equal(decode(customerWhatsAppUrl({ phone: '0800 000 0101' }, rct)!), rct);
});

test('the buttons sit next to the emails, and nothing is sent from the server', () => {
  const tracker = read('apps/portal/app/(app)/workshop/service-tracker/page.tsx');
  assert.match(tracker, /<WhatsAppLink[\s\S]*serviceReminderMessage\(/);
  assert.ok(tracker.indexOf('sendManualServiceReminderFormAction}') < tracker.indexOf('serviceReminderMessage({'), 'after the emailed reminder');
  assert.match(read('apps/portal/app/(app)/workshop/vehicles/[id]/edit/page.tsx'), /serviceReminderMessage\(/);
  const jc = read('apps/portal/app/(app)/workshop/job-cards/[id]/page.tsx');
  assert.ok(jc.includes('readyForCollectionMessage('), 'ready for collection');
  // Phase 6A: the invoice and the receipt go with their PDF, prepared on the server (lib/actions/whatsapp.ts).
  assert.match(jc, /<WhatsAppSendButton prepare=\{\{ document: \{ kind: 'INVOICE', id: invoice\.id \} \}\} testId="invoice-whatsapp" \/>/);
  assert.match(jc, /<WhatsAppSendButton prepare=\{\{ document: \{ kind: 'RECEIPT', id: p\.id \} \}\} label="Receipt on WhatsApp" testId="receipt-whatsapp" \/>/);
  const prepared = read('apps/portal/lib/actions/whatsapp.ts');
  for (const fn of ['invoiceMessage(', 'receiptMessage(']) assert.ok(prepared.includes(fn), fn);
  const link = read('apps/portal/components/WhatsAppLink.tsx');
  assert.match(link, /if \(!href\) return null;/);
  assert.match(link, /rel="noopener noreferrer"/);
  const lib = read('apps/portal/lib/whatsapp-messages.ts');
  assert.ok(!/fetch\(|sendEmail|prisma/.test(lib), 'the messages module sends nothing');
  assert.ok(!/node:crypto/.test(read('packages/utils/src/whatsapp.ts')), 'usable in any page');
});
