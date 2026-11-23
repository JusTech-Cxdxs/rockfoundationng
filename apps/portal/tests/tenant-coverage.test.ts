/**
 * "What you are supposed to see is what you see", checked on the source.
 * Every exported server action is an endpoint a signed-in browser can call
 * with any id, so each one must check the record, not only the person's role:
 *
 *  1. Reads that take an id check the record's branch / organisation.
 *  2. Writes that take an id check the record (branch, organisation or assignment).
 *  3. The security desk acts only on its own branch's records.
 *  4. Nobody can create an account from the internet; a deactivated person
 *     cannot sign in and is signed out at once.
 *  5. Lists are fenced to the person's organisation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const ACTIONS = join(ROOT, 'lib', 'actions');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const WRITE = /\b(?:prisma|tx)\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
const READ = /\bprisma\.\w+\.(find\w*|count|aggregate|groupBy)\(/;
const TAKES_ID = /\b\w*[iI]d\w*\s*:\s*string/;

type Fn = { file: string; name: string; sig: string; body: string };
function actions(): Fn[] {
  const out: Fn[] = [];
  for (const file of readdirSync(ACTIONS).filter((n) => n.endsWith('.ts') && !n.includes('form-handlers'))) {
    const src = readFileSync(join(ACTIONS, file), 'utf8');
    if (!src.slice(0, 300).includes("'use server'")) continue;
    for (const part of src.split('\nexport async function ').slice(1)) {
      const name = part.slice(0, part.indexOf('('));
      const sig = part.slice(0, part.indexOf(')') + 1);
      const end = part.indexOf('\nexport ');
      out.push({ file, name, sig, body: end === -1 ? part : part.slice(0, end) });
    }
  }
  return out;
}

/** Anything that checks the record (or scopes the query) counts as a fence. */
const READ_FENCES = [
  'seeJobCard', 'seeBranch', 'seeVehicle', 'seePart', 'seeTarget', 'myOrganisationBranches', 'reachWhere', 'jobCardReach', 'canSeeRecord', 'authorizeOn',
  'orgWhere', 'inMyOrganisation', 'visibleOrNull', 'branchWithinReach', 'firstReach', 'requireJobCardApprover', 'me()', 'requireStoreStaff',
  // Organisation structure (lib/actions/structure.ts): fenced to the person's organisation + authorize with the branch.
  'branchInMyOrg(', 'departmentInMyOrg(', 'orgFence(o)',
  // Customer documents in bulk (lib/actions/documents.ts): the workshop found inside the person's organisation.
  'documentBranchOf(',
  // Scheduled exports (lib/actions/export-schedules.ts): the person's own schedule inside their organisation.
  'myScheduleOf(',
  'requireEligible', 'currentUserIsMasterAdmin', 'branchInMyOrganisationOrSystem',
  // The gate (lib/actions/security.ts): the Job Card's branch, checked against the gate desk's reach.
  'jobCardOnMyDesk(',
  'allows(', // with the record (branch / assignees)
  // Customers (lib/actions/crm.ts): the customer, or its address / contact / note, looked up inside the person's organisation (orgWhere).
  'fencedCustomer',
  // Enyo (lib/actions/enyo.ts): the person's own chats and facts, by user id AND the organisation the chat route stores them under.
  'myEnyoOrg(',
  // Integrity alerts: where { AND: [{ id }, visible(await integrityReviewer()) ] }: the reviewer's organisation, never about themselves.
  'integrityReviewer(',
  // Data Exchange (lib/actions/data-exchange.ts): where { id, organisationId } of the person's own organisation (exchangeOrg).
  'myImportJob(',
  // Exports (lib/actions/exports.ts): where { id, organisationId } of the person's own organisation (the platform team: any).
  'myExportJob(',
  // The demo console (lib/actions/demo-console.ts): the platform team only, any organisation by design (platformOrg).
  'platformOrg(',
];

/** Reads that need no record fence, with the reason. */
const READ_EXCEPTIONS: Record<string, string> = {
  'dashboard.ts:listActiveAnnouncements': 'compares the id with myOrganisationId() and returns nothing otherwise',
  'organisation.ts:getOrganisation': "the person's own organisation (platform team: the first)",
};

test('every read action that takes an id checks the record it reads', () => {
  const missing: string[] = [];
  for (const f of actions()) {
    if (WRITE.test(f.body) || !READ.test(f.body) || !TAKES_ID.test(f.sig)) continue;
    if (`${f.file}:${f.name}` in READ_EXCEPTIONS) continue;
    if (!READ_FENCES.some((k) => f.body.includes(k))) missing.push(`${f.file}: ${f.name}`);
  }
  assert.deepEqual(missing, [], `Reads by id with no record check:\n${missing.join('\n')}`);
});

