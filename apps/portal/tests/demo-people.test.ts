/**
 * D1 — the demo people (lib/demo/people.ts) and how they are made
 * (lib/demo/people-load.ts): every role at Headquarters and at the Victoria
 * Island Workshop, one account each, named by their role, on a reserved
 * domain, with no password anywhere in the code; the demo organisation is
 * its own (lib/demo/organisation.ts), never the real one; the deploy makes
 * them only when the environment asks. The database behaviour (idempotent,
 * never a password changed, a demo person in a real organisation switched
 * off) is proved in e2e/demo-people.spec.ts against a real database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OLD_ORGANISATION } from './leftovers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_CUSTOMERS, DEMO_DOMAIN, DEMO_PASSWORD_MIN, DEMO_STAFF, demoPerson, isDemoEmail } from '../lib/demo/people';
import { demoPasswords } from '../lib/demo/people-load';
import { DEMO_ORG_NAME, DEMO_ORG_SLUG, REAL_ORG_SLUG, demoOrgSlug } from '../lib/demo/organisation';
import { ROLE_GRANTS, ROLE_LABELS } from '../lib/authz/catalogue';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** The roles the D'Phoenix edition has (packages/database/prisma/seed.ts), per place. */
const WANTED: Record<'HQ' | 'VI', string[]> = {
  HQ: ['administrator', 'executive', 'it-administrator', 'customer-care-lead', 'broadcaster', 'scheduling-admin', 'calendar-user'],
  VI: ['workshop-manager', 'workshop-supervisor', 'technician', 'receptionist', 'finance-officer', 'chief-security-officer', 'security-officer', 'customer-care', 'department-head'],
};
const WORKSHOP_DEPARTMENTS = ['workshop', 'workshop-passenger', 'workshop-commercial'];
const OFF_ROLES = ['store-manager', 'store-officer', 'warranty-hod', 'warranty-officer', 'plant-manager', 'line-operator', 'kit-inspector', 'qc-inspector', 'qa-auditor', 'quality-supervisor', 'production-supervisor', 'pdi-inspector', 'pdi-supervisor'];

test('every role of the edition has a sign-in on its place; two supervisors (cars and fleet) and three technicians; nothing of the Store, Warranty or the plant', () => {
  for (const [branch, roles] of Object.entries(WANTED) as ['HQ' | 'VI', string[]][]) {
    for (const role of roles) assert.ok(DEMO_STAFF.some((s) => s.branch === branch && s.role === role), `${role} on ${branch}`);
  }
  const vi = (role: string) => DEMO_STAFF.filter((s) => s.branch === 'VI' && s.role === role);
  assert.deepEqual(vi('workshop-supervisor').map((s) => s.dept).sort(), ['workshop-commercial', 'workshop-passenger']);
  assert.deepEqual(vi('technician').map((s) => s.name), ['Technician 1', 'Technician 2', 'Technician 3']);
  assert.ok(vi('technician').some((s) => s.dept === 'workshop-commercial'));
  for (const s of DEMO_STAFF) assert.ok(!OFF_ROLES.includes(s.role), `${s.email}: ${s.role} is off in this edition`);
  assert.equal(demoPerson('workshop-manager').branch, 'VI');
  assert.equal(demoPerson('executive').name, 'Managing Director');
  assert.throws(() => demoPerson('master-administrator'), /No demo person/);
});

