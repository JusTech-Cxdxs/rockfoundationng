# Operations checklist (hosting, firewall, spend, backups)

What JusTech and the Owner set up in the hosting dashboards. The code cannot
do these things for itself. Each item is marked:

- **[Before release]**: do it before the system is used for real work.
- **[Recommended]**: do it soon after; it reduces risk or cost.

Providers rename menus from time to time; if a label differs, search the
provider's documentation for the feature name in bold.

---

## 1. Environment variables

Names only. Values never go into the repository, chat or tickets. Every
variable, with an example and a note, is in [.env.example](../.env.example).

### Staff portal (Vercel project for `apps/portal`)

| Variable | Needed | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Pooled Postgres connection (Supabase transaction pooler, port 6543, `pgbouncer=true`) |
| `DIRECT_URL` | yes | Direct Postgres connection (schema changes at deploy) |
| `BETTER_AUTH_SECRET` | yes | Long random secret, the same in both projects |
| `BETTER_AUTH_URL` | yes | The staff portal's public address, e.g. `https://portal.rockfoundationng.com` |
| `NEXT_PUBLIC_PORTAL_URL` | yes | The staff portal's public address (links in emails and print-outs) |
| `NEXT_PUBLIC_WEBSITE_URL` | yes | The customer portal's public address (customer links) |
| `NEXT_PUBLIC_ORGANISATION_NAME` | yes | `Rock Foundation Automobile`, on the sign-in pages |
| `NEXT_PUBLIC_SITE_TAGLINE` | recommended | `Trust your vehicle to the certified service experts.`, on the sign-in pages |
| `CRON_SECRET` | yes | Long random secret for the scheduled jobs |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | yes | Outgoing email |
| `PLATFORM_OWNER_EMAIL` | yes | The platform owner account (JusTech) |
| `MASTER_ADMIN_NAME`, `MASTER_ADMIN_EMAIL`, `MASTER_ADMIN_PASSWORD` | first deploy | The first sign-in; remove the password once the account exists |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | recommended | Instant notifications; also cuts each open tab's regular checks |
| `DATABASE_SPACE_LIMIT_MB` | recommended | The database plan's size in MB (`8000` on Supabase Pro). Imports that would not fit are refused and a load near the limit pauses; `0` switches the checks off |
| `BETTER_AUTH_TRUSTED_ORIGINS` | optional | Extra addresses allowed to sign in (e.g. the `vercel.app` address next to the custom domain) |
| `SERVER_ACTIONS_ALLOWED_ORIGINS` | optional | Only if a proxy in front changes the host name |
| `AUTH_SIGNIN_PER_MINUTE`, `AUTH_RESET_REQUESTS_PER_5_MIN` | optional | Sign-in limits per address (defaults 20 and 5) |
| `RECYCLE_BIN_DAYS` | optional | Days a record deleted by mistake can be restored (default 30, kept between 7 and 90) |
| `MAILBOX_ENCRYPTION_KEY` | for the Support centre's mailboxes | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts each connected support mailbox's password. Changing it disconnects every mailbox |
| `ENYO_LLM_PROVIDER`, `ENYO_LLM_API_KEY` | for Enyo | `anthropic` and an Anthropic Console API key (console.anthropic.com → API Keys; billing set up and a monthly spend limit set). Without them Enyo shows "not switched on yet" and everything else works |
| `ENYO_LLM_MODEL`, `ENYO_LLM_FAST_MODEL`, `ENYO_LLM_PROVIDER_LABEL` | recommended | `claude-opus-5-5`, `claude-haiku-5-5` (both the defaults) and `Anthropic Claude`, the name shown on Settings → Enyo |
| `ENYO_LLM_EFFORT`, `ENYO_LLM_FAST_EFFORT`, `ENYO_LLM_TIMEOUT_MS`, `ENYO_REQUESTS_PER_MINUTE`, `ENYO_LLM_ROUTING`, `ENYO_LLM_FALLBACK_MODELS` | optional | How much each model thinks; the time limit per request; questions per person per minute (default 20); whether short questions use the faster model; models to try when the main one is unavailable |
| `ENYO_WEB_LOOKUP`, `ENYO_FREE_WEB_SEARCH` | optional | `off` stops Enyo looking up general knowledge on the web (only the topic words are ever sent) |
| `SERPER_API_KEY` or `BRAVE_SEARCH_API_KEY` or `TAVILY_API_KEY` | optional | A web search engine for Enyo's general-knowledge answers (the first set is used) |
| `MAIL_OBSERVER_BCC` | optional | A copy of every outgoing email to these addresses, or `off` |
| `DEMO_STAFF_PASSWORD` | for the demo | One password (8+ characters) for every demo sign-in ([DEMO.md](DEMO.md)). While it is set, each production build makes the demo organisation (Rock Foundation Automobile (Demo), kept apart from the real one) and makes or refreshes its demo people. Not set: no demo at all |
| `DEMO_CUSTOMER_PASSWORD` | optional | The customer-portal demo sign-ins' password; the staff password when not set |
| `RESET_DEMO_PASSWORDS` | optional | `yes` sets every demo password again on the next build. Set it for one deploy, then remove it |
| `DEMO_ORG_SLUG` | optional | The demo organisation's short name when none is marked yet (default `rock-foundation-demo`). The real organisation, or any organisation with its own customers or job cards, is refused |
| `DEMO_DAILY_ACTIVITY` | optional | `off` stops the demo organisation's daily working day. Never touches the real organisation and never emails |
| `DEMO_LOAD` | optional | `off` stops the build loading the demo records into the demo organisation the first time |
| `DEMO_STRICT` | optional | `1` makes a demo problem stop the build (by default it is reported and the app still deploys) |

