/**
 * Version-1 polish: employee IDs, the access description used in emails and
 * on the profile page, the welcome email, the version-1 menu, and the live
 * check (cheap, organisation-scoped, never a page render). Pure: no database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { organisationCode, branchCode, employeeIdPrefix, formatEmployeeId, sequenceOf, uniqueBranchPrefixes } from '../lib/employee-id';
import { describeAccess, plainLabel } from '../lib/authz/describe-access';
import { PERMISSIONS, type Principal, type PermissionKey } from '../lib/authz/catalogue';
import { renderStaffAccessEmail, STAFF_RULES } from '../lib/email-templates/staff-access';
import { navigationFor } from '../lib/authz/navigation';
import { SYSTEM_DEPARTMENT_SLUGS } from '../lib/structure-rules';
import { parseTheme, THEME_BOOT_SCRIPT } from '../lib/theme';
import { initialsOf, colourOf } from '../lib/avatar';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const who = (roleSlugs: string[], extra: Partial<Principal> = {}): Principal => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'b1', departmentId: null, ...extra });

test('employee IDs: organisation and branch codes', () => {
  assert.equal(organisationCode('Rock Foundation Automobile'), 'RFA');
  assert.equal(organisationCode('Lagos Fleet Services Limited'), 'LFS');
  assert.equal(organisationCode('Acme'), 'ACM');
  assert.equal(organisationCode('   '), 'EJO');
  assert.equal(branchCode('Ajah Branch'), 'AJA');
  assert.equal(branchCode('Sango Ota'), 'SO');
  assert.equal(branchCode('Ikeja Workshop'), 'IKE');
  assert.equal(branchCode('Anything', 'ota-ws'), 'OTAW', 'the branch\'s own code wins (letters and digits only)');
  assert.equal(branchCode('Abuja', 'x'), 'ABU', 'a one-character own code is ignored');
  assert.equal(branchCode('Lekki <script>'), 'LS', 'only letters and digits survive');
  assert.equal(employeeIdPrefix('Rock Foundation Automobile', 'Ajah Branch'), 'RFA-AJA');
});

test('employee IDs: format and running number', () => {
  assert.equal(formatEmployeeId('PN-AJA', 7), 'PN-AJA-0007');
  assert.equal(formatEmployeeId('PN-AJA', 12345), 'PN-AJA-12345');
  assert.equal(sequenceOf('PN-AJA', 'PN-AJA-0042'), 42);
  assert.equal(sequenceOf('PN-AJA', 'PN-AJAX-0042'), null);
  assert.equal(sequenceOf('PN-AJA', 'PN-AJA-12a'), null);
  assert.equal(sequenceOf('PN-AJA', 'EMP-001'), null);
});

test('employee IDs: branches whose names give the same code are told apart, and existing ones never change', () => {
  const first = uniqueBranchPrefixes('Rock Foundation Automobile', [{ id: 'a', name: 'Ajah' }, { id: 'b', name: 'Ajah Workshop' }, { id: 'c', name: 'Sango Ota' }]);
  assert.deepEqual([...first.values()], ['RFA-AJA', 'RFA-AJA2', 'RFA-SO']);
  const later = uniqueBranchPrefixes('Rock Foundation Automobile', [{ id: 'a', name: 'Ajah' }, { id: 'b', name: 'Ajah Workshop' }, { id: 'c', name: 'Sango Ota' }, { id: 'd', name: 'Ajah Branch' }]);
  assert.equal(later.get('a'), 'RFA-AJA');
  assert.equal(later.get('b'), 'RFA-AJA2');
  assert.equal(later.get('d'), 'RFA-AJA3');
});

test('access description: exactly what the catalogue grants, with "added" grants marked', () => {
  const tech = describeAccess(who(['technician']));
  const keys = tech.flatMap((g) => g.lines.map((l) => l.key));
  assert.ok(keys.includes('workshop.job.work'));
  assert.ok(!keys.includes('admin.users.manage'));
  const work = tech.flatMap((g) => g.lines).find((l) => l.key === 'workshop.job.work')!;
  assert.equal(work.where, 'on work assigned to you');
  assert.equal(work.added, false);
  const extra = describeAccess(who(['technician'], { extraGrants: { 'workshop.payment.record': 'BRANCH' } }), () => true);
  const w = extra.flatMap((g) => g.lines).find((l) => l.key === 'workshop.payment.record')!;
  assert.equal(w.added, true);
  assert.equal(w.where, 'in your branch');
  for (const g of tech) for (const l of g.lines) assert.equal(l.label, plainLabel(PERMISSIONS[l.key as PermissionKey].label));
  assert.ok(!tech.flatMap((g) => g.lines).some((l) => / — |\(/.test(l.label)), 'labels are plain — no repeated scope or role hints');
  assert.deepEqual(describeAccess(who([], { isSuperAdmin: true })), [{ module: 'Platform', lines: [] }]);
});

test('welcome email: employee ID, roles, branch, access, sign-in steps, the rules — and nothing unescaped', () => {
  const { subject, html } = renderStaffAccessEmail({
    kind: 'welcome', fullName: 'Ada <b>Obi</b>', email: 'ada@example.com', employeeId: 'PN-AJA-0007', companyName: 'Example Motors Ltd',
    branchName: 'Ajah Branch', departmentName: 'Workshop', roles: ['Technician'], isPlatformTeam: false,
    access: describeAccess(who(['technician'])), setPasswordUrl: 'https://portal.example/api/auth/reset-password/tok?callbackURL=%2Freset-password', setPasswordHours: 72,
    signInUrl: 'https://portal.example/login', logoUrl: 'https://portal.example/brand/logo.png',
  });
  assert.match(subject, /Welcome/);
  assert.ok(html.includes('PN-AJA-0007'));
  assert.ok(html.includes('Technician'));
  assert.ok(html.includes('Ajah Branch'));
  assert.ok(html.includes('Set my password'));
  assert.ok(html.includes('72 hours'));
  assert.ok(html.includes('https://portal.example/login'));
  assert.ok(html.includes('on work assigned to you'));
  for (const r of STAFF_RULES) assert.ok(html.includes(r.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;')), `rule missing: ${r.slice(0, 30)}`);
  assert.ok(!html.includes('<b>Obi</b>'), 'names are escaped');
  const upd = renderStaffAccessEmail({ kind: 'updated', fullName: 'Ada', email: 'ada@example.com', employeeId: null, companyName: 'K', branchName: null, departmentName: null, roles: [], isPlatformTeam: false, access: [], signInUrl: 'https://x/login', logoUrl: 'https://x/l.png', changeNote: 'You were given the role Store Officer.' });
  assert.match(upd.subject, /changed/);
  assert.ok(upd.html.includes('You were given the role Store Officer.'));
  assert.ok(!upd.html.includes('Set my password'), 'an access-changed email carries no password link');
});

test('the menu: only live modules; the organisation structure for the Owner', () => {
  const admin = navigationFor(who(['owner']));
  const master = navigationFor(who([], { isSuperAdmin: true }));
  for (const items of [admin, master]) for (const i of items) assert.equal(i.status, 'LIVE', `${i.key} is shown but not live`);
  assert.ok(admin.some((i) => i.key === 'structure'), 'the organisation structure is in the menu for the Owner');
  assert.ok(!navigationFor(who(['technician'])).some((i) => i.key === 'structure'), 'but not for a technician');
  assert.equal(existsSync(join(ROOT, 'components', 'PagePlaceholder.tsx')), false);
});

test('organisation structure: workflow departments are protected', () => {
  for (const slug of ['workshop', 'mechanical', 'electrical', 'body-spray', 'car-wash', 'store']) assert.ok(SYSTEM_DEPARTMENT_SLUGS.has(slug), `${slug} is a system department`);
  const src = read('lib/actions/structure.ts');
  assert.match(src, /cannot be switched off/, 'system departments are never switched off');
  assert.match(src, /move them to another department first/, 'a department with people is never switched off');
});

test('live check: a cheap organisation-scoped GET, never a page-posting server action on a 3-second loop', () => {
  const provider = read('components/NotificationProvider.tsx');
  assert.ok(provider.includes("fetch('/api/live/pulse'"), 'the change check is a plain GET');
  assert.ok(!/getNotificationPulse/.test(provider), 'no server action POST to the page every few seconds');
  const ms = (name: string) => Number(new RegExp(`const ${name} = ([0-9_]+)`).exec(provider)?.[1]?.replace(/_/g, ''));
  assert.ok(ms('PULSE_MS') >= 10000, 'checks no more often than every 10 seconds');
  assert.ok(ms('PULSE_WHEN_IDLE_MS') >= 60000);
  assert.ok(ms('PAGE_REFRESH_GAP_MS') >= 30000, 'pages refresh at most every 30 s on organisation changes');
  assert.ok(ms('HEAVY_PAGE_REFRESH_GAP_MS') >= 120000, 'analytics pages recompute at most every 2 minutes');
  assert.ok(ms('MIN_LOAD_GAP_MS') >= 30000, 'the notification summary is fetched at most every 30 s');
  assert.ok(provider.includes("visibilityState === 'hidden'"), 'hidden tabs never check');
  const route = read('app/api/live/pulse/route.ts');
  assert.ok(/isActive/.test(route) && /401/.test(route), 'signed-out or switched-off people get 401');
  const pulse = read('lib/live-pulse.ts');
  assert.ok(/organisationId/.test(pulse), 'scoped to the organisation');
});

test('theme: Light / Dark / System, applied before paint, never trusting the cookie blindly', () => {
  assert.equal(parseTheme('dark'), 'dark');
  assert.equal(parseTheme('light'), 'light');
  assert.equal(parseTheme('"><script>'), 'system');
  assert.equal(parseTheme(undefined), 'system');
  assert.ok(THEME_BOOT_SCRIPT.includes('(light|dark)'), 'the boot script accepts only the two values');
  assert.ok(read('app/layout.tsx').includes('THEME_BOOT_SCRIPT'));
  const css = read('app/globals.css');
  assert.ok(css.includes(":root[data-theme='dark']") && css.includes('prefers-color-scheme: dark'));
  assert.ok(read('components/Topbar.tsx').includes('<ThemeToggle'), 'the toggle is in the header on every page');
});

test('avatars: initials and a stable colour', () => {
  assert.equal(initialsOf('Ada Grace Obi'), 'AO');
  assert.equal(initialsOf('ada'), 'A');
  assert.equal(initialsOf('  '), '?');
  assert.equal(colourOf('ada obi'), colourOf('ada obi'));
});

test('deploys: pre-deploy SQL is additive and re-runnable, and runs before every production push', () => {
  const repo = join(ROOT, '..', '..');
  const dir = join(repo, 'scripts', 'predeploy');
  const { readdirSync, existsSync: exists } = require('node:fs') as typeof import('node:fs');
  // A fresh edition starts with none; each later additive change adds a numbered file.
  const files = exists(dir) ? readdirSync(dir).filter((f: string) => f.endsWith('.sql')) : [];
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8').replace(/--.*$/gm, '');
    assert.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE|RENAME)\b|ALTER\s+COLUMN[\s\S]*?\bTYPE\b/i, `${f} must be additive only`);
    for (const m of sql.matchAll(/\b(CREATE(?:\s+UNIQUE)?\s+INDEX|ADD\s+COLUMN|CREATE\s+TABLE)\b(?!\s+IF\s+NOT\s+EXISTS)/gi)) assert.fail(`${f}: "${m[0]}" must use IF NOT EXISTS`);
  }
  for (const f of readdirSync(join(repo, 'scripts', 'postdeploy')).filter((x: string) => x.endsWith('.sql'))) {
    const sql = readFileSync(join(repo, 'scripts', 'postdeploy', f), 'utf8').replace(/--.*$/gm, '');
    // No statement that removes data or structure (trigger definitions may name the events they guard).
    assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN|SCHEMA|INDEX|TYPE|VIEW|FUNCTION|TRIGGER)\b|\bDELETE\s+FROM\b|^\s*TRUNCATE\b|\bALTER\s+TABLE[^;]*\bDISABLE\s+TRIGGER\b/im, `${f} must not remove anything`);
  }
  const rls = readFileSync(join(repo, 'scripts', 'postdeploy', '0001-rls-default-deny.sql'), 'utf8');
  assert.match(rls, /ENABLE ROW LEVEL SECURITY/);
  assert.match(rls, /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon/);
  for (const s of ['db-push-if-vercel.js']) {
    const src = readFileSync(join(repo, 'scripts', s), 'utf8');
    assert.ok(src.indexOf('applyPostdeploySql();') > src.indexOf('execSync(`npx prisma db push'), `${s} applies row-level security after the push`);
    assert.ok(src.indexOf('applyPredeploySql();') > 0 && src.indexOf('applyPredeploySql();') < src.indexOf('execSync(`npx prisma db push'), `${s} runs the pre-deploy SQL first`);
    assert.doesNotMatch(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''), /--accept-data-loss/, `${s} never accepts data loss`);
  }
});