test('one account each: addresses on the reserved domain, unique; named by role (no real person’s name); employee numbers unique and obviously demo; every role known to the catalogue; departments that exist; reporting lines resolve', () => {
  assert.equal(DEMO_DOMAIN, 'demo.dphoenix.example');
  assert.ok(DEMO_DOMAIN.endsWith('.example'), 'a reserved name');
  const emails = new Set<string>();
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const s of DEMO_STAFF) {
    assert.match(s.email, new RegExp(`^[a-z0-9.]+@${DEMO_DOMAIN.replace(/\./g, '\\.')}$`), s.email);
    assert.ok(!emails.has(s.email), `${s.email} twice`); emails.add(s.email);
    assert.ok(!ids.has(s.employeeId), `${s.employeeId} twice`); ids.add(s.employeeId);
    assert.ok(!names.has(s.name), `${s.name} twice`); names.add(s.name);
    assert.match(s.employeeId, /^DEMO-(HQ|VI)-\d{3}$/);
    assert.equal(s.employeeId.slice(5, 7), s.branch);
    // A role name: the role label, the job title or a numbered/qualified role ("Technician 1", "Supervisor — Cars").
    const label = (ROLE_LABELS[s.role] ?? '').replace(/\s*\(.*\)\s*$/, '');
    assert.ok(s.name === label || s.name === s.jobTitle || /^(Technician \d|Supervisor — \w+|Security Officer — \w+|Head of Department — \w+|Workshop Manager|Front Desk|Managing Director|Administrator|Broadcaster)$/.test(s.name), `${s.email}: "${s.name}" is a role name`);
    for (const role of [s.role, ...(s.alsoRoles ?? [])]) { assert.ok(role in ROLE_LABELS, `${role} has a label`); assert.ok(role in ROLE_GRANTS, `${role} has grants`); }
    if (s.branch === 'HQ') assert.equal(s.dept, null, `${s.email}: headquarters has no department`);
    if (s.dept) assert.ok(WORKSHOP_DEPARTMENTS.includes(s.dept), `${s.email}: ${s.dept} exists at the workshop`);
    if (s.reportsTo) assert.ok(DEMO_STAFF.some((o) => o.email === s.reportsTo), `${s.email} reports to ${s.reportsTo}`);
    assert.ok(s.jobTitle.length > 3 && s.show.length > 20, `${s.email} has a title and a tour line`);
  }
  assert.ok(isDemoEmail(`x@${DEMO_DOMAIN}`) && !isDemoEmail('x@dphoenixautocare.com') && !isDemoEmail(null));
  // Nobody at headquarters is tied to a branch: that is what makes them organisation-wide.
  assert.ok(DEMO_STAFF.filter((s) => s.branch === 'HQ').length >= 6);
});

test('two customer-portal sign-ins: an individual and a fleet company on credit — reserved addresses, no real numbers', () => {
  assert.deepEqual(DEMO_CUSTOMERS.map((c) => c.kind), ['INDIVIDUAL', 'FLEET']);
  for (const c of DEMO_CUSTOMERS) { assert.ok(isDemoEmail(c.email)); assert.match(c.phone, /^0800 000 \d{4}$/); assert.ok(c.address.includes('Lagos')); }
  assert.equal(DEMO_CUSTOMERS.find((c) => c.kind === 'FLEET')!.company, 'SEEPCO');
  assert.equal(new Set(DEMO_CUSTOMERS.map((c) => c.email)).size, DEMO_CUSTOMERS.length);
});

test('the demo has its own organisation: dphoenix-demo by default (DEMO_ORG_SLUG changes it), never the real dphoenix-autocare nor one with its own records', () => {
  assert.equal(DEMO_ORG_SLUG, 'dphoenix-demo');
  assert.equal(DEMO_ORG_NAME, "D'Phoenix Autocare (Demo)");
  assert.equal(REAL_ORG_SLUG, 'dphoenix-autocare');
  assert.equal(demoOrgSlug({}), 'dphoenix-demo');
  assert.equal(demoOrgSlug({ DEMO_ORG_SLUG: ' my-demo ' }), 'my-demo');
  const org = read('apps/portal/lib/demo/organisation.ts');
  assert.match(org, /if \(org\.slug === REAL_ORG_SLUG\) return/);
  assert.match(org, /prisma\.customer\.count\(\{ where: \{ organisationId: org\.id \} \}\)/);
  assert.match(org, /isDemo: true/);
  assert.match(org, /name: 'Victoria Island Workshop \(Demo\)'/);
  const people = read('apps/portal/scripts/demo-people.ts');
  assert.match(people, /ensureDemoOrganisation\(prisma, demoOrgSlug\(env\)\)/);
  assert.ok(!OLD_ORGANISATION.test(people + org + read('apps/portal/lib/demo/people-load.ts')));
});

