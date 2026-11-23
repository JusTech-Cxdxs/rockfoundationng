/**
 * money and documents.
 *
 *  1. One totals calculation (@ejo/utils/billing), pure and in whole kobo:
 *     customer lines → line discounts → subtotal → estimate discount → VAT
 *     → total. Goodwill / internal / warranty lines are free to the customer;
 *     a discount never exceeds what it discounts.
 *  2. Both apps, every document and every payment check use it.
 *  3. The wiring: the invoice is issued once when a Job Card is completed,
 *     the receipt number is given inside recordPayment's locked step, and a
 *     discount above the limit needs the Owner's explicit approval.
 *  4. ₦ in PDFs: Noto Sans is embedded and the ₦ is in the text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { renderToBuffer } from '@react-pdf/renderer';
import { balanceDue, billingTotals, depositOf, discountNeedsManager, discountPercent, paidInFull, toKobo, vatIsFixed, vatSettingFor } from '@ejo/utils/billing';
import { jobCardTotals } from '../lib/estimate-billing';
import { invoiceLinesFrom, invoicePdfProps, letterhead, nairaForPdf } from '../lib/pdf/document-props';
import { InvoicePdf } from '../lib/pdf/invoice-pdf';
import { EstimatePdf } from '../lib/pdf/estimate-pdf';
import { jobEstimatePdfProps } from '../lib/pdf/document-props';
import { pdfFontDir } from '../lib/pdf/fonts';

const ROOT = join(__dirname, '..', '..');
const REPO = join(ROOT, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const readRepo = (rel: string) => readFileSync(join(REPO, rel), 'utf8');
const VAT_ON = { vatEnabled: true, vatRate: '7.5' };
const VAT_OFF = { vatEnabled: false, vatRate: '7.5' };

function body(src: string, fn: string): string {
  const at = src.indexOf(`export async function ${fn}(`);
  assert.ok(at >= 0, `${fn} not found`);
  const next = src.indexOf('\nexport ', at + 10);
  return next === -1 ? src.slice(at) : src.slice(at, next);
}

// ── 1. The shared totals ─────────────────────────────────────────────

test('customer lines only: goodwill, internal and warranty lines cost the customer nothing', () => {
  const t = billingTotals({ lines: [{ amount: 1000 }, { amount: '2500.00', billTo: 'CUSTOMER' }, { amount: 9000, billTo: 'GOODWILL', discountAmount: 100 }, { amount: 700, billTo: 'INTERNAL' }, { amount: 300, billTo: 'WARRANTY' }], vat: VAT_OFF });
  assert.deepEqual([t.gross, t.lineDiscounts, t.subtotal, t.total], [3500, 0, 3500, 3500]);
  assert.deepEqual(t.lines.map((l) => l.charged), [true, true, false, false, false]);
  assert.equal(t.lines[2]!.discount, 0, "a goodwill line's discount is ignored: it is already free");
  assert.equal(t.lines[2]!.net, 0);
});

test('line discounts, then the estimate discount, then VAT on what is left', () => {
  const t = billingTotals({ lines: [{ amount: 10000, discountAmount: 1000 }, { amount: 5000 }], discountAmount: 1400, vat: VAT_ON });
  assert.equal(t.gross, 15000);
  assert.equal(t.lineDiscounts, 1000);
  assert.equal(t.subtotal, 14000);
  assert.equal(t.discountAmount, 1400);
  assert.equal(t.afterDiscount, 12600);
  assert.equal(t.vatRate, 7.5);
  assert.equal(t.vatAmount, 945);
  assert.equal(t.total, 13545);
  assert.equal(discountPercent(t), 10);
});

test('VAT off: no VAT whatever the rate; no settings at all: no VAT', () => {
  const lines = [{ amount: 20000 }];
  assert.deepEqual([billingTotals({ lines, vat: VAT_OFF }).vatAmount, billingTotals({ lines, vat: VAT_OFF }).vatRate, billingTotals({ lines, vat: VAT_OFF }).total], [0, 0, 20000]);
  assert.equal(billingTotals({ lines }).total, 20000);
  assert.equal(billingTotals({ lines, vat: null }).total, 20000);
  assert.equal(billingTotals({ lines, vat: { vatEnabled: true, vatRate: 7.5 } }).total, 21500);
});

test('every step in whole kobo: 3 × ₦333.33 and other awkward numbers', () => {
  // A line of 3 × ₦333.33 is stored as ₦999.99 (the line amount is rounded when saved).
  const t = billingTotals({ lines: [{ amount: 999.99 }], vat: VAT_ON });
  assert.equal(t.vatAmount, 75); // 74.99925 → 75.00
  assert.equal(t.total, 1074.99);
  // Three lines of ₦333.33: no float drift in the sum.
  const three = billingTotals({ lines: [{ amount: 333.33 }, { amount: 333.33 }, { amount: 333.33 }], vat: VAT_ON });
  assert.equal(three.subtotal, 999.99);
  assert.equal(three.total, 1074.99);
  // 0.1 + 0.2 is exact in kobo.
  assert.equal(billingTotals({ lines: [{ amount: 0.1 }, { amount: 0.2 }] }).total, 0.3);
  // Half a kobo of VAT rounds up: ₦0.06 × 7.5% = 0.45 kobo → 0; ₦0.07 → 0.525 kobo → 1 kobo.
  assert.equal(billingTotals({ lines: [{ amount: 0.06 }], vat: VAT_ON }).vatAmount, 0);
  assert.equal(billingTotals({ lines: [{ amount: 0.07 }], vat: VAT_ON }).vatAmount, 0.01);
  // Every figure is a whole number of kobo, and the total is what the steps add up to.
  for (const x of [three, t]) {
    for (const v of [x.gross, x.lineDiscounts, x.subtotal, x.discountAmount, x.vatAmount, x.total]) assert.equal(toKobo(v) / 100, v);
    assert.equal(toKobo(x.total), toKobo(x.gross) - toKobo(x.lineDiscounts) - toKobo(x.discountAmount) + toKobo(x.vatAmount));
  }
});

test('a discount never exceeds what it discounts; nothing goes negative', () => {
  const t = billingTotals({ lines: [{ amount: 500, discountAmount: 800 }, { amount: 1000 }], discountAmount: 99999, vat: VAT_ON });
  assert.equal(t.lines[0]!.discount, 500, 'a line discount is capped at the line');
  assert.equal(t.subtotal, 1000);
  assert.equal(t.discountAmount, 1000, 'the estimate discount is capped at the subtotal');
  assert.deepEqual([t.afterDiscount, t.vatAmount, t.total], [0, 0, 0]);
  const negative = billingTotals({ lines: [{ amount: 1000, discountAmount: -50 }], discountAmount: -20 });
  assert.deepEqual([negative.lineDiscounts, negative.discountAmount, negative.total], [0, 0, 1000]);
  assert.equal(billingTotals({ lines: [{ amount: null }, { amount: undefined }, { amount: 'x' }] }).total, 0, 'an unpriced line counts for nothing');
});

test('the Owner rule: above the limit, or any discount with no limit set', () => {
  const t = (discount: number) => ({ subtotal: 10000, discountAmount: discount });
  assert.equal(discountNeedsManager(t(0), null), false, 'no discount, nothing to approve');
  assert.equal(discountNeedsManager(t(1), null), true, 'no limit: every discount');
  assert.equal(discountNeedsManager(t(1000), 10), false, 'exactly at the limit');
  assert.equal(discountNeedsManager(t(1000.01), 10), true, 'a kobo above it');
  assert.equal(discountNeedsManager(t(500), 0), true, 'a 0% limit: every discount');
});

test('deposit, paid in full and balance compare in kobo', () => {
  assert.equal(depositOf(13545, 0.7), 9481.5);
  assert.equal(depositOf(1074.99, 0.7), 752.49);
  assert.equal(paidInFull(1074.99, 1074.99), true);
  assert.equal(paidInFull(1074.98, 1074.99), false);
  assert.equal(paidInFull(0.1 + 0.2, 0.3), true);
  assert.equal(balanceDue(1074.99, 1000), 74.99);
  assert.equal(balanceDue(100, 250), 0);
});

test('the VAT fixed at the Owner\'s approval is used whatever the settings say later', () => {
  const lines = [{ amount: 10000 }];
  // Still being written: the live setting.
  assert.equal(jobCardTotals({ lineItems: lines, vatRate: null }, VAT_ON).total, 10750);
  assert.equal(jobCardTotals({ lineItems: lines }, VAT_OFF).total, 10000);
  // Approved at 7.5%: VAT switched off, or the rate changed, afterwards changes nothing.
  const approvedWithVat = { lineItems: lines, vatRate: '7.50' };
  assert.equal(jobCardTotals(approvedWithVat, VAT_OFF).total, 10750);
  assert.equal(jobCardTotals(approvedWithVat, { vatEnabled: true, vatRate: '10' }).total, 10750);
  // Approved with VAT off (rate 0): switching VAT on later adds none.
  const approvedWithoutVat = { lineItems: lines, vatRate: 0 };
  assert.equal(jobCardTotals(approvedWithoutVat, VAT_ON).total, 10000);
  assert.equal(jobCardTotals(approvedWithoutVat, VAT_ON).vatRate, 0);
  assert.deepEqual([vatIsFixed(approvedWithVat), vatIsFixed(approvedWithoutVat), vatIsFixed({ vatRate: null }), vatIsFixed(null)], [true, true, false, false]);
  assert.deepEqual(vatSettingFor({ vatRate: null }, VAT_ON), VAT_ON);
});

test('the rate is fixed in the approving update and cleared when the estimate is sent back', () => {
  const ws = read('lib/actions/workshop.ts');
  const manager = body(ws, 'approveEstimateAsManager');
  assert.match(manager, /status: 'MANAGER_APPROVED', managerApprovedAt: approvedAt, managerApprovedById: user\.id,[\s\S]{0,200}vatRate: settings\.vatEnabled \? Number\(settings\.vatRate\) : 0,/);
  assert.match(body(ws, 'returnEstimateForChanges'), /data: \{ status: 'SUBMITTED', approvedAt: null, approvedById: null, vatRate: null, \.\.\.CLEARED_CUSTOMER_ANSWER \}/);
  // Nothing else moves an approved estimate back to be edited.
  assert.equal([...ws.matchAll(/status: '(APPROVED|MANAGER_APPROVED)' \},\s*(?:\/\/[^\n]*\n\s*)?data: \{ status: '(DRAFT|SUBMITTED)'/g)].length, 1);
  assert.match(read('lib/estimate-billing.ts'), /vat: vatSettingFor\(estimate, settings\)/);
  assert.match(read('lib/estimate-billing.ts'), /ESTIMATE_TOTALS_SELECT = \{ discountAmount: true, vatRate: true,/);
  assert.match(read('lib/invoices.ts'), /discountReason: true, vatRate: true,/, 'the invoice takes the fixed rate');
  assert.match(body(ws, 'notifyCustomerOfApprovedEstimate'), /vat: vatSettingFor\(estimate,/, 'the email and its PDF too');
  assert.match(readRepo('apps/website/lib/customer-portal/data.ts'), /vat: vatSettingFor\(jc\.estimate,/, 'and the customer portal');
  assert.match(read('app/(app)/workshop/job-cards/[id]/page.tsx'), /\(fixed when the Owner approved\)/);
  assert.match(readRepo('packages/database/prisma/schema.prisma'), /model Estimate \{[\s\S]*?vatRate\s+Decimal\?\s+@db\.Decimal\(5, 2\)/);
});

// ── 2. One calculation everywhere ────────────────────────────────────

test('the calculation lives in @ejo/utils, has no imports, and both apps use it', () => {
  const billing = readRepo('packages/utils/src/billing.ts');
  assert.doesNotMatch(billing, /^import /m, 'pure: no imports');
  assert.match(readRepo('packages/utils/src/index.ts'), /export \{[^}]*billingTotals[^}]*\} from '\.\/billing'/);
  assert.match(readRepo('packages/utils/package.json'), /"\.\/billing": "\.\/src\/billing\.ts"/);
  assert.match(read('lib/estimate-billing.ts'), /from '@ejo\/utils\/billing'/);
  assert.match(read('lib/estimate-billing.ts'), /export function jobCardTotals\([\s\S]{0,200}billingTotals\(/);
  const website = readRepo('apps/website/lib/customer-portal/format.ts');
  assert.match(website, /import \{[^}]*billingTotals[^}]*\} from '@ejo\/utils(\/billing)?'/);
  assert.match(website.slice(website.indexOf('export function moneyFor')), /billingTotals\(/);
});

test('the estimate page, prints, PDF, emails and payment checks all go through it', () => {
  const ws = read('lib/actions/workshop.ts');
  assert.doesNotMatch(ws, /customerTotal\(/, 'no Job Card total is worked out by hand any more');
  for (const fn of ['recordPayment', 'updateJobCardStatus', 'requestJobCardClose', 'sendApprovalReminder']) assert.match(body(ws, fn), /jobCardTotals\(/, fn);
  assert.match(body(ws, 'updateJobCardStatus'), /paidInFull\(totalPaid, totalEstimate\)/, 'checkout: paid in full in kobo');
  assert.match(body(ws, 'requestJobCardClose'), /paidInFull\(totalPaid, totalEstimate\)/, 'close: paid in full in kobo');
  // The email's figures and its PDF: the same billing rules (vatSettingFor, depositFractionFor); the PDF is drawn once, in lib/document-pdfs.
  const notify = body(ws, 'notifyCustomerOfApprovedEstimate');
  assert.match(notify, /vat: vatSettingFor\(estimate, estimate\.jobCard\.branch\.businessUnit\.organisation\), depositFraction: depositFractionFor\(/);
  assert.match(notify, /jobEstimateTotals\(estimate\.lineItems, billing\)[\s\S]*await estimatePdfFor\(jobCardId\)/, 'the email and its PDF: the same figures');
  const pdfs = read('lib/document-pdfs.ts');
  assert.match(pdfs, /vat: vatSettingFor\(jc\.estimate, org\), depositFraction: depositFractionFor\(org, String\(jc\.customer\.customerType\)\)/);
  assert.match(pdfs, /EstimatePdf\(jobEstimatePdfProps\(\{[\s\S]*billing,/);
  assert.match(read('lib/pdf/document-props.ts'), /export function jobEstimateTotals[\s\S]{0,900}billingTotals\(/);
  assert.match(read('app/(app)/workshop/job-cards/[id]/page.tsx'), /const estimateTotal = jobCardTotals\(estimate, billingSettings\)\.total;/);
  assert.match(read('app/print/job-cards/[id]/estimate/page.tsx'), /jobCardTotals\(estimate, billingOf\(jobCard\)\)/);
  assert.match(read('app/print/job-cards/[id]/page.tsx'), /jobCardTotals\(jobCard\.estimate, billingOf\(jobCard\)\)/);
  for (const f of ['lib/actions/refunds.ts', 'lib/actions/security.ts', 'lib/actions/estimate-billing.ts']) assert.match(read(f), /jobCardTotals\(/, f);
  // One estimate maths only: no second calculation for a separate service flow.
  assert.doesNotMatch(read('lib/pdf/document-props.ts'), /serviceEstimateTotals/);
});

// ── 3. The wiring ────────────────────────────────────────────────────

test('completing a Job Card issues its invoice in the same step, once', () => {
  const status = body(read('lib/actions/workshop.ts'), 'updateJobCardStatus');
  const claim = status.indexOf('claimed(await prisma.jobCard.updateMany');
  const issue = status.indexOf('await ensureInvoice(id, user.id)');
  assert.ok(claim > 0 && issue > claim, 'issued after the move to COMPLETED is claimed');
  assert.match(status, /if \(status === JobCardStatus\.COMPLETED && priorStatus !== JobCardStatus\.COMPLETED\) \{\s*try \{/);
  assert.match(status, /if \(issued\?\.created\) await sendInvoiceEmail\(issued\.invoice\.id\)/, 'the email goes once, with the new invoice');
  const inv = read('lib/invoices.ts');
  const ensure = inv.slice(inv.indexOf('export async function ensureInvoice'), inv.indexOf('/** Everything a printed'));
  assert.match(ensure, /const existing = await prisma\.invoice\.findUnique\(\{ where: \{ jobCardId \}[\s\S]*if \(existing\) return \{ invoice: existing, created: false \}/, 'a second call returns the invoice already issued');
  assert.match(ensure, /retryOnNumberClash\('invoiceNumber', \(\) => prisma\.\$transaction\(async \(tx\) => \{\s*\/\/[^\n]*\n\s*await lockExisting\(tx, 'jobCard', \[jobCardId\]/, 'numbered and frozen under the Job Card lock');
  assert.match(ensure, /const already = await tx\.invoice\.findUnique\(\{ where: \{ jobCardId \}/, 'checked again under the lock');
  assert.match(ensure, /isUniqueClashOn\(err, 'jobCardId'\)/, 'two at once: the loser hands back the winner');
  assert.match(inv, /`INV-\$\{lagosYear\(\)\}-`/);
  assert.match(ensure, /action: 'invoice\.issued'/);
  const schema = readRepo('packages/database/prisma/schema.prisma');
  assert.match(schema, /model Invoice \{[\s\S]*?invoiceNumber\s+String\s+@unique[\s\S]*?jobCardId\s+String\s+@unique/);
  assert.match(schema, /model Invoice \{[\s\S]*?lines\s+Json/);
});

test('"Issue invoice" is for whoever records payments (Front Desk, Accounts) or the Owner at the branch; viewing follows the Job Card', () => {
  const src = read('lib/actions/invoices.ts');
  assert.match(src, /allows\('workshop\.payment\.record', \{ branchId, homeBranch: true \}\)[\s\S]{0,200}authorize\('workshop\.close\.approve', \{ branchId, homeBranch: true \}/);
  assert.match(body(src, 'issueInvoice'), /seeJobCard\(jobCardId, 'issueInvoice'\)[\s\S]*requireBiller\(/);
  assert.match(body(src, 'getInvoice'), /seeJobCard\(inv\.jobCard\.id, 'getInvoice'\)/);
  assert.match(body(src, 'getReceipt'), /seeJobCard\(p\.jobCard\.id, 'getReceipt'\)/);
});

test('a receipt number is given inside recordPayment\'s locked step, retried on a clash', () => {
  const pay = body(read('lib/actions/workshop.ts'), 'recordPayment');
  assert.match(pay, /retryOnNumberClash\('receiptNumber', \(\) => prisma\.\$transaction\(async \(tx\) => \{\s*await lockExisting\(tx, 'jobCard'/);
  const lock = pay.indexOf("await lockExisting(tx, 'jobCard'");
  const number = pay.indexOf('const receiptNumber = await generateReceiptNumber(tx);');
  const create = pay.indexOf('await tx.payment.create(');
  assert.ok(lock > 0 && number > lock && create > number, 'numbered after the lock, before the payment is written');
  assert.match(pay.slice(create, create + 400), /receiptNumber,/);
  assert.match(pay, /action: 'receipt\.issued'/);
  assert.match(pay, /receiptNumber: settled\.receiptNumber,/, 'the customer email carries it');
  assert.match(read('lib/actions/workshop.ts'), /`RCT-\$\{lagosYear\(\)\}-`/);
  assert.match(readRepo('packages/database/prisma/schema.prisma'), /receiptNumber\s+String\?\s+@unique/);
});

test('discounts: by whoever works on the estimate, with a reason; the Owner approves one above the limit', () => {
  const ws = read('lib/actions/workshop.ts');
  const whole = body(ws, 'setEstimateDiscount');
  assert.match(whole, /requireEstimateContributor\(jobCard\)/);
  assert.match(whole, /Give the reason for this discount/);
  assert.match(whole, /discount > t\.subtotal/, 'never more than the subtotal');
  assert.match(whole, /discountApprovedById: null, discountApprovedAt: null/, 'a change clears an earlier approval');
  assert.match(whole, /action: discount > 0 \? 'estimate\.discount_set' : 'estimate\.discount_removed'/);
  const line = body(ws, 'setEstimateLineDiscount');
  assert.match(line, /requirePricingAuthority\(line\.type/);
  assert.match(line, /!isCustomerLine\(line\)/, 'customer lines only');
  assert.match(line, /discount > Number\(line\.amount\)/, 'never more than the line');
  const manager = body(ws, 'approveEstimateAsManager');
  assert.match(manager, /discountNeedsManager\(totals, settings\.discountApprovalPercent\)/);
  assert.match(manager, /if \(discountToApprove && !approveDiscount\) \{\s*throw new WorkshopActionError/, 'refused without the explicit tick');
  assert.match(manager, /where: \{ id: estimate\.id, status: 'APPROVED', discountAmount: estimate\.discountAmount \}/, 'the discount the Owner saw');
  assert.match(manager, /discountApprovedById: user\.id, discountApprovedAt: approvedAt/);
  assert.match(manager, /action: 'estimate\.discount_approved'/);
  assert.match(read('lib/actions/workshop-form-handlers.ts'), /approveEstimateAsManager\(jobCardId, formData\.get\('approveDiscount'\) === 'on'\)/);
  assert.match(read('app/(app)/workshop/job-cards/[id]/page.tsx'), /name="approveDiscount" required/);
});

test('billing settings: their own audited action, guarded like the organisation details', () => {
  const src = body(read('lib/actions/organisation.ts'), 'updateBillingSettings');
  assert.match(src, /authorize\('admin\.organisation\.manage'/);
  assert.match(src, /me\?\.organisationId !== organisationId/);
  assert.match(src, /action: 'organisation\.billing_updated'/);
  const page = read('app/(app)/organisation/page.tsx');
  for (const label of ['Billing &amp; tax', 'Charge VAT', 'VAT rate (%)', 'Tax ID (TIN) on invoices', 'Discounts above this % need the Owner']) assert.ok(page.includes(label), label);
  const schema = readRepo('packages/database/prisma/schema.prisma');
  const org = schema.slice(schema.indexOf('model Organisation {'), schema.indexOf('\n}', schema.indexOf('model Organisation {')));
  assert.match(org, /vatEnabled\s+Boolean\s+@default\(false\)/);
  assert.match(org, /vatRate\s+Decimal\s+@default\(7\.5\) @db\.Decimal\(5, 2\)/);
  assert.match(org, /discountApprovalPercent Int\?/);
});

test('the schema carries receipts and invoices with their unique numbers and one invoice per Job Card', () => {
  const schema = readRepo('packages/database/prisma/schema.prisma');
  assert.match(schema, /model Payment \{[\s\S]*?receiptNumber\s+String\?\s+@unique/);
  assert.match(schema, /model Invoice \{[\s\S]*?@@map\("invoices"\)/);
  assert.match(schema, /model Estimate \{[\s\S]*?vatRate\s+Decimal\?\s+@db\.Decimal\(5, 2\)/);
});

// ── 4. The invoice document and ₦ in PDFs ────────────────────────────

const head = letterhead({ name: 'Demo Autocare Limited', legalName: 'Demo Autocare Limited', hqAddress: '1 Example Road, Lagos', poBox: null, rcNumber: 'RC 000001', hotlines: ['0800 000 0001'], website: null, email: 'hello@example.com' }, { name: 'Lekki', address: '2 Example Close', hotlines: [], email: null }, 'https://portal.example.com');
const localHead = { ...head, logoUrl: join(ROOT, 'public', 'images', 'logo', 'logo.png') };
const bank = { bankName: 'Example Bank', accountName: 'Demo Autocare', accountNumber: '0001112223' };
const vehicle = { make: 'Toyota', model: 'Corolla', plateNumber: 'LND-123AB', chassisNumber: null };

test('the invoice: frozen lines, discounts, VAT with the TIN, paid and due, and the closing', () => {
  const lines = invoiceLinesFrom([
    { type: 'EXTERNAL_PART', description: 'Brake pads', quantity: 3, unitPrice: '333.33', amount: '999.99', unitOfMeasure: 'set', discountAmount: '99.99' },
    { type: 'LABOUR', description: 'Fitting', quantity: 1, unitPrice: 5000, amount: 5000, unitOfMeasure: null, billTo: 'GOODWILL' },
  ]);
  assert.deepEqual(lines[0], { description: 'Brake pads', type: 'EXTERNAL_PART', quantity: 3, unitOfMeasure: 'set', unitPrice: 333.33, lineDiscount: 99.99, amount: 999.99, billTo: 'CUSTOMER' });
  assert.equal(lines[1]!.billTo, 'GOODWILL');
  const p = invoicePdfProps({
    letterhead: head, bank, invoiceNumber: 'INV-2026-000001', issuedOnLabel: '21 November 2026', jobNumber: 'JC-2026-000001',
    customer: { name: 'Example Fleet Limited', contact: 'Ada Example', address: null }, vehicle: { ...vehicle, mileage: 45000 }, lines,
    figures: { subtotal: 900, lineDiscounts: 99.99, discountAmount: 100, discountReason: 'Fleet customer', vatRate: 7.5, vatAmount: 60, vatNumber: '12345678-0001', total: 860 },
    amountPaid: 500,
  });
  assert.equal(p.lineItems[0]!.amount, '₦900.00');
  assert.equal(p.lineItems[0]!.discount, '−₦99.99');
  assert.equal(p.lineItems[1]!.amount, 'Goodwill — not charged');
  assert.equal(p.subtotalAmount, '₦999.99');
  assert.equal(p.discountAmount, '−₦199.99');
  assert.deepEqual([p.vatLabel, p.vatAmount, p.vatNumber], ['VAT (7.5%)', '₦60.00', '12345678-0001']);
  assert.deepEqual([p.totalAmount, p.amountPaid, p.balanceDue], ['₦860.00', '₦500.00', '₦360.00']);
  assert.equal(p.mileage, '45,000 km');
  assert.equal(p.closing, 'Thank you for choosing Demo Autocare Limited.');
  // VAT off: no VAT line and no TIN.
  const off = invoicePdfProps({ letterhead: head, bank, invoiceNumber: 'INV-2026-000002', issuedOnLabel: 'x', jobNumber: 'JC-1', customer: { name: 'A', contact: null, address: null }, vehicle: { ...vehicle, mileage: null }, lines, figures: { subtotal: 900, lineDiscounts: 99.99, discountAmount: 0, discountReason: null, vatRate: 0, vatAmount: 0, vatNumber: '1', total: 900 }, amountPaid: 900 });
  assert.deepEqual([off.vatLabel, off.vatAmount, off.vatNumber, off.balanceDue], [null, null, null, '₦0.00']);
});

/** The text a PDF carries, with its compressed streams opened. */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const parts = [raw];
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length;
    const end = raw.indexOf('endstream', start);
    try {
      parts.push(inflateSync(pdf.subarray(start, end)).toString('latin1'));
    } catch {
      // Not a compressed stream (an image, say).
    }
  }
  return parts.join('\n');
}

