#!/usr/bin/env node
/**
 * Creates the first sign-in during a Vercel production build of the staff
 * portal, right after the schema push (scripts/db-push-if-vercel.js), so a
 * new installation is usable the moment the deploy finishes: no commands to
 * run anywhere.
 *
 * Runs packages/database/prisma/seed.ts (D'Phoenix Autocare, the Victoria
 * Island workshop and its departments, the roles and the Master
 * Administrator) and scripts/v24-roles.sql. No business data: no customers,
 * vehicles or jobs. Both are idempotent: a later build adds only what is
 * missing and never changes an existing password (RESET_MASTER_ADMIN_PASSWORD
 * =yes is the one deliberate exception, see the seed).
 *
 * Preview builds, builds outside Vercel and builds without the administrator
 * variables skip it. A failure stops the build, so a broken first sign-in is
 * never deployed silently.
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

if (!process.env.VERCEL) {
  console.log('[seed] Skipping — not running on Vercel.');
  process.exit(0);
}
if (process.env.VERCEL_ENV !== 'production') {
  console.log(`[seed] Skipping — ${process.env.VERCEL_ENV || 'unknown'} deployment; only production seeds the database.`);
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.log('[seed] Skipping — DATABASE_URL is not set.');
  process.exit(0);
}
if (!process.env.MASTER_ADMIN_EMAIL || !process.env.MASTER_ADMIN_PASSWORD) {
  console.log('[seed] Skipping — set MASTER_ADMIN_EMAIL and MASTER_ADMIN_PASSWORD (Vercel → Settings → Environment Variables) to create the first sign-in on the next deploy.');
  process.exit(0);
}

// Supabase's transaction pooler (port 6543) cannot hold the prepared
// statements Prisma uses in a long script, so the seed talks to the session
// connection (DIRECT_URL) when there is one.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
const env = { ...process.env, DATABASE_URL: url };

console.log('[seed] Creating the organisation, roles and first sign-in (only what is missing)...');
execSync('npx tsx packages/database/prisma/seed.ts', { cwd: root, stdio: 'inherit', env });
execSync('npx prisma db execute --schema=packages/database/prisma/schema.prisma --file=scripts/v24-roles.sql', { cwd: root, stdio: 'inherit', env: { ...env, DIRECT_URL: url } });
console.log('[seed] Done.');
