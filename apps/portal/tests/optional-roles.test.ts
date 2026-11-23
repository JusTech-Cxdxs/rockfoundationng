/**
 * Optional roles (Settings → Roles): the Owner switches the Workshop
 * Supervisor, Technician, Store Keeper, Accounts and Security roles on or
 * off. While one is off its holders get nothing from it and Front Desk
 * covers its steps (lib/authz/catalogue.ts effectiveRoles). The rules are
 * pure (tests/authz.test.ts covers every case); this checks the wiring on the
 * source, like the other coverage tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPTIONAL_ROLES, effectiveRoles } from '../lib/authz/catalogue';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const fn = (src: string, name: string) => {
  const i = src.indexOf(`export async function ${name}(`);
  assert.ok(i >= 0, `${name} exists`);
  const next = src.indexOf('\nexport ', i + 10);
  return src.slice(i, next === -1 ? undefined : next);
};

test('switching a role on or off: the roles permission first, optional roles only, the person’s own organisation, audited, effective within a minute', () => {
  const set = fn(read('lib/actions/roles.ts'), 'setOptionalRole');
  const auth = set.indexOf("await authorize('admin.roles.manage'");
  assert.ok(auth > 0 && auth < set.indexOf('$transaction('), 'authorised before anything is written');
  assert.match(set, /if \(!isOptionalRole\(slug\)\) throw/, 'Owner and Front Desk can never be switched off');
  assert.match(set, /where: \{ id: p\.organisationId! \}/, 'only the person’s own organisation');
  assert.match(set, /action: on \? 'role\.optional_switched_on' : 'role\.optional_switched_off'/);
  assert.match(set, /revalidateTag\('org-roles'\)/, 'the cached roles are refreshed');
  assert.match(set, /OPTIONAL_ROLES\.filter\(\(r\) => current\.has\(r\)\)/, 'only known roles are ever stored');
  const list = fn(read('lib/actions/roles.ts'), 'listOptionalRoles');
  assert.match(list, /await authorize\('admin\.roles\.manage'/);
});

test('every request applies the switches: the principal drops roles that are off and gives Front Desk the cover', () => {
  const server = read('lib/authz/server.ts');
  assert.match(server, /const effective = effectiveRoles\(/);
  assert.match(server, /\['org-optional-roles-v1'\],\s*\{ revalidate: 60, tags: \['org-roles'\] \}/);
  assert.match(server, /roleSlugs: effective\.roleSlugs/);
  assert.match(server, /\{ \.\.\.effective\.cover \}/);
  assert.match(read('../../packages/database/prisma/schema.prisma'), /optionalRoles String\[\] @default\(\[\]\)/, 'all optional roles start off');
});

test('the people a step is sent to follow the switches: the role while it is on, otherwise Front Desk', () => {
  const duty = read('lib/duty-roles.ts');
  assert.match(duty, /return org\?\.optionalRoles\.includes\(role\) \? \[role\] : \['front-desk'\];/);
  // A fresh organisation (no optional role on): Front Desk covers every optional step, and the role holders get nothing.
  const fresh = effectiveRoles(['front-desk', ...OPTIONAL_ROLES], []);
  assert.deepEqual(fresh.roleSlugs, ['front-desk']);
  assert.ok(Object.keys(fresh.cover).length >= 10);
});
