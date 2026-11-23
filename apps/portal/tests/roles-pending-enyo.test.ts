/**
 * Roles shown as people know them ("Ada Obi (Manager)", "You (Manager)"),
 * "Waiting on others" for every role, the master-admin observer copy,
 * support action items only for support staff, organisation-wide overviews,
 * Enyo's small requests (tool selection) and its staff directory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROLE_LABELS, isOwnerRole, nameWithRole, primaryRoleLabel } from '../lib/authz/catalogue';
import { CORE_TOOLS, selectToolNames, slimToolNames } from '../lib/enyo/tool-select';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

test('names carry their role in its short form; the reader is "You"', () => {
  assert.equal(ROLE_LABELS.owner, 'Owner / GMD');
  assert.equal(primaryRoleLabel(['technician', 'owner']), 'Owner');
  assert.equal(primaryRoleLabel(['front-desk', 'store-keeper']), 'Front Desk');
  assert.equal(primaryRoleLabel(['workshop-supervisor']), 'Workshop Supervisor');
  assert.equal(primaryRoleLabel([], true), 'Platform Administrator');
  assert.equal(nameWithRole('Tunde Bello', ['owner']), 'Tunde Bello (Owner)');
  assert.equal(nameWithRole('Ada Obi', ['accounts'], { isMe: true }), 'You (Accounts)');
  assert.equal(nameWithRole('Ada', ['front-desk']), 'Ada (Front Desk)');
  assert.equal(nameWithRole('No Role', []), 'No Role');
  assert.equal(isOwnerRole(['owner']), true);
  assert.equal(isOwnerRole(['front-desk']), false);
});

test('activity and the audit trail show "Name (Role)"', () => {
  for (const f of ['lib/actions/notifications.ts', 'lib/actions/audit-logs.ts']) assert.match(read(f), /nameWithRole\(/, f);
  assert.match(read('lib/notification-rules.ts'), /'access\.denied'/);
});

test('the master admin gets an observer copy of every email (switchable off), never twice', async () => {
  const src = read('lib/email.ts');
  assert.match(src, /bcc/i);
  assert.match(src, /MAIL_OBSERVER_BCC/);
  // Staff workflow mail only: never sign-in links, password or account emails, never customers.
  assert.match(src, /options\.observer === false \? \[\] : await staffOnly\(to\)/);
  assert.match(src, /accountType: 'EMPLOYEE'/);
  assert.equal((read('lib/auth.ts').match(/observer: false/g) ?? []).length, 3, 'reset, verification and password-changed emails');
  for (const f of ['lib/staff-onboarding.ts', 'lib/customer-access.ts', 'lib/actions/users-admin.ts']) assert.match(read(f), /observer: false/, f);
  // The rule itself (copied from lib/email.ts to keep nodemailer out of the test).
  const fn = src.slice(src.indexOf('export function observerCopies'), src.indexOf('\n}\n', src.indexOf('export function observerCopies')) + 2);
  const observerCopies = new Function(`${fn.replace('export function', 'return function').replace(/: Record<string, string \| undefined> = process\.env\): string\[\]/, ')').replace(/\(to: string, env/, '(to, env')}`)() as (to: string, env: Record<string, string>) => string[];
  assert.deepEqual(observerCopies('a@x.com', { PLATFORM_OWNER_EMAIL: 'owner@x.com' }), ['owner@x.com']);
  assert.deepEqual(observerCopies('owner@x.com', { PLATFORM_OWNER_EMAIL: 'owner@x.com' }), []);
  assert.deepEqual(observerCopies('a@x.com', { MAIL_OBSERVER_BCC: 'off', PLATFORM_OWNER_EMAIL: 'owner@x.com' }), []);
  assert.deepEqual(observerCopies('a@x.com', { MAIL_OBSERVER_BCC: 'it@x.com, not-an-email' }), ['it@x.com']);
});

test('support action items belong to Front Desk (customer care), not to the workshop floor', () => {
  const src = read('lib/actions/my-work.ts');
  assert.match(src, /const care = p\.isSuperAdmin \|\| p\.roleSlugs\.includes\('front-desk'\);/);
  assert.match(src, /supportQueueMember/);
});

test('only headquarters gets the overviews; a manager keeps the branch dashboard', () => {
  const lead = read('lib/actions/leadership.ts');
  assert.match(lead, /scopeFor\(p, k\) === 'ALL'/);
  assert.match(lead, /leadership: orgWide\('analytics\.business\.view'\)/);
  const dash = read('app/(app)/dashboard/page.tsx');
  assert.match(dash, /overviews\.leadership \?/);
  assert.match(dash, /overviews\.it \?/);
  assert.match(dash, /'Your branch at a glance'/);
});

test('"Waiting on others" covers every workflow, names who has it, and is on Approvals, the dashboard, the brief and Enyo', () => {
  const src = read('lib/actions/pending.ts');
  for (const m of ['jobCard', 'estimate', 'partRequestSlip', 'closeRequest', 'cancellationRequest', 'supportTicket']) {
    assert.ok(src.includes(`prisma.${m}.findMany`), m);
  }
  // Only the person's own requests.
  for (const k of ['createdById: mine', 'requestedById: mine', 'requesterUserId: mine']) assert.ok(src.includes(k), k);
  assert.match(src, /organisationId: p\.organisationId, requesterUserId: mine/);
  assert.match(src, /'Owner', 'the Owner'/, 'decisions waiting on the Owner name the Owner');
  assert.match(src, /\(Owner\)/);
  assert.match(read('app/(app)/approvals/page.tsx'), /<WaitingOnOthers items=\{waiting\} \/>/);
  assert.match(read('app/(app)/dashboard/page.tsx'), /<WaitingOnOthers items=\{waiting\} limit=\{5\} compact \/>/);
  assert.match(read('lib/brief/collect.ts'), /key: 'waiting'/);
  // Every link opens a page that exists.
  for (const url of src.matchAll(/url: `(\/[a-z/-]+)\/\$\{/g)) assert.ok(read(`app/(app)${url[1]}/[id]/page.tsx`).length > 0, url[1]);
});

test('Enyo offers only the tools a question needs, so "hi" fits the free model tier', () => {
  const dir = join(ROOT, 'lib', 'enyo', 'tools');
  const all = new Set(readdirSync(dir).filter((f) => f.endsWith('.ts')).flatMap((f) => [...readFileSync(join(dir, f), 'utf8').matchAll(/^\s{4}name: '([a-z_]+)'/gm)].map((m) => m[1]!)));
  for (const t of CORE_TOOLS) assert.ok(all.has(t), `core tool ${t} exists`);
  for (const t of ['my_pending', 'staff_directory', 'branch_briefing', 'explain_error']) assert.ok(all.has(t), t);
  for (const t of ['website_traffic', 'warranty_watch', 'vehicle_service_details', 'my_schedule', 'my_security', 'mail_brief']) assert.ok(!all.has(t), `${t} belongs to a removed module`);
  const hi = selectToolNames('hi');
  assert.ok(hi.names.length <= 12, `hi offers ${hi.names.length}`);
  assert.ok(hi.names.includes('daily_brief') && hi.names.includes('my_pending'));
  assert.equal(hi.web, false);
  assert.ok(selectToolNames('who is the store keeper').names.includes('staff_directory'));
  assert.ok(selectToolNames('brief me on Ota Workshop').names.includes('branch_briefing'));
  assert.ok(selectToolNames('explain error 1914370005').names.includes('explain_error'));
  assert.ok(selectToolNames('has my PRS been approved?').names.includes('my_pending'));
  // A follow-up keeps the previous question's tools.
  assert.ok(selectToolNames('and last month?', 'what was revenue this month').names.includes('business_summary'));
  assert.ok(selectToolNames('x'.repeat(10), '', 16).names.length <= 16);
  assert.ok(slimToolNames('brief me').length <= 9);
  // Every selectable name is a real tool (a typo would silently drop it).
  const src = read('lib/enyo/tool-select.ts');
  for (const m of src.matchAll(/'([a-z_]+)'/g)) if (m[1]!.includes('_')) assert.ok(all.has(m[1]!), `tool-select names ${m[1]}`);
});

test('the chat route sends a small request and retries smaller when the model server says it is too big or busy', () => {
  const portal = read('app/api/enyo/chat/route.ts');
  assert.match(portal, /staffToolsFor\(/);
  assert.match(portal, /retrySmaller:/);
  assert.match(portal, /trimHistory\(/);
  assert.match(read('../website/app/api/enyo/chat/route.ts'), /retrySmaller:/);
  // A failed answer offers "Try again" and "New chat".
  const ui = read('components/enyo/EnyoMessages.tsx');
  assert.match(ui, /Try again/);
  assert.match(ui, /New chat/);
  assert.match(read('components/enyo/EnyoPanel.tsx'), /onRetry=\{/);
});

test('the staff directory stays inside the organisation and shares only work details', () => {
  const src = read('lib/enyo/tools/people.ts');
  assert.match(src, /organisationId: org/);
  assert.match(src, /accountType: 'EMPLOYEE'/);
  const select = src.slice(src.indexOf('select: { fullName'), src.indexOf('});', src.indexOf('select: { fullName')));
  for (const never of ['phone', 'password', 'employeeProfile', 'image']) assert.ok(!select.includes(never), never);
});
