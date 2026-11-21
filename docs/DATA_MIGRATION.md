# Data migration — bringing existing records into EJO 100

How D'Phoenix Autocare's existing records — the customers and their
vehicles, the staff, past invoices and job cards, and the work in the
workshop on the day EJO takes over — come into EJO 100 from **Excel or CSV
files** (exported from Zoho Books, Zoho Invoice, Zoho CRM, Zoho People, an
old system, or kept as your own spreadsheets), **without retyping and without
risk to the live records**. Every list in EJO also goes back out to Excel or
CSV.

> In this edition: imports of staff, customers, vehicles, invoice history,
> job card history, open job cards, and open services and bookings; the
> cut-over checklist; exports from every list; updates from an edited
> export; documents in bulk; and scheduled exports. The Store, Warranty, the
> assembly plant and the SAP link are switched off
> (`apps/portal/lib/modules.ts`): their sections below say so in one line.

## 1. The principle

An import copies records **into** EJO from a file. It never writes back to
Zoho or any other system, and it never overwrites a record that is already in
EJO.

Every import goes through the same six steps, in the portal at
**Data Exchange** (`/data-exchange`):

| Step | What happens | Live records changed? |
| --- | --- | --- |
| 1. Upload | The file is read **in the browser** and sent in small blocks to a staging area. Any size up to a million rows; an interrupted upload is started again and nothing is counted twice. | No |
| 2. Match columns | Each column is matched to a field by its name. **Zoho's own column headers match themselves** (*Display Name*, *EmailID*, *Billing City*, *Invoice Number*, *Account Name*…), and so do the plain names people type in Excel. The matching can be saved as a profile ("Zoho contacts") for the next file. | No |
| 3. Check | Every row is checked with the **same rules as the front desk's own forms**, and matched against what is already in EJO. Result: ready, ready with a note, rejected, duplicate in the file, already in EJO. Rejected rows download as a file with a *Problem* column, to fix in Excel and upload again. | No |
| 4. Approve | A **second person** approves. The person who prepared the import cannot approve it (the platform administrator may, while nobody else holds the role; this is recorded). | No |
| 5. Load | Rows load in batches of 1,000. Each batch is all-or-nothing; the import is locked so two screens can never load it twice; it can be paused and resumed; a failed batch pauses the import with nothing saved from it. | Yes |
| 6. Report and undo | The report adds up: rows in the file = added + filled in + not added + rejected. The full row-by-row outcome downloads as a file. **Undo** moves exactly what the import added to the **Recycle bin** — each record its own item, restorable for the bin's retention period (30 days by default) — and empties only the fields it filled in. It is refused while any work has been recorded on those records since. | Undo reverses it (recoverably) |

Every step is in the audit trail (*Data exchange …* entries) with who, when
and the counts. The staged copy of the file is kept with its import; it is
deleted at once if the import is cancelled, and released once the import is
finished (section 9a).

## 2. Who does what

| Role | Prepare (upload, match, check, send for approval) | Approve, load, send back, undo |
| --- | --- | --- |
| Administrator (headquarters) | Yes | Yes, everything (never their own) |
| Group IT administrator | Yes | — (the business approves what goes in) |
| Branch administrator | Yes | — |
| Workshop manager | — | Customers, vehicles and invoice history of their branch; production / QC / PDI registers |
| Customer care lead | — | Customers, vehicles and invoice history |
| Store manager | — | Suppliers, parts and opening stock of their branch |
| Plant manager | — | The plant's shipments, vehicles, kits and kit issues (§7b2) |
| Finance officer | — | — · **confirms the totals** of loaded opening stock and invoice history |
| Everyone else (front desk, technicians, security…) | — | — |

Each kind of record is approved by the **department that owns it**: approving
customers also needs the right to manage customers; approving suppliers,
parts and stock needs the right to manage the Store's parts. Opening stock
and invoice history have a second signature: after they load, someone in
**Finance** (not the person who prepared or approved it) confirms the totals.
Finance opens those two kinds of import only — never a customers file.

## 2a. The cut-over checklist (P9)

**Data Exchange → Cut-over checklist** lists every workshop, warehouse and
assembly plant with how far its cut-over has come. A branch's page lists the
files it needs, in the order they load, each with where it stands —
worked out from the imports themselves, never typed in:

| Branch | Steps, in order |
| --- | --- |
| Workshop | Staff, customers, vehicles, suppliers, parts, opening stock, invoice history, job card history, open job cards, open services and bookings, warranties, open claims, registers |
| Warehouse | Staff, suppliers, parts, opening stock, invoice history |
| Assembly plant | Staff, plant shipments, plant vehicles, plant kits, plant kit issues |

