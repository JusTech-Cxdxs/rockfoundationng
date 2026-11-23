/**
 * Automatic WhatsApp (Meta's WhatsApp Business Platform, the Cloud API).
 *
 *  1. The client (@ejo/utils/whatsapp-cloud): a TEMPLATE message with its
 *     body parameters, a DOCUMENT header (link and file name) and a URL
 *     button; Meta's errors as plain outcomes; nothing at all when it is not
 *     configured; the token only ever in the Authorization header.
 *  2. Who may get one: only after agreeing, at a number WhatsApp can take
 *     (234… form).
 *  3. The catalogue (@ejo/utils/whatsapp-templates): every template's
 *     placeholders match its parameters and Meta's rules; every email of
 *     both apps has a template or a reason to stay email-only; the doc for
 *     the owner (docs/WHATSAPP_TEMPLATES.md) is the catalogue.
 *  4. The wiring: each email sender also sends its WhatsApp template; the
 *     PDFs go as document links; consent is recorded, changeable and
 *     respected; Settings → WhatsApp; the outbox and its clean-up; the
 *     schema change additive.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_GRAPH_VERSION, cleanParameter, lastFour, listWhatsAppTemplates, mapGraphError, sendWhatsAppTemplate, templatePayload, whatsAppCloudConfig, whatsAppFailureText,
} from '@ejo/utils/whatsapp-cloud';
import { EMAIL_COVERAGE, WHATSAPP_TEMPLATES, bodyParameters, placeholdersOf, renderBody, renderTemplatesDoc, templateFor, type WhatsAppTemplateDef } from '@ejo/utils/whatsapp-templates';
import { greetingName, whatsAppNumber, whatsAppRecipient } from '@ejo/utils/whatsapp';
import { DOCUMENT_KINDS, documentPdfFileName } from '../lib/document-links-core';
import { balanceSentence, depositSentence, detailsLine, jobRecord, visitText, waDate, waLongDate } from '../lib/whatsapp/words';

const ROOT = join(__dirname, '..', '..');
const REPO = join(ROOT, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const readRepo = (rel: string) => readFileSync(join(REPO, rel), 'utf8');
const ALL = WHATSAPP_TEMPLATES as readonly WhatsAppTemplateDef[];
const ENV = { WHATSAPP_ACCESS_TOKEN: 'test-token-not-real', WHATSAPP_PHONE_NUMBER_ID: '100000000000001', WHATSAPP_BUSINESS_ACCOUNT_ID: '200000000000002' };
// Reserved, obviously made-up numbers (0800 000 …).
const TO = '2348000000101';

function body(src: string, fn: string): string {
  const at = src.search(new RegExp(`(export )?(async )?function ${fn}[<(]`));
  assert.ok(at >= 0, `${fn} not found`);
  const next = src.slice(at + 10).search(/\n(export )?(async )?function /);
  return next === -1 ? src.slice(at) : src.slice(at, at + 10 + next);
}

type Call = { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } };
function fakeFetch(replies: { status: number; json: unknown }[] | ((url: string) => { status: number; json: unknown })) {
  const calls: Call[] = [];
  const fn = async (url: string, init?: Call['init']) => {
    calls.push({ url, init });
    const r = typeof replies === 'function' ? replies(url) : replies[Math.min(calls.length - 1, replies.length - 1)]!;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
  };
  return { fn, calls };
}

// ── 1. The client ────────────────────────────────────────────────────

test('configured only with a token and a phone number ID; the defaults are the current Graph API version and English', () => {
  assert.equal(whatsAppCloudConfig({}), null);
  assert.equal(whatsAppCloudConfig({ WHATSAPP_ACCESS_TOKEN: 'x' }), null, 'a token alone is not enough');
  assert.equal(whatsAppCloudConfig({ WHATSAPP_PHONE_NUMBER_ID: '100000000000001' }), null);
  assert.equal(whatsAppCloudConfig({ WHATSAPP_ACCESS_TOKEN: 'x', WHATSAPP_PHONE_NUMBER_ID: 'not-an-id' }), null);
  const cfg = whatsAppCloudConfig(ENV)!;
  assert.equal(cfg.graphVersion, DEFAULT_GRAPH_VERSION);
  assert.equal(DEFAULT_GRAPH_VERSION, 'v27.0');
  assert.equal(cfg.language, 'en');
  assert.equal(cfg.businessAccountId, '200000000000002');
  const custom = whatsAppCloudConfig({ ...ENV, WHATSAPP_GRAPH_VERSION: 'v26.0', WHATSAPP_TEMPLATE_LANGUAGE: 'en_GB', WHATSAPP_BUSINESS_ACCOUNT_ID: '' })!;
  assert.equal(custom.graphVersion, 'v26.0');
  assert.equal(custom.language, 'en_GB');
  assert.equal(custom.businessAccountId, null);
  assert.equal(whatsAppCloudConfig({ ...ENV, WHATSAPP_GRAPH_VERSION: '27' })!.graphVersion, DEFAULT_GRAPH_VERSION, 'a malformed version falls back');
});

test('the payload: a template with its language, the body parameters in order, a DOCUMENT header (link and file name), a URL button', () => {
  const p = templatePayload({ to: TO, template: 'rf_invoice', language: 'en', body: ['Tunde', 'INV-2026-000012'], document: { link: 'https://staff.example.com/d/AbC', filename: 'INV-2026-000012.pdf' }, buttonUrlSuffix: 'approve/AbC' });
  assert.deepEqual(p, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: TO,
    type: 'template',
    template: {
      name: 'rf_invoice',
      language: { code: 'en' },
      components: [
        { type: 'header', parameters: [{ type: 'document', document: { link: 'https://staff.example.com/d/AbC', filename: 'INV-2026-000012.pdf' } }] },
        { type: 'body', parameters: [{ type: 'text', text: 'Tunde' }, { type: 'text', text: 'INV-2026-000012' }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'approve/AbC' }] },
      ],
    },
  });
  const plain = templatePayload({ to: TO, template: 'rf_staff_update', language: 'en', body: ['a'] }) as { template: { components: { type: string }[] } };
  assert.deepEqual(plain.template.components.map((c) => c.type), ['body'], 'no header or button unless given');
});

test('parameters as Meta takes them: no new lines or tabs, never four spaces together, never empty, capped', () => {
  assert.equal(cleanParameter('Line one\nLine two\t\tend'), 'Line one Line two end');
  assert.equal(cleanParameter('a     b'), 'a b');
  assert.equal(cleanParameter('   '), '-');
  assert.equal(cleanParameter(null), '-');
  assert.equal(cleanParameter('x'.repeat(50), 10).length, 10);
  assert.ok(cleanParameter('x'.repeat(50), 10).endsWith('…'));
});

test('sending: one POST to /<version>/<phone number ID>/messages, the token only in the Authorization header; the message id comes back', async () => {
  const cfg = whatsAppCloudConfig(ENV)!;
  const f = fakeFetch([{ status: 200, json: { messaging_product: 'whatsapp', contacts: [{ wa_id: TO }], messages: [{ id: 'wamid.TEST1' }] } }]);
  const r = await sendWhatsAppTemplate(cfg, { to: TO, template: 'rf_payment_receipt', language: 'en', body: ['Tunde'], document: { link: 'https://staff.example.com/d/x', filename: 'RCT-2026-000077.pdf' } }, f.fn);
  assert.deepEqual(r, { ok: true, messageId: 'wamid.TEST1' });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]!.url, 'https://graph.facebook.com/v27.0/100000000000001/messages');
  assert.equal(f.calls[0]!.init?.method, 'POST');
  assert.equal(f.calls[0]!.init?.headers?.Authorization, 'Bearer test-token-not-real');
  assert.ok(!f.calls[0]!.init!.body!.includes('test-token-not-real'), 'never in the body');
  const sent = JSON.parse(f.calls[0]!.init!.body!);
  assert.equal(sent.template.components[0].parameters[0].document.filename, 'RCT-2026-000077.pdf');
});

test('not configured: nothing is sent and no request is made', async () => {
  const f = fakeFetch([{ status: 200, json: {} }]);
  const r = await sendWhatsAppTemplate(null, { to: TO, template: 'rf_invoice', language: 'en', body: [] }, f.fn);
  assert.deepEqual(r, { ok: false, reason: 'NOT_CONFIGURED', message: whatsAppFailureText('NOT_CONFIGURED') });
  assert.equal(f.calls.length, 0);
  const listed = await listWhatsAppTemplates(null, f.fn);
  assert.equal(listed.ok, false);
  assert.equal(f.calls.length, 0);
  // A bad number or template name is refused before any request.
  const cfg = whatsAppCloudConfig(ENV)!;
  assert.equal((await sendWhatsAppTemplate(cfg, { to: '08000000101', template: 'rf_invoice', language: 'en', body: [] }, f.fn) as { reason: string }).reason, 'BAD_NUMBER');
  assert.equal((await sendWhatsAppTemplate(cfg, { to: TO, template: 'Bad Name', language: 'en', body: [] }, f.fn) as { reason: string }).reason, 'TEMPLATE');
  assert.equal(f.calls.length, 0);
});

test("Meta's errors as plain outcomes: access, limits, the number, the template, anything else", async () => {
  const cases: [number, { code?: number; message?: string; error_data?: { details?: string } } | null, string][] = [
    [401, { code: 190, message: 'Error validating access token' }, 'AUTH'],
    [403, { code: 10, message: 'Permission denied' }, 'AUTH'],
    [403, { code: 200, message: 'Requires permission' }, 'AUTH'],
    [401, null, 'AUTH'],
    [429, { code: 130429, message: 'Rate limit hit' }, 'RATE_LIMITED'],
    [400, { code: 131056, message: 'Pair rate limit hit' }, 'RATE_LIMITED'],
    [400, { code: 4, message: 'Too many calls' }, 'RATE_LIMITED'],
    [429, null, 'RATE_LIMITED'],
    [400, { code: 131026, message: 'Message undeliverable' }, 'BAD_NUMBER'],
    [400, { code: 131030, message: 'Recipient phone number not in allowed list' }, 'BAD_NUMBER'],
    [400, { code: 131009, message: 'Parameter value is not valid', error_data: { details: 'Invalid phone number' } }, 'BAD_NUMBER'],
    [404, { code: 132001, message: 'Template name does not exist in the translation' }, 'TEMPLATE'],
    [400, { code: 132000, message: 'Number of parameters does not match' }, 'TEMPLATE'],
    [400, { code: 132015, message: 'Template is paused' }, 'TEMPLATE'],
    [400, { code: 131052, message: 'Media download error' }, 'OTHER'],
    [500, { code: 1, message: 'Unknown' }, 'OTHER'],
  ];
  for (const [status, err, reason] of cases) {
    const mapped = mapGraphError(status, err);
    assert.equal(mapped.reason, reason, `${status} ${err?.code}`);
    if (err?.code) assert.match(mapped.message, new RegExp(`Meta error ${err.code}`));
  }
  const cfg = whatsAppCloudConfig(ENV)!;
  const f = fakeFetch([{ status: 404, json: { error: { code: 132001, message: 'Template name does not exist in the translation', type: 'OAuthException' } } }]);
  const r = await sendWhatsAppTemplate(cfg, { to: TO, template: 'rf_invoice', language: 'en', body: [] }, f.fn);
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, 'TEMPLATE');
  // A network failure or a timeout never throws.
  const down = await sendWhatsAppTemplate(cfg, { to: TO, template: 'rf_invoice', language: 'en', body: [] }, async () => { throw new Error('getaddrinfo ENOTFOUND'); });
  assert.deepEqual(down, { ok: false, reason: 'OTHER', message: 'WhatsApp could not be reached.' });
  const slow = await sendWhatsAppTemplate(cfg, { to: TO, template: 'rf_invoice', language: 'en', body: [] }, async () => { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e; });
  assert.equal((slow as { message: string }).message, 'WhatsApp did not answer in time.');
});

test('the templates on the account, with their status, page by page', async () => {
  const cfg = whatsAppCloudConfig(ENV)!;
  const f = fakeFetch((url) => url.includes('after=')
    ? { status: 200, json: { data: [{ name: 'rf_invoice', language: 'en', status: 'PENDING', category: 'UTILITY' }] } }
    : { status: 200, json: { data: [{ name: 'rf_welcome', language: 'en', status: 'APPROVED', category: 'UTILITY' }], paging: { next: 'https://graph.facebook.com/v27.0/200000000000002/message_templates?after=abc' } } });
  const r = await listWhatsAppTemplates(cfg, f.fn);
  assert.equal(r.ok, true);
  assert.deepEqual((r as { templates: { name: string; status: string }[] }).templates.map((t) => `${t.name}:${t.status}`), ['rf_welcome:APPROVED', 'rf_invoice:PENDING']);
  assert.match(f.calls[0]!.url, /^https:\/\/graph\.facebook\.com\/v27\.0\/200000000000002\/message_templates\?fields=name,language,status,category/);
  assert.equal(f.calls[0]!.init?.headers?.Authorization, 'Bearer test-token-not-real');
  // A "next" page elsewhere than Graph is never followed (the token stays with Meta).
  const g = fakeFetch(() => ({ status: 200, json: { data: [], paging: { next: 'https://evil.example.com/steal' } } }));
  await listWhatsAppTemplates(cfg, g.fn);
  assert.equal(g.calls.length, 1);
  const noWaba = await listWhatsAppTemplates(whatsAppCloudConfig({ ...ENV, WHATSAPP_BUSINESS_ACCOUNT_ID: '' }), f.fn);
  assert.equal(noWaba.ok, false);
});

test('only the last four digits of a number are ever recorded or logged; the token never', () => {
  assert.equal(lastFour('+234 800 000 0101'), '0101');
  assert.equal(lastFour(null), null);
  assert.equal(lastFour('12'), null);
  const send = read('lib/whatsapp/send.ts');
  assert.match(send, /toLast4: lastFour\(o\.number\)/);
  assert.doesNotMatch(send, /accessToken/, 'the sender never touches the token');
  for (const m of send.matchAll(/logFailure\(([^\n]*)\);/g)) assert.doesNotMatch(m[1]!, /o\.number\)?,|\.phone/, `no whole number in a log: ${m[1]}`);
  assert.match(send, /logFailure\('WhatsApp message not sent', o\.key, `…\$\{lastFour\(o\.number\) \?\? ''\}`, outcome\.reason\);/);
  const client = readRepo('packages/utils/src/whatsapp-cloud.ts');
  assert.doesNotMatch(client, /console\./, 'the client logs nothing');
  assert.equal((client.match(/config\.accessToken/g) ?? []).length, 2, 'only in the two Authorization headers');
  const site = readRepo('apps/website/lib/whatsapp.ts');
  assert.match(site, /toLast4: lastFour\(o\.number\)/);
  assert.doesNotMatch(site, /console\.|accessToken/);
});

// ── 2. Who may get one ───────────────────────────────────────────────

test('numbers in 234… form: Nigerian mobiles however written; landlines and text refused', () => {
  for (const n of ['0800 000 0101', '800 000 0101', '+234 800 000 0101', '+234 0800 000 0101', '234-800-000-0101']) assert.equal(whatsAppNumber(n), '2348000000101', n);
  for (const n of ['01 234 5678', 'not a phone', '', null, '0800 000', '+0 800']) assert.equal(whatsAppNumber(n), null, String(n));
  assert.equal(whatsAppNumber('+44 20 7946 0000'), '442079460000', 'a number with + and a country code stays as it is');
});

test('consent first: no agreement, no message — whatever the number; then the first number WhatsApp can take', () => {
  assert.deepEqual(whatsAppRecipient({ optIn: false, phones: ['0800 000 0101'] }), { ok: false, reason: 'NO_CONSENT' });
  assert.deepEqual(whatsAppRecipient({ optIn: null, phones: ['0800 000 0101'] }), { ok: false, reason: 'NO_CONSENT' });
  assert.deepEqual(whatsAppRecipient({ optIn: undefined, phones: ['0800 000 0101'] }), { ok: false, reason: 'NO_CONSENT' });
  assert.deepEqual(whatsAppRecipient({ optIn: true, phones: ['01 234 5678', null] }), { ok: false, reason: 'NO_NUMBER' });
  assert.deepEqual(whatsAppRecipient({ optIn: true, phones: ['01 234 5678', '0800 000 0102'] }), { ok: true, number: '2348000000102' });
  assert.equal(greetingName('Tunde Bakare', false), 'Tunde');
  assert.equal(greetingName('Example Fleet Services Ltd', true), 'Example Fleet Services Ltd');
  assert.equal(greetingName('  ', false), 'there');
});

test('the sender checks configuration, then agreement and number, before anything else; staff need their own switch', () => {
  const send = read('lib/whatsapp/send.ts');
  const customer = body(send, 'whatsAppToCustomer');
  assert.ok(customer.indexOf('whatsAppCloudConfig()') < customer.indexOf('prisma.customer.findUnique'), 'not configured: not even a database read');
  assert.match(customer, /if \(!cfg \|\| !m\.customerId\) return OFF;/);
  assert.match(customer, /whatsAppRecipient\(\{ optIn: c\.whatsappOptIn, phones: \[c\.whatsappPhone, c\.phone, c\.altPhone\] \}\)/, 'the WhatsApp number first');
  assert.ok(customer.indexOf('whatsAppRecipient(') < customer.indexOf('deliver('), 'consent before any send');
  assert.match(customer, /status: 'SKIPPED'/, 'a customer who has not agreed is recorded as skipped');
  assert.match(customer, /catch \(err\) \{[\s\S]*return \{ status: 'FAILED'/, 'never throws');
  const staff = body(send, 'whatsAppToStaff');
  assert.match(staff, /whatsappOptIn: true/);
  assert.match(staff, /isActive: true, accountType: 'EMPLOYEE'/);
  assert.match(staff, /p\.id !== m\.exceptUserId/);
  assert.match(staff, /catch \(err\) \{[\s\S]*return 0;/);
  // A PDF goes as a fresh document link with the document's own file name.
  const deliver = body(send, 'deliver');
  assert.match(deliver, /issueDocumentLink\(\{ organisationId: o\.organisationId, kind: o\.document\.kind, recordId: o\.document\.recordId, createdById: by \}\)/);
  assert.match(deliver, /filename: documentPdfFileName\(o\.document\.kind, o\.document\.number\)/);
  assert.ok(deliver.indexOf("t.header === 'DOCUMENT'") < deliver.indexOf('sendWhatsAppTemplate('));
  const site = readRepo('apps/website/lib/whatsapp.ts');
  assert.match(site, /whatsAppRecipient\(\{ optIn: c\.whatsappOptIn, phones: \[c\.whatsappPhone, c\.phone, c\.altPhone\] \}\)/);
  assert.match(site, /whatsappOptIn: true/);
});

// ── 3. The catalogue ─────────────────────────────────────────────────

test('every template: an rf_ name, its placeholders {{1}}…{{n}} matching its parameters, within Meta’s rules', () => {
  const names = new Set<string>();
  const keys = new Set<string>();
  for (const t of ALL) {
    assert.match(t.name, /^rf_[a-z0-9_]+$/, t.key);
    assert.ok(t.name.length <= 512);
    assert.ok(!names.has(t.name), `${t.name} twice`);
    assert.ok(!keys.has(t.key), `${t.key} twice`);
    names.add(t.name);
    keys.add(t.key);
    const ph = placeholdersOf(t.body);
    assert.deepEqual(ph, t.params.map((_, i) => i + 1), `${t.name}: {{1}}…{{${t.params.length}}} in order, each once`);
    assert.doesNotMatch(t.body.trimStart(), /^\{\{/, `${t.name} must not start with a variable`);
    assert.doesNotMatch(t.body.trimEnd(), /\{\{\d+\}\}[.!?]?$/, `${t.name} must not end with a variable`);
    assert.doesNotMatch(t.body, /\}\}[\s\p{P}]*\{\{/u, `${t.name}: two variables side by side`);
    assert.ok(t.body.length <= 1024, `${t.name} body ≤ 1024`);
    assert.ok(t.footer.length <= 60, `${t.name} footer ≤ 60`);
    assert.doesNotMatch(t.body, /\n{3,}/);
    const words = t.body.replace(/\{\{\d+\}\}/g, '').split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 3 * t.params.length, `${t.name}: enough fixed words for its ${t.params.length} variables (${words})`);
    for (const p of t.params) {
      assert.ok(p.example.trim(), `${t.name}.${p.key} needs a sample`);
      assert.doesNotMatch(p.example, /[\r\n\t]|\s{4,}/, `${t.name}.${p.key}: a sample Meta accepts`);
    }
    assert.equal(new Set(t.params.map((p) => p.key)).size, t.params.length, `${t.name}: parameter names unique`);
    assert.equal(t.params[0]!.key, 'name', `${t.name} greets by name`);
    // Dates as DD/MM/YYYY in every sample that has a date.
    for (const p of t.params) assert.doesNotMatch(p.example, /\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)\b/, `${t.name}.${p.key}: DD/MM/YYYY`);
    assert.doesNotMatch(renderBody(t, t.params.map((p) => p.example)), /\{\{/);
    assert.match(t.body, /^Hello \{\{1\}\},/);
    assert.ok(['UTILITY', 'MARKETING'].includes(t.category));
  }
  assert.equal(ALL.find((t) => t.category === 'MARKETING')?.key, 'customer_announcement', 'only the announcement is marketing');
  assert.deepEqual(ALL.filter((t) => t.header === 'DOCUMENT').map((t) => t.key).sort(), ['estimate_ready', 'invoice', 'payment_receipt']);
  assert.ok(ALL.every((t) => t.audience === 'customer' || t.key.startsWith('staff_')));
  // Money in ₦ with two decimals, in every sample that has money.
  for (const t of ALL) for (const p of t.params) if (/₦/.test(p.example)) assert.match(p.example, /₦\d{1,3}(,\d{3})*\.\d{2}/, `${t.name}.${p.key}`);
});

test('body parameters in order, with the sender’s name and workshop; a missing one is “-”, never empty', () => {
  const t = templateFor('invoice')!;
  const out = bodyParameters(t, { name: 'Tunde', invoiceNumber: 'INV-2026-000012', record: jobRecord('JC-2026-000123'), total: '₦403,125.00', balance: balanceSentence(103_125.5, new Date('2026-12-20T10:00:00Z')), link: 'https://www.example.com/x', workshop: 'Rock Foundation Automobile' });
  assert.deepEqual(out, ['Tunde', 'INV-2026-000012', 'Job Card JC-2026-000123', '₦403,125.00', '₦103,125.50 still to pay, by 20/12/2026.', 'https://www.example.com/x', 'Rock Foundation Automobile']);
  assert.equal(bodyParameters(t, {})[0], '-');
  assert.equal(templateFor('nothing'), null);
  assert.equal(balanceSentence(0), 'nothing more is owed. Thank you.');
  assert.equal(depositSentence(81_200), 'a deposit of ₦81,200.00 is needed once you approve, then we begin.');
  assert.equal(depositSentence(0), 'we begin as soon as you approve it.');
  assert.equal(detailsLine([['Customer', 'Tunde Bakare'], ['Note', null], ['Total', '₦1.00']]), 'Customer: Tunde Bakare. Total: ₦1.00.');
  assert.equal(waDate(new Date('2026-11-20T23:30:00Z')), '21/11/2026', 'DD/MM/YYYY, in Lagos');
  assert.equal(waLongDate(new Date('2026-12-04T09:00:00Z')), 'Friday, 04/12/2026');
  // What the visit is for, from the Job Card's job type.
  assert.equal(visitText('SERVICE_AND_REPAIR'), 'a service and repair');
  assert.equal(visitText('SPRAYING'), 'spraying');
  assert.equal(visitText('CAR_WASH'), 'a car wash');
  assert.equal(visitText('DIAGNOSTICS'), 'a diagnostic check');
  assert.equal(visitText(null), 'a repair');
  assert.equal(visitText('constructor'), 'a repair');
});

const emailFiles = (app: 'portal' | 'website') => readdirSync(join(REPO, 'apps', app, 'lib', 'email-templates')).filter((f) => f.endsWith('.ts')).map((f) => `${app}:${f.replace(/\.ts$/, '')}`);

test('every email of both apps has its WhatsApp template, or is listed email-only with a reason', () => {
  const files = [...emailFiles('portal'), ...emailFiles('website')];
  for (const f of files) assert.ok(EMAIL_COVERAGE[f], `${f}: give it a WhatsApp template or an email-only reason in packages/utils/src/whatsapp-templates.ts`);
  for (const k of Object.keys(EMAIL_COVERAGE)) assert.ok(files.includes(k), `${k} is not an email template file any more`);
  const used = new Set<string>();
  for (const [f, c] of Object.entries(EMAIL_COVERAGE)) {
    if ('whatsapp' in c) {
      assert.ok(c.whatsapp.length, f);
      for (const k of c.whatsapp) { assert.ok(templateFor(k), `${f}: ${k}`); used.add(k); }
    } else {
      assert.ok(c.emailOnly.length > 30, `${f}: a real reason`);
    }
  }
  for (const t of ALL) assert.ok(used.has(t.key), `${t.key} goes with no email`);
  // Password and sign-in links stay email-only, for both apps.
  for (const f of ['portal:password-reset', 'website:customer-password-reset', 'portal:staff-access']) assert.ok('emailOnly' in EMAIL_COVERAGE[f]!, f);
  // Every customer email goes on WhatsApp (WhatsApp first), except the password links.
  for (const f of files.filter((x) => /:customer-/.test(x))) {
    const c = EMAIL_COVERAGE[f]!;
    assert.ok('whatsapp' in c || /^Password and sign-in links stay email-only/.test(c.emailOnly), `${f}: a customer email needs a WhatsApp template`);
  }
});

test('docs/WHATSAPP_TEMPLATES.md is the catalogue (npm run whatsapp:templates-doc)', () => {
  const doc = readRepo('docs/WHATSAPP_TEMPLATES.md');
  assert.equal(doc, renderTemplatesDoc(), 'out of date: run `npm run whatsapp:templates-doc`');
  for (const t of ALL) {
    assert.ok(doc.includes(`### \`${t.name}\``), t.name);
    assert.ok(doc.includes(t.body), `${t.name}: the body word for word`);
  }
  assert.match(doc, /## Emails that stay email-only/);
  assert.match(readRepo('package.json'), /"whatsapp:templates-doc": "npx tsx apps\/portal\/scripts\/whatsapp-templates-doc\.ts"/);
});

// ── 4. The wiring ────────────────────────────────────────────────────

function sources(app: 'portal' | 'website'): { rel: string; src: string }[] {
  const out: { rel: string; src: string }[] = [];
  for (const dir of ['lib', 'app', 'components']) {
    const base = join(REPO, 'apps', app, dir);
    if (!existsSync(base)) continue;
    for (const f of readdirSync(base, { recursive: true }) as string[]) {
      if (!/\.(ts|tsx)$/.test(f) || f.includes('email-templates')) continue;
      out.push({ rel: `${dir}/${f.split('\\').join('/')}`, src: readFileSync(join(base, f), 'utf8') });
    }
  }
  return out;
}

test('wiring: every file that sends an email with a WhatsApp version also sends that WhatsApp template', () => {
  for (const app of ['portal', 'website'] as const) {
    const files = sources(app).filter((f) => /\b(sendEmail|sendFromSupport)\(/.test(f.src));
    for (const [entry, c] of Object.entries(EMAIL_COVERAGE)) {
      if (!entry.startsWith(`${app}:`) || !('whatsapp' in c)) continue;
      const name = entry.slice(app.length + 1);
      const senders = files.filter((f) => f.src.includes(`email-templates/${name}'`));
      const keys = new Set<string>();
      for (const f of senders) {
        if (c.exceptIn?.[f.rel]) continue;
        // The document helpers (lib/whatsapp/documents) send their own template.
        const HELPER: Record<string, string> = { invoice: 'whatsAppInvoice(', payment_receipt: 'whatsAppPaymentReceipt(', estimate_ready: 'whatsAppEstimate(' };
        const found = c.whatsapp.filter((k) => new RegExp(`key: '${k}'`).test(f.src) || Boolean(HELPER[k] && f.src.includes(HELPER[k]!)));
        assert.ok(found.length, `${f.rel} sends ${name} by email: it must also send ${c.whatsapp.join(' or ')} on WhatsApp`);
        assert.match(f.src, /whatsAppTo(Customer|Staff)\(|whatsApp(Invoice|PaymentReceipt|Estimate)\(/, f.rel);
        found.forEach((k) => keys.add(k));
      }
      assert.ok(senders.length, `${entry}: no file sends it`);
      const all = sources(app);
      for (const k of c.whatsapp) assert.ok(keys.has(k) || all.some((f) => new RegExp(`key: '${k}'`).test(f.src)), `${entry}: ${k} is never sent`);
    }
  }
});

test('wiring: the shared senders (logged staff emails, workflow notices, Security, broadcasts, support) carry WhatsApp; digests and account notices do not', () => {
  const logged = body(read('lib/logged-email.ts'), 'sendLoggedEmail');
  assert.match(logged, /if \(opts\.whatsapp !== false\) \{\s*await whatsAppToStaff\(\{ to: unique, key: 'staff_update'/);
  const flow = body(read('lib/workflow-notify.ts'), 'emailColleagues');
  assert.match(flow, /if \(o\.notice\.next\) \{\s*await whatsAppToStaff\(\{ to: ids\.map\(\(id\) => \(\{ id \}\)\), key: 'staff_update'/, 'only a notice that asks the colleague to act');
  const sec = body(read('lib/actions/security.ts'), 'sendLogged');
  assert.match(sec, /await whatsAppToStaff\(\{ to: unique, key: 'staff_update'/);
  const gate = body(read('lib/security-notify.ts'), 'notifyGateOfRelease');
  assert.ok(gate.indexOf("key: 'staff_update'") < gate.indexOf('for (const g of gate)'), 'the gate hears once, before the emails');
  const bc = read('lib/broadcast-delivery.ts');
  assert.match(body(bc, 'whatsAppCustomers'), /notifyByEmail: true, whatsappOptIn: true/, 'announcements only to customers who want them and agreed');
  assert.match(bc, /key: 'staff_announcement'/);
  assert.match(read('lib/support/notify.ts'), /key: 'staff_assigned'/);
});

test('wiring: the PDFs go with the WhatsApp message — the estimate, the invoice and each receipt', () => {
  const docs = read('lib/whatsapp/documents.ts');
  assert.match(body(docs, 'whatsAppInvoice'), /key: 'invoice'[\s\S]*document: \{ kind: 'INVOICE', recordId: inv\.id, number: inv\.invoiceNumber/);
  assert.match(body(docs, 'whatsAppPaymentReceipt'), /key: 'payment_receipt'[\s\S]*document: \{ kind: 'RECEIPT', recordId: p\.id, number: p\.receiptNumber/);
  assert.match(body(docs, 'whatsAppEstimate'), /key: 'estimate_ready'[\s\S]*document: \{ kind: 'ESTIMATE', recordId: jc\.id, number: jc\.jobNumber/);
  const inv = body(read('lib/invoices.ts'), 'sendInvoiceEmail');
  assert.ok(inv.indexOf('await whatsAppInvoice(invoiceId, null);') < inv.indexOf('if (!inv?.customer.email) return false;'), 'on WhatsApp even with no email on file');
  const w = read('lib/actions/workshop.ts');
  const pay = w.slice(w.indexOf('export async function recordPayment('), w.indexOf('async function requireJobCardCreatorOrSupervisor('));
  assert.ok(pay.indexOf('await whatsAppPaymentReceipt(settled.paymentId, user.id);') < pay.indexOf('`Payment received — Job Card ${jobCard.jobNumber}`'));
  const est = body(w, 'notifyCustomerOfApprovedEstimate');
  assert.match(est, /key: 'estimate_ready'[\s\S]*document: \{ kind: 'ESTIMATE', recordId: jobCardId, number: estimate\.jobCard\.jobNumber, createdById: user\.id \}/);
  assert.ok(est.indexOf("key: 'estimate_ready'") < est.indexOf('renderCustomerEstimateApprovedEmail('), 'before the email, so a customer with no email still gets it');
  // Only the three customer documents go as PDFs.
  assert.deepEqual([...DOCUMENT_KINDS], ['ESTIMATE', 'INVOICE', 'RECEIPT']);
  assert.equal(documentPdfFileName('INVOICE', 'INV-2026-000012'), 'INV-2026-000012.pdf');
});

test('wiring: the customer’s Job Card journey, reminders, refunds, the welcome and support each send their template', () => {
  const w = read('lib/actions/workshop.ts');
  const status = w.slice(w.indexOf('export async function updateJobCardStatus('), w.indexOf('export async function approveJobCard('));
  for (const k of ['job_work_update', 'job_work_started', 'job_quality_check', 'job_completed', 'ready_for_collection', 'vehicle_collected']) assert.match(status, new RegExp(`key: '${k}'`), k);
  assert.match(body(w, 'createJobCard'), /key: 'job_checked_in'[\s\S]*visit: visitText\(visit\.jobType\)/, 'the check-in says what the visit is for');
  assert.match(body(read('lib/customer-care/server.ts'), 'onJobCheckedOut'), /key: 'rating_request'[\s\S]*link: rating\.link/, '"How did we do?" on WhatsApp too');
  assert.match(body(w, 'sendApprovalReminder'), /key: 'estimate_reminder'/);
  assert.match(body(w, 'notifyOverdueCancelledVehicle'), /key: 'cancelled_vehicle_waiting'/);
  assert.match(body(w, 'sendReadyForCollectionReminder'), /key: 'ready_for_collection'/);
  assert.match(body(w, 'approveCancellationRequest'), /key: 'job_cancelled'/);
  assert.match(body(w, 'approveCloseRequest'), /key: 'job_closed'/);
  assert.match(body(read('lib/actions/customer-approval.ts'), 'sendEstimateApprovalLink'), /key: 'estimate_approval_link'[\s\S]*link: url/);
  assert.match(read('lib/actions/refunds.ts'), /key: 'refund'/);
  const remind = body(read('lib/service-reminders-core.ts'), 'sendServiceReminder');
  assert.match(remind, /key: 'service_reminder'/);
  assert.match(remind, /if \(!vehicle\.customer\.email\) \{\s*if \(onWhatsApp\.status !== 'SENT'\) return;/, 'a customer with no email is reminded on WhatsApp, and only then is it logged as sent');
  const welcome = body(read('lib/customer-access.ts'), 'sendCustomerAccessEmail');
  assert.match(welcome, /if \(kind === 'welcome'\) \{\s*await whatsAppToCustomer\(\{ customerId: customer\.id, key: 'welcome'/);
  assert.doesNotMatch(welcome.slice(welcome.indexOf("key: 'welcome'"), welcome.indexOf("key: 'welcome'") + 300), /setPasswordUrl/, 'the set-password link stays in the email');
  assert.match(read('lib/actions/support.ts'), /key: 'support_reply'/);
  assert.match(read('lib/support/intake.ts'), /key: 'support_received'/);
  assert.match(readRepo('apps/website/lib/customer-portal/support.ts'), /key: 'support_received'/);
  assert.match(readRepo('apps/website/lib/estimate-approval-core.ts'), /key: 'staff_update'/);
});

test('"Send now on WhatsApp": beside "Open WhatsApp" when sending is set up; the same permissions; consent first; audited', () => {
  const btn = read('components/WhatsAppSendButton.tsx');
  assert.match(btn, /Send now on WhatsApp/);
  assert.match(btn, /Open WhatsApp/, 'the existing link stays');
  assert.match(btn, /const now = sendNow && 'document' in prepare;/);
  const a = read('lib/actions/whatsapp.ts');
  const now = body(a, 'sendWhatsAppNow');
  assert.match(now, /await seeJobCard\(inv\.jobCardId, 'sendWhatsAppNow'\);\s*const user = await requireBiller\(inv\.branchId, 'sendWhatsAppNow'\);/, 'the invoice: as "Email invoice"');
  assert.match(now, /requireEligibleFinanceOfficer\(p\.jobCard\.branchId, 'workshop\.payment\.record'\)/, 'the receipt: the Finance Officer');
  assert.ok(now.indexOf('customerWhatsAppRefusal(inv.customerId)') < now.indexOf('whatsAppInvoice(inv.id, user.id)'));
  assert.match(now, /action: sent\.status === 'SENT' \? 'whatsapp\.sent' : 'whatsapp\.failed'/);
  const est = body(read('lib/actions/customer-approval.ts'), 'sendEstimateOnWhatsAppNow');
  assert.match(est, /requireAnswerTaker\(jc, 'sendEstimateOnWhatsAppNow'\)/, 'as "Send approval link"');
  assert.ok(est.indexOf('customerWhatsAppRefusal(jc.customerId)') < est.indexOf('issueApprovalLink('), 'no new approval link without consent and a number');
  const jc = read('app/(app)/workshop/job-cards/[id]/page.tsx');
  for (const kind of ['ESTIMATE', 'INVOICE', 'RECEIPT']) assert.match(jc, new RegExp(`kind: '${kind}'[^\\n]*sendNow=\\{whatsAppConfigured\\(\\)\\}`), kind);
  assert.match(body(read('lib/whatsapp/send.ts'), 'customerWhatsAppRefusal'), /The customer has not agreed to WhatsApp messages/);
});

test('consent: the registration tick box (ticked once a phone is typed), recorded with who and when; the customer page; the customer portal; staff profiles; imports only on a yes', () => {
  const field = read('components/WhatsAppConsentField.tsx');
  assert.match(field, /The customer agrees to receive updates on WhatsApp/);
  assert.match(field, /if \(!touched\.current\) setChecked\(phone\.value\.trim\(\)\.length > 0\)/, 'ticked once a phone is entered, until the colleague changes it');
  assert.match(field, /name="whatsappOptIn"/);
  assert.match(read('components/crm/RegisterCustomerForm.tsx'), /<WhatsAppConsentField /);
  assert.match(read('app/(app)/workshop/customers/page.tsx'), /<WhatsAppConsentField \/>/, 'the front desk too');
  assert.match(read('lib/actions/crm-form-handlers.ts'), /whatsappOptIn: values\.whatsappOptIn === 'yes',/);
  assert.match(read('lib/actions/workshop-form-handlers.ts'), /whatsappOptIn: str\(formData, 'whatsappOptIn'\) === 'yes',/);
  const create = body(read('lib/actions/workshop.ts'), 'findOrCreateCustomer');
  assert.match(create, /input\.whatsappOptIn === true \? \{ whatsappOptIn: true, whatsappOptInAt: new Date\(\), whatsappOptInById: currentUser\.id \} : \{\}/);
  assert.ok(create.indexOf('whatsappOptInById') < create.indexOf('sendCustomerAccessEmail('), 'recorded before the welcome goes');
  const upd = body(read('lib/actions/crm.ts'), 'updateCustomer');
  assert.match(upd, /'whatsappOptIn' in changes \? \{ whatsappOptInAt: new Date\(\), whatsappOptInById: me\.id \}/);
  assert.match(upd, /await audit\(me\.id, before, 'updated', \{ changes \}\);/, 'audited');
  assert.match(read('lib/crm.ts'), /whatsappOptIn: 'WhatsApp updates'/);
  assert.match(read('components/crm/EditCustomerForm.tsx'), /name="whatsappOptIn"/);
  const site = readRepo('apps/website/lib/customer-portal/actions.ts');
  assert.match(body(site, 'updateWhatsAppPreference'), /data: \{ whatsappOptIn, whatsappOptInAt: new Date\(\), whatsappOptInById: null \}/);
  assert.match(body(site, 'updateWhatsAppPreference'), /writeCustomerAudit\(/);
  assert.match(readRepo('apps/website/components/customer/ProfileForms.tsx'), /Send me updates on WhatsApp/);
  const mine = body(read('lib/actions/my-whatsapp.ts'), 'saveMyWhatsApp');
  assert.match(mine, /if \(optIn && !whatsAppNumber\(phone\)\)/);
  assert.match(mine, /action: 'user\.whatsapp_updated'/);
  assert.match(read('app/(app)/profile/page.tsx'), /<MyWhatsAppForm /);
  assert.match(read('lib/data-exchange/check.ts'), /const whatsappOptIn = \['yes', 'y', 'true', '1', 'agreed', 'opted in'\]\.includes\(/);
  assert.match(read('lib/actions/data-exchange.ts'), /v\.whatsappOptIn === true \? \{ whatsappOptIn: true/);
});

test('Settings → WhatsApp: administrators only; no secrets; template approvals; the latest messages; an audited test send; the 90-day clean-up', () => {
  const page = read('app/(app)/settings/whatsapp/page.tsx');
  assert.match(page, /await guardPage\('admin\.settings\.manage', '\/settings\/whatsapp'\);/);
  assert.doesNotMatch(page, /accessToken|phoneNumberId/, 'only whether each setting is there');
  assert.match(page, /listWhatsAppTemplates\(cfg\)/);
  assert.match(page, /'MISSING'/);
  assert.match(read('app/(app)/settings/page.tsx'), /href: '\/settings\/whatsapp'[^\n]*needs: 'admin\.settings\.manage'/);
  const t = body(read('lib/actions/whatsapp-settings.ts'), 'sendWhatsAppTest');
  assert.match(t, /await authorize\('admin\.settings\.manage'/);
  assert.match(t, /action: outcome\.ok \? 'whatsapp\.test_sent' : 'whatsapp\.test_failed'[^\n]*toLast4: lastFour\(number\)/);
  assert.match(t, /if \(!t \|\| t\.header\) return/, 'no PDF template in a test');
  const cron = read('app/api/cron/pricing-alerts/route.ts');
  assert.match(cron, /const whatsAppPurged = await purgeOldWhatsAppMessages\(90\)\.catch\(\(\) => null\);/);
  assert.match(cron, /recordJobRun\('whatsapp-retention'/);
  assert.match(read('lib/job-runs.ts'), /key: 'whatsapp-retention'/);
  assert.match(body(read('lib/whatsapp/send.ts'), 'purgeOldWhatsAppMessages'), /createdAt: \{ lt: new Date\(Date\.now\(\) - days \* 86_400_000\) \}/);
});

test('the schema change is additive: new columns off by default, one new table; the data inventory; the set-up guide', () => {
  const schema = readRepo('packages/database/prisma/schema.prisma');
  assert.equal((schema.match(/whatsappOptIn\s+Boolean\s+@default\(false\)/g) ?? []).length, 2, 'customers and users, off by default');
  assert.equal((schema.match(/whatsappOptInAt\s+DateTime\?/g) ?? []).length, 2);
  assert.equal((schema.match(/whatsappOptInById\s+String\?/g) ?? []).length, 2);
  assert.match(schema, /enum WhatsAppMessageStatus \{\s*SENT\s*FAILED\s*SKIPPED\s*\}/);
  const model = schema.slice(schema.indexOf('model WhatsAppMessage {'), schema.indexOf('\n}', schema.indexOf('model WhatsAppMessage {')));
  for (const f of ['organisationId\\s+String', 'templateKey\\s+String', 'toLast4\\s+String\\?', 'status\\s+WhatsAppMessageStatus', 'error\\s+String\\?', 'providerMessageId\\s+String\\?', 'relatedType\\s+String\\?', 'relatedId\\s+String\\?', 'createdAt\\s+DateTime\\s+@default\\(now\\(\\)\\)']) assert.match(model, new RegExp(f), f);
  assert.match(model, /@@map\("whatsapp_messages"\)/);
  assert.match(read('lib/governance/data-inventory.ts'), /WhatsAppMessage: \{ tenancy: 'ORGANISATION', owner: 'organisationId', classification: \['PERSONAL', 'AUDIT'\], lifecycle: 'CASCADE', retention: '90 days[^']*', ai: 'NEVER' \}/);
  const guide = readRepo('docs/SETUP.md');
  for (const s of ['Send on WhatsApp', 'Automatic WhatsApp', 'whatsapp_business_messaging', 'whatsapp_business_management', 'Phone number ID', 'WhatsApp Business Account ID', 'docs/WHATSAPP_TEMPLATES.md', 'BOTH Vercel projects', 'redeploy', 'Meta charges per message', 'The customer agrees to receive updates on WhatsApp']) assert.ok(guide.includes(s), s);
  for (const v of ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_BUSINESS_ACCOUNT_ID', 'WHATSAPP_GRAPH_VERSION', 'WHATSAPP_TEMPLATE_LANGUAGE']) {
    assert.ok(guide.includes(v), v);
    assert.ok(readRepo('.env.example').includes(v), `.env.example: ${v}`);
  }
  assert.doesNotMatch(readRepo('.env.example'), /NEXT_PUBLIC_WHATSAPP/, 'server only');
});