### Customer portal (Vercel project for `apps/website`)

| Variable | Needed | What it is |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | yes | As above |
| `BETTER_AUTH_SECRET` | yes | The same value as the staff portal |
| `NEXT_PUBLIC_WEBSITE_URL` | yes | This site's public address |
| `NEXT_PUBLIC_PORTAL_URL` | yes | The staff portal's address (links in emails sent to staff) |
| `NEXT_PUBLIC_ORGANISATION_NAME` | yes | Display name: header, footer, page titles, emails |
| `NEXT_PUBLIC_ORGANISATION_LEGAL_NAME` | recommended | `Rock Foundation Automobile Investment Ltd`, for the copyright line |
| `NEXT_PUBLIC_SITE_TAGLINE`, `NEXT_PUBLIC_SITE_DESCRIPTION` | recommended | Page title suffix and search description |
| `NEXT_PUBLIC_CONTACT_ADDRESS`, `NEXT_PUBLIC_CONTACT_PHONE`, `NEXT_PUBLIC_CONTACT_EMAIL` | optional | Footer contact lines (the workshop's published facts are used when not set) |
| `NEXT_PUBLIC_SOCIAL_FACEBOOK`, `_LINKEDIN`, `_X`, `_YOUTUBE`, `_INSTAGRAM` | optional | Footer social links (hidden when not set) |
| `SMTP_*` | yes | Outgoing email (customer password reset, estimate approvals) |
| `CUSTOMER_SIGNIN_PER_MINUTE`, `CUSTOMER_RESET_REQUESTS_PER_5_MIN` | optional | Sign-in limits per address |
| `ENYO_LLM_*` | for Enyo | The same model settings as the staff portal, for Enyo in the customer portal and on the support page |
| `WEBSITE_ORGANISATION_SLUG` | for Enyo | `rock-foundation`: the organisation this site belongs to |
| `ENYO_IP_HASH_KEY` | recommended | A long random secret used only to hash visitors' addresses for rate limits |
| `ENYO_CUSTOMER_PER_MINUTE`, `ENYO_PUBLIC_PER_MINUTE`, `ENYO_PUBLIC_PER_DAY`, `ENYO_PUBLIC_IP_PER_MINUTE`, `ENYO_PUBLIC_IP_PER_DAY` | optional | Chat limits (defaults 12, 6, 60, 20, 200) |

### Both projects: automatic WhatsApp (optional, off until set)

| Variable | | What it is |
| --- | --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | optional | Meta's permanent System User token. Unset: nothing is sent automatically; the Send on WhatsApp buttons still work |
| `WHATSAPP_PHONE_NUMBER_ID` | with the token | The business phone number's ID (WhatsApp Manager → API setup) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | recommended | Lets Settings → WhatsApp show each template's approval |
| `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_TEMPLATE_LANGUAGE` | optional | Defaults `v27.0` and `en` |

Set the same values in both projects, then redeploy both (docs/SETUP.md, 5a).

### QuickBooks Online (optional, portal only)

`QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_TOKEN_KEY`
(32 random bytes, base64; keep it, or the Owner must connect again) and
`QBO_ENVIRONMENT` (`sandbox` or `production`). Off unless all are set; the
QuickBooks Desktop and CSV exports need none of them (docs/SETUP.md, 5b).

### Planned, not read by the code yet

`R2_*` (nightly backup copy, Phase 9) is listed in
`.env.example` so the settings can be prepared. Each stays off until its
phase is released and the Owner switches it on.

### Never in production

`MAILBOX_ALLOW_INSECURE` and `TEST_DATABASE_URL` are for the test servers
only. The portal ignores the first on a production build outside CI; neither
should ever be set on Vercel.

### Rules that apply to every project

- **[Before release]** In Vercel → Project → **Settings → Environment
  Variables**, give each variable the right **Environments** (Production,
  Preview, Development). Production secrets should not be visible to Preview
  deployments.
- **[Before release]** Mark secrets as **Sensitive** when adding them (Vercel
  then never shows the value again).
- `NEXT_PUBLIC_*` values are built into the pages. After changing one,
  **redeploy** the project.
- A production build on Vercel **stops with a clear message** when a
  required variable is missing (`next.config.ts` in each app). The live site
  keeps running on the previous deployment until the variable is set and you
  redeploy.

---

## 2. Vercel (staff portal and customer portal)

### Plan

- **[Before release]** Vercel's Hobby plan is for personal, non-commercial
  use. A company system belongs on **Pro**, which also unlocks Spend
  Management, more firewall rules and longer rollback history.

### Node.js version

- **[Before release]** The repository asks for **Node 24** (`engines` in
  `package.json`, `.node-version`). Check after the first deploy: Project →
  **Settings → Build and Deployment → Node.js Version** shows 24.x.

### Spend Management

**[Before release]**
1. Team → **Settings → Billing → Spend Management**: turn it on.
2. Set the **On-Demand Budget** (monthly, USD) to the most you are willing
   to pay above the plan's included credit.
3. Notifications at 50%, 75% and 100% are on by default.
4. Decide on **Pause Production Deployments**. For a business system, a
   notification is usually better than an automatic outage; set the budget
   high enough that pausing is a last resort.

### Firewall (WAF)

The code already limits sign-in attempts per address (20 a minute) and form
submissions per person on each server instance. The firewall adds a limit
across all instances, at the edge.

**[Before release]** Project → **Firewall** → **Configure** → **+ New Rule**,
then **Review Changes → Publish**:

| Project | Name | If | Then |
|---|---|---|---|
| Staff portal | Sign-in flood | Request Path starts with `/api/auth/` | **Rate Limit**, Fixed Window, 60 s, 30 requests, key IP |
| Customer portal | Customer sign-in flood | Request Path starts with `/api/auth/` | Rate Limit, 60 s, 30, IP |
| Customer portal | Customer portal flood | Request Path starts with `/customer-portal` and Method equals `POST` | Rate Limit, 60 s, 60, IP |

Start each rule with the **Log** action for a day, check for false positives
(a whole office shares one internet address), then switch it to 429.

**[Recommended]**
- Keep Vercel's managed protections on (**Bot Protection**, managed
  rulesets).