- **States:** *Not started*, *Being prepared*, *Waiting for approval*,
  *Loaded* (with how many records it added and filled in), *Loaded —
  waiting for Finance to confirm the totals* (opening stock and invoice
  history), *Undone — load it again*, *Not needed*. Staff, customers,
  vehicles, suppliers, warranties and claims belong to the whole
  organisation: loaded once, they count on every branch's checklist.
- **Next:** the first step to do now is outlined; a step that names an
  earlier one (open job cards name their vehicle) says to load that first.
- **Not needed here:** a step the branch has nothing for (no open claims on
  the day) is marked so, with a reason, by someone who approves imports at
  that branch; *Needed after all* takes it back. A loaded step, or one
  under way, cannot be marked.
- **Signing off:** once every step is loaded (and confirmed by Finance,
  where it asks) or not needed, an approver signs the branch off as cut
  over. The sign-off records the whole checklist as it stood — each step's
  state, how many records, which imports, each reason. *Reopen*, with a
  reason, is for a file that has to be loaded again.
- Every mark, sign-off and reopening is an entry in the audit trail
  (`BranchCutover`, actions `data_exchange.cutover_*`): append-only, the
  latest counts, nothing is ever edited, and each is read back before the
  page says it is saved. The page shows that history, newest first.

## 2b. Staff (P7) — load first

The organisation's people (a staff list, or Zoho People's export) come in before
everything else, so the open job cards and services of the cut-over find
their technicians and supervisors by employee ID. **Staff** turns each row
into an EJO account:

- **Name, the person's own work email** (they sign in with it and their
  invitation goes to it — a shared mailbox gets a note), phone.
- **Branch** (its name or code) and **department** (as on the
  Structure page; must be in that branch).
- **Roles** by name, separated by `;` — by the role's own name, its slug, or
  the name EJO shows it under (*Front Desk* for the receptionist, *Manager*
  for the workshop manager). Roles must exist (Roles page). **The
  organisation's administrators are never brought in by a file**: an
  Administrator or Branch Administrator role is refused, whatever it is
  called; they are added by hand on the Users page.
- **Employee ID** from HR when given (it must be free); otherwise EJO issues
  the branch's next (ORG-BRANCH-NNNN). A personnel number from the HR or
  payroll records is kept and searchable.

**Switched off until invited.** Every account comes in switched off, with an
unusable password, and **nobody is emailed**. After loading, an
administrator of the whole organisation (the Organisation or IT
Administrator — never a Branch Administrator: the file reaches every
branch) presses **Send the invitations** on the import: each waiting
account is switched on and the person is emailed the same welcome as
someone added on the Users page — employee ID, roles, branch, what they may
do — with a one-time link to set their own password. Each person is invited
once (audited `user.invited`); the page shows the progress. One person at a
time: switch them on and send the welcome from the Users page. Until they are
invited, the cut-over's open job cards and services may still name them.

Approval: an **Organisation Administrator**. Refused: no name, no or a
malformed email, an email that has an account in another organisation, no
branch, a branch, department or role the organisation does not have, an
administrator role, an employee ID in use by someone else or with spaces and
signs. An email already in this organisation is left as it is (change their
roles on the Users page). The same email twice in a file is a duplicate.

**Undo** moves to the Recycle bin only the accounts never invited, never
signed in, with nothing done by or about them since; the bin keeps the person
and their roles, never a password or a link. A restored account comes back
switched off, with a new unusable password, ready for its invitation.

## 3. Customers

**Template:** Data Exchange → Customers → *Excel template* (with an
Instructions sheet and dropdowns) or *CSV template*.

| Field | Required | Recognised column names (examples) |
| --- | --- | --- |
| Customer number | — | Contact ID, Customer ID, customer number, account number |
| Name | **Yes** | Display Name, Contact Name, name, customer name (or First and Last Name) |
| Name, second line | — | name 2, name line 2 |
| Type | — | Individual / Organisation (empty: Organisation when a company name is given) |
| Company name | — | Company Name, Account Name, organisation |
| Email | — | EmailID, email, e-mail |
| Phone / Second phone | — | Phone, Mobile, mobile number / second phone |
| Address, City, State | — | Billing Address, Billing Street / Billing City / Billing State |
| Tax ID | — | TIN, tax number, VAT number |
| Payment terms | — | Payment Terms ("Net 30"), kept as a tag |
| Tags | — | tags, group, segment |
| Customer since | — | Created Time, created on, customer since, first purchase |

**Customer since.** The date the customer was created in Zoho or the old
system (written 02/06/2014, 02.06.2014, 20140602 or 2014-06-02) becomes the
customer's *customer since*. The CRM shows it ("Customer since 02/06/2014
(from the old system, customer 1000123) · in EJO 100 since …"), the newest-first list
sorts by it, and **new customers** — the CRM's *New this month* and
Headquarters' *New customers* — count people new to the business, not new
to the system: a long-standing customer imported today is not "new". A date
that cannot be read is a note (the import day is used), never a rejection.

