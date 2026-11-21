/**
 * The runtime database address (src/index.ts tunedDatabaseUrl): a Supabase
 * transaction pooler (port 6543) always gets pgbouncer=true, or every query
 * fails with "prepared statement already exists"; the session pooler and a
 * direct connection are left as they are; values already in the address win.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tunedDatabaseUrl } from '../src/index';

const pooled = 'postgresql://postgres.ref:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';
const session = 'postgresql://postgres.ref:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';

test('a transaction-pooler address gets pgbouncer=true', () => {
  const u = new URL(tunedDatabaseUrl(pooled)!);
  assert.equal(u.searchParams.get('pgbouncer'), 'true');
  assert.ok(u.searchParams.get('connection_limit'));
});

test('a value already in the address wins', () => {
  const u = new URL(tunedDatabaseUrl(`${pooled}?pgbouncer=true&connection_limit=1`)!);
  assert.equal(u.searchParams.get('pgbouncer'), 'true');
  assert.equal(u.searchParams.get('connection_limit'), '1');
});

test('the session pooler and other ports are not given pgbouncer', () => {
  assert.equal(new URL(tunedDatabaseUrl(session)!).searchParams.get('pgbouncer'), null);
  assert.equal(new URL(tunedDatabaseUrl('postgresql://u:p@localhost:5432/db')!).searchParams.get('pgbouncer'), null);
});

test('nothing set, nothing changed; a malformed address is passed through', () => {
  assert.equal(tunedDatabaseUrl(undefined), undefined);
  assert.equal(tunedDatabaseUrl('not a url'), 'not a url');
});
