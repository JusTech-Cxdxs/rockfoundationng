# Production readiness

The standard: defence in depth, graceful failure, bounded resource use,
monitoring, tested recovery, least privilege and a clear path to scale. No
system can promise "nothing can ever break"; this page records what is in
place, what is deliberately left for later, and what is still to do before
Rock Foundation Automobile works on it for real.

The binding rules every change must keep are in
[ARCHITECTURE_BASELINE.md](ARCHITECTURE_BASELINE.md).

## 1. In place

| Area | State |
|---|---|
| Server actions | Every exported action reaches a sign-in and permission check (`tests/guard-coverage.test.ts` fails otherwise) |
| Roles | Seven workshop roles plus the platform administrator, with server-side checks; cost prices and profit for the Owner only; optional roles with Front Desk cover |
| Tenant fence | Every read and write by id checks the record (`tests/tenant-coverage.test.ts`) |
| Database public API | Row-level security on every table with no policies; Supabase's public roles have no table, sequence or function access; new tables covered after every deploy |
| Secrets | None in the repository; only the Supabase URL and anon key are public (by design, used only for the change ping) |
| Injection and XSS | Prisma parameterised queries only; React escaping; names escaped in emails; Content-Security-Policy with a nonce |
| Sign-in | Rate-limited per address (staff and customers: 20 sign-ins a minute, 5 reset requests per 5 minutes by default); "redirect back" only to pages on this site |
| Submissions | Flood limit on form posts per person and per address, with a friendly message |
| Double processing | Status changes are compare-and-set; payments, refunds and goods receipts carry an idempotency key with a unique constraint |
| Money and stock | Totals checked under row locks; VAT fixed on approval; discounts above the limit need the Owner |
| Errors | People see plain words or "quote reference ABC123", never technical text; references kept 90 days |
| Logs | Structured JSON error lines with reference, route and time; secrets removed |
| Scheduled jobs | Protected by `CRON_SECRET`; every run recorded and shown on Settings |
| Audit | Every business step and every data change recorded; the audit trail is append-only in the database |
| CI | Lint, type-check, unit and source tests, database concurrency tests, production build, dependency report on every push to `main` |
| Installable app | Both apps can be added to a phone's home screen (`app/manifest.ts`); icons in `public/icons/` are resized from the workshop's emblem (`public/brand/emblem.png`). No service worker, so nothing is kept on the phone |

## 2. Deliberately not added yet

| Item | Why not now | Add when |
|---|---|---|
| Redis | One workshop, modest traffic; Postgres and in-process caches are enough | Several app instances need a shared rate limit, cache or queue |
| Queues and workers | Emails and reminders are small and logged; cron covers schedules | Bulk work exceeds request time |
| Read replicas | Data volume is small | Analytics measurably slows live work |
| Offline mode | Pages carry personal and financial data | A clear need, with a design that keeps data safe on the phone |

## 3. Recovery

- **Code:** Vercel → Deployments → the previous one → Instant Rollback
  (seconds).
- **Database:** schema changes are additive, so older code keeps working
  against a newer database. Supabase Pro daily backups; point-in-time
  recovery as an add-on; a nightly copy to Cloudflare R2 is planned.
- **Targets:** agree RPO and RTO with the GMD, then prove them with a
  restore drill ([RUNBOOKS.md](RUNBOOKS.md) §3).

## 4. Before go-live

1. Work through [OPERATIONS_CHECKLIST.md](OPERATIONS_CHECKLIST.md): Vercel
   Pro, firewall rules, deployment protection, Supabase SSL, MFA everywhere.
2. Run the Supabase surface proof and a restore drill
   ([RUNBOOKS.md](RUNBOOKS.md) §2 and §3).
3. Remove `MASTER_ADMIN_PASSWORD` from Vercel once the first sign-in works.
4. Set `DATABASE_SPACE_LIMIT_MB` to the plan's size.
5. Bring in the existing records and sign off the cut-over
   ([DATA_MIGRATION.md](DATA_MIGRATION.md)).

## 5. Principles every change keeps

1. Authorise on the server, every time; never trust an id, branch, role or
   price from the browser.
2. Fence every query by organisation and branch.
3. Audit every change; never edit or delete the audit trail.
4. Money and stock: compare-and-set, row locks, idempotency keys.
5. Additive schema changes only, once released.
6. Plain words on screen; no technical text.
7. No secrets in code, logs or chat.
