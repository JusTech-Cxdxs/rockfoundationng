# Roles and access: what each person sees

The roles at Rock Foundation Automobile, what each one does, what it
approves and what it never sees. The rules live in code:
`apps/portal/lib/authz/catalogue.ts` (permissions, `ROLE_GRANTS`,
`OPTIONAL_ROLE_COVER`), `lib/authz/navigation.ts` (the menu) and each page's
server-side guard. The Roles and Permissions pages show the same
descriptions to the Owner.

Three things hold for everyone:

- **Pasted links do not get round the menu.** Every page checks the
  permission on the server and sends people without it to *Access denied*;
  every server action checks again.
- **Nobody approves their own request**, and an import is never approved by
  the person who prepared it.
- **Notifications are personal.** The bell and the dashboard's *Needs your
  attention* list only steps waiting on that person.

## The roles

| Role | Always on? | Scope | What they do |
|---|---|---|---|
| **Owner / GMD** | Yes | Whole business | Sees and does everything. Gives final approval to estimates (when the workshop sets it), discounts above the limit, closing and cancelling jobs, credit notes, credit and stock adjustments; sees the warranty report. The only role that sees **cost prices, margins, stock value and profit** (`store.cost.view`). Manages staff, roles, settings, the Recycle bin, imports and the audit trail. |
| **Front Desk / Customer Care** | Yes | The workshop | Receives vehicles and customers, registers customers and vehicles, opens Job Cards, prepares estimates, sends estimates and updates (email and WhatsApp), records payments, asks for credit notes, sees what customers owe (statements and ageing), asks for a job to be closed or cancelled, works the Support centre (requests and complaints), sees parts at selling price, brings in Excel files and exports lists. |
| **Workshop Supervisor / Service Advisor** | Optional | The workshop | Accepts supervising a job, assigns technicians, inspects, writes and checks estimates before the Owner, works on jobs, raises parts requests and gives them first approval. |
| **Technician** | Optional | Their own jobs | Sees only the jobs assigned to them; inspects, records the work, writes estimate lines and raises parts requests on those jobs. |
| **Store Keeper** | Optional | The workshop | Parts and their selling prices, stock and reorder levels, goods received from suppliers, matching estimate parts to stock, approving and issuing parts requests. Sees selling prices, not cost prices or margins. |
| **Accounts** | Optional | The workshop | Records payments (cash, transfer, POS) and refunds, asks for credit notes, sees what customers owe (statements and ageing), records and follows warranty claims to suppliers, sees customers and Job Cards, exports lists including customers' contact details and payments. |
| **Security** | Optional | The workshop | The gate: vehicles in the compound, vehicles leaving, gate passes. |

The platform administrator (JusTech) is separate from these roles. It is
shown to the workshop as "Platform support" and is used for set-up and
support only.

## Optional roles and who covers them

The Owner switches the five optional roles on in **Settings → Roles**. The
choice is stored on the organisation (`optionalRoles`) and takes effect
within a minute.

While a role is **off**:

- people who hold it get nothing from it;
- **Front Desk takes over its steps**, so no step of the workshop is left
  without someone to do it;
- the Owner can always do anything.

| Role switched off | Front Desk then also does |
|---|---|
| Workshop Supervisor | Supervise jobs, assign technicians, inspect, approve estimates before the Owner, raise parts requests |
| Technician | Carry out the work, inspect, raise parts requests |
| Store Keeper | Manage parts and stock, record goods received, match estimate parts, issue parts to jobs |
| Accounts | Record refunds, follow warranty claims to suppliers, export files with contact details or payments |
| Security | Run the gate |

A small workshop can run on the Owner and Front Desk alone; each optional
role is switched on when there is a person to fill it.

## Cost prices and profit

Cost prices, margins, stock value and profit need `store.cost.view`, which
only the Owner holds by default. The Store Keeper records goods received
(what a delivery cost is on the supplier's invoice) but does not see the
catalogue's cost prices, the pricing and margin pages, stock value or
profit. Business Analytics (revenue, cost, profit, cash) needs
`analytics.business.view`, also Owner-only by default.

## Scopes

- **Whole business (ALL):** every branch of the organisation. Only the
  Owner.
- **The workshop (BRANCH):** the branch the person belongs to. Rock
  Foundation runs one workshop today (Ota), so this is everything in the
  workshop.
- **Their own jobs (ASSIGNED):** only Job Cards where they are the assigned
  technician or supervisor.

## Adding a permission to a role

The Owner may add a catalogue permission to a role on the Roles page, for
example letting Accounts see business analytics. Roles cannot be given a
permission that is not in the catalogue, and the platform-only steps (listed
on the Permissions page) can never be granted to the organisation's roles.

## Which pages each role sees

| Area | Owner | Front Desk | Supervisor | Technician | Store Keeper | Accounts | Security |
|---|---|---|---|---|---|---|---|
| Dashboard, notifications, reminders, profile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Workshop (Job Cards, vehicles in custody, service tracker) | ✓ | ✓ | ✓ | own jobs | ✓ (read) | ✓ (read) | |
| Customers and the Support centre | ✓ | ✓ | read | | | read | |
| Parts store | ✓ | read | read | read | ✓ | read | |
| Goods received | ✓ | | | | ✓ | | |
| Pricing, margins, stock value | ✓ | | | | | | |
| Gate | ✓ | | | | | | ✓ |
| Money: what customers owe, credit notes | ✓ | ✓ | | | | ✓ | |
| Warranty: report | ✓ | | | | | | |
| Warranty: claims to suppliers | ✓ | | | | | ✓ | |
| Business Analytics | ✓ | | | | | | |
| Data Exchange (imports) | ✓ | ✓ | | | | | |
| Exports | ✓ | ✓ | | | ✓ | ✓ | |
| Staff, roles, settings, business details, audit, recycle bin, integrity | ✓ | | | | | | |

A switched-off optional role sees nothing from that role; Front Desk gains
the cover above.