test('passwords come only from the environment: none → skipped; shorter than 8 → skipped with the reason; the customers fall back to the staff password; never printed', () => {
  assert.equal(DEMO_PASSWORD_MIN, 8);
  assert.deepEqual(demoPasswords({}), { staff: null, customer: null, problems: ['DEMO_STAFF_PASSWORD is not set: no staff sign-ins.', 'No customer password (DEMO_CUSTOMER_PASSWORD or DEMO_STAFF_PASSWORD): no customer-portal sign-ins.'] });
  const short = demoPasswords({ DEMO_STAFF_PASSWORD: 'abc' });
  assert.equal(short.staff, null); assert.equal(short.customer, null);
  assert.match(short.problems[0]!, /has 3 characters; it needs at least 8/);
  const ok = demoPasswords({ DEMO_STAFF_PASSWORD: ' Long-Enough-1 ' });
  assert.equal(ok.staff, 'Long-Enough-1'); assert.equal(ok.customer, 'Long-Enough-1'); assert.deepEqual(ok.problems, []);
  const both = demoPasswords({ DEMO_STAFF_PASSWORD: 'Long-Enough-1', DEMO_CUSTOMER_PASSWORD: 'Customers-Only-2' });
  assert.equal(both.customer, 'Customers-Only-2');
  for (const p of ['apps/portal/lib/demo/people.ts', 'apps/portal/lib/demo/people-load.ts', 'apps/portal/scripts/demo-people.ts', 'apps/portal/scripts/demo-reset.ts', 'scripts/db-push-if-vercel.js']) {
    const src = read(p);
    assert.ok(!/password\s*[:=]\s*['"`][^'"`]{3,}/i.test(src), `${p} holds no password literal`);
    assert.ok(!/console\.(log|warn|error)\([^)]*(staffPassword|customerPassword|DEMO_STAFF_PASSWORD\b[^)]*\$\{)/.test(src), `${p} never prints a password`);
  }
});

test('the loader keeps the rules in its code: only a demo organisation (never the real one), a password already set is kept unless RESET_DEMO_PASSWORDS=yes, an earlier address is renamed not doubled, stray demo people switched off, one audit entry', () => {
  const src = read('apps/portal/lib/demo/people-load.ts');
  assert.match(src, /if \(!org\.isDemo\) \{ r\.skipped =/);
  assert.match(src, /if \(org\.slug === REAL_ORG_SLUG\) \{ r\.skipped =/);
  assert.match(src, /env\.RESET_DEMO_PASSWORDS === 'yes'/);
  assert.match(src, /else if \(reset\) \{\s*await prisma\.account\.update/);
  assert.match(src, /session\.deleteMany\(\{ where: \{ userId \} \}\)/);
  assert.match(src, /previousEmail/);
  assert.match(src, /disableStrayDemoPeople/);
  assert.match(src, /action: 'demo\.people_loaded'/);
  assert.match(src, /customerSession\.deleteMany/);
});

test('the production build makes the demo people only when DEMO_STAFF_PASSWORD is set, after the schema, and never fails the deploy for them; the commands exist', () => {
  const deploy = read('scripts/db-push-if-vercel.js');
  assert.ok(deploy.indexOf('applyPostdeploySql();') < deploy.indexOf("if (process.env.DEMO_STAFF_PASSWORD)"));
  assert.match(deploy, /npx tsx apps\/portal\/scripts\/demo-people\.ts/);
  assert.match(deploy, /catch \(err\)[\s\S]*The app still deploys/);
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts['demo:people'], 'npx tsx apps/portal/scripts/demo-people.ts');
  assert.equal(pkg.scripts['demo:reset'], 'npx tsx apps/portal/scripts/demo-reset.ts');
  const reset = read('apps/portal/scripts/demo-reset.ts');
  assert.match(reset, /loadDemoPeople\(prisma, org\.id/);
  assert.match(reset, /DEMO_RESET_CONFIRM/);
  // The schema column and its re-runnable SQL.
  assert.match(read('packages/database/prisma/schema.prisma'), /isDemo\s+Boolean\s+@default\(false\)/);
  assert.match(read('scripts/predeploy/0017-demo-organisation.sql'), /ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(read('scripts/v-d1-demo-people.sql'), /ADD COLUMN IF NOT EXISTS "isDemo"/);
});

test('docs/DPHOENIX_DEMO.md lists every demo sign-in (staff and customers) with its employee number, how to switch the demo on, and never a password', () => {
  const doc = read('docs/DPHOENIX_DEMO.md');
  for (const s of DEMO_STAFF) { assert.ok(doc.includes(`\`${s.email}\``), s.email); assert.ok(doc.includes(s.employeeId), s.employeeId); assert.ok(doc.includes(s.name), s.name); }
  for (const c of DEMO_CUSTOMERS) assert.ok(doc.includes(`\`${c.email}\``), c.email);
  assert.ok(!/password\s*(is|:)\s*`[^`]+`/i.test(doc), 'no password written in the tour');
  assert.match(doc, /DEMO_STAFF_PASSWORD/);
  assert.match(doc, /## Switching the demo on/);
  assert.ok(!OLD_ORGANISATION.test(doc));
});
