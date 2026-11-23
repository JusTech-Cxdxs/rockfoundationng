/**
 * Authorization Catalogue: allowed AND denied cases for each of the seven
 * roles and every kind of scope (every path is tested, allowed and denied).
 * Pure: no database, no network. Run with `npm run test --workspace=apps/portal`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decide, scopeFor, effectiveRoles, isOptionalRole, isOwnerRole, PERMISSIONS, ROLE_GRANTS, ROLE_LABELS, ROLE_DESCRIPTIONS, PAGE_PERMISSIONS,
  CORE_ROLES, OPTIONAL_ROLES, OPTIONAL_ROLE_COVER, STORE_COST_PERMISSIONS, APPROVAL_PERMISSIONS, type Principal, type PermissionKey,
} from '../lib/authz/catalogue';

const A = 'branch-a';
const B = 'branch-b';
const who = (roleSlugs: string[], extra: Partial<Principal> = {}): Principal => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: A, departmentId: 'dept-1', ...extra });
const yes = (p: Principal, k: PermissionKey, r?: Parameters<typeof decide>[2]) => assert.equal(decide(p, k, r).allowed, true, `${p.roleSlugs.join('+') || 'baseline'} should be allowed ${k}`);
const no = (p: Principal, k: PermissionKey, r?: Parameters<typeof decide>[2]) => assert.equal(decide(p, k, r).allowed, false, `${p.roleSlugs.join('+') || 'baseline'} should be refused ${k}`);
const ALL_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

/** A principal as lib/authz/server.ts builds it: optional roles switched off count for nothing; Front Desk gets the cover. */
const effective = (roleSlugs: string[], enabledOptional: readonly string[], extra: Partial<Principal> = {}): Principal => {
  const e = effectiveRoles(roleSlugs, enabledOptional);
  return who(e.roleSlugs, { extraGrants: e.cover, ...extra });
};

test('the seven roles: two always on, five optional, each labelled and described', () => {
  assert.deepEqual([...CORE_ROLES], ['owner', 'front-desk']);
  assert.deepEqual([...OPTIONAL_ROLES], ['workshop-supervisor', 'technician', 'store-keeper', 'accounts', 'security']);
  assert.deepEqual(Object.keys(ROLE_GRANTS).sort(), [...CORE_ROLES, ...OPTIONAL_ROLES].sort());
  for (const slug of Object.keys(ROLE_GRANTS)) {
    assert.ok(ROLE_LABELS[slug], `${slug} has a label`);
    assert.ok((ROLE_DESCRIPTIONS[slug] ?? '').length > 40, `${slug} has a plain description`);
  }
  assert.equal(isOptionalRole('technician'), true);
  assert.equal(isOptionalRole('owner'), false);
  assert.equal(isOptionalRole('front-desk'), false);
  assert.equal(isOwnerRole(['front-desk', 'owner']), true);
  assert.equal(isOwnerRole(['front-desk']), false);
});

test('Platform team holds everything, everywhere', () => {
  const m = who([], { isSuperAdmin: true });
  for (const k of ALL_KEYS) yes(m, k, { branchId: B });
});

test('Owner / GMD: every permission, organisation-wide, approvals included', () => {
  const o = who(['owner']);
  for (const k of ALL_KEYS) yes(o, k, { branchId: B });
  for (const k of ['workshop.estimate.final_approve', 'workshop.close.approve', 'store.prs.approve_hod', 'store.cost.view', 'analytics.business.view'] as PermissionKey[]) assert.equal(scopeFor(o, k), 'ALL');
});

test('Cost prices, margins and profit: the Owner only', () => {
  assert.deepEqual(STORE_COST_PERMISSIONS, ['store.cost.view']);
  yes(who(['owner']), 'store.cost.view', { branchId: A });
  for (const slug of ['front-desk', 'workshop-supervisor', 'technician', 'store-keeper', 'accounts', 'security']) {
    no(who([slug]), 'store.cost.view', { branchId: A });
    no(who([slug]), 'analytics.business.view', { branchId: A });
  }
  // Not even through Front Desk's cover for a switched-off Store Keeper.
  no(effective(['front-desk'], []), 'store.cost.view', { branchId: A });
});

