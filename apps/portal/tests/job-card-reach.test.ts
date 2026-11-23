/**
 * A technician sees only the Job Cards given to them (scope ASSIGNED): the
 * single-record checks pass the job's assignees, and every Job Card list,
 * count, search and export goes through jobCardReach, never the bare branch
 * reach (which, for an assigned-only person, would mean the whole business).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { decide, type Principal } from '../lib/authz/catalogue';

const ROOT = join(__dirname, '..', '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');

test('a technician opens a Job Card they are assigned to, and not another', () => {
  const tech: Principal = { userId: 'tech-1', isSuperAdmin: false, roleSlugs: ['technician'], branchId: 'b1', departmentId: null, orgBranchIds: ['b1'] };
  assert.equal(decide(tech, 'workshop.job_card.view', { branchId: 'b1', assigneeIds: ['sup-1', 'tech-1'] }).allowed, true);
  assert.equal(decide(tech, 'workshop.job_card.view', { branchId: 'b1', assigneeIds: ['sup-1', 'tech-2'] }).allowed, false);
  assert.equal(decide(tech, 'workshop.job_card.view', { branchId: 'b1' }).allowed, false, 'no assignees given: refused, never the branch');
});

test('single-record checks pass the job’s assignees', () => {
  const server = read('lib/authz/server.ts');
  assert.match(server, /export async function seeJobCard[\s\S]{0,400}assigneeIds: \[j\.supervisorId, j\.assignedTechnicianId\]/);
  assert.match(server, /export async function jobCardVisible[\s\S]{0,300}assigneeIds: \[j!\.supervisorId, j!\.assignedTechnicianId\]/);
  assert.doesNotMatch(server + read('lib/actions/workshop.ts'), /canSeeRecord\('workshop\.job_card\.view', \{ branchId: (?:(?!assigneeIds)[^}])*\}, /, 'every Job Card check passes the assignees');
  assert.match(read('lib/actions/workshop.ts'), /export async function getJobCard\(id: string\)[\s\S]{0,600}assigneeIds: \[r\.supervisorId, r\.assignedTechnicianId\]/);
});

function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(join(ROOT, rel)).isDirectory() ? files(rel) : /\.(ts|tsx)$/.test(n) ? [rel] : [];
  });
}

test('Job Card lists never use the bare branch reach on prisma.jobCard', () => {
  const offenders: string[] = [];
  for (const f of [...files('lib'), ...files('app')]) {
    const src = read(f);
    for (const m of src.matchAll(/const (\w+) = await reachWhere\('workshop\.job_card\.view'/g)) {
      const v = m[1]!;
      if (new RegExp(`prisma\\.jobCard\\.(findMany|findFirst|count|groupBy|aggregate)\\(\\{ where: \\{[^}]*\\.\\.\\.${v}\\b`).test(src)) offenders.push(`${f} (${v})`);
    }
    if (/\.\.\.\(await reachWhere\('workshop\.job_card\.view'[^)]*\)\)/.test(src) && /prisma\.jobCard\./.test(src)) offenders.push(`${f} (inline)`);
  }
  assert.deepEqual(offenders, []);
});