- **Attack Challenge Mode**: leave off normally; turn on during an attack.
  Afterwards, confirm the scheduled jobs (`/api/cron/*`) still ran.
- A custom rule to **Deny** common probe paths that never exist here
  (`/wp-admin`, `/.env`, `/phpmyadmin`).

### Deployment Protection

- **[Before release]** Project → **Settings → Deployment Protection** →
  **Vercel Authentication**: on, **Standard Protection**. Preview
  deployments then need a Vercel login. Production stays public.

### Cron jobs

- The staff portal's daily job is in `apps/portal/vercel.json`
  (`/api/cron/pricing-alerts`). Check under Project → **Settings → Cron
  Jobs** after the first deploy. The frequent jobs (the Support centre) are
  called by the Supabase scheduler ([SETUP.md](SETUP.md)).

### Rollback

- **[Before release]** Know the steps: Project → **Deployments** → the last
  good production deployment → **⋯** → **Instant Rollback**. Takes seconds;
  no rebuild.
- A rollback does not undo database changes. Schema changes are additive
  only, so older code keeps working against the newer database.

### Custom domain

- **[Recommended]** Add the subdomains under Project → **Settings → Domains**,
  for example `portal.rockfoundationng.com` (staff) and
  `my.rockfoundationng.com` (customers). Then set `BETTER_AUTH_URL`,
  `NEXT_PUBLIC_PORTAL_URL` and `NEXT_PUBLIC_WEBSITE_URL` to the new
  addresses in **both** projects, update the addresses in the Supabase
  scheduler, and redeploy. Keep the old `vercel.app` address working by
  listing it in `BETTER_AUTH_TRUSTED_ORIGINS` during the move.
