# Testing programme

What is tested, where it runs and how to run it yourself. Results are read
from the CI runs themselves (GitHub → Actions), not copied here, so this page
never goes out of date.

## 1. The three workflows

| Workflow | When | What |
|---|---|---|
| `ci.yml` (job `build`) | every push to `main` and every pull request | Lint, TypeScript strict on every workspace, unit and source tests for the staff portal, the database package, Enyo and the customer portal, real parallel transactions on a throwaway PostgreSQL, a full production build of both apps, `npm audit` (report only) |
| `e2e.yml` | pull requests to `main`, manual runs | Real browsers (Playwright, Chromium) against production builds of both apps, PostgreSQL 16 with the real schema and seed, a mail catcher for every email, a stand-in model server for Enyo; one account per role and a second organisation for cross-organisation attempts; two shards; a short load check at the end |
| `security.yml` | pull requests to `main` | Secrets (Gitleaks over every commit and the client bundles), static analysis (Semgrep with project rules in `.semgrep/`), dependencies (`npm audit`), and a dynamic stage: RLS and grant probes as Supabase's `anon` and `authenticated`, access-control sweeps, concurrency bursts, and OWASP ZAP baseline scans of both apps |

Pushes straight to `main` run `ci.yml`. Run the browser and security
workflows by hand (Actions → the workflow → **Run workflow**, where
offered) or open a pull request before a large change.

## 2. Unit and source tests (`ci.yml`)

`npm run test --workspace=apps/portal` compiles `apps/portal/tests/*.ts` and
runs them with Node's own test runner. Among them:

- **Permissions** (`tests/authz.test.ts`): what each of the seven workshop roles may
  and may not do, allowed **and** denied cases, optional-role cover, and
  cost prices for the Owner only.
- **Guards** (`tests/guard-coverage.test.ts`): every data-changing server
  action checks a permission first.
- **Tenant fence** (`tests/tenant-coverage.test.ts`): every read or write by
  id checks the record; fenced lists keep their fence; sign-up stays closed.
- **Data inventory** (`tests/data-inventory.test.ts`): every table is
  declared with its owner, classification, retention and AI access.
- **Integrity** (`tests/integrity-coverage.test.ts`): status changes are
  compare-and-set, totals are checked under row locks.
- **Concurrency** (`tests/concurrency.db.test.ts`): real parallel
  transactions on a throwaway PostgreSQL (`TEST_DATABASE_URL`; skipped
  without it).
- Pure rules: billing and VAT, credit, approvals, reminders, imports and
  exports, WhatsApp messages, emails, Enyo's guardrails.

The other workspaces: `npm run test --workspace=packages/database` (the
audit journal, database addresses), `--workspace=packages/enyo` (the model
client, agent loop, tool checks, guardrails) and `--workspace=apps/website`
(the customer portal's rules and Enyo for customers).

## 3. Browser tests (`e2e.yml`)

The specs are in `apps/portal/e2e/*.spec.ts`, with the test people in
`e2e/people.ts`, the test data in `e2e/seed.ts` and the shared steps in
`e2e/helpers.ts` and `e2e/workflows.ts`. Every spec uses its own data, so
specs never step on each other. They cover signing in and out, the role ×
page matrix (`e2e/role-matrix.spec.ts`), the Job Card from check-in to
check-out, estimates and approval links, billing and credit, the parts
store, customers and the customer portal, imports and exports, the recycle
bin, notifications, reminders, Enyo, phone layouts and error handling.

Running them on your own computer (a database of your own; never
production):

```bash
# a fresh database, the schema, the seed and the test data
npx prisma db push --schema=packages/database/prisma/schema.prisma
for f in scripts/postdeploy/*.sql; do npx prisma db execute --file="$f" --url="$DIRECT_URL"; done
npm run seed --workspace=packages/database
npx tsx apps/portal/e2e/seed.ts

# both apps as production builds
npm run build --workspace=apps/portal && (cd apps/portal && npx next start -p 3001 &)
npm run build --workspace=apps/website && (cd apps/website && npx next start -p 3002 &)

# the tests (E2E_BASE_URL and E2E_WEBSITE_URL default to these addresses)
npx playwright test --config=apps/portal/e2e/playwright.config.ts
```

Point `SMTP_*` at a local mail catcher (Mailpit) so the email steps can read
what was sent. Screenshots of failures are kept in
`apps/portal/test-results/` (not committed).

The browser tests are being brought up to date with the new roles and the
new workshop flows phase by phase; Phase 9 finishes a test for every
workflow and every role.

## 4. Security tests (`security.yml`)

- **Secrets:** Gitleaks over all history and the built client bundles; no
  secret, environment variable name or source map may reach the browser.
- **Static analysis:** Semgrep registry rules (report only) and the
  project's own rules in `.semgrep/` (an ERROR fails the build).
- **Database exposure:** with Supabase's roles recreated, RLS must be on for
  every table and every attempt as `anon` or `authenticated` refused.
- **Access control:** cron routes without the secret, every role against
  every page, cross-organisation pages and print views, an IDOR sweep over
  record ids, every server action called signed out, and privilege
  escalation attempts.
- **Concurrency:** bursts of the same payment, approval and stock action
  against real server actions; every invariant must hold.
- **Dynamic scan:** OWASP ZAP baseline on both apps, signed out and signed
  in.

## 5. Load

`apps/portal/e2e/load.ts` measures p50, p95 and p99 for the main pages and
searches against the running test instance. For a real load test, run it
against a staging copy on the production providers and watch Supabase's
reports at the same time ([RUNBOOKS.md](RUNBOOKS.md) §4).

## 6. Before every push to `main`

```bash
npm run lint && npm run typecheck
npm run test --workspace=apps/portal
npm run test --workspace=packages/database
npm run test --workspace=packages/enyo
npm run test --workspace=apps/website
npm run build
```

and, for any change a person sees, screenshots of the changed pages on a
desktop and a phone.
