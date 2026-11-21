# Operations runbooks

Steps that need account access (GitHub, Supabase, Vercel). Everything the
code can do is already done and tested. Tick each box; record the date and
who did it.

## 1. GitHub hardening ☐

1. Settings → General: the repository is **Private**.
2. Settings → Code security: **Secret scanning**, **Push protection** and
   **Dependabot alerts** on.
3. A ruleset on `main` that blocks force pushes and deletions.
4. Settings → Collaborators: only people who need write access. Remove old
   tokens and deploy keys.
5. Security → Secret scanning alerts is empty. `.env` files are never
   committed (`.gitignore`).

## 2. Prove the Supabase surface is closed ☐ (Supabase → SQL Editor)

Each query must return **0 rows**.

```sql
-- Tables or views the public roles can still read or write
SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
-- Tables without row-level security
SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;
-- Functions the public roles can call
SELECT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
-- Storage buckets that are public
SELECT id, name FROM storage.buckets WHERE public = true;
```

Then **Project Settings → API**: the **service_role** key must not be in any
`NEXT_PUBLIC_…` variable (the apps do not use it). **Realtime**: the apps use
one broadcast channel carrying only "something changed"; no table is
published for Realtime.

## 3. Backup and restore drill ☐ (before go-live, then every quarter)

1. Production Supabase on **Pro** (daily backups); point-in-time recovery
   added once real money is in the system.
2. Agree targets with the GMD: **RPO** (most data you may lose: 24 hours with
   daily backups, a few minutes with point-in-time recovery) and **RTO**
   (time to be working again: suggested 4 hours or less).
3. Drill: restore the latest backup into a **new** Supabase project → point a
   Vercel Preview at it → sign in → open a Job Card, record a test payment,
   run a search, open Audit Logs → note how long it took (your measured RTO)
   → delete the drill project.
4. Never put database dumps in GitHub (artifacts or files): they contain
   customers' details.

## 4. Load check ☐ (a staging copy only)

Run the browser tests' load check (`apps/portal/e2e/load.ts`, see
[TESTING_PROGRAMME.md](TESTING_PROGRAMME.md)) against a staging copy, and
watch Supabase → **Reports** (CPU, connections) at the same time. Record the
slowest pages and fix the **measured** slowest first.

## 5. Failure drills ☐ (staging): a friendly message, no lost data

| Drill | How | Expected |
|---|---|---|
| Double-click a payment | click Record twice fast | one payment; the second is recognised |
| Resubmit after a dropped connection | browser offline after clicking Record, then online, click again | one payment (same operation id) |
| Two people approve the same parts request | two browsers, approve at once | one succeeds; the other: "just done by someone else" |
| Database unreachable | pause the staging project | "The database is not reachable right now…" |
| Email provider down | wrong SMTP password on staging | the action succeeds; the email is logged as failed |
| Realtime down | block the Supabase websocket | pages still update by polling |
| Session expires mid-form | delete the cookie, submit | sent to sign in, then back to the page |
| Record deleted meanwhile | delete in one tab, act in another | "This record no longer exists…" |

## 6. When to add infrastructure (measurable triggers)

| Add | When this is measured |
|---|---|
| Larger Supabase compute | database CPU above 70% for long periods |
| Read replica | analytics or exports above 2 s at p95 |
| Shared cache (Redis) | many app instances and rate limits that must be shared |
| Queue and worker | any job above 10 s, or bulk email, import or export slowing people |
| Pre-computed analytics tables | Business or Inventory analytics above 3 s at p95 |

## 7. Observability (now and next)

Now: one JSON log line per server error (reference, route, time; secrets
removed); emails logged as sent or failed; the audit trail for every business
action; every scheduled job's runs on Settings. Next: a Vercel log drain with
alerts on `"level":"error"` spikes, and Vercel Speed Insights for real
page timings.

## 8. Scheduled jobs: "am I getting the emails?"

1. Open **Settings** in the staff portal: each job shows its last run, what
   it did, and whether it is on time. A job that sends nothing has found
   nothing to send.
2. **Email delivery**: sent and failed in the last 7 days and the last
   error. Failures almost always mean `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
   `SMTP_PASSWORD` or `SMTP_FROM` is missing or wrong in Vercel.
3. **The Support centre "Not running on time"**: check the Supabase
   scheduler ([SETUP.md](SETUP.md), step 6):
   `SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5;`
   200 means working; 401 means the secret in Supabase does not match
   `CRON_SECRET` in Vercel.
4. Vercel's own cron (`/api/cron/pricing-alerts`) needs `CRON_SECRET` set in
   Vercel; Vercel sends it automatically.
