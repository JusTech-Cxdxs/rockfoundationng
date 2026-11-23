/**
 * documents on WhatsApp.
 *
 *  1. The secure document link: 32 random bytes in base64url, only its
 *     SHA-256 stored, 30 days, a strict format; the plain token is never
 *     stored, logged or audited.
 *  2. The public route /d/<token>: refuses a malformed, unknown, expired or
 *     revoked link with one plain page; streams the PDF privately; the
 *     portal lets /d/* (and only that) through without signing in; the
 *     fonts are traced in. Against a real PostgreSQL when TEST_DATABASE_URL
 *     is set: the exact statement the route runs.
 *  3. The drafted messages: the PDF link, the right figures, and — for the
 *     welcome and the estimate — that the new link replaces the earlier one.
 *  4. The receipt PDF: the printed receipt's figures, Noto Sans and the ₦.
 *  5. The wiring: authorised like the matching email, never during an
 *     audited without the link; buttons only with a
 *     usable phone; the schema change additive.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { Pool } from 'pg';
import { renderToBuffer } from '@react-pdf/renderer';
import {
  DOCUMENT_LINK_DAYS, DOCUMENT_LINK_MS, OPEN_DOCUMENT_LINK_SQL, createHitLimiter, documentLinkOpen, documentLinkUrl, documentPdfFileName, documentRefusalHtml,
  hashDocumentToken, isDocumentKind, isDocumentToken, newDocumentToken,
} from '../lib/document-links-core';
import {
  custodyReminderMessage, customerCanWhatsApp, customerWhatsAppUrl, estimateMessage, invoiceMessage, jobCardNoticeMessage, receiptMessage, refundMessage, supportReplyMessage, welcomeMessage,
} from '../lib/whatsapp-messages';
import { letterhead, receiptPdfProps } from '../lib/pdf/document-props';
import { ReceiptPdf } from '../lib/pdf/receipt-pdf';

const ROOT = join(__dirname, '..', '..');
const REPO = join(ROOT, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const readRepo = (rel: string) => readFileSync(join(REPO, rel), 'utf8');
const decode = (url: string) => decodeURIComponent(url.split('?text=')[1]!);
const workshop = { name: 'Demo Autocare', phone: '0800 000 0001' };
const PDF = 'https://staff.example.com/d/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcde';

function body(src: string, fn: string): string {
  const at = src.search(new RegExp(`(export )?(async )?function ${fn}\\(`));
  assert.ok(at >= 0, `${fn} not found`);
  const next = src.slice(at + 10).search(/\n(export )?(async )?function /);
  return next === -1 ? src.slice(at) : src.slice(at, at + 10 + next);
}

// ── 1. The token ─────────────────────────────────────────────────────

test('the token: 32 random bytes in base64url, its SHA-256 in hex, a strict format, 30 days', () => {
  const a = newDocumentToken();
  const b = newDocumentToken();
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(a.token, 'base64url').length, 32);
  assert.notEqual(a.token, b.token);
  assert.equal(a.tokenHash, createHash('sha256').update(a.token).digest('hex'));
  assert.equal(hashDocumentToken(a.token), a.tokenHash);
  assert.match(a.tokenHash, /^[0-9a-f]{64}$/);
  assert.equal(isDocumentToken(a.token), true);
  for (const bad of ['', 'short', `${a.token}x`, a.token.slice(1), `${a.token.slice(0, 42)}/`, `${a.token.slice(0, 42)}.`, a.tokenHash, null, undefined, 42, {}]) assert.equal(isDocumentToken(bad), false, String(bad));
  assert.equal(DOCUMENT_LINK_DAYS, 30);
  assert.equal(DOCUMENT_LINK_MS, 30 * 86_400_000);
  assert.equal(documentLinkUrl('https://staff.example.com/', a.token), `https://staff.example.com/d/${a.token}`);
  for (const k of ['ESTIMATE', 'INVOICE', 'RECEIPT']) assert.equal(isDocumentKind(k), true, k);
  for (const k of ['REFUND', 'estimate', '', null]) assert.equal(isDocumentKind(k), false, String(k));
});

test('a link opens until its 30 days are up, and never once revoked', () => {
  const now = new Date('2026-11-21T10:00:00Z');
  assert.equal(documentLinkOpen({ expiresAt: new Date(now.getTime() + 1000), revokedAt: null }, now), true);
  assert.equal(documentLinkOpen({ expiresAt: new Date(now.getTime() - 1), revokedAt: null }, now), false, 'expired');
  assert.equal(documentLinkOpen({ expiresAt: now, revokedAt: null }, now), false, 'expires at the instant');
  assert.equal(documentLinkOpen({ expiresAt: new Date(now.getTime() + 86_400_000), revokedAt: new Date(now.getTime() - 1000) }, now), false, 'revoked');
  // The statement the route runs checks the same two things, and only by the hash.
  assert.match(OPEN_DOCUMENT_LINK_SQL, /WHERE "tokenHash" = \$1 AND "revokedAt" IS NULL AND "expiresAt" > NOW\(\)/);
  assert.match(OPEN_DOCUMENT_LINK_SQL, /SET "openCount" = "openCount" \+ 1, "lastOpenedAt" = NOW\(\)/, 'counted in the same statement');
});

test('the plain token is never stored, logged or put in the audit trail', () => {
  const schema = readRepo('packages/database/prisma/schema.prisma');
  const model = schema.slice(schema.indexOf('model DocumentLink {'), schema.indexOf('\n}', schema.indexOf('model DocumentLink {')));
  assert.match(model, /tokenHash\s+String\s+@unique/);
  assert.doesNotMatch(model, /\btoken\s+String/);
  for (const f of ['openCount\\s+Int\\s+@default\\(0\\)', 'lastOpenedAt\\s+DateTime\\?', 'revokedAt\\s+DateTime\\?', 'expiresAt\\s+DateTime', 'kind\\s+DocumentLinkKind', 'recordId\\s+String', 'organisationId\\s+String', 'createdById\\s+String']) assert.match(model, new RegExp(f), f);
  const links = read('lib/document-links.ts');
  const issue = body(links, 'issueDocumentLink');
  assert.match(issue, /const \{ token, tokenHash \} = newDocumentToken\(\);/);
  assert.match(issue, /documentLink\.create\(\{ data: \{ organisationId: o\.organisationId, kind: o\.kind, recordId: o\.recordId, tokenHash, expiresAt, createdById: o\.createdById \}/);
  assert.doesNotMatch(issue, /data: \{[^}]*\btoken\b[,:}]/, 'the token itself is not written');
  assert.match(body(links, 'openDocumentLink'), /\(OPEN_DOCUMENT_LINK_SQL, hashDocumentToken\(token\)\)/, 'looked up by its hash');
  // No link, token or address in any audit entry these features write, nor in the route's log line.
  for (const f of ['lib/actions/whatsapp.ts', 'lib/actions/customer-approval.ts', 'lib/customer-access.ts']) {
    const src = read(f);
    for (const m of src.matchAll(/writeAuditLog\(\{[\s\S]*?\}\);/g)) assert.doesNotMatch(m[0], /\btoken\b|pdf\.url|\burl\b|setPasswordUrl|approvalUrl/i, `${f}: no link in the audit metadata`);
  }
  const route = read('app/d/[token]/route.ts');
  for (const m of route.matchAll(/logFailure\(([^)]*)\)/g)) assert.doesNotMatch(m[1]!, /token/, 'the token is never logged');
  assert.match(route, /perLink\(`t:\$\{hashDocumentToken\(token\)\}`\)/, 'counted by the hash, not the token');
});

// ── 2. The route ─────────────────────────────────────────────────────

test('the route refuses anything that does not open with one plain page, and streams the PDF privately', () => {
  const route = read('app/d/[token]/route.ts');
  const get = body(route, 'GET');
  assert.match(get, /if \(!isDocumentToken\(token\)\) return refusal\(\);/, 'a malformed or altered token');
  assert.match(get, /const link = await openDocumentLink\(token\);\s*if \(!link\) return refusal\(\);/, 'unknown, expired or revoked');
  assert.match(get, /const doc = await documentPdf\(link\.kind, link\.recordId, link\.organisationId\);\s*if \(!doc\) return refusal\(\);/, 'the document is no longer there');
  assert.match(get, /'Content-Type': 'application\/pdf'/);
  assert.match(get, /'Content-Disposition': `inline; filename="\$\{doc\.fileName\}"`/);
  assert.match(route, /'Cache-Control': 'private, no-store'/);
  assert.match(route, /'X-Robots-Tag': 'noindex, nofollow'/);
  assert.match(route, /'Referrer-Policy': 'no-referrer'/);
  assert.match(route, /const perLink = createHitLimiter\(20\);/);
  assert.match(route, /const perAddress = createHitLimiter\(60\);/);
  assert.doesNotMatch(route, /\b(POST|PUT|PATCH|DELETE)\b/, 'read-only: GET only');
  // One page for every reason: it says nothing about which.
  const page = documentRefusalHtml();
  assert.match(page, /This link does not open/);
  assert.match(page, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(page, /revoked|unknown|not found|INV-|RCT-|JC-/i);
  // The PDF's name is its number, nothing more.
  assert.equal(documentPdfFileName('INVOICE', 'INV-2026-000012'), 'INV-2026-000012.pdf');
  assert.equal(documentPdfFileName('RECEIPT', 'RCT-2026-000077'), 'RCT-2026-000077.pdf');
  assert.equal(documentPdfFileName('ESTIMATE', 'JC-2026-000123'), 'Estimate-JC-2026-000123.pdf', 'as the email attachment');
  assert.ok(!/[/"\\]/.test(documentPdfFileName('INVOICE', '../"x\\y')));
});

test('the limiter: at most N a minute per key, then refused until the minute passes', () => {
  const over = createHitLimiter(3);
  const t = 1_000_000;
  assert.deepEqual([over('a', t), over('a', t + 1), over('a', t + 2), over('a', t + 3)], [false, false, false, true]);
  assert.equal(over('b', t + 3), false, 'another key has its own count');
  assert.equal(over('a', t + 60_001), false, 'a minute later');
});

test('the portal lets /d/<token> through without signing in, and nothing else under /d', () => {
  const mw = read('middleware.ts');
  const m = mw.match(/const DOCUMENT_LINK = \/(.+)\/;/);
  assert.ok(m, 'the pattern');
  const re = new RegExp(m[1]!);
  assert.equal(re.test('/d/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcde'), true);
  for (const p of ['/d', '/d/', '/d/x/y', '/dashboard', '/documents/x', '/api/d/x']) assert.equal(re.test(p), false, p);
  assert.match(mw, /if \(DOCUMENT_LINK\.test\(pathname\)\) \{\s*return tagged\(NextResponse\.next\(\), requestId\);/);
  assert.match(mw, /ALWAYS_PUBLIC = \['\/api\/auth', '\/api\/cron', '\/api\/health', '\/api\/error-report', '\/api\/ml', '\/signed-out'\]/, 'nothing else became public');
  const config = read('next.config.ts');
  assert.match(config, /'\/d\/\[token\]': \['\.\.\/\.\.\/node_modules\/pdfkit\/js\/standard-fonts\/\*\*', '\.\/lib\/pdf\/fonts\/\*\*'\]/, 'the fonts are traced for the route');
  assert.match(config, /source: '\/d\/:token', headers: \[\{ key: 'Referrer-Policy', value: 'no-referrer' \}/);
});

test('the PDF is drawn from the live record by the same builders as the email', () => {
  const pdfs = read('lib/document-pdfs.ts');
  assert.match(body(pdfs, 'estimatePdfFor'), /jc\.estimate\.status !== 'MANAGER_APPROVED'\) return null;/, 'only the approved estimate');
  assert.match(body(pdfs, 'estimatePdfFor'), /EstimatePdf\(jobEstimatePdfProps\(\{/);
  assert.match(body(pdfs, 'invoicePdfFor'), /invoicePdfBuffer\(inv\)/, 'the invoice email\'s own function: frozen figures');
  assert.match(body(pdfs, 'receiptPdfFor'), /ReceiptPdf\(receiptPdfProps\(\{/);
  for (const fn of ['estimatePdfFor', 'invoicePdfFor', 'receiptPdfFor']) assert.match(body(pdfs, fn), /organisationId && [^\n]*!== organisationId\)+ return null;/, `${fn}: only inside the link's organisation`);
  assert.match(body(read('lib/actions/workshop.ts'), 'notifyCustomerOfApprovedEstimate'), /const made = await estimatePdfFor\(jobCardId\);/, 'the estimate email attaches the same PDF');
  assert.match(body(read('lib/actions/workshop.ts'), 'returnEstimateForChanges'), /documentLink\.updateMany\(\{ where: \{ kind: 'ESTIMATE', recordId: jobCardId, revokedAt: null \}, data: \{ revokedAt: new Date\(\) \} \}\)/, 'sent back for changes: its PDF links are revoked');
});

// A real database: the exact statement the route runs, on the table the deploy SQL makes.
const DB = process.env.TEST_DATABASE_URL;
const SCHEMA = `dltest_${process.pid}_${Date.now()}`;
let pool: Pool | null = null;

before(async () => {
  if (!DB) return;
  pool = new Pool({ connectionString: DB, max: 4 });
  const sql = readRepo('scripts/predeploy/0031-document-links.sql');
  const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS "document_links"'), sql.indexOf(');', sql.indexOf('CREATE TABLE IF NOT EXISTS "document_links"')) + 2);
  const c = await pool.connect();
  try {
    await c.query(`CREATE SCHEMA ${SCHEMA}`);
    await c.query(`SET search_path TO ${SCHEMA}`);
    await c.query(`CREATE TYPE "DocumentLinkKind" AS ENUM ('ESTIMATE', 'INVOICE', 'RECEIPT')`);
    await c.query(table);
  } finally {
    c.release();
  }
});

after(async () => {
  if (!pool) return;
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await pool.end();
});

test('against PostgreSQL: a good link opens and is counted; unknown, expired and revoked never match', { skip: !DB }, async () => {
  const c = await pool!.connect();
  try {
    await c.query(`SET search_path TO ${SCHEMA}`);
    const add = async (id: string, expires: string, revoked: string | null) => {
      const t = newDocumentToken();
      await c.query(`INSERT INTO document_links (id, "organisationId", kind, "recordId", "tokenHash", "expiresAt", "revokedAt", "createdById") VALUES ($1, 'org1', 'INVOICE', 'inv1', $2, NOW() + $3::interval, $4::timestamp, 'u1')`, [id, t.tokenHash, expires, revoked]);
      return t.token;
    };
    const good = await add('l1', '30 days', null);
    const expired = await add('l2', '-1 second', null);
    const revoked = await add('l3', '30 days', '2026-01-01');
    const open = (token: string) => c.query(OPEN_DOCUMENT_LINK_SQL, [hashDocumentToken(token)]);
    const first = await open(good);
    assert.deepEqual(first.rows, [{ kind: 'INVOICE', recordId: 'inv1', organisationId: 'org1' }]);
    await Promise.all([open(good), open(good)]);
    assert.equal((await c.query(`SELECT "openCount", "lastOpenedAt" IS NOT NULL AS seen FROM document_links WHERE id = 'l1'`)).rows[0].openCount, 3, 'opens at once all count');
    assert.equal((await open(expired)).rowCount, 0, 'expired');
    assert.equal((await open(revoked)).rowCount, 0, 'revoked');
    assert.equal((await open(newDocumentToken().token)).rowCount, 0, 'unknown');
    const altered = `${good.slice(0, 42)}${good.endsWith('A') ? 'B' : 'A'}`;
    assert.equal((await open(altered)).rowCount, 0, 'an altered token');
    const counts = (await c.query(`SELECT id, "openCount" FROM document_links ORDER BY id`)).rows;
    assert.deepEqual(counts.map((r) => r.openCount), [3, 0, 0], 'a refused link is never counted');
    // Nothing in the table could open a link: only hashes.
    const stored = (await c.query(`SELECT "tokenHash" FROM document_links`)).rows.map((r) => r.tokenHash as string);
    assert.ok(!stored.includes(good));
    assert.ok(stored.every((h) => /^[0-9a-f]{64}$/.test(h)));
  } finally {
    c.release();
  }
});

// ── 3. The messages ──────────────────────────────────────────────────

test('the invoice and the receipt carry their PDF link, their numbers and the right figures', () => {
  const inv = invoiceMessage({ customerName: 'Tolu Example', invoiceNumber: 'INV-2026-000012', jobNumber: 'JC-2026-000123', total: 403_125, balance: 103_125.5, dueOn: new Date('2026-12-20T10:00:00Z'), portalUrl: 'https://my.example.com/customer-portal/dashboard/services/jc/abc/invoice', pdfUrl: PDF, workshop });
  assert.match(inv, /^Hello Tolu,/);
  assert.match(inv, /invoice INV-2026-000012 for Job Card JC-2026-000123 is ₦403,125\.00/);
  assert.match(inv, /Balance to pay: ₦103,125\.50, by 20 December 2026\./);
  assert.ok(inv.includes(`Your invoice (PDF): ${PDF}`));
  assert.match(inv, /The link works for 30 days\./);
  assert.match(inv, /customer portal: https:\/\/my\.example\.com\//);
  assert.match(inv, /Demo Autocare\nCall or WhatsApp us: 0800 000 0001$/);
  // Without a PDF link (a message drafted before phase 6A): unchanged.
  assert.doesNotMatch(invoiceMessage({ customerName: 'A', invoiceNumber: 'INV-1', jobNumber: 'JC-1', total: 1, balance: 0, dueOn: null, portalUrl: null, workshop }), /PDF/);
  const rct = receiptMessage({ customerName: 'Example Fleet Limited', organisation: true, receiptNumber: 'RCT-2026-000077', amount: 50_000, jobNumber: 'JC-2026-000123', paidAt: new Date('2026-11-20T10:00:00Z'), balance: 12_500, pdfUrl: PDF, workshop });
  assert.match(rct, /^Hello Example Fleet Limited,/);
  assert.match(rct, /received ₦50,000\.00 on 20 November 2026 for Job Card JC-2026-000123\. Your receipt number is RCT-2026-000077\./);
  assert.match(rct, /Balance still to pay: ₦12,500\.00\./);
  assert.ok(rct.includes(`Your receipt (PDF): ${PDF}`));
  // The whole message, link and ₦ included, survives the wa.me address.
  assert.equal(decode(customerWhatsAppUrl({ phone: '0803 123 4567' }, rct)!), rct);
});

test('the estimate carries both links — the PDF and the approval — with the total, the deposit and the replacement', () => {
  const approval = 'https://my.example.com/estimate/approve/ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210_-abcde';
  const m = estimateMessage({ customerName: 'Tolu Example', vehicle: { make: 'Toyota', model: 'Camry', plateNumber: 'EKY 482 KJ' }, jobNumber: 'JC-2026-000123', total: 116_000, deposit: 81_200, approvalUrl: approval, approvalExpiresOn: new Date('2026-11-28T10:00:00Z'), pdfUrl: PDF, portalUrl: 'https://my.example.com/customer-portal/dashboard/services/jc/abc', workshop });
  assert.match(m, /estimate for your Toyota Camry \(EKY 482 KJ\) is ready: Job Card JC-2026-000123, total ₦116,000\.00, deposit to start the work ₦81,200\.00\./);
  assert.ok(m.includes(`Your estimate (PDF): ${PDF}`));
  assert.ok(m.includes(`Approve or decline it here: ${approval}`));
  assert.match(m, /works once, until 28 November 2026\. It replaces any approval link we sent you before\./);
  assert.ok(m.indexOf(PDF) < m.indexOf(approval), 'the PDF first, then the answer');
  const none = estimateMessage({ customerName: 'Example Fleet Limited', organisation: true, vehicle: {}, jobNumber: 'JC-1', total: 10, deposit: 0, approvalUrl: approval, approvalExpiresOn: null, pdfUrl: PDF, portalUrl: null, workshop });
  assert.doesNotMatch(none, /deposit/, 'no deposit wording when none applies');
});

test('the welcome names the portal, the set-password link, the workshop — and that it replaces any earlier link', () => {
  const link = 'https://my.example.com/customer-portal/reset-password?token=abc';
  const w = welcomeMessage({ kind: 'welcome', customerName: 'Tolu Example', email: 'tolu@example.com', signInUrl: 'https://my.example.com/customer-portal', setPasswordUrl: link, hours: 72, workshop });
  assert.match(w, /Welcome to Demo Autocare\./);
  assert.ok(w.includes(`Set your password here (the link works once, for 72 hours): ${link}`));
  assert.match(w, /This link replaces any earlier one we sent you, by email or WhatsApp; only the newest link works\./);
  assert.match(w, /sign in at https:\/\/my\.example\.com\/customer-portal with your email address tolu@example\.com/);
  assert.match(w, /Call or WhatsApp us: 0800 000 0001/);
  const again = welcomeMessage({ kind: 'access', customerName: 'A B', email: 'a@example.com', signInUrl: 'x', setPasswordUrl: link, hours: 72, workshop });
  assert.match(again, /a new link to set your password/);
  assert.match(again, /replaces any earlier one/);
});

test('the refund, the last Job Card notices and the custody reminders say what their emails say', () => {
  const r = refundMessage({ customerName: 'Tolu Example', referenceNumber: 'RF-2026-000004', recordLabel: 'Job Card', recordNumber: 'JC-2026-000123', amount: 20_000, method: 'BANK_TRANSFER', refundedAt: new Date('2026-11-20T10:00:00Z'), remaining: 5_000, workshop });
  assert.match(r, /refunded ₦20,000\.00 on 20 November 2026 \(bank transfer\) for Job Card JC-2026-000123\. Your refund receipt number is RF-2026-000004\./);
  assert.match(r, /Still to be refunded: ₦5,000\.00/);
  assert.match(supportReplyMessage({ customerName: 'Tolu Example', ticketNumber: 'SUP-000012', subject: 'Brake noise', reply: '  Your car is ready.  ', workshop }), /^Hello Tolu,\nAbout your request SUP-000012 \(Brake noise\):\nYour car is ready\.\n/);
  assert.doesNotMatch(r, /PDF|\/d\//, 'there is no refund PDF, so no document link');
  const v = { make: 'Toyota', model: 'Camry', plateNumber: 'EKY 482 KJ' };
  assert.match(jobCardNoticeMessage({ notice: 'CHECKED_OUT', customerName: 'A B', vehicle: v, jobNumber: 'JC-1', collectedByName: 'C D', portalUrl: null, workshop }), /has been collected \(Job Card JC-1\), by C D\./);
  assert.match(jobCardNoticeMessage({ notice: 'CANCELLED', customerName: 'A B', vehicle: v, jobNumber: 'JC-1', portalUrl: null, workshop }), /Job Card JC-1 for your Toyota Camry \(EKY 482 KJ\) has been cancelled/);
  assert.match(jobCardNoticeMessage({ notice: 'CLOSED', customerName: 'A B', vehicle: v, jobNumber: 'JC-1', portalUrl: 'https://x', workshop }), /is now closed[\s\S]*customer portal: https:\/\/x/);
  assert.match(jobCardNoticeMessage({ notice: 'CHECKED_IN', customerName: 'A B', vehicle: v, jobNumber: 'JC-1', portalUrl: null, workshop }), /checked it in under Job Card JC-1/);
  assert.match(jobCardNoticeMessage({ notice: 'IN_PROGRESS', customerName: 'A B', vehicle: v, jobNumber: 'JC-1', portalUrl: null, workshop }), /started work on your Toyota Camry/);
  assert.match(jobCardNoticeMessage({ notice: 'QUALITY_CHECK', customerName: 'A B', vehicle: v, jobNumber: 'JC-1', portalUrl: null, workshop }), /final checks, including a road test/);
  assert.match(jobCardNoticeMessage({ notice: 'COMPLETED', customerName: 'A B', vehicle: v, jobNumber: 'JC-1', portalUrl: null, workshop }), /passed our final quality inspection/);
  assert.match(custodyReminderMessage({ kind: 'READY', customerName: 'A B', vehicle: v, jobNumber: 'JC-1', collectBy: new Date('2026-11-25T10:00:00Z'), workshop }), /A reminder that your Toyota Camry \(EKY 482 KJ\) is ready for collection \(Job Card JC-1\)\. Please collect it by 25 November 2026/);
  assert.match(custodyReminderMessage({ kind: 'CANCELLED', customerName: 'A B', vehicle: v, jobNumber: 'JC-1', collectBy: null, workshop }), /was cancelled, and the vehicle is still with us/);
});

test('no usable phone, no button', () => {
  assert.equal(customerCanWhatsApp({ phone: '0803 123 4567' }), true);
  assert.equal(customerCanWhatsApp({ phone: '01 234 5678', altPhone: '+234 805 000 0000' }), true, 'the other phone');
  assert.equal(customerCanWhatsApp({ phone: '01 234 5678', altPhone: null }), false, 'a landline');
  assert.equal(customerCanWhatsApp({}), false);
});

// ── 4. The receipt PDF ───────────────────────────────────────────────

const head = letterhead({ name: 'Demo Autocare Limited', legalName: 'Demo Autocare Limited', hqAddress: '1 Example Road, Lagos', poBox: null, rcNumber: 'RC 000001', hotlines: ['0800 000 0001'], website: null, email: 'hello@example.com' }, { name: 'Lekki', address: '2 Example Close', hotlines: [], email: null }, 'https://portal.example.com');

test('the receipt PDF: the printed receipt\'s figures, the letterhead, Noto Sans and the ₦', async () => {
  const p = receiptPdfProps({ letterhead: head, receiptNumber: 'RCT-2026-000077', receivedOnLabel: '20 November 2026, 10:00', customerName: 'Ada Example', jobNumber: 'JC-2026-000123', vehicle: { make: 'Toyota', model: 'Camry', plateNumber: 'EKY 482 KJ' }, amount: '50000', method: 'CASH', reference: '  ', receivedByName: 'A Cashier', total: 116_000, paidToDate: 81_200 });
  assert.deepEqual([p.amountReceived, p.totalAmount, p.paidToDate, p.balanceAfter, p.statusLabel], ['₦50,000.00', '₦116,000.00', '₦81,200.00', '₦34,800.00', 'Part payment']);
  assert.equal(p.methodLabel, 'Cash');
  assert.equal(p.reference, null, 'a blank note is left out');
  assert.equal(p.vehicleDescription, 'Toyota Camry');
  assert.equal(p.closing, 'Thank you for choosing Demo Autocare Limited.');
  const paid = receiptPdfProps({ letterhead: head, receiptNumber: 'RCT-1', receivedOnLabel: 'x', customerName: 'A', jobNumber: 'JC-1', vehicle: { make: null, model: null, plateNumber: null }, amount: 10, method: 'BANK_TRANSFER', reference: 'TRF 123', receivedByName: 'B', total: 100, paidToDate: 120 });
  assert.deepEqual([paid.balanceAfter, paid.statusLabel, paid.methodLabel, paid.reference], ['₦0.00', 'Paid in full', 'Bank Transfer', 'TRF 123'], 'never a negative balance');
  const pdf = await renderToBuffer(ReceiptPdf({ ...p, logoUrl: join(ROOT, 'public', 'images', 'logo', 'logo.png') }));
  const raw = pdf.toString('latin1');
  assert.match(raw, /^%PDF-/);
  const text = [...raw.matchAll(/stream\r?\n/g)].map((m) => {
    const start = m.index! + m[0].length;
    try { return inflateSync(pdf.subarray(start, raw.indexOf('endstream', start))).toString('latin1'); } catch { return ''; }
  }).join('\n') + raw;
  assert.match(text, /\/BaseFont \/[A-Z]{6}\+NotoSans-Regular/);
  assert.match(text, /\/BaseFont \/[A-Z]{6}\+NotoSans-Bold/);
  assert.doesNotMatch(text, /\/BaseFont \/Helvetica/);
  assert.match(text, /<20a6>/i, 'the ₦ is in the text');
  const src = read('lib/pdf/receipt-pdf.tsx');
  assert.match(src, /registerPdfFonts\(\);/);
  assert.doesNotMatch(src, /Helvetica/);
});

// ── 5. The wiring ────────────────────────────────────────────────────

test('makeWhatsAppMessage: authorised like the matching email, audited with the kind and number only', () => {
  const a = read('lib/actions/whatsapp.ts');
  assert.match(a, /^'use server';/);
  const make = body(a, 'makeWhatsAppMessage');
  assert.match(make, /if \(!isDocumentKind\(input\?\.kind\) \|\| !id\)/);
  const inv = body(a, 'invoiceWhatsApp');
  assert.match(inv, /await seeJobCard\(inv\.jobCardId, 'makeWhatsAppMessage'\);\s*const user = await requireBiller\(inv\.branchId/, 'as "Email invoice"');
  assert.match(body(a, 'requireBiller'), /allows\('workshop\.payment\.record', \{ branchId, homeBranch: true \}\)[\s\S]*authorize\('workshop\.close\.approve', \{ branchId, homeBranch: true \}/);
  const rct = body(a, 'receiptWhatsApp');
  assert.match(rct, /requireEligibleFinanceOfficer\(jc\.branchId, 'workshop\.payment\.record'\)/, 'the Finance Officer who records payments (and their email)');
  for (const [fn, kind] of [[inv, 'INVOICE'], [rct, 'RECEIPT']] as const) {
    assert.match(fn, new RegExp(`issueDocumentLink\\(\\{ organisationId[^}]*kind: '${kind}'`), kind);
    assert.match(fn, new RegExp(`action: 'whatsapp\\.prepared'[^\\n]*kind: '${kind}'`), kind);
    assert.ok(fn.indexOf('whatsAppShareUrlFor(') < fn.indexOf('issueDocumentLink('), `${kind}: no link is made without a usable phone`);
  }
  const est = body(read('lib/actions/customer-approval.ts'), 'prepareEstimateWhatsApp');
  assert.match(est, /requireAnswerTaker\(jc, 'prepareEstimateWhatsApp'\)/, 'as "Send approval link"');
  assert.match(est, /assertAwaitingAnswer\(jc\);/);
  assert.ok(est.indexOf('whatsAppShareUrlFor(') < est.indexOf('issueApprovalLink('), 'the emailed approval link is not replaced without a usable phone');
  assert.match(est, /action: 'whatsapp\.prepared'[^\n]*kind: 'ESTIMATE'/);
  assert.match(body(read('lib/actions/customer-approval.ts'), 'estimateWhatsApp'), /kind: 'ESTIMATE', recordId: jc\.id/);
  assert.match(body(read('lib/actions/customer-approval.ts'), 'sendEstimateApprovalLink'), /await estimateWhatsApp\(jc, user\.id, \{ url, expiresAt/, '"Share on WhatsApp" after the email carries the PDF too');
});

test('the welcome on WhatsApp: the same set-password mechanism as the email, the same permission, audited without the link', () => {
  const access = body(read('lib/customer-access.ts'), 'prepareCustomerAccessWhatsApp');
  assert.match(access, /const setPasswordUrl = await issueCustomerSetPasswordLink\(customer\.id\);/, 'the email\'s own mechanism: only the newest link works');
  assert.ok(access.indexOf('whatsAppShareUrlFor(') < access.indexOf('issueCustomerSetPasswordLink('), 'the emailed link keeps working when WhatsApp cannot be used');
  assert.match(access, /if \(!hasEmail\(customer\.email\)\) return/);
  assert.match(access, /action: 'whatsapp\.prepared'/);
  const crm = body(read('lib/actions/crm.ts'), 'sendCustomerAccessOnWhatsApp');
  assert.match(crm, /if \(!\(await allows\('workshop\.customer\.manage'\)\)\) await authorize\('crm\.manage'/, 'the welcome: whoever may register customers');
  assert.match(crm, /\} else \{\s*await authorize\('crm\.manage'/, 'the link again: crm.manage, as the email');
  assert.match(crm, /const c = await fencedCustomer\(customerId\);/);
  const made = body(read('lib/actions/whatsapp.ts'), 'makeWelcomeWhatsAppMessage');
  assert.match(made, /This replaces the link we emailed/);
});

test('the buttons: next to each email, a real link to tap (no pop-up), only with a usable phone', () => {
  const btn = read('components/WhatsAppSendButton.tsx');
  assert.match(btn, /^'use client';/);
  assert.match(btn, /<a href=\{state\.url\} target="_blank" rel="noopener noreferrer"/);
  assert.match(btn, /Open WhatsApp/);
  assert.doesNotMatch(btn, /window\.open|location\.href\s*=/, 'the colleague taps the link: nothing for a pop-up blocker to stop');
  const jc = read('app/(app)/workshop/job-cards/[id]/page.tsx');
  assert.match(jc, /const canWhatsApp = customerCanWhatsApp\(jobCard\.customer\);/);
  assert.match(jc, /\{mayInvoice && canWhatsApp \? <WhatsAppSendButton prepare=\{\{ document: \{ kind: 'INVOICE'/);
  assert.match(jc, /\{isEligibleFinance && canWhatsApp \? <WhatsAppSendButton prepare=\{\{ document: \{ kind: 'RECEIPT'/);
  assert.ok(jc.indexOf('<ApprovalLinkPanel jobCardId={jobCard.id} />') < jc.indexOf("kind: 'ESTIMATE', id: jobCard.id"), 'the estimate one next to "Send approval link"');
  assert.match(jc, /whatsAppFor=\{isEligibleFinance \? refundWhatsApp : undefined\}/);
  assert.match(jc, /jobCardNoticeMessage\(\{ notice: noticeKind/);
  const crmPage = read('app/(app)/crm/customers/[id]/page.tsx');
  assert.ok(crmPage.indexOf('label="Send set-password link"') < crmPage.indexOf("access: { customerId: c.id, kind: 'access' }"), 'beside "Send set-password link"');
  assert.match(crmPage, /This replaces the link we emailed/);
  assert.match(crmPage, /kind: 'welcome'/);
  const desk = read('app/(app)/workshop/customers/page.tsx');
  assert.match(desk, /access: \{ customerId: created\.id, kind: 'welcome' \}/);
  assert.match(read('lib/actions/workshop-form-handlers.ts'), /status=customer_created_emailed&customer=\$\{encodeURIComponent\(customer\.id\)\}/);
  const custody = read('app/(app)/workshop/custody/page.tsx');
  for (const id of ['custody-estimate-whatsapp', 'custody-cancelled-whatsapp', 'custody-ready-whatsapp']) assert.ok(custody.includes(id), id);
  assert.match(read('app/(app)/crm/support/[id]/page.tsx'), /supportReplyMessage\(\{[^\n]*reply: lastAgentReply\.body/, 'the last emailed reply, on WhatsApp');
});

test('the schema keeps only a hash of each link, one per token, and the data inventory marks it secret', () => {
  const schema = readRepo('packages/database/prisma/schema.prisma');
  assert.match(schema, /enum DocumentLinkKind \{\s*ESTIMATE\s*INVOICE\s*RECEIPT\s*\}/);
  assert.match(schema, /model DocumentLink \{[\s\S]*?tokenHash\s+String\s+@unique[\s\S]*?@@map\("document_links"\)/);
  assert.match(schema, /model DocumentLink \{[\s\S]*?openCount\s+Int\s+@default\(0\)/);
  assert.match(read('lib/governance/data-inventory.ts'), /DocumentLink: \{ tenancy: 'ORGANISATION', owner: 'organisationId', classification: \['SECRET'\][^\n]*ai: 'NEVER' \}/);
  assert.match(readRepo('docs/SETUP.md'), /WhatsApp/);
});
