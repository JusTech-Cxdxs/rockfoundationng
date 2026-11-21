/**
 * D'Phoenix phase 4 — the customer's approval, the deposit switch and credit.
 *
 *  1. One deposit rule (@ejo/utils depositFractionFor): off by default, then
 *     the organisation's percentage for individual customers only — never
 *     for an organisation, on credit or not. No second rule anywhere.
 *  2. Approval by link, portal or phone (or paying at the counter); work
 *     starts once the customer has approved and any deposit is paid.
 *  3. The secure link: 32 random bytes, only the SHA-256 kept, single use,
 *     and the page that shows it changes nothing.
 *  4. Credit terms: an organisation on credit leaves with a balance once
 *     invoiced, within its limit (a Manager may close over it), and the
 *     invoice carries its due date.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { depositFractionFor, depositOf, depositPercentOf, paymentApproves, workMayStart } from '@ejo/utils/billing';
import { APPROVAL_LINK_DAYS, approvalLinkUrl, hashApprovalToken, isApprovalToken, newApprovalToken } from '@ejo/utils/approval-link';
import { whatsAppNumber, whatsAppShareUrl } from '@ejo/utils/whatsapp';
import { creditLimitOf, invoiceDueDate, isOnCredit, isOverdue, withinCreditLimit } from '../lib/credit-core';
import { jobEstimatePdfProps } from '../lib/pdf/document-props';

const ROOT = join(__dirname, '..', '..');
const REPO = join(ROOT, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const readRepo = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

function body(src: string, fn: string): string {
  const at = src.search(new RegExp(`(export )?async function ${fn}\\(`));
  assert.ok(at >= 0, `${fn} not found`);
  const next = src.indexOf('\nexport ', at + 10);
  return next === -1 ? src.slice(at) : src.slice(at, next);
}

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.test-out' || name === 'tests' || name === 'e2e') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// ── 1. The deposit rule ──────────────────────────────────────────────

test('the deposit rule: off by default, individuals only, never an organisation', () => {
  assert.equal(depositFractionFor(null, 'INDIVIDUAL'), 0, 'no settings: no deposit');
  assert.equal(depositFractionFor({ depositRequired: false, depositPercent: 70 }, 'INDIVIDUAL'), 0, 'switched off (the default)');
  assert.equal(depositFractionFor({ depositRequired: true, depositPercent: 70 }, 'INDIVIDUAL'), 0.7);
  assert.equal(depositFractionFor({ depositRequired: true, depositPercent: 70 }, 'ORGANIZATION'), 0, 'never for an organisation');
  assert.equal(depositFractionFor({ depositRequired: true, depositPercent: 100 }, 'ORGANIZATION'), 0);
  assert.equal(depositFractionFor({ depositRequired: true, depositPercent: 25 }, 'INDIVIDUAL'), 0.25);
  assert.equal(depositFractionFor({ depositRequired: true, depositPercent: 150 }, 'INDIVIDUAL'), 1, 'never more than the total');
  assert.equal(depositFractionFor({ depositRequired: true, depositPercent: 0 }, 'INDIVIDUAL'), 0);
  assert.equal(depositPercentOf(0.7), 70);
  assert.equal(depositOf(116000, depositFractionFor({ depositRequired: true, depositPercent: 70 }, 'INDIVIDUAL')), 81200);
  // The schema's defaults: off, 70% when switched on.
  const schema = readRepo('packages/database/prisma/schema.prisma');
  const org = schema.slice(schema.indexOf('model Organisation {'), schema.indexOf('\n}', schema.indexOf('model Organisation {')));
  assert.match(org, /depositRequired Boolean @default\(false\)/);
  assert.match(org, /depositPercent\s+Int\s+@default\(70\)/);
});

test('one rule: the hard-coded 70% is gone from both apps', () => {
  const offenders: string[] = [];
  for (const app of ['apps/portal', 'apps/website']) {
    for (const f of sources(join(REPO, app))) {
      const src = readFileSync(f, 'utf8');
      if (/MINIMUM_DEPOSIT_FRACTION|minimum deposit \(70|70% deposit|70% minimum deposit|"70%"/i.test(src)) offenders.push(f.slice(REPO.length + 1));
    }
  }
  assert.deepEqual(offenders, []);
  assert.match(read('lib/estimate-billing.ts'), /depositFractionFor\(settings, customerType\)/);
  assert.match(read('lib/estimate-billing.ts'), /BILLING_SETTINGS_SELECT = \{[^}]*depositRequired: true, depositPercent: true/);
  for (const f of ['lib/customer-portal/format.ts', 'lib/customer-portal/data.ts']) assert.match(readRepo(`apps/website/${f}`), /depositFraction/);
  assert.match(readRepo('apps/website/lib/customer-portal/data.ts'), /depositFractionFor\(jc\.branch\?\.businessUnit\.organisation, String\(jc\.customer\.customerType\)\)/);
});

test('no deposit wording when none applies: the estimate PDF has no deposit box', () => {
  const p = jobEstimatePdfProps({
    letterhead: { organisation: { name: 'Demo Autocare', legalName: null, hqAddress: null, poBox: null, rcNumber: null, hotlines: [], website: null, email: null }, branch: { name: 'Lekki', address: null, hotlines: [], email: null }, logoUrl: 'https://portal.example.com/images/logo/logo.png' },
    bank: { bankName: 'Example Bank', accountName: 'Demo', accountNumber: '0001112223' },
    jobNumber: 'JC-2026-000001', customer: { fullName: 'Example Fleet Limited', address: null }, vehicle: { make: 'Toyota', model: 'Hilux', plateNumber: null, chassisNumber: null },
    lineItems: [{ type: 'LABOUR', description: 'Service', quantity: 1, amount: 10000, unitOfMeasure: null }],
    billing: { depositFraction: depositFractionFor({ depositRequired: true, depositPercent: 70 }, 'ORGANIZATION') },
  });
  assert.equal(p.minimumDepositAmount, null);
  assert.match(read('lib/pdf/estimate-pdf.tsx'), /\{minimumDepositAmount \? \(/);
  assert.match(read('lib/email-templates/customer-estimate-approved.ts'), /\$\{deposit \? highlight\(depositCaption/);
});

// ── 2. Approval and when work starts ─────────────────────────────────

test('work starts only once the customer has approved and any deposit is paid', () => {
  assert.equal(workMayStart({ approved: false, deposit: 0, paid: 0 }), false, 'never without approval');
  assert.equal(workMayStart({ approved: true, deposit: 0, paid: 0 }), true, 'no deposit: approval alone');
  assert.equal(workMayStart({ approved: true, deposit: 70000, paid: 69999.99 }), false, 'deposit not yet met');
  assert.equal(workMayStart({ approved: true, deposit: 70000, paid: 70000 }), true);
  // Paying at the counter is the customer's go-ahead: the deposit when one applies, else the first money in.
  assert.equal(paymentApproves({ total: 100000, deposit: 70000, paidBefore: 0, paidAfter: 50000 }), false);
  assert.equal(paymentApproves({ total: 100000, deposit: 70000, paidBefore: 50000, paidAfter: 70000 }), true);
  assert.equal(paymentApproves({ total: 100000, deposit: 0, paidBefore: 0, paidAfter: 1000 }), true);
  assert.equal(paymentApproves({ total: 100000, deposit: 0, paidBefore: 1000, paidAfter: 2000 }), false, 'only the first money in');
  assert.equal(paymentApproves({ total: 100000, deposit: 0, paidBefore: 1000, paidAfter: 100000 }), true, 'or clearing the total');
});

test('the move to In Progress: one compare-and-set, from Awaiting Customer Approval, with the deposit when it applies', () => {
  const lib = read('lib/customer-approval.ts');
  const start = body(lib, 'startWorkIfReady');
  assert.match(start, /depositDueOn\(total, billingOf\(jc\), String\(jc\.customer\.customerType\)\)/);
  assert.match(start, /if \(!workMayStart\(\{ approved: Boolean\(jc\.estimate\?\.customerApprovedAt\), deposit, paid \}\)\) return false;/);
  assert.match(start, /where: \{ id: jobCardId, status: JobCardStatus\.AWAITING_CUSTOMER_APPROVAL \}[\s\S]*status: JobCardStatus\.IN_PROGRESS/);
  const pay = body(read('lib/actions/workshop.ts'), 'recordPayment');
  assert.match(pay, /paymentApproves\(\{ total: totalNow, deposit: depositNow, paidBefore: paidNow, paidAfter: afterNow \}\)/);
  assert.match(pay, /customerApprovedVia: 'DEPOSIT'/, 'paying at the counter still counts as approval');
  assert.match(pay, /const autoApprove = await startWorkIfReady\(tx, jobCardId\);/, 'the same move as every other approval, inside the locked step');
  assert.ok(pay.indexOf('lockExisting(tx, \'jobCard\'') < pay.indexOf('startWorkIfReady(tx'), 'under the Job Card lock');
  // Paying the balance later on a Job Card that left on credit.
  assert.match(pay, /invoiced && ON_ACCOUNT_STATUSES\.includes\(status\)/);
});

test('approval by phone: the front desk, the supervisor or a Manager; who they spoke with; audited; never during an assisted session', () => {
  const a = read('lib/actions/customer-approval.ts');
  const phone = body(a, 'recordCustomerApprovalByPhone');
  assert.match(phone, /await refuseDuringAssist\('recordCustomerApprovalByPhone'\)/);
  assert.match(phone, /authorizeOnJobCard\('workshop\.job_card\.view', jobCardId/);
  assert.match(phone, /requireAnswerTaker\(jc, 'recordCustomerApprovalByPhone'\)/);
  assert.match(phone, /if \(who\.length < 2\) throw/, 'who they spoke with is required');
  assert.match(phone, /lockExisting\(tx, 'jobCard', \[jobCardId\]/);
  assert.match(phone, /customerApprovedVia: 'PHONE', customerApprovedByStaffId: user\.id/);
  assert.match(phone, /return startWorkIfReady\(tx, jobCardId\);/);
  assert.match(phone, /action: 'estimate\.customer_approved'/);
  const taker = body(a, 'requireAnswerTaker');
  for (const k of ["allows('workshop.customer.notify'", "allows('workshop.estimate.final_approve'", 'user.id === jc.supervisorId']) assert.ok(taker.includes(k), k);
  const page = read('app/(app)/workshop/job-cards/[id]/page.tsx');
  assert.ok(page.includes('Customer approved by phone'));
  assert.ok(page.includes('Approved by the customer'));
  assert.match(page, /taken by \$\{estimate\.customerApprovedByStaff\.fullName\}/);
  assert.ok(page.includes('data-testid="customer-declined"'));
});

test('sending the estimate back for changes clears the customer\'s answer and its links', () => {
  const back = body(read('lib/actions/workshop.ts'), 'returnEstimateForChanges');
  assert.match(back, /\.\.\.CLEARED_CUSTOMER_ANSWER/);
  assert.match(back, /estimateApprovalLink\.updateMany\(\{ where: \{ estimateId: estimate\.id, usedAt: null, revokedAt: null \}, data: \{ revokedAt: new Date\(\) \} \}\)/);
  const cleared = read('lib/customer-approval.ts');
  for (const f of ['customerApprovedAt', 'customerApprovedVia', 'customerApprovedByStaffId', 'customerApprovalNote', 'customerDeclinedAt', 'customerDeclineNote']) assert.match(cleared, new RegExp(`${f}: null`), f);
});

// ── 3. The secure link ───────────────────────────────────────────────

test('the token: 32 random bytes in base64url, only its SHA-256 stored, a strict format', () => {
  const a = newApprovalToken();
  const b = newApprovalToken();
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.token, b.token);
  assert.equal(a.tokenHash, createHash('sha256').update(a.token).digest('hex'));
  assert.equal(hashApprovalToken(a.token), a.tokenHash);
  assert.match(a.tokenHash, /^[0-9a-f]{64}$/);
  assert.equal(isApprovalToken(a.token), true);
  for (const bad of ['', 'short', `${a.token}x`, a.token.slice(1), `${a.token.slice(0, 42)}/`, a.tokenHash, null, 42]) assert.equal(isApprovalToken(bad), false, String(bad));
  assert.equal(APPROVAL_LINK_DAYS, 7);
  assert.equal(approvalLinkUrl('https://www.example.com/', a.token), `https://www.example.com/estimate/approve/${a.token}`);
  // Stored: the hash, unique; never the token.
  const schema = readRepo('packages/database/prisma/schema.prisma');
  const link = schema.slice(schema.indexOf('model EstimateApprovalLink {'), schema.indexOf('\n}', schema.indexOf('model EstimateApprovalLink {')));
  assert.match(link, /tokenHash\s+String\s+@unique/);
  assert.doesNotMatch(link, /\btoken\s+String/);
});

test('the token never reaches the audit trail or a log; a new link revokes the older ones', () => {
  const lib = read('lib/customer-approval.ts');
  const issue = body(lib, 'issueApprovalLink');
  assert.match(issue, /estimateApprovalLink\.updateMany\(\{ where: \{ estimateId, usedAt: null, revokedAt: null \}, data: \{ revokedAt: now \} \}\)/);
  assert.match(issue, /estimateApprovalLink\.create\(\{ data: \{ estimateId, tokenHash, expiresAt, createdById \} \}\)/);
  const a = read('lib/actions/customer-approval.ts');
  for (const m of a.matchAll(/writeAuditLog\(\{[^\n]*\}\);/g)) assert.doesNotMatch(m[0], /\btoken\b|approvalUrl|\burl\b/i, 'no link in the audit metadata');
  const ws = read('lib/actions/workshop.ts');
  for (const m of ws.matchAll(/writeAuditLog\(\{[^\n]*\}\);/g)) assert.doesNotMatch(m[0], /\btoken\b|approvalUrl/i);
  assert.match(body(ws, 'notifyCustomerOfApprovedEstimate'), /issueApprovalLink\(estimate\.id, user\.id\)[\s\S]*approvalUrl,/, 'the estimate email carries the link');
});

test('the link page: strict format, noindex, opening it changes nothing; the answer is one atomic single-use claim, rate-limited', () => {
  const site = (rel: string) => readRepo(`apps/website/${rel}`);
  const page = site('app/estimate/approve/[token]/page.tsx');
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /referrer: 'no-referrer'/);
  assert.doesNotMatch(page, /recordEstimateAnswer|prisma\.|updateMany|create\(/, 'GET changes nothing');
  const core = site('lib/estimate-approval-core.ts');
  const view = body(core, 'viewApprovalLink');
  assert.match(view, /if \(!isApprovalToken\(token\)\) return \{ state: 'not-found' \};/);
  assert.doesNotMatch(view, /update|create\(|delete/i, 'the view only reads');
  const answer = body(core, 'recordEstimateAnswer');
  assert.match(answer, /estimateApprovalLink\.updateMany\(\{ where: \{ tokenHash, usedAt: null, revokedAt: null, expiresAt: \{ gt: now \} \}, data: \{ usedAt: now \} \}\)/);
  assert.match(answer, /if \(claim\.count !== 1\)/);
  assert.match(answer, /FOR UPDATE/);
  assert.match(answer, /jc\.customerId !== o\.customerId/, 'the portal answers only the customer\'s own Job Card');
  assert.match(answer, /workMayStart\(\{ approved: true, deposit: f\.deposit/);
  assert.match(answer, /action: o\.answer === 'approve' \? 'estimate\.customer_approved' : 'estimate\.customer_declined'/);
  assert.match(answer, /metadata: \{ actor: 'customer', via: o\.via, workStarted, noted: Boolean\(o\.note\) \}/, 'no note text and no link in the audit trail');
  const actions = site('lib/estimate-approval.ts');
  assert.match(actions, /^'use server';/);
  assert.match(body(actions, 'answerByLink'), /tooMany\(`link:\$\{token\}`\)/);
  assert.match(body(actions, 'answerInPortal'), /const me = await currentCustomer\(\);[\s\S]*tooMany\(`portal:\$\{me\.id\}`\)/);
  for (const k of ['used', 'revoked', 'expired', 'not-waiting']) assert.match(core, new RegExp(`'?${k}'?: '`), k);
});

test('WhatsApp: a wa.me link the colleague opens, from the stored phone in 234… form, none without a usable number', () => {
  for (const p of ['0803 123 4567', '08031234567', '803 123 4567', '+234 803 123 4567', '+2348031234567', '+234 0803 123 4567', '234-803-123-4567']) assert.equal(whatsAppNumber(p), '2348031234567', p);
  assert.equal(whatsAppNumber('+44 20 7946 0958'), '442079460958', 'a number written with its country code stays');
  for (const p of [null, '', 'call the office', '0123', '01 234 5678', '0201 234 5678', '+0803']) assert.equal(whatsAppNumber(p), null, String(p));
  const url = whatsAppShareUrl('0803 123 4567', 'Approve here: https://www.example.com/estimate/approve/x & thanks');
  assert.equal(url, `https://wa.me/2348031234567?text=${encodeURIComponent('Approve here: https://www.example.com/estimate/approve/x & thanks')}`);
  assert.equal(whatsAppShareUrl(null, 'x'), null);
  const panel = read('components/ApprovalLinkPanel.tsx');
  assert.match(panel, /href=\{state\.whatsAppUrl\}/);
  assert.match(panel, /rel="noopener noreferrer"/);
});

// ── 4. Credit terms ──────────────────────────────────────────────────

test('credit: organisations only, approved, with terms; the limit in whole kobo; due date and overdue', () => {
  const approved = new Date('2026-11-01T09:00:00Z');
  assert.equal(isOnCredit('ORGANIZATION', { paymentTermsDays: 30, creditApprovedAt: approved }), true);
  assert.equal(isOnCredit('INDIVIDUAL', { paymentTermsDays: 30, creditApprovedAt: approved }), false);
  assert.equal(isOnCredit('ORGANIZATION', { paymentTermsDays: 0, creditApprovedAt: approved }), false);
  assert.equal(isOnCredit('ORGANIZATION', { paymentTermsDays: 30, creditApprovedAt: null }), false, 'approved by Finance or a Manager');
  assert.equal(creditLimitOf({ creditLimit: '500000.00' }), 500000);
  assert.equal(creditLimitOf({ creditLimit: null }), null);
  assert.equal(withinCreditLimit(500000, 500000), true);
  assert.equal(withinCreditLimit(500000.01, 500000), false);
  assert.equal(withinCreditLimit(9_999_999, null), true, 'no limit set');
  const due = invoiceDueDate(new Date('2026-11-21T10:00:00Z'), 30);
  assert.equal(due.toISOString(), '2026-12-21T10:00:00.000Z');
  assert.equal(isOverdue({ dueDate: due, balance: 100 }, new Date('2026-12-22T00:00:00Z')), true);
  assert.equal(isOverdue({ dueDate: due, balance: 0 }, new Date('2026-12-22T00:00:00Z')), false, 'paid is never overdue');
  assert.equal(isOverdue({ dueDate: null, balance: 100 }), false);
});

test('checkout and close on credit: the invoice is issued, the limit holds, a Manager may close over it with an explicit tick', () => {
  const ws = read('lib/actions/workshop.ts');
  const leave = body(ws, 'leaveOnCredit');
  assert.match(leave, /if \(!standing\.onCredit\) throw new WorkshopActionError\(o\.refusal\);/, 'anyone else pays in full');
  assert.match(leave, /if \(o\.checkLimit && !standing\.withinLimit\) \{/);
  assert.match(leave, /const issued = await ensureInvoice\(jobCardId, userId\);/, 'issued if missing, as on completion');
  assert.match(leave, /setInvoiceDueDate\(issued\.invoice\.id, standing\.paymentTermsDays \?\? 0\)/);
  const status = body(ws, 'updateJobCardStatus');
  assert.match(status, /await leaveOnCredit\(id, balanceDue\(totalEstimate, totalPaid\), user\.id, \{\s*checkLimit: jobCard\.status !== JobCardStatus\.CLOSED,/);
  const close = body(ws, 'approveCloseRequest');
  assert.match(close, /checkLimit: !overCreditLimit,/);
  assert.match(close, /action: 'credit\.closed_over_limit'/);
  assert.match(read('lib/actions/workshop-form-handlers.ts'), /formData\.get\('overCreditLimit'\) === 'on'/);
  assert.match(read('app/(app)/workshop/job-cards/[id]/page.tsx'), /name="overCreditLimit" required/);
  const credit = read('lib/credit.ts');
  assert.match(credit, /const others = invoices\.filter\(\(i\) => i\.jobCardId !== jobCardId\)/, 'this Job Card counted once');
  // The invoice: due date from the terms, printed and emailed.
  assert.match(read('lib/invoices.ts'), /invoiceDueDate\(issuedAt, company!\.paymentTermsDays!\)/);
  assert.ok(read('lib/pdf/invoice-pdf.tsx').includes('Payment due by {props.dueOnLabel}'));
  assert.ok(read('app/print/invoices/[id]/page.tsx').includes('Payment due by'));
  assert.match(read('lib/email-templates/customer-invoice.ts'), /\['Payment due by', o\.dueOn\]/);
});

test('credit terms are set by Finance or a Manager, for organisations only, audited; the customer page shows the account', () => {
  const crm = read('lib/actions/crm.ts');
  const set = body(crm, 'setCustomerCreditTerms');
  assert.match(set, /refuseDuringAssist\('setCustomerCreditTerms'\)/);
  assert.match(set, /await fencedCustomer\(customerId\)/);
  assert.match(set, /allows\('workshop\.payment\.record'\)\) && !\(await allows\('workshop\.close\.approve'\)\)/);
  assert.match(set, /c\.customerType !== 'ORGANIZATION'/);
  assert.match(set, /creditApprovedById: on \? me\.id : null/);
  assert.match(set, /await audit\(me\.id, c, on \? 'credit_terms_set' : 'credit_terms_removed'/);
  const page = read('app/(app)/crm/customers/[id]/page.tsx');
  for (const label of ['On account', 'Credit limit', 'Owed now', 'Overdue', 'Payment terms (days)']) assert.ok(page.includes(label), label);
  assert.match(page, /href=\{`\/print\/invoices\/\$\{i\.id\}`\}/, 'links to the invoices');
});

// ── 5. Settings and the schema change ────────────────────────────────

test('the deposit switch lives in Billing & tax, saved by the same audited action', () => {
  const org = read('lib/actions/organisation.ts');
  const save = body(org, 'updateBillingSettings');
  assert.match(save, /depositPercent < 1 \|\| depositPercent > 100/);
  assert.match(save, /data: \{ vatEnabled: input\.vatEnabled, vatRate, vatNumber, discountApprovalPercent: threshold, depositRequired, depositPercent \}/);
  assert.match(save, /to: \{[^}]*depositRequired, depositPercent \}/);
  const page = read('app/(app)/organisation/page.tsx');
  assert.ok(page.includes('Require a deposit before work starts (individual customers only)'));
  assert.ok(page.includes('Deposit (%)'));
  assert.match(read('lib/actions/organisation-form-handlers.ts'), /depositRequired: formData\.get\('depositRequired'\) === 'on'/);
});

test('the schema change is additive: the deploy SQL, its manual mirror and the migration note', () => {
  for (const f of ['scripts/predeploy/0030-approval-credit.sql', 'scripts/v-dp4-approval-credit.sql']) {
    const sql = readRepo(f);
    assert.match(sql, /IF to_regclass\('public\.organisations'\) IS NULL OR to_regclass\('public\.job_cards'\) IS NULL THEN/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS "depositRequired" BOOLEAN NOT NULL DEFAULT false;/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS "depositPercent" INTEGER NOT NULL DEFAULT 70;/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS "estimate_approval_links"/);
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "estimate_approval_links_tokenHash_key"/);
    assert.match(sql, /ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP\(3\);/);
    assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\b(DROP|DELETE|TRUNCATE|UPDATE|RENAME)\b/i, 'additive only');
  }
  assert.equal(readRepo('scripts/predeploy/0030-approval-credit.sql'), readRepo('scripts/v-dp4-approval-credit.sql'));
  assert.match(readRepo('docs/DATA_MIGRATION.md'), /0030-approval-credit\.sql[\s\S]{0,40}v-dp4-approval-credit\.sql/);
});