**Matching an existing customer**, in this order: the customer number (from
the same source), then the email, then the phone.

- A match by number or email is **certain**: the customer is left as they
  are, or — if *fill in only empty fields* was chosen — gets only the fields
  that were empty. Nothing is ever overwritten.
- A match by **phone only** is a **possible duplicate** (families and fleets
  share phones). By default it is **not** added and is listed under
  *Possible duplicates* (with a link to the existing customer, and as a
  download) for someone to follow up. It is never merged silently.

**Old data with gaps loads with a note, not a rejection**: no phone, no
address, an email that is not valid (the customer is kept **without** it),
several emails in one cell (the first is kept), an address longer than the
80-character printed line (the line is shortened; the full address is kept as
an extra address). Only a row with **no name** is rejected.

**Customers without an email** are full customer records — job cards,
vehicles, warranties, history — reached by phone. They have no customer
portal access until their own email is added on their page. EJO never uses a
made-up or placeholder address. An email already registered for another
organisation on the platform is left off the new customer.

## 4. Vehicles

Load the **customers file first**: each vehicle is linked to its customer by
the customer number, email or phone.

| Field | Required | Recognised column names (examples) |
| --- | --- | --- |
| Customer number / email / phone | **one of them** | customer number, Customer ID / customer email / customer phone |
| Vehicle number | — | vehicle number, fleet number, asset number |
| Chassis number (VIN) | **VIN or plate** | VIN, chassis number, frame number |
| Plate number | **VIN or plate** | plate, registration, reg no |
| Engine number, Engine type | — | engine number / engine type |
| Make, Model, Year | — | make, brand / model / year, model year |
| Passenger or Commercial | — | category (empty: worked out from the model where it is obvious — a Hiace or a truck is commercial, a Camry is passenger) |
| Mileage (km) | — | mileage, odometer |

**Matching:** vehicle number (within the organisation), then VIN, then plate.
VINs and plates are unique on the platform: one registered for another
organisation is rejected. A VIN that is not the standard 17 characters is
kept as written, with a note.

## 5. Suppliers

Switched off in this edition (the Store is off, `apps/portal/lib/modules.ts`).

## 6. Parts

Switched off in this edition (the Store is off).

## 7. Opening stock

Switched off in this edition (the Store is off).

## 7a. Invoice history (before EJO)

The invoices each customer had before EJO 100 came in, so a long-standing
customer does not look new: **read-only history** that counts in the
customer's **lifetime spend, visits and last visit**, in the CRM list (spend,
*spend this year*, top spenders, last visit) and in **Headquarters** and the
analytics, always labelled **"Before EJO"**.

Load the **customers file first** (and the vehicles, to link invoices to
them). Choose the **branch** whose sales they were.

| Field | Required | Recognised column names (examples) |
| --- | --- | --- |
| Invoice number | **Yes** | Invoice Number, invoice no, document number |
| Invoice date | **Yes** | Invoice Date, date |
| Customer number | **Yes**, or the phone or the name | Customer ID, customer number |
| Amount (₦) | **Yes** | Total, amount, invoice total |
| Tax (₦) | — | tax, VAT amount — added to a net amount, so the history is gross |
| Currency | — | Currency Code — naira only |
| Balance, Due date, Status | — | Zoho's Balance, Due Date and Invoice Status (a void invoice is reported, never loaded) |
| Chassis number (VIN) | — | VIN, chassis — links the invoice to the vehicle |
| Description, Quantity, Item price | — | Item Name, Item Desc, Quantity, Item Price — added to the description |

From Zoho Books or Zoho Invoice: **Sales → Invoices → Export**. A file with
one row per item is understood: the first row of each invoice is loaded with
the invoice total, and its other rows are reported as the same invoice.

- **Each invoice loads once**: the number identifies it. Loading the same
  file again adds nothing; an invoice already in the history is *Already in
  the history*.
- **Credit notes** (a negative amount — `20000-` is understood too) reduce
  the customer's total.
- **Rejected:** no invoice number, no date or a date that is not a real day,
  a date in the future, no amount, a currency other than naira, a customer
  who is not in EJO. **A note:** a VIN that is not a vehicle in EJO yet (the
  invoice stays on the customer).
