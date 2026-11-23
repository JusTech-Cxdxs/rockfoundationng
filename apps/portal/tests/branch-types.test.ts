/**
 * Branch types: what kind of place a branch is and which records may live on
 * it. Rock Foundation Automobile runs one workshop with its parts store; the
 * kinds keep workshop records on a workshop and stock on a workshop or
 * warehouse, ready for more places later.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AREA_BRANCH_TYPES, BRANCH_TYPES, BRANCH_TYPE_HINTS, BRANCH_TYPE_WORDS, branchTypeFits, branchTypeMismatch, isBranchType } from '../lib/branch-types';

const read = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');

test('three kinds of branch, each with words and a hint; workshop records on a workshop, store records on a workshop or warehouse', () => {
  assert.deepEqual(BRANCH_TYPES, ['WORKSHOP', 'HEAD_OFFICE', 'WAREHOUSE']);
  for (const t of BRANCH_TYPES) { assert.ok(BRANCH_TYPE_WORDS[t]); assert.ok(BRANCH_TYPE_HINTS[t].length > 20); }
  assert.ok(isBranchType('WAREHOUSE') && !isBranchType('ASSEMBLY_PLANT') && !isBranchType('SALES') && !isBranchType(null));
  assert.deepEqual(Object.keys(AREA_BRANCH_TYPES).sort(), ['store', 'workshop']);
  assert.deepEqual(AREA_BRANCH_TYPES.workshop, ['WORKSHOP']);
  assert.equal(branchTypeFits('workshop', 'WORKSHOP'), true);
  assert.equal(branchTypeFits('workshop', 'WAREHOUSE'), false);
  assert.equal(branchTypeFits('store', 'WAREHOUSE'), true);
  assert.equal(branchTypeFits('store', 'HEAD_OFFICE'), false);
  assert.equal(branchTypeMismatch('workshop', 'Ota Workshop', 'WORKSHOP'), null);
  assert.equal(branchTypeMismatch('workshop', 'Parts Warehouse', 'WAREHOUSE'), 'Parts Warehouse is a warehouse, so it cannot hold workshop records: they belong on a workshop branch.');
  assert.equal(branchTypeMismatch('store', 'Head Office', 'HEAD_OFFICE'), 'Head Office is a head office, so it cannot hold store records: they belong on a workshop or warehouse branch.');
});

test('the schema carries the kind with a default of WORKSHOP, and nothing of the plant is left', () => {
  const schema = read('../../packages/database/prisma/schema.prisma');
  assert.match(schema, /enum BranchType \{\n  WORKSHOP\n  HEAD_OFFICE\n  WAREHOUSE\n\}/);
  assert.match(schema, /type           BranchType @default\(WORKSHOP\)/);
  assert.doesNotMatch(schema, /ASSEMBLY_PLANT|sapPlant/);
  const seed = read('../../packages/database/prisma/seed.ts');
  assert.doesNotMatch(seed, /ASSEMBLY_PLANT/);
  assert.match(seed, /type: 'WORKSHOP'/);
  const dir = join(__dirname, '..', '..', '../../scripts/postdeploy');
  for (const f of readdirSync(dir)) assert.doesNotMatch(readFileSync(join(dir, f), 'utf8'), /ASSEMBLY_PLANT/, f);
});

test('wired in: the workshop anchors only on workshop branches; imports name the kind of branch they load into; a branch keeps its kind while it holds records', () => {
  const authz = read('lib/authz/server.ts');
  assert.match(authz, /export async function typedReach\(/);
  assert.match(authz, /return none\('lens-elsewhere'/, 'a lens on another kind of branch explains instead of showing nothing');
  const core = read('lib/workshop-core.ts');
  assert.match(core, /const fitting = \{ type: \{ in: AREA_BRANCH_TYPES\[slug\] \} \} as const;/);
  assert.match(core, /\['department-branch-v2'\]/);
  const dx = read('lib/actions/data-exchange.ts');
  assert.match(dx, /branchTypeMismatch\(ENTITIES\[entity\]\.branchArea \?\? 'store', b\.name, b\.type\)/);
  const branches = read('lib/actions/branches.ts');
  assert.match(branches, /so it stays \$\{BRANCH_TYPE_WORDS\[before\.type\]\.toLowerCase\(\)\}/);
});