const RECORD_CHECKS = [
  ...READ_FENCES, 'requireJobCardApprover', 'requireAssignedTechnician', 'requireEstimateContributor', 'requireJobCardCreatorOrSupervisor', 'homeBranch',
  'canDecide', 'checkPair', 'ownBroadcast', 'editableRole', 'actorOrg', 'inMyOrganisation(',
  // Enyo learned answers: where { id, organisationId: learnedOrg() } (the person's own organisation).
  'learnedOrg(',
  // Support centre set-up: where { id, organisationId: supportOrg() } (the person's own organisation).
  'supportOrg(',
  // Scheduled exports: the person's own export, and their own schedule, inside their organisation.
  'myExportOf(',
  'myScheduleOf(',
  // Callbacks (lib/actions/customer-care.ts): where { id, organisationId } inside the person's branch reach (openCallback).
  'openCallback(',
];
/** authorize(key, { branchId … }) — a role check WITH the record's branch. */
const AUTHORIZE_WITH_RECORD = /\bauthorize\([^,]+,\s*\{\s*branchId/;
/** Writes checked another way, with the reason. */
const WRITE_EXCEPTIONS: Record<string, string> = {
  'organisation.ts:updateOrganisation': 'refuses any organisation but the person\'s own (me.organisationId !== organisationId)',
  'organisation.ts:updateBillingSettings': 'the same check as updateOrganisation: the person\'s own organisation only',
};

test('every write action that takes an id checks the record it changes', () => {
  const missing: string[] = [];
  for (const f of actions()) {
    if (!WRITE.test(f.body) || !TAKES_ID.test(f.sig)) continue;
    if (`${f.file}:${f.name}` in WRITE_EXCEPTIONS) continue;
    if (!RECORD_CHECKS.some((k) => f.body.includes(k)) && !AUTHORIZE_WITH_RECORD.test(f.body)) missing.push(`${f.file}: ${f.name}`);
  }
  assert.deepEqual(missing, [], `Writes by id with no record check:\n${missing.join('\n')}`);
});

test('every gate write by id checks the desk branch or the organisation', () => {
  const src = read('lib/actions/security.ts');
  const missing: string[] = [];
  for (const part of src.split('\nexport async function ').slice(1)) {
    const name = part.slice(0, part.indexOf('('));
    const sig = part.slice(0, part.indexOf(')') + 1);
    const end = part.indexOf('\nexport ');
    const body = end === -1 ? part : part.slice(0, end);
    if (!TAKES_ID.test(sig) || !WRITE.test(body)) continue;
    if (!body.includes('OnMyDesk(') && !body.includes('inMyOrganisation(')) missing.push(name);
  }
  assert.deepEqual(missing, [], `Gate writes without a branch / organisation check:\n${missing.join('\n')}`);
});

test('the gate acts only on its own branch: the release is checked against the Job Card’s branch before anything is written', () => {
  const src = read('lib/actions/security.ts');
  const helper = src.slice(src.indexOf('async function jobCardOnMyDesk('), src.indexOf('async function jobCardOnMyDesk(') + 400);
  assert.match(helper, /prisma\.jobCard\.findUnique\(\{ where: \{ id \}, select: \{ branchId: true \} \}\)/);
  assert.match(helper, /seeBranchAnyOf\(\['security\.gate\.operate', 'security\.view'\], rec\.branchId, where\)/);
  const exit = src.slice(src.indexOf('export async function confirmVehicleExit('), src.indexOf('\nexport ', src.indexOf('export async function confirmVehicleExit(') + 10));
  assert.ok(exit.indexOf("await jobCardOnMyDesk(jobCardId, 'confirmVehicleExit')") > -1, 'the exit checks the desk branch');
  assert.ok(exit.indexOf("await jobCardOnMyDesk(") < exit.indexOf('vehicleGateExit.create('), 'checked before the exit is written');
  assert.match(exit, /if \(j\.status !== 'CHECKED_OUT'\)/, 'only a released vehicle may leave');
  // One exit per Job Card, enforced by the database too.
  assert.match(read('../../packages/database/prisma/schema.prisma'), /model VehicleGateExit \{[^}]*jobCardId\s+String\?\s+@unique/);
});

test('nobody can create an account from the internet (staff or customer)', () => {
  assert.match(read('lib/auth.ts'), /emailAndPassword: \{[\s\S]{0,200}disableSignUp: true/);
  assert.match(readFileSync(join(ROOT, '..', 'website', 'lib', 'auth-customer.ts'), 'utf8'), /emailAndPassword: \{[\s\S]{0,300}disableSignUp: true/);
});

test('a deactivated person cannot sign in and is signed out at once', () => {
  const auth = read('lib/auth.ts');
  assert.match(auth, /databaseHooks: \{[\s\S]{0,200}session: \{[\s\S]{0,100}create: \{[\s\S]{0,100}before: async[\s\S]{0,200}isActive/);
  assert.match(read('lib/actions/workshop.ts'), /const sessionForRequest = cache\(async \(\) => \{[\s\S]{0,400}return u\?\.isActive \? session : null;/);
  assert.match(read('app/(app)/layout.tsx'), /if \(!user\?\.isActive\) redirect\('\/signed-out\?reason=inactive'\)/);
  // …which clears the browser's session cookies (no redirect loop with the middleware).
  const out = read('app/signed-out/route.ts');
  assert.match(out, /session_token/);
  assert.match(out, /maxAge: 0/);
  assert.match(read('middleware.ts'), /ALWAYS_PUBLIC = \[[^\]]*'\/signed-out'/);
  // A stale cookie with no session also goes through /signed-out (never /login ↔ /dashboard).
  assert.match(read('app/(app)/layout.tsx'), /if \(!session\?\.user\?\.id\) \{[\s\S]{0,250}redirect\('\/signed-out'\)/);
  const setActive = read('lib/actions/users-admin.ts');
  assert.match(setActive, /if \(!active\) await tx\.session\.deleteMany\(\{ where: \{ userId \} \}\)/, 'switching off removes every open session');
  assert.match(setActive, /You cannot switch off your own account/);
  assert.match(setActive, /platform owner's account cannot be switched off/);
});

test('adding a staff member never emails a password and stays inside the organisation', () => {
  const src = read('lib/actions/users-admin.ts');
  const create = src.slice(src.indexOf('export async function createStaffMember('), src.indexOf('export async function setStaffActive('));
  assert.match(create, /randomBytes\(32\)/, 'unusable random password until the person sets their own');
  assert.match(create, /sendStaffAccessEmail\(created\.id, 'welcome'\)/, 'a welcome with a set-your-password link is emailed');
  assert.match(create, /nextEmployeeId\(branch\.id\)/, 'the employee ID is issued by the server, never typed');
  assert.doesNotMatch(create, /input\.employeeId/, 'nobody chooses an employee ID');
  const onboarding = read('lib/staff-onboarding.ts');
  assert.match(onboarding, /createVerificationValue\(\{ value: userId, identifier: `reset-password:\$\{token\}`/, 'the link is the auth library\'s own one-time reset token');
  assert.match(onboarding, /randomBytes\((18|2[4-9]|3[0-2])\)/, 'an unguessable token (at least 144 bits)');
  assert.doesNotMatch(create, /temporaryPassword|generateSecurePassword/, 'no password is ever emailed');
  assert.match(create, /Choose a branch of your organisation/);
  assert.match(create, /You can only add people to your own branch/);
  assert.match(create, /r\.slug === 'owner' && !p\.isSuperAdmin && !p\.roleSlugs\.includes\('owner'\)\) throw new Error\('Only the Owner can give the Owner role\.'\)/, 'only the Owner (or the platform team) makes another Owner');
  assert.match(create, /r\.isSuperAdmin \|\| r\.organisationId !== branchOrg/, 'never the platform role, never another organisation\'s role');
});

test('lists that used to read platform-wide are fenced', () => {
  assert.match(read('lib/actions/refunds.ts'), /export async function listAllRefunds[\s\S]{0,300}const reach = \{ jobCard: await jobCardReach\(\) \}/);
  assert.match(read('lib/actions/workshop.ts'), /export async function getWorkshopCustodySummary[\s\S]{0,1600}jobCardReach\(\)/);
  const wf = read('lib/actions/workflow-actions.ts');
  assert.doesNotMatch(wf, /const T = 40;/, 'never "the newest 40 platform-wide, then filtered"');
  for (const m of wf.matchAll(/prisma\.(\w+)\.findMany\(\{ where: \{([^]*?)\}, take: T/g)) {
    assert.match(m[2]!, /reach/, `${m[1]} action items must be scoped to the person's reach`);
  }
  assert.match(read('lib/actions/dashboard.ts'), /listActiveAnnouncements[\s\S]{0,300}mine !== organisationId\) return \[\]/);
});

test('staff lists (names and emails) are never handed out for another organisation\'s branch', () => {
  assert.match(read('lib/actions/store.ts'), /listEligibleStoreManagersForBranch[\s\S]{0,200}branchInMyOrganisationOrSystem/);
  assert.match(read('lib/actions/store.ts'), /listEligibleStoreOfficersForBranch[\s\S]{0,200}branchInMyOrganisationOrSystem/);
  assert.match(read('lib/actions/workshop.ts'), /listEligibleFinanceOfficersForBranch[\s\S]{0,200}branchInMyOrganisationOrSystem/);
  assert.match(read('lib/actions/workshop.ts'), /listEligibleManagersForBranch\(branchId: string\)[\s\S]{0,200}branchInMyOrganisationOrSystem/);
});

test('the Store is found per organisation, never "the first Store department anywhere"', () => {
  const store = read('lib/actions/store.ts');
  const fn = store.slice(store.indexOf('export async function getStoreBranchId('), store.indexOf('export async function getStoreBranchId(') + 600);
  assert.match(fn, /getStoreBranchIdForMe\(\)/);
  assert.doesNotMatch(fn, /department\.findFirst\(\{\s*where: \{ slug: 'store' \}/);
});