test('Front Desk: receives vehicles, opens jobs, prepares estimates, takes payments, in their branch only', () => {
  const f = who(['front-desk']);
  for (const k of ['workshop.job_card.create', 'workshop.customer.manage', 'workshop.customer.notify', 'workshop.estimate.edit', 'workshop.payment.record', 'crm.manage', 'support.tickets.manage', 'store.view'] as PermissionKey[]) {
    yes(f, k, { branchId: A });
    no(f, k, { branchId: B });
  }
  for (const k of ['workshop.estimate.final_approve', 'workshop.close.approve', 'workshop.refund.record', 'admin.users.manage', 'admin.roles.manage', 'audit.view', 'store.parts.manage', 'security.gate.operate'] as PermissionKey[]) no(f, k, { branchId: A });
});

test('Workshop Supervisor: assigns, inspects, checks estimates, never gives final approval or opens jobs', () => {
  const s = who(['workshop-supervisor']);
  for (const k of ['workshop.technician.assign', 'workshop.job.supervise', 'workshop.estimate.approve', 'workshop.inspection.perform', 'workshop.estimate.edit', 'store.prs.approve_hod'] as PermissionKey[]) {
    yes(s, k, { branchId: A });
    no(s, k, { branchId: B });
  }
  for (const k of ['workshop.job_card.create', 'workshop.estimate.final_approve', 'workshop.close.approve', 'workshop.payment.record', 'store.prs.release'] as PermissionKey[]) no(s, k, { branchId: A });
});

test('Technician: sees and works only on jobs assigned to them', () => {
  const t = who(['technician']);
  assert.equal(scopeFor(t, 'workshop.job_card.view'), 'ASSIGNED');
  yes(t, 'workshop.job_card.view', { branchId: A, assigneeIds: ['me'] });
  no(t, 'workshop.job_card.view', { branchId: A, assigneeIds: ['someone-else'] });
  yes(t, 'workshop.job.work', { assigneeIds: [null, 'me'] });
  no(t, 'workshop.job.work', { assigneeIds: ['other'] });
  yes(t, 'workshop.estimate.edit', { assigneeIds: ['me'] });
  no(t, 'workshop.estimate.edit', { assigneeIds: ['other'] });
  for (const k of ['workshop.estimate.approve', 'workshop.technician.assign', 'workshop.job.supervise', 'workshop.job_card.create', 'workshop.payment.record', 'crm.view', 'analytics.inventory.view'] as PermissionKey[]) no(t, k, { branchId: A, assigneeIds: ['me'] });
});

test('Store Keeper: parts, goods received and issuing parts in their branch; selling prices only', () => {
  const s = who(['store-keeper']);
  for (const k of ['store.parts.manage', 'store.grn.record', 'store.prs.release', 'store.matching', 'store.view'] as PermissionKey[]) {
    yes(s, k, { branchId: A });
    no(s, k, { branchId: B });
  }
  for (const k of ['store.cost.view', 'store.prs.approve_hod', 'workshop.payment.record', 'workshop.job_card.create', 'analytics.inventory.view'] as PermissionKey[]) no(s, k, { branchId: A });
});

test('Accounts: money and statements, no workshop decisions', () => {
  const a = who(['accounts']);
  for (const k of ['workshop.payment.record', 'workshop.refund.record', 'dataexchange.export.sensitive'] as PermissionKey[]) {
    yes(a, k, { branchId: A });
    no(a, k, { branchId: B });
  }
  for (const k of ['workshop.job_card.create', 'workshop.estimate.approve', 'workshop.estimate.final_approve', 'workshop.job.work', 'store.cost.view', 'store.parts.manage', 'security.view'] as PermissionKey[]) no(a, k, { branchId: A, assigneeIds: ['me'] });
  yes(a, 'workshop.job_card.view', { branchId: A });
});

test('Security: the gate only', () => {
  const s = who(['security']);
  yes(s, 'security.gate.operate', { branchId: A });
  no(s, 'security.gate.operate', { branchId: B });
  yes(s, 'security.view', { branchId: A });
  for (const k of ['workshop.job_card.view', 'workshop.payment.record', 'workshop.job_card.create', 'store.view', 'crm.view'] as PermissionKey[]) no(s, k, { branchId: A });
});