- **What the history is not:** it is never edited, paid, refunded or
  "outstanding"; it is not in EJO's own sales, margins, average job or
  projections (those stay EJO's work); and it is **never shown to the
  customer** in the customer portal.
- **The check shows the totals** — invoices, amount, first and last date — to
  compare with the invoice list in Zoho for the same period before approving; Finance
  confirms them after the load.

Where it shows: the customer's page (*Lifetime spend* "incl. ₦… from the
previous system", *Visits*, the 12-month chart, and **Jobs → From the
previous system, before EJO** with every invoice); the CRM list and its KPIs;
the vehicle's page (*Before EJO 100*); Headquarters (each branch's
*Collected* shows "+ ₦… before EJO" for the period, and a line under the
figures) and the analytics' top customers.

## 7a2. Job card history (P4)

The workshop's past is job cards: one per visit, with *Carry out service* or
the repair written on it. **Job card
history** loads them as **read-only history** into the **workshop branch**
they were done at: shown on the customer (**Jobs → Job cards before EJO**)
and on the vehicle (**Before EJO 100**), counted as a **visit** (once with
the invoice it was billed on, matched by its invoice number), searchable by
number, and exported in job card format (**Job card history (before EJO)**).

- **Every row is a job card.** There is no "job or service" column to fill:
  EJO reads the text — *carry out service*, *40,000 km service*, *periodic
  maintenance* — and marks that job
  card a **service** inside EJO. A service job card **starts the vehicle's
  next-service clock** (the Service tracker, the reminders, the vehicle's
  *Service history*) with the same interval rules as EJO's own services,
  until EJO completes a service of its own. Nothing a repair does changes.
- **Columns** (plain names, as on the template): job number (required);
  the customer number — or the customer's phone or email, or the vehicle by
  VIN or plate (the owner is used); opened on (required); completed on;
  mileage; complaint / work requested; work done; technician (staff only);
  bay; labour, parts, total; invoice number; status (Closed or Cancelled —
  an open job card is **refused**: open job cards have their own import);
  **Branch** (when given, must be the branch chosen for the import).
- **Refused:** no job number, no opening date, a future date, completed
  before opened, a job card still open, a customer EJO cannot find, a row
  for another branch. **Noted, not refused:** no completion date (the clock
  counts from the opening day), no VIN or plate (kept on the customer only,
  no clock), a vehicle not yet in EJO (links when the vehicles file is
  loaded and this file loaded again).
- Each job number is loaded once; undo **voids** (nothing deleted),
  reloading restores.

## 7a3. Open job cards at the cut-over (P5)

On the day EJO takes over, the vehicles already in the workshop keep their
job cards: **Open job cards** turns each row into a **live EJO job card** in
the chosen workshop branch, at the stage it is at, on the customer and the
vehicle already in EJO (load customers and vehicles first). Nobody is
emailed — the customer and the staff were told at the time.

What each job card carries:

- **Its old number**, kept (`externalId`) and searchable (*Old system job
  card 483211 → JC-2026-000045*); EJO gives it its own JC number; its
  opening date is the day the vehicle came in. A banner on the job card says
  where it came from and which import brought it.
- **Its stage**, mapped from the words people use:

  | In the file | EJO stage |
  | --- | --- |
  | empty, Checked in, Received | Checked in |
  | In progress, Work in progress, WIP | In progress |
  | Awaiting parts, Parts, On hold | Awaiting parts |
  | QC, Quality check, Inspection, Road test | Quality check |
  | Awaiting customer approval, Estimate sent, Quotation | Awaiting customer approval |
  | Completed, Done | Completed |
  | Ready, Ready for collection, Invoiced | Ready for collection |
  | Closed, Checked out, Collected, Cancelled | **refused** — history (§7a2) |

