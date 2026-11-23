/**
 * The nightly backup (scripts/backup, .github/workflows/backup.yml): the dump
 * is encrypted before it leaves the runner, every value comes from the
 * repository's secrets, nothing is printed but sizes and names, and the
 * restore refuses the live database or one that already has tables. Reads
 * the files, so a change that weakens any of this fails CI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

test('the backup is encrypted before upload, kept for a set time, and never prints a secret', () => {
  const sh = read('scripts/backup/backup-to-r2.sh');
  assert.match(sh, /^set -euo pipefail$/m);
  assert.match(sh, /pg_dump --format=custom/);
  assert.match(sh, /openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_ENCRYPTION_KEY/);
  // The plain dump is gone before anything is uploaded.
  assert.ok(sh.indexOf('rm -f "$WORK/db.dump"') < sh.indexOf('put "$DAILY_KEY"'));
  assert.match(sh, /BACKUP_ENCRYPTION_KEY is too short/);
  assert.match(sh, /DAILY_DAYS="\$\{BACKUP_DAILY_DAYS:-30\}"/);
  assert.match(sh, /MONTHLY_DAYS="\$\{BACKUP_MONTHLY_DAYS:-365\}"/);
  assert.doesNotMatch(sh, /echo[^\n]*\$(BACKUP_DATABASE_URL|BACKUP_ENCRYPTION_KEY|R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID)/);
  assert.doesNotMatch(sh, /set -x/);
  assert.ok(statSync(join(ROOT, 'scripts/backup/backup-to-r2.sh')).mode & 0o111, 'executable');
});

test('the restore checks the file and refuses the live database or one with tables', () => {
  const sh = read('scripts/backup/restore-from-r2.sh');
  assert.match(sh, /Refused: that is the live database/);
  assert.match(sh, /Refused: the target database already has \$TABLES tables/);
  assert.match(sh, /does not match its checksum: not restored/);
  assert.match(sh, /openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY/);
  // The closing line counts rows with psql (the address is passed to psql, never printed).
  const printed = sh.replace(/\$\(psql "\$RESTORE_DATABASE_URL"[^)]*\)/g, '');
  assert.doesNotMatch(printed, /echo[^\n]*\$(RESTORE_DATABASE_URL|BACKUP_ENCRYPTION_KEY|R2_SECRET_ACCESS_KEY)/);
});

test('the nightly workflow reads every value from secrets and stops politely without them', () => {
  const yml = read('.github/workflows/backup.yml');
  for (const name of ['BACKUP_DATABASE_URL', 'BACKUP_ENCRYPTION_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
    assert.match(yml, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`), name);
  }
  assert.match(yml, /permissions:\n {2}contents: read/);
  assert.match(yml, /cron: '40 0 \* \* \*'/);
  assert.match(yml, /The nightly backup is not set up yet/);
  assert.doesNotMatch(yml, /upload-artifact/, 'never a dump as a GitHub artifact');
  const env = read('.env.example');
  for (const name of ['BACKUP_DATABASE_URL', 'BACKUP_ENCRYPTION_KEY', 'R2_BUCKET']) assert.match(env, new RegExp(`^# ${name}=`, 'm'), `${name} is listed by name only`);
});