test('Nobody signed in has anything without a role', () => {
  const p = who([]);
  for (const k of ALL_KEYS) no(p, k, { branchId: A, assigneeIds: ['me'], ownerIds: ['me'] });
});

test('Optional roles: a role that is switched off counts for nothing', () => {
  for (const role of OPTIONAL_ROLES) {
    const off = effectiveRoles([role], []);
    assert.deepEqual(off.roleSlugs, [], `${role} off: the role is dropped`);
    assert.deepEqual(off.cover, {}, `${role} off: its holder gets no cover either`);
    assert.deepEqual(effectiveRoles([role], [role]).roleSlugs, [role], `${role} on: it counts`);
  }
  // The technician whose role is off cannot work on a job, even one assigned to them.
  no(effective(['technician'], []), 'workshop.job.work', { assigneeIds: ['me'] });
  yes(effective(['technician'], ['technician']), 'workshop.job.work', { assigneeIds: ['me'] });
  // Owner and Front Desk are always on.
  assert.deepEqual(effectiveRoles(['owner', 'front-desk'], []).roleSlugs, ['owner', 'front-desk']);
});

test('Optional roles: Front Desk covers the steps of exactly the roles that are off', () => {
  // Everything off: Front Desk gets every role's cover.
  const allOff = effectiveRoles(['front-desk'], []);
  for (const role of OPTIONAL_ROLES) for (const k of Object.keys(OPTIONAL_ROLE_COVER[role]) as PermissionKey[]) assert.ok(allOff.cover[k], `front desk covers ${k} while ${role} is off`);
  const fd = effective(['front-desk'], []);
  for (const k of ['workshop.technician.assign', 'workshop.job.work', 'store.grn.record', 'store.prs.release', 'workshop.refund.record', 'security.gate.operate'] as PermissionKey[]) {
    yes(fd, k, { branchId: A });
    no(fd, k, { branchId: B });
  }
  // Everything on: no cover at all; the specialists do their own steps.
  const allOn = effectiveRoles(['front-desk'], [...OPTIONAL_ROLES]);
  assert.deepEqual(allOn.cover, {});
  const fdOn = effective(['front-desk'], [...OPTIONAL_ROLES]);
  for (const k of ['workshop.technician.assign', 'workshop.job.work', 'store.grn.record', 'workshop.refund.record', 'security.gate.operate'] as PermissionKey[]) no(fdOn, k, { branchId: A });
  // Only the Store Keeper off: store steps covered, the gate is not.
  const storeOff = effective(['front-desk'], ['workshop-supervisor', 'technician', 'accounts', 'security']);
  yes(storeOff, 'store.prs.release', { branchId: A });
  no(storeOff, 'security.gate.operate', { branchId: A });
  no(storeOff, 'workshop.technician.assign', { branchId: A });
  // Cover never reaches approvals that belong to the Owner.
  for (const k of ['workshop.estimate.final_approve', 'workshop.close.approve', 'store.cost.view', 'admin.roles.manage'] as PermissionKey[]) no(fd, k, { branchId: A });
  // Someone who is not Front Desk never gets the cover.
  assert.deepEqual(effectiveRoles(['accounts'], ['accounts']).cover, {});
});

test('Cover grants only catalogue permissions, and never more than the optional role itself', () => {
  for (const role of OPTIONAL_ROLES) {
    for (const [k, scope] of Object.entries(OPTIONAL_ROLE_COVER[role])) {
      assert.ok(k in PERMISSIONS, `${role} cover: unknown permission ${k}`);
      assert.notEqual(scope, 'ALL', `${role} cover: ${k} is branch-limited`);
      assert.notEqual(k, 'store.cost.view');
    }
  }
});

test('A grant added on the Roles page counts, but only for catalogue permissions', () => {
  const p = who(['technician'], { extraGrants: { 'workshop.payment.record': 'BRANCH' } });
  yes(p, 'workshop.payment.record', { branchId: A });
  no(p, 'workshop.payment.record', { branchId: B });
  assert.equal(decide(p, 'not.a.permission' as PermissionKey).allowed, false);
});

