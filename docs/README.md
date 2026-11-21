# Documentation index

Every document in this folder, grouped by what it is for. All are plain
Markdown and can be edited in any text editor or on GitHub.

This is the **D'Phoenix Autocare** edition of EJO 100: the workshop, the
customers (with fleet companies on credit), billing, the customer portal,
security, scheduling, analytics and Enyo are on; the Store (inventory),
Warranty, the assembly plant and the SAP link are switched off
(`apps/portal/lib/modules.ts`). Records come in and go out as Excel or CSV
files (Zoho exports included).

Two kinds of document live here:

- **Current reference**: describes the system as it is and is kept up to
  date.
- **Historical record**: a report written at a point in time (a test
  programme, an assessment). It is kept as evidence and is not updated.
  Counts and "planned" items in a record are as of its date. Each one is
  marked *Record* below with that date.

If a record and a current reference disagree, the current reference and
the code are right.

## Start here

| Document | What it is |
|---|---|
| [../README.md](../README.md) | What this edition is, how to set it up, the demo and the switches. |
| [DPHOENIX_SETUP.md](DPHOENIX_SETUP.md) | Setting up D'Phoenix Autocare from an empty account: hosting, the first sign-in, staff, billing, bringing in the Zoho and Excel records, email, and going live. |
| [DPHOENIX_DEMO.md](DPHOENIX_DEMO.md) | The D'Phoenix Autocare demo: how to switch it on, who to sign in as, a 15-minute tour and what each scenario shows. **Generated file**: do not edit by hand. Change `apps/portal/lib/demo/tour.ts` or `people.ts` and run `npm run demo:tour-doc`; a test fails if the file and the code differ. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the system is built: the three applications, how a request flows, the organisation and branch fences, how to add a module, coding rules. |

## How it works

| Document | What it is |
|---|---|
| [ARCHITECTURE_BASELINE.md](ARCHITECTURE_BASELINE.md) | The binding architecture and security rules in full: identity, tenancy, roles, scopes, audit, concurrency, deployment. Pull requests are reviewed against it. Its counts (tables, permissions, roles, tests) are as of 12 October 2026. |
| [ROLES_AND_ACCESS.md](ROLES_AND_ACCESS.md) | What each role sees, does and approves, and what it never sees, including who may run imports and exports. |
| [SUPPORT_CENTRE.md](SUPPORT_CENTRE.md) | The support centre: how a request flows, teams and addresses, the rules that keep it safe, the figures, how to run it. |
| [ENYO_CONTEXT_AND_INTEGRITY.md](ENYO_CONTEXT_AND_INTEGRITY.md) | How Enyo recognises who is writing, how its replies are checked, the integrity watch, and the decision model. |
| [ENYO_BRIEF_AND_LEARNING.md](ENYO_BRIEF_AND_LEARNING.md) | Enyo's daily brief, how it adapts to each role, and what it learns from. |
| [ML.md](ML.md) | The Python training package in `ml/`: the prediction tasks, data quality rules, how to switch training on, how to change a model. |
| [AI_READINESS.md](AI_READINESS.md) | The rules for what Enyo may read and do: data classification, the tenant fence for retrieval, the service boundary, audit, privacy. Written as an assessment on 12 October 2026 and extended since. |

## Operations

| Document | What it is |
|---|---|
| [OPERATIONS_CHECKLIST.md](OPERATIONS_CHECKLIST.md) | What the owner sets in the hosting dashboards: environment variables per application, plans, firewall, spend limits, backups, custom domains, steps after each release. |
| [RUNBOOKS.md](RUNBOOKS.md) | Procedures: repository hardening, proving the database's public interface is closed, staging, the backup restore drill, the load test, failure drills, checking scheduled jobs. The boxes are for the operator to tick. |
| [FREE_PLAN.md](FREE_PLAN.md) | The free hosting plans the system runs on, the limits of each, and when to move to paid plans. |
| [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) | What is verified and in place, what was deliberately left out and when to add it, the recovery steps, and the remaining risks. Partly a record (Phase A close-out); the principles in §7 still bind. |

## Data

| Document | What it is |
|---|---|
| [DATA_MIGRATION.md](DATA_MIGRATION.md) | Bringing existing records in from Excel and CSV (Zoho exports included): the six steps of an import, who approves, every file layout this edition uses, the cut-over checklist, undo, exports and updates from an edited export. |

## Records

| Document | Date | What it records |
|---|---|---|
| [TESTING_PROGRAMME.md](TESTING_PROGRAMME.md) | 12 Oct 2026 | *Record.* The security, concurrency and load test programme: findings, how each was closed, how to run it again. The tests themselves still run in CI. |
| [E2E_COVERAGE.md](E2E_COVERAGE.md) | 12 Oct 2026 | *Record.* The browser test suite as it stood then: specs, the workflow-by-role matrix, defects found. The specs in `apps/portal/e2e/` are the current list. |
| [ENYO_RELEASE.md](ENYO_RELEASE.md) | Enyo 1.0 | *Record.* Release notes for Enyo: where it appears, its safety rules, how to switch it on, known limits. |

## Editing these documents

- Keep them plain Markdown. No generated HTML, no images that need a tool
  to rebuild.
- Do not edit `DPHOENIX_DEMO.md` by hand: it is written by a script and
  checked by a test.
- When a rule in the code changes, change the current reference in the
  same pull request. Leave the records as they are.
- Changes under `docs/` and to `*.md` files do not trigger the CI
  workflows.
