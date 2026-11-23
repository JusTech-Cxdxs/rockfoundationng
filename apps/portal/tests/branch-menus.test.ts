/**
 * Which areas a person is offered, by the kind of branch in view. The
 * Workshop exists only on a workshop branch; the Parts store on a workshop or
 * a warehouse. The Owner sees every area until they choose one branch in the
 * branch bar; someone whose access is to their own branch is offered only
 * what that branch has. The rule hides menu entries only: permissions decide
 * what anyone may do.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decide, ROLE_GRANTS, type Principal } from '../lib/authz/catalogue';
import { hrefInView, moduleInView, navigationFor } from '../lib/authz/navigation';
import { branchHostsModule, MODULE_AREA, moduleOfPath } from '../lib/branch-types';
import { moduleIsOn } from '../lib/modules';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const who = (roleSlugs: string[], extra: Partial<Principal> = {}): Principal => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'b', departmentId: null, ...extra });
const AREAS = ['workshop', 'inventory'];
const edition = (areas: string[]) => areas.filter((k) => moduleIsOn(k));
const menu = (roles: string[], view: { ownBranchType?: string | null; lensBranchType?: string | null } = {}, extra: Partial<Principal> = {}) =>
  navigationFor(who(roles, extra), view).map((i) => i.key).filter((k) => AREAS.includes(k));

test('which kind of branch has which area', () => {
  assert.deepEqual(MODULE_AREA, { workshop: 'workshop', inventory: 'store' });
  assert.equal(branchHostsModule('inventory', 'WORKSHOP'), true);
  assert.equal(branchHostsModule('inventory', 'WAREHOUSE'), true);
  assert.equal(branchHostsModule('inventory', 'HEAD_OFFICE'), false);
  assert.equal(branchHostsModule('workshop', 'WAREHOUSE'), false);
  assert.equal(branchHostsModule('workshop', 'WORKSHOP'), true);
  for (const type of ['WORKSHOP', 'WAREHOUSE', 'HEAD_OFFICE']) for (const everywhere of ['crm', 'security', 'analytics', 'dashboard', 'users']) assert.equal(branchHostsModule(everywhere, type), true, `${everywhere} at ${type}`);
  assert.equal(branchHostsModule('workshop', null), true, 'an unknown kind of branch hides nothing');
  assert.equal(moduleOfPath('/inventory/parts?q=x'), 'inventory');
  assert.equal(moduleOfPath('/workshop'), 'workshop');
  for (const p of ['/dashboard', '/vehicles/ABC', '/crm/customers/1', '/security', '/', '', null]) assert.equal(moduleOfPath(p), null, String(p));
});

test('the Owner oversees every branch, whichever branch they are attached to, until they choose one in the branch bar', () => {
  for (const own of ['WORKSHOP', 'HEAD_OFFICE', 'WAREHOUSE', null]) assert.deepEqual(menu(['owner'], { ownBranchType: own }), edition(AREAS), `owner attached to ${own}`);
  assert.deepEqual(menu(['owner'], {}, { branchId: null }), edition(AREAS));
  assert.deepEqual(menu(['owner'], { ownBranchType: 'WORKSHOP', lensBranchType: 'WAREHOUSE' }), edition(['inventory']), 'viewing a warehouse: no Workshop');
  assert.deepEqual(menu(['owner'], { lensBranchType: 'HEAD_OFFICE' }), edition([]), 'viewing head office');
  for (const k of ['workshop.view', 'store.view'] as const) assert.equal(decide(who(['owner'], { branchId: null }), k).scope, 'ALL');
});

test('someone whose access is to their own branch is offered only what that branch has', () => {
  assert.deepEqual(menu(['front-desk'], { ownBranchType: 'WORKSHOP' }), edition(['workshop', 'inventory']));
  assert.deepEqual(menu(['front-desk'], { ownBranchType: 'WAREHOUSE' }), edition(['inventory']));
  assert.deepEqual(menu(['store-keeper'], { ownBranchType: 'WAREHOUSE' }), edition(['inventory']));
  assert.deepEqual(menu(['front-desk'], { ownBranchType: 'HEAD_OFFICE' }), edition([]));
  // Areas not tied to a kind of branch are untouched.
  const full = navigationFor(who(['front-desk']), { ownBranchType: 'HEAD_OFFICE' }).map((i) => i.key);
  assert.ok(full.includes('dashboard') && full.includes('crm'), 'front desk at head office keeps the dashboard and customers');
});

test('no role is offered an area its own branch cannot have; with no branch known, nothing is hidden', () => {
  for (const role of Object.keys(ROLE_GRANTS)) {
    const p = who([role]);
    for (const [type, never] of [['WAREHOUSE', ['workshop']], ['HEAD_OFFICE', ['workshop', 'inventory']]] as const) {
      const shown = navigationFor(p, { ownBranchType: type }).map((i) => i.key);
      for (const area of never) {
        const key = area === 'inventory' ? 'store.view' : 'workshop.view';
        if (decide(p, key).scope === 'ALL') continue;
        assert.ok(!shown.includes(area), `${role} at ${type} is offered ${area}`);
      }
    }
    assert.deepEqual(navigationFor(p, {}).map((i) => i.key), navigationFor(p).map((i) => i.key), role);
  }
  assert.equal(moduleInView(who([], { isSuperAdmin: true }), 'workshop', ['workshop.view'], { ownBranchType: 'WAREHOUSE' }), true, 'the platform team');
});

test('wired in: the layout and search use the branch in view; the branch bar offers only the branches that have the area', () => {
  assert.match(read('app/(app)/layout.tsx'), /navigationFor\(principal, view\)/);
  assert.match(read('lib/actions/search.ts'), /navigationFor\(principal, await getBranchView\(\)/);
  const bar = read('components/BranchLensBar.tsx');
  assert.match(bar, /const here = options\.branches\.filter\(\(b\) => branchHostsModule\(area, b\.type\)\)/);
  assert.match(bar, /data-testid="branch-lens-elsewhere"/);
  assert.match(read('lib/authz/server.ts'), /export const getBranchView = cache\(/);
});

test('dashboard tiles and shortcuts never lead into an area the branch in view does not have', () => {
  const fd = who(['front-desk']);
  for (const href of ['/workshop/custody', '/workshop/job-cards']) assert.equal(hrefInView(fd, href, { ownBranchType: 'WAREHOUSE' }), false, href);
  for (const href of ['/inventory/parts', '/crm', '/security', '/analytics', '/notifications']) assert.equal(hrefInView(fd, href, { ownBranchType: 'WAREHOUSE' }), true, href);
  assert.equal(hrefInView(who(['owner']), '/workshop/custody', { ownBranchType: 'WAREHOUSE' }), true, 'the Owner attached to a warehouse still oversees the workshop');
  assert.equal(hrefInView(who(['owner']), '/workshop/custody', { lensBranchType: 'WAREHOUSE' }), false, 'until they choose the warehouse in the branch bar');
  const dash = read('app/(app)/dashboard/page.tsx');
  assert.match(dash, /quickAllowed\[i\] && inView\(q\.href\)/);
  assert.match(dash, /glance\.filter\(\(t\) => inView\(t\.href\)\)/);
  assert.match(read('lib/authz/server.ts'), /if \(!isOffPermission\(key\) && \(p\.isSuperAdmin \|\| scopeFor\(p, key\) === 'ALL'\)\) return;/);
  assert.match(read('lib/actions/data-exchange.ts'), /if \(!\(await allows\('dataexchange\.import\.run', \{ branchId: b\.id \}\)\)\) throw new DataExchangeError\(`You may bring records into your own branch only/, 'an import loads only into a branch the importer may use');
});

test('an area the person’s own branch does not have explains itself when opened by a pasted link: the same rule as the menu', () => {
  const server = read('lib/authz/server.ts');
  const gate = server.slice(server.indexOf('export async function areaNotAtMyBranch'));
  assert.match(gate.slice(0, 900), /moduleInView\(p, moduleKey, \[AREA_VIEW\[moduleKey\]!\], view\)/, 'one rule for the menu and the page');
  assert.match(gate.slice(0, 900), /view\.lensBranchType \|\| !view\.ownBranchType/);
  for (const [area, key] of [['workshop', 'workshop.view'], ['inventory', 'store.view']] as const) {
    const layout = read(`app/(app)/${area}/layout.tsx`);
    assert.ok(layout.indexOf(`guardAnyPage(['${key}']`) < layout.indexOf(`areaNotAtMyBranch('${area}')`), `${area}: permission first, then the branch`);
    assert.match(layout, new RegExp(`<AreaNotHere area="${area}"`));
  }
  for (const area of ['workshop', 'inventory']) assert.equal(moduleInView(who(['owner']), area, [area === 'workshop' ? 'workshop.view' : 'store.view'], { ownBranchType: 'HEAD_OFFICE' }), true, `owner ${area}`);
  const notice = read('components/AreaNotHere.tsx');
  assert.doesNotMatch(notice, /prisma|lib\/actions|plant/i);
});