- **Its estimate as it stood**: labour, the parts already issued from the
  store (by part number when the catalogue has them; "x" quantity, "@" unit
  price), the rest of the parts as one line — marked **approved before
  EJO** (the job card's approval too). EJO's own approval flow is not
  replayed and **stock is not moved**: the opening stock already counts the
  issued parts out. *Estimate approved = No* leaves it submitted, waiting
  for the customer.
- **Deposits taken before EJO** as **opening payments** (bank transfer or
  cash, the old receipt number in the note), which **Finance confirms**
  after the load against the old system's receipts — the import's totals
  show them before approval.
- **Technician and supervisor by employee ID** (a name is tried too);
  nobody found leaves them unset for the workshop.
- A **Branch**/WERKS column, when given, must be the branch chosen.

Refused: no job number, no opening date, a future date, a closed or
cancelled job card, a stage EJO does not know, no VIN or plate, a vehicle not
in EJO, a vehicle that already has an open job card (one at a time), a row
for another branch. The second row for the same vehicle in a file is a
duplicate.

**Undo** moves the job cards nobody has worked on since the import to the
Recycle bin — each with its complaints, estimate and opening payments, so it
restores whole — and **keeps** (and reports) any job card that has had a
payment, a parts request, a warranty or anything else recorded on it since.

## 7a3b. Open services and bookings at the cut-over (P6b)

The routine services still in the workshop on the day EJO takes over, and
the bookings already in the diary for the days after, so nobody arrives
unexpected. **Open services and bookings** turns each row into an **EJO
Vehicle Service** in the chosen workshop branch, on the customer and the
vehicle already in EJO. Approval: a **Workshop manager** (or an
administrator). Nobody is emailed — the customers were told at the time.

| In the file | EJO |
| --- | --- |
| empty, Booked, Scheduled, Appointment, Confirmed | **a booking** (Scheduled): waits for the customer |
| Checked in, Received, CRTD | Checked in |
| In service, In progress, REL | In service |
| Completed, TECO | Completed |
| Ready for collection | Ready for collection |
| Closed, Collected, Cancelled, No show | **refused** — history (§7a2) |

- **A booking** needs its day (*Booked for*, e.g. 12.11.2026) and takes its
  time (*Time*, e.g. 09:30; empty: 09:00), in Lagos time. The service page
  says *Booked for 12 Nov 2026, 09:30 — check the vehicle in when it
  arrives*, the Vehicle Services list shows the day, and the front desk
  checks it in as any booking. A booking for a day already passed is kept,
  with a note (the customer has not come). A technician is not given to a
  booking: the workshop assigns one when the vehicle arrives.
- **A service in the workshop** needs the day it came in (*Checked in on*;
  never in the future) and carries on from its stage, accepted
  before EJO (the supervisor's acceptance is not asked again); the
  technician and supervisor are matched by employee ID (a name is tried).
- **Its old number** (the booking reference) is kept and searchable (*Old
  system booking BK-2026-0600 → SV-2026-000123*); EJO gives it its
  own SV number. A banner on the service says where it came from.
- **One open visit per vehicle** — a vehicle with an open job card or
  service in EJO is refused, and the second row for a vehicle in the file is
  a duplicate.

Refused: no number, a stage EJO does not know, a closed or collected
service, a booking with no day, a service in the workshop with no check-in
day or one in the future, no VIN or plate, a vehicle EJO does not have, a
vehicle with an open visit, a row for another branch.

**Undo** moves the services and bookings nobody has worked on since the
import to the Recycle bin, each with its complaints, so it restores whole;
one that has had anything recorded since (a check-in, a technician, an
inspection, a parts request, a payment — every step of a service is
audited) is kept and reported.

## 7a4. Warranties and open warranty claims

Switched off in this edition (Warranty is off).

## 7b. Production, QC and PDI registers

Switched off in this edition (the assembly plant is off).

## 7b2. The plant's records at the cut-over

Switched off in this edition (the assembly plant is off).

## 7c. Undoing history

Undo of an invoice-history or register import **voids** what it loaded: the
rows stop counting everywhere at once and are **kept** (nothing is deleted).
**Reopen** the import and load it again to restore exactly the same rows —
never a second copy.

## 8. File rules

- **CSV** (comma, semicolon, tab or pipe — worked out from the first line;
  UTF-8 or Windows-1252) or **Excel .xlsx** (first sheet).
- Column names in the **first row**. Blank rows are skipped but keep their
  numbers, so "row 5,212" in a report is row 5,212 in Excel.
- Refused: **macro workbooks (.xlsm)**, old **.xls** files (save as .xlsx or
  CSV), files over 1,000,000 rows (split them). The type is checked from the
  file's content, not its name.
- Excel dates come through as dates (2024-03-15); numbers Excel stored with
  rounding noise come through as people read them; formulas give their last
  saved value and are never run.
- Every downloaded file (rejects, possible duplicates, report, templates)
  neutralises spreadsheet formulas, so nothing typed into the system can run
  as a formula when opened in Excel.

## 9. Size, speed and the database

The staging area lives in the organisation's own Postgres database (no new
services). Every figure below was **measured**, not estimated.

### What keeps it fast at any size

- **Steady, few requests.** Each check, load or undo request works in blocks
  for about 2.5 seconds, then answers with its progress: about 25 requests a
  minute whatever the server's speed — well inside the portal's flood limit
  of 120 submissions a minute per person (`middleware.ts`). Uploads send at
  most one block every 0.6 s. (The first speed run found this limit: a check
  quicker than two requests a second was being refused. A test now pins the
  pacing to the limit.)
- **A row cursor.** Each block reads on from the last row number through the
  (import, row number) index, so block 800 is as quick as block 1.
- **Interruptions are harmless.** A request that fails or does not answer
  within two minutes is tried again (five times, about a minute in all, with
  "reconnecting…" on the bar), then the page offers *Carry on*. Every step is
  repeatable: a row is never checked or loaded twice. Closing the page and
  opening it again carries on where it was.
- **Lookups by index only.** Matching against existing parts, customers and
  vehicles uses the indexed number as written and in capitals — never a scan
  that changes every row's case.
- **The Store's screens are paged.** Parts Catalog (50 a page, searched on
  the server), the goods-receipt part picker (25 matches as you type) and the
  low-stock list (bounded) do not grow with the catalogue.

