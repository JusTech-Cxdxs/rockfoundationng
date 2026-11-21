/**
 * Nothing of the organisation this platform was first built for is left in
 * the D'Phoenix Autocare edition: no name, branch, plant or partner in the
 * code, the tests, the documents or the model fixtures. The one vehicle
 * make it shares with the plant module stays only in the plant's own files
 * (switched off) and the make and model list.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { OLD_ORGANISATION, PLANT_MAKE } from './leftovers';

const REPO = join(__dirname, '..', '..', '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.test-out', 'dist', '.turbo', 'coverage', 'test-results', 'playwright-report']);
const TEXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.py', '.sql', '.prisma', '.css', '.html', '.yml', '.yaml', '.toml', '.txt', '.csv', '.example', '']);
const SELF = new Set(['apps/portal/tests/leftovers.ts']);
/** Where the shared vehicle make is a genuine brand: the plant module and the make and model list. */
const MAKE_ALLOWED = /^(apps\/portal\/(lib\/plant\/|lib\/data\/vehicle-catalog\.ts|lib\/actions\/plant|lib\/data-exchange\/(check-)?plant|components\/plant\/|app\/\(app\)\/plant\/|tests\/plant-|e2e\/data-exchange-plant\.spec\.ts|e2e\/plant)|packages\/database\/prisma\/)/;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* files(p);
    else if (TEXT.has(extname(name)) && st.size < 5_000_000) yield p;
  }
}

test('no name, branch, plant or partner of the first organisation anywhere in the repository', () => {
  const found: string[] = [];
  for (const p of files(REPO)) {
    const rel = relative(REPO, p).split('\\').join('/');
    if (SELF.has(rel) || rel.endsWith('package-lock.json')) continue;
    const text = readFileSync(p, 'utf8');
    if (OLD_ORGANISATION.test(text)) found.push(rel);
    else if (PLANT_MAKE.test(text) && !MAKE_ALLOWED.test(rel)) found.push(`${rel} (vehicle make outside the plant)`);
  }
  assert.deepEqual(found, []);
});