test('₦ in PDFs: the invoice and the estimate embed Noto Sans and carry the ₦', async () => {
  assert.equal(nairaForPdf(11000), '₦11,000.00');
  assert.match(pdfFontDir(), /lib[\\/]pdf[\\/]fonts$/);
  const invoice = await renderToBuffer(InvoicePdf(invoicePdfProps({
    letterhead: localHead, bank, invoiceNumber: 'INV-2026-000003', issuedOnLabel: '21 November 2026', jobNumber: 'JC-2026-000003',
    customer: { name: 'Ada Example', contact: null, address: null }, vehicle: { ...vehicle, mileage: null },
    lines: invoiceLinesFrom([{ type: 'LABOUR', description: 'Service', quantity: 1, unitPrice: 11000, amount: 11000, unitOfMeasure: null }]),
    figures: { subtotal: 11000, lineDiscounts: 0, discountAmount: 0, discountReason: null, vatRate: 0, vatAmount: 0, vatNumber: null, total: 11000 }, amountPaid: 0,
  })));
  const estimate = await renderToBuffer(EstimatePdf({ ...jobEstimatePdfProps({ letterhead: localHead, bank, jobNumber: 'JC-2026-000004', customer: { fullName: 'Ada Example', address: null }, vehicle: { ...vehicle, year: 2020 }, lineItems: [{ type: 'LABOUR', description: 'Service', quantity: 1, amount: 11000, unitOfMeasure: null }] }) }));
  for (const [name, pdf] of [['invoice', invoice], ['estimate', estimate]] as const) {
    const text = pdfText(pdf);
    assert.match(text, /\/BaseFont \/[A-Z]{6}\+NotoSans-Regular/, `${name}: Noto Sans embedded`);
    assert.match(text, /\/BaseFont \/[A-Z]{6}\+NotoSans-Bold/, `${name}: Noto Sans Bold embedded`);
    assert.doesNotMatch(text, /\/BaseFont \/Helvetica/, `${name}: no standard font left`);
    // The ₦ (U+20A6) is in the text: the font's character map names it.
    assert.match(text, /<20a6>/i, `${name}: ₦ in the text`);
  }
});

test('the fonts reach every deployed function that can make a PDF', () => {
  const config = read('next.config.ts');
  assert.match(config, /outputFileTracingIncludes: \{\s*'\/\*\*': \[[^\]]*'\.\/lib\/pdf\/fonts\/\*\*'/);
  for (const f of ['lib/pdf/estimate-pdf.tsx', 'lib/pdf/inspection-pdf.tsx', 'lib/pdf/invoice-pdf.tsx']) {
    const src = read(f);
    assert.match(src, /registerPdfFonts\(\);/, f);
    assert.doesNotMatch(src, /Helvetica/, f);
  }
});