## 9b. Finding and tracing imported records

- **Search by the old system's number.** The search box at the top finds a
  record by the number Zoho or the old system gave it: customer, vehicle,
  past job card and invoice numbers from the history — with or without
  leading zeros. Such numbers have no prefix, so the same digits can be a
  customer and an invoice: every match is listed under *Old-system numbers*,
  labelled — *Old system customer 125262 · Ada Okafor*, *Old system invoice
  125262 · 2026*. Each person finds only what they may open (invoices are for
  people with the CRM).
- **Where it came from.** Customer, vehicle and part pages have a *Where this
  came from* box: created in EJO by whom and when, or *Imported from a
  spreadsheet* by **IMP-…** (its file, who approved it; the number opens the
  import for the people who may see imports), the old system's number, and
  the original date (a customer's *customer since*).
- **Filter the lists** — Customers and Vehicles — under *Where it came from,
  and when*: **Source** (created in EJO / imported from a spreadsheet), one **import number**, **Entered EJO** from–to
  (created or imported) and, for customers, **Customer since** from–to (the
  original date) — so "customers since 2018 or before who were imported last
  week" is one filter. Job Cards, services and warranties are always made in
  EJO, so they have no source to filter by.
- **Day by day.** *Data Exchange → Day by day* is a calendar of imports
  started, loaded, confirmed by Finance, undone, released and cancelled, and
  of lists exported (§9c); a day lists them, each opening its import or
  export.
- **With or without the history.** Headquarters, the business analytics and
  the CRM list have a switch: *With history before EJO* (the default) or *EJO only*
  (the invoices from before EJO left out of spend, visits, top customers and
  the per-branch figures). The Headquarters export follows the switch.

## 9a. Staged files: space and release

Each import keeps a copy of its file — every row — while it is checked,
approved and loaded (about 0.6 KB a row; a run of 800,000 rows took
513 MB). Once it is no longer needed it is
**released**:

- **When:** a set number of days after the import **finished** — counted
  from Finance's confirmation for opening stock and invoice history, never
  before it. **30 days** by default; an administrator changes it on the
  Data Exchange page (*Release a finished import’s file after … days*; 0 keeps
  every file for ever). The daily run at 8:00 releases what is due and is
  listed on the scheduled-jobs page (*Imported files released*).
- **Early:** an approver of that kind of record presses **Release it now** on
  the import.
- **What is kept:** the import's summary and counts; **every row's outcome**
  (status, the record it made, its notes) — so *Every row and its outcome*
  still downloads; the **rejected and duplicate rows** whole (the *to fix in
  Excel* file still downloads); **possible duplicates** whole (to follow up);
  and rows whose filled-in fields an **undo** would empty again. Undo keeps
  working after a release.
- **What goes:** the cells of every other row. A released import cannot be
  **reopened** — start a new import with the same file instead (it is
  recognised, and nothing is added twice).
- **Space:** the Data Exchange page shows the space all staged files take
  now and each import's own (*Staged file*); the import page shows its size,
  when it will be released, and who released it. Every release is in the
  audit trail with the space before and after.

Cancelling an import removes its staged file at once (nothing was loaded
from it).

## 9c. Exports: any list to Excel or CSV

Every list has an **Export** button — Customers, Vehicles, Parts, Stock and
value, Suppliers, Goods receipt lines, Job Cards, Vehicle Services,
Warranties, a customer's invoice history, Imports, Exports, People and roles,
the Audit trail, the Security register and Headquarters. Choose **Excel
(.xlsx)** or **CSV**.

- **Exactly the list.** The file holds every record that matches the list's
  filters and search (not just the page on screen), in the list's order —
  for the person downloading it: their organisation, branch and permissions
  today, the branch lens included. The Security register is the exception
  the file itself states: it holds what the register shows (the most recent
  several hundred of each kind); export the audit trail for a full period.
- **Built when downloaded, never stored.** Pressing Export records an
  export, **EXP-2026-000012** — which list, which filters, who, when — and
  the download starts at once. No copy of the data is kept anywhere; the file
  is built as it downloads.
- **24 hours, once per person.** The link works for 24 hours. Each person who
  may export that list can download it once; after that the link says so, and
  a fresh export gives a fresh file. A link shared with someone who may not
  export that list is refused (and the refusal is in the audit trail).
- **A long list comes in parts.** A download stops at a clean row boundary
  after about 40 seconds (or 2,000,000 rows) and says so: *More to come* in
  the file's About sheet, and **Download part 2** on the button and on the
  export's page. Each part is a complete file and carries on exactly where
  the last one stopped. In Excel, more than 1,048,575 rows continue on a
  numbered second sheet. One part downloads at a time per person.
- **Written to be used.** An *About this file* sheet comes first (the CSV
  has the same lines at the top, each starting with `#`): the list, the
  organisation, the export number, the filters, who exported and who
  downloaded it, when, and what is in it. Then a bold, frozen header row;
  real dates (dd/mm/yyyy, Lagos time); money as numbers with a *Currency*
  column (NGN); record numbers as text, so leading zeros stay; *Yes* /
  *No*; and a link back to each record. CSV is UTF-8 with a byte-order mark,
  so Excel opens ₦ and Nigerian names correctly.
- **Nothing runs as a formula.** Text that starts with `=`, `+`, `-` or `@`
  gets a leading apostrophe in CSV; Excel cells are always plain text.
- **Who may export.** *Export lists* (`dataexchange.export.run`) — the
  Administrator, Branch administrator, Workshop manager, Finance, Store
  manager, Customer care lead, Executive, Group IT, Warranty HOD and Chief
  security officer. Lists with **contact details or payments** — customers,
  invoices, invoice history and the audit trail (sign-in addresses) — also need *Export
  contact details and payments* (`dataexchange.export.sensitive`): the
  Administrator, Workshop manager, Finance and Customer care lead. Technicians,
  officers and the front desk export nothing. Exporting is refused during an
  assisted session, and a person may start 60 exports an hour.
- **Exports, tracked.** *Data Exchange → Exports* (or *Exports* in the menu)
  lists your exports — everyone's in the organisation for those who read the
  audit trail — with the filters, who downloaded each one, how many rows and
  how big. Search finds an export by its number. Every export and every part
  downloaded is in the audit trail (*data_exchange.exported*, with rows and
  size).

### Exports come back in (round trip)

An export of a list that Data Exchange also imports — customers, vehicles,
a customer's invoice history — can be uploaded again as it is: the importer
passes over the *About this file* sheet and the CSV's `#` lines, and every
column name an export writes is one the importer recognises (*Customer
number*, *Vehicle number*, *Invoice number*…). Files exported under earlier
column names are recognised too. A
leading apostrophe (how a CSV keeps `+234…` from running as a formula) is
not part of the value. Records already in EJO are recognised by their
numbers and never added twice. *Stock and value* is a report, not an
opening balance: it is not imported again.

### Updating records from an edited export (P10)

Export customers, vehicles, parts or suppliers, change what needs changing
in Excel, and upload the file as it is to the same import with **Update
customers (vehicles, parts, suppliers) exported from EJO**:

- **Found by the EJO record only.** Every export writes each record's EJO
  number (*EJO record*). A row is matched by it
  and by nothing else — never by a name, a phone or a guess — within the
  organisation (a part within the branch the import loads into). A row
  without one, or with one that is not the organisation's, is refused.
  Nothing new is ever added in this mode.
- **Only real changes.** Each row is compared with the record as it is now.
  The same value written another way is no change: a phone as *+234 803…*
  or *0803…*, a plate with or without its space, a number with its
  leading zeros, an email in capitals. **An empty cell leaves a field as it
  is**: a file never blanks anything.
- **What identifies a record stays.** A part's number, how it is tracked and
  its base unit, and a vehicle's chassis number (filled in if EJO has none)
  and owner are changed on their pages, never by a file; a mileage lower
  than EJO's is left out (an odometer only goes up). Values that must stay
  unique — a customer's email, a plate, a chassis number, a customer number — are
  refused when another record holds them.
- **Previewed before approval.** The check lists every change, row by row,
  as *Address: 3 Old Road → 12 New Road*, with how many records and fields
  change and each field counted. The approver (as for any import of that
  list) approves exactly that.
- **Applied only while still true.** The load locks each record and makes a
  change only if the record still holds what the preview said it held; a
  field changed in EJO since the check is left as it is, and the row says
  so. Each record changed gets one entry in its history (*customer.updated*,
  *vehicle.updated*, *part.updated*, *supplier.updated*) with every field's
  *from* and *to* and the import's number — the same as a change made on its
  page. Nobody is emailed.
- **Undo, field by field.** Undoing the import puts each field back to what
  it was, where it still holds what the file wrote; a field changed since is
  kept as it is now and named on its row.
- The templates never carry the *EJO record* column: it comes only from an
  export. Invoice history and opening stock are never updated by a file.

### SAP field names

Only with the SAP link, which is switched off in this edition: exports use EJO's plain column names, in Excel or CSV.

## 10. For the database administrator

| Change | Script |
| --- | --- |
| A0 — customer email optional; SAP numbers on customers, vehicles, parts | `scripts/predeploy/0003-external-keys.sql` (deploy) · `scripts/v-a0-optional-email-sap-keys.sql` (manual, Supabase SQL editor) |
| A1 — import tables; "made by this import" on customers and vehicles | `scripts/predeploy/0004-data-exchange.sql` (deploy) · `scripts/v-a1-data-exchange.sql` (manual) |
| A2 — suppliers; opening-balance receipts; parts made by an import; Finance sign-off | `scripts/predeploy/0005-parts-stock-suppliers.sql` (deploy) · `scripts/v-a2-parts-stock-suppliers.sql` (manual) |
| A3 — customer since; invoice history; production / QC / PDI registers | `scripts/predeploy/0006-sap-history.sql` (deploy) · `scripts/v-a3-sap-history.sql` (manual) |
| Staged files — release period, size, release record | `scripts/predeploy/0007-import-staging-release.sql` (deploy) · `scripts/v-a4a-import-staging-release.sql` (manual) |
| Search and tracking — SAP-number indexes; invoice company code and fiscal year | `scripts/predeploy/0008-search-and-tracking.sql` (deploy) · `scripts/v-a4b-search-and-tracking.sql` (manual) |
| P3–P7 — open job cards, the demo organisation and its records, warranties and claims, services and bookings, staff | `scripts/predeploy/0016` … `0021` (deploy) · `scripts/v-p5` … `v-p7` (manual) |
| P8 — plant shipments, vehicles, kits and kit issues made by an import | `scripts/predeploy/0022-plant-imports.sql` (deploy) · `scripts/v-p8-plant-imports.sql` (manual) |
| P10 — each row's changes for an update from an edited export | `scripts/predeploy/0023-round-trip-changes.sql` (deploy) · `scripts/v-p10-round-trip.sql` (manual) |
| C1a — postings for SAP: the files and their lines | `scripts/predeploy/0024-sap-postings.sql` (deploy) · `scripts/v-c1a-sap-postings.sql` (manual) |
| C1b — the plant and refunds in the postings; SAP's master data back in | No change to the database: it uses C1a's tables and P10's import columns |
| A4c1 — customers' data requests (NDPA 2023) | `scripts/predeploy/0025-data-requests.sql` (deploy) · `scripts/v-a4c1-data-requests.sql` (manual) |
| A4c2 — customer documents in bulk (PDF zips) | No change to the database |
| A4c3 — scheduled exports | `scripts/predeploy/0026-export-schedules.sql` (deploy) · `scripts/v-a4c3-export-schedules.sql` (manual) |
| B — portal invitations for imported customers (one column on customers) | `scripts/predeploy/0027-customer-portal-invited.sql` (deploy) · `scripts/v-b-customer-portal-invited.sql` (manual) |
| D'Phoenix phase 2 — one Job Card for repairs and services (two columns on job cards) | `scripts/predeploy/0028-job-card-service.sql` (deploy) · `scripts/v-dp2-job-card-service.sql` (manual) |
| D'Phoenix phase 3 — billing & tax settings, estimate discounts and the VAT rate fixed at approval, receipt numbers on payments, invoices | `scripts/predeploy/0029-billing.sql` (deploy) · `scripts/v-dp3-billing.sql` (manual) |
| D'Phoenix phase 4 — the deposit switch, the customer's approval of the estimate (link, portal, phone), approval links, credit terms for organisation customers, the invoice due date | `scripts/predeploy/0030-approval-credit.sql` (deploy) · `scripts/v-dp4-approval-credit.sql` (manual) |
| D'Phoenix phase 6A — secure document links for WhatsApp (the estimate, invoice and receipt PDFs; only each token's SHA-256 is kept) | `scripts/predeploy/0031-document-links.sql` (deploy) · `scripts/v-dp6-document-links.sql` (manual) |

All are additive (new tables, columns and indexes), re-runnable, and tested
twice on Postgres 16 against the previous structure and compared with a
fresh schema. Run them in order (A0, A1, A2, A3, then the staged-files and search scripts).

## 11. Open questions for the organisation (not guessed in code)

1. Which Zoho exports will be supplied (Books or Invoice contacts and
   invoices, CRM accounts, People), and which spreadsheets hold the vehicles
   and the old job cards.
2. Volumes: customers, vehicles, and how many years of invoices and job
   cards to bring in.
3. Who signs off the migration totals (Finance, the Workshop manager) and
   the cut-over date for open jobs.