test('Several roles: the widest scope wins', () => {
  const p = who(['technician', 'workshop-supervisor']);
  assert.equal(scopeFor(p, 'workshop.job.work'), 'BRANCH');
  assert.equal(scopeFor(who(['front-desk', 'owner']), 'workshop.payment.record'), 'ALL');
});

test('Staff with no branch on their profile are not limited to one branch for viewing', () => {
  yes(who(['accounts'], { branchId: null }), 'workshop.payment.record', { branchId: B });
});

test('Approvals and money need the person to BELONG to the branch (homeBranch)', () => {
  no(who(['accounts'], { branchId: null }), 'workshop.payment.record', { branchId: A, homeBranch: true });
  yes(who(['accounts']), 'workshop.payment.record', { branchId: A, homeBranch: true });
  no(who(['accounts']), 'workshop.payment.record', { branchId: B, homeBranch: true });
  no(who(['workshop-supervisor'], { branchId: null }), 'workshop.estimate.approve', { branchId: B, homeBranch: true });
  // The platform team and organisation-wide (ALL) grants are unaffected.
  yes(who([], { isSuperAdmin: true, branchId: null }), 'workshop.close.approve', { branchId: B, homeBranch: true });
  yes(who(['owner'], { branchId: null }), 'workshop.close.approve', { branchId: B, homeBranch: true });
});

test('Realistic duties: nobody approves their own estimate work by role alone', () => {
  // The person who prepares the estimate (front desk, technician) cannot give final approval.
  for (const slug of ['front-desk', 'technician', 'workshop-supervisor', 'accounts', 'store-keeper']) no(who([slug]), 'workshop.estimate.final_approve', { branchId: A, assigneeIds: ['me'] });
  // Approval permissions are held by the Owner, and the supervisor's first check only.
  for (const k of APPROVAL_PERMISSIONS) yes(who(['owner']), k, { branchId: A });
  no(who(['front-desk']), 'workshop.estimate.approve', { branchId: A });
});

test('The catalogue is internally consistent', () => {
  for (const [slug, grants] of Object.entries(ROLE_GRANTS)) {
    for (const k of Object.keys(grants)) assert.ok(k in PERMISSIONS, `${slug} grants unknown permission ${k}`);
  }
  for (const k of Object.values(PAGE_PERMISSIONS)) assert.ok(k in PERMISSIONS, `page permission ${k} exists`);
  for (const k of APPROVAL_PERMISSIONS) assert.ok(k in PERMISSIONS, `approval permission ${k} exists`);
  for (const [k, v] of Object.entries(PERMISSIONS)) assert.ok(v.label.length > 5 && !/[_]/.test(v.label), `${k} has a readable label`);
  // No permission for a module this edition does not have.
  for (const k of ALL_KEYS) assert.doesNotMatch(k, /^(plant|warranty|procurement|schedule|website|privacy)\.|exit_pass|reception|incident|assist|label\.print/, `${k} belongs to a removed module`);
});

test('Tenant fence: no scope, not even ALL, reaches another organisation', () => {
  const mine = ['branch-a', 'branch-a2'];
  const owner = who(['owner'], { organisationId: 'org-1', orgBranchIds: mine });
  yes(owner, 'audit.view', { branchId: 'branch-a2' });
  yes(owner, 'workshop.job_card.view', { branchId: 'branch-a2' });
  no(owner, 'workshop.job_card.view', { branchId: 'org-2-branch' });
  no(owner, 'store.cost.view', { branchId: 'org-2-branch' });
  const tech = who(['technician'], { organisationId: 'org-1', orgBranchIds: mine });
  no(tech, 'workshop.job.work', { branchId: 'org-2-branch', assigneeIds: ['me'] });
  assert.equal(decide(owner, 'workshop.job_card.view', { branchId: 'org-2-branch' }).reason, 'Outside your organisation');
  yes(who([], { isSuperAdmin: true, orgBranchIds: mine }), 'workshop.job_card.view', { branchId: 'org-2-branch' });
});