- **HSTS preload**: both apps send
  `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
  Submitting rockfoundationng.com to hstspreload.org makes HTTPS permanent
  for **every subdomain**, and is slow to undo. Submit only when every
  subdomain of the company domain serves HTTPS.

---

## 3. Supabase (database)

Sign-in is handled by the app (Better Auth), not by Supabase Auth, so
Supabase's own auth settings do not apply.

### Backups and restore

- **[Before release]** Supabase Pro includes **daily backups** kept for 7
  days (**Database → Backups**).
- **[Recommended]** **Point-in-Time Recovery** (Project → **Settings →
  Add-ons**): restore to any second, not just the daily copy. Worth it once
  real money and job cards are in the system.
- **Planned:** a nightly copy to Cloudflare R2 (`R2_*`), kept outside
  Supabase.
- **[Before release]** Test a restore once, and write down the date
  ([RUNBOOKS.md](RUNBOOKS.md) §2).

### Network and connections

- **[Before release]** **Database → Settings → SSL Configuration**: turn on
  **Enforce SSL on incoming connections**.
- **[Recommended]** Connection pooler: the apps connect through the
  transaction pooler (port 6543, `pgbouncer=true`). If Vercel functions
  report "too many connections" under load, lower `PRISMA_CONNECTION_LIMIT`.
- **[Recommended]** Rotate the database password if it was ever shared, then
  update `DATABASE_URL` / `DIRECT_URL` in both projects.

### Data API

- Every table has row-level security switched on with no policies, and the
  `anon` / `authenticated` roles have no rights
  (`scripts/postdeploy/0001-rls-default-deny.sql`, run after every
  production deploy, so new tables are covered). The public API key
  therefore reads nothing.
- **[Recommended]** If instant notifications are not used, switch the Data
  API off (Project → **Settings → Data API**).

### Account

- **[Before release]** Turn on MFA for every Supabase account with access,
  and remove people who no longer need it.
- **[Recommended]** Set usage alerts under the organisation's **Billing**
  page.

---

## 4. GitHub

- **[Before release]** **Settings → Code security**: turn on **Secret
  scanning**, **Push protection** and **Dependabot alerts**.
- **[Recommended]** Require MFA for everyone in the GitHub organisation.
- **[Recommended]** A ruleset on `main` that blocks force pushes and
  deletions. CI (`build`) runs on every push to `main`; the browser and
  security workflows run on pull requests.

---

## 5. After each release

- [ ] The production deploy succeeded on both Vercel projects.
- [ ] `https://<staff portal>/api/health` and `https://<customer portal>/api/health` answer `ok`.
- [ ] Sign in to the staff portal, open the dashboard, sign out.
- [ ] The customer portal sign-in page loads; the "Forgot password" email arrives.
- [ ] Response headers on the staff portal include `Content-Security-Policy` with a `nonce-` value and `x-request-id`.
- [ ] Settings shows every scheduled job ran on time.
