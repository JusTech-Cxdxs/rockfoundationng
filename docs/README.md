# Documentation

The documents for Rock Foundation Automobile's workshop system (EJO). Start
with the top-level [README](../README.md) for what the system is and how to
run it.

## Start here

| Document | For | What it covers |
|---|---|---|
| [SETUP.md](SETUP.md) | JusTech, the Owner | Supabase, Vercel, environment variables, the first sign-in, business details, email, scheduled jobs, the domain, bringing in records |
| [DEPLOY.md](DEPLOY.md) | JusTech | What runs where, every setting by name, the first deploy and every later one, the checks after a deploy, the nightly backup to R2 and the restore, rolling back |
| [DEMO.md](DEMO.md) | Anyone presenting | The demo organisation, who to sign in as, a 15-minute tour for the GMD and the board |
| [ROLES_AND_ACCESS.md](ROLES_AND_ACCESS.md) | The Owner, administrators | The seven workshop roles (Owner and Front Desk always on, five optional), Front Desk's cover, cost prices, which pages each role sees |

## How it works

| Document | What it covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the system is put together; system design and scale; adding a module; changing the database; coding rules |
| [ARCHITECTURE_BASELINE.md](ARCHITECTURE_BASELINE.md) | The binding security and integrity rules every change keeps |
| [ACCESSIBILITY.md](ACCESSIBILITY.md) | The accessibility standard (WCAG 2.2 AA): field labels, the text colours that keep 4.5:1 in light and dark, lists, tables, headings and landmarks, and how to check a change |
| [ENYO.md](ENYO.md) | Enyo, the assistant: where it appears, what keeps it safe, how it learns, switching it on |
| [SUPPORT_CENTRE.md](SUPPORT_CENTRE.md) | Customer requests and complaints: teams, addresses, Enyo's part, the rules, the numbers |

## Data

| Document | What it covers |
|---|---|
| [DATA_MIGRATION.md](DATA_MIGRATION.md) | Bringing staff, customers, vehicles, parts, stock and history in from Excel, CSV and QuickBooks exports; the cut-over checklist; exports |

## Operations

| Document | What it covers |
|---|---|
| [OPERATIONS_CHECKLIST.md](OPERATIONS_CHECKLIST.md) | Every environment variable; Vercel, Supabase and GitHub settings; checks after each release |
| [RUNBOOKS.md](RUNBOOKS.md) | Hardening steps, proving the database is closed, restore drills, failure drills, when to add infrastructure, scheduled jobs |
| [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) | What is in place, what is left for later, and the steps before go-live |
| [TESTING_PROGRAMME.md](TESTING_PROGRAMME.md) | The CI, browser and security tests, and how to run them |

## Editing these documents

- Plain Nigerian business English, short sentences; ₦12,345.00, DD/MM/YYYY,
  Africa/Lagos, km.
- Describe what the code does now. Name a file when a reader has to go
  there; check that it exists.
- No real staff names; examples use invented names and example.com
  addresses.
- When a rule in the code changes, change the document in the same push.
