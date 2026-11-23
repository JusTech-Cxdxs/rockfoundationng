/**
 * What each role is shown (menu, approvals, cost prices): the pure rules
 * behind the role walkthrough in docs/ROLES_AND_ACCESS.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, ROLE_GRANTS, ROLE_DESCRIPTIONS, ROLE_LABELS, APPROVAL_PERMISSIONS, STORE_COST_PERMISSIONS, PERMISSIONS, type Principal } from '../lib/authz/catalogue';
import { navigationFor } from '../lib/authz/navigation';
import { approvalArea, isApproval } from '../lib/approvals';

const who = (roleSlugs: string[], extra: Partial<Principal> = {}): Principal => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'a', departmentId: null, ...extra });
const keys = (roles: string[]) => navigationFor(who(roles)).map((i) => i.key);
const seesCosts = (roles: string[]) => STORE_COST_PERMISSIONS.some((k) => decide(who(roles), k).allowed);

test('every role says in plain words what it is for', () => {
  for (const slug of Object.keys(ROLE_GRANTS)) {
    assert.ok(ROLE_LABELS[slug], `${slug} has a name`);
    assert.ok((ROLE_DESCRIPTIONS[slug] ?? '').length > 30, `${slug} has a description`);
  }
  for (const k of APPROVAL_PERMISSIONS) assert.ok(k in PERMISSIONS, `${k} is a real permission`);
});

test('the Gate is in the menu for Security (and the Owner), nobody else', () => {
  for (const role of ['security', 'owner']) assert.ok(keys([role]).includes('security'), `${role}: the Gate`);
  for (const role of ['front-desk', 'workshop-supervisor', 'technician', 'store-keeper', 'accounts']) assert.ok(!keys([role]).includes('security'), `${role}: no Gate`);
  // Nobody is offered the removed people-security pages.
  for (const role of Object.keys(ROLE_GRANTS)) for (const k of ['exit-passes', 'my-visitors', 'deliveries', 'mail', 'it', 'headquarters', 'news', 'data-requests', 'assist']) assert.ok(!keys([role]).includes(k), `${role}: ${k}`);
});

test('the menu follows the role: workshop, customers and the parts store for those who use them', () => {
  assert.ok(keys(['front-desk']).includes('workshop') && keys(['front-desk']).includes('crm') && keys(['front-desk']).includes('inventory'));
  assert.ok(keys(['technician']).includes('workshop') && !keys(['technician']).includes('crm'), 'a technician works on jobs, not customer records');
  assert.ok(keys(['store-keeper']).includes('inventory'));
  assert.ok(!keys(['security']).includes('workshop') && !keys(['security']).includes('inventory'));
  assert.ok(keys(['owner']).includes('analytics') && !keys(['accounts']).includes('analytics'), 'profit analytics: the Owner only');
  for (const k of ['users', 'roles', 'settings', 'audit-logs']) {
    assert.ok(keys(['owner']).includes(k), `owner: ${k}`);
    for (const role of ['front-desk', 'technician', 'store-keeper', 'accounts', 'security', 'workshop-supervisor']) assert.ok(!keys([role]).includes(k), `${role}: ${k}`);
  }
});

test('Approvals is in the menu for people who decide things, not for the workshop floor', () => {
  for (const role of ['owner', 'workshop-supervisor', 'store-keeper']) assert.ok(keys([role]).includes('approvals'), `${role}: Approvals`);
  for (const role of ['technician', 'front-desk', 'security', 'accounts']) assert.ok(!keys([role]).includes('approvals'), `${role}: no Approvals`);
  assert.ok(navigationFor(who([], { isSuperAdmin: true })).some((i) => i.key === 'approvals'), 'the platform team');
});

test('cost prices, margins and profit are the Owner’s only', () => {
  assert.ok(seesCosts(['owner']));
  for (const role of ['front-desk', 'workshop-supervisor', 'technician', 'store-keeper', 'accounts', 'security']) assert.ok(!seesCosts([role]), `${role} does not see costs`);
});

test('approval items are recognised; work items are not', () => {
  assert.equal(approvalArea({ id: 'est-mgr-1', title: 'Final approval of the estimate — JC-1' }), 'Workshop');
  assert.equal(approvalArea({ id: 'close-1', title: 'Close requested — JC-1' }), 'Workshop');
  assert.equal(approvalArea({ id: 'cancel-1', title: 'Cancellation requested — JC-1' }), 'Workshop');
  assert.equal(approvalArea({ id: 'prs-hod-1', title: 'Approve the parts request' }), 'Store');
  assert.equal(approvalArea({ id: 'prs-store-1', title: 'Release the parts' }), 'Store');
  for (const id of ['prs-rel-1', 'assign-1', 'est-ntf-1', 'jc-out-1', 'my-assign-1', 'pricing-1', 'exitpass-1', 'warranty-claim-1', 'epr-mgr-1']) {
    assert.equal(isApproval({ id, title: 'x' }), false, `${id} is not a decision in this edition`);
  }
});
