# Bringing existing records into EJO

How Rock Foundation Automobile's existing records come into EJO from
**Excel or CSV files**, without retyping and without risk to the live
records: staff, customers and fleet companies, their vehicles, suppliers,
parts and opening stock, past invoices and job cards, and the Job Cards still
open on the day EJO takes over. The files come from **QuickBooks** (Desktop
or Online), from an old system, or from the workshop's own spreadsheets.
Every list in EJO also goes back out to Excel or CSV.

QuickBooks stays the accounting system. Importing copies records **into**
EJO; it never writes to QuickBooks or anything else, and never overwrites a
record already in EJO.

## 1. The six steps

Every import goes through the same steps, at **Data Exchange**
(`/data-exchange`):

| Step | What happens | Live records changed? |
| --- | --- | --- |
| 1. Upload | The file is read **in the browser** and sent in small blocks to a staging area. Any size; an interrupted upload starts again and nothing is counted twice. | No |
| 2. Match columns | Each column is matched to a field by its name. Common names match themselves (*Customer*, *Phone*, *Email*, *Item*, *Invoice No*…); anything else is chosen from a list. A matching can be saved for the next file of the same kind. | No |
| 3. Check | Every row is checked with the **same rules as the front desk's own forms**, and matched against what is already in EJO: ready, ready with a note, rejected, duplicate in the file, already in EJO. Rejected rows download as a file with the reason on each row. | No |
| 4. Approve | A **second person** approves (the Owner by default). The person who prepared the import cannot approve it. | No |
| 5. Load | Rows load in batches of 1,000. Each batch is all-or-nothing; the import is locked so two screens can never load it twice; it can be paused and resumed. | Yes |
| 6. Report and undo | The report adds up: rows in the file = added + filled in + not added + rejected, with a row-by-row download. **Undo** moves exactly what the import added to the **Recycle bin**. | Yes (reversible) |

Every step is in the audit trail with who, when and the counts.

**Templates:** Data Exchange → the kind of record → *Excel template* (with an
instructions sheet and dropdowns) or *CSV template*.

## 2. Who does what

| Role | Prepare (upload, match, check, send for approval) | Approve, load, send back, undo |
| --- | --- | --- |
| Owner / GMD | Yes | Yes (never their own) |
| Front Desk | Yes | No |
| Everyone else | No | No |

Opening stock and invoice history have a second signature: after they load,
someone who records payments (Accounts, or Front Desk while Accounts is off)
and who neither prepared nor approved the import **confirms the totals**.

## 3. The order, and the cut-over checklist

Load in this order, because later files find records from earlier ones:

1. **Staff**: so open Job Cards find their technicians.
2. **Customers**: individuals and fleet companies.
3. **Vehicles**: each linked to its customer.
4. **Suppliers**, then **parts**, then **opening stock**.
5. **Invoice history** and **job card history** (before EJO).
6. **Open Job Cards** on the go-live day.

**Data Exchange → Cut-over checklist** shows each of these for the Ota
Workshop with where it stands (not started, being prepared, waiting for
approval, loaded, waiting for the totals to be confirmed, not needed),
worked out from the imports themselves. When everything is loaded or marked
not needed, an approver signs the workshop off as cut over. Every mark and
sign-off is in the audit trail.

## 4. Where the files come from

- **QuickBooks Desktop:** Customer Center → **Excel → Export Customer List**;
  Item List → **Excel → Export all items**; Vendor Center → **Excel →
  Export Vendor List**; past invoices from **Reports → Sales → Sales by
  Customer Detail** (export to Excel).
- **QuickBooks Online:** **Sales → Customers → Export to Excel**; **Sales →
  Products and services → Export to Excel**; **Expenses → Vendors → Export
  to Excel**; invoices from a sales report exported to Excel.
- **Spreadsheets:** any Excel or CSV file with a header row.

## 5. What each kind of record needs

| Kind | Required | Matched to an existing record by |
| --- | --- | --- |
| Staff | Name, the person's own work email, branch | Email |
| Customers | Name | Customer number, then email; a match by phone only is a *possible duplicate* |
| Vehicles | The customer (number, email or phone) and the VIN or the plate | Vehicle number, then VIN, then plate |
| Suppliers | Name | Supplier number or name |
| Parts | Part number and description | Part number |
| Opening stock | Part number and quantity on hand, with the unit cost or the total value | The part |
| Invoice history | Invoice number, date, amount and the customer (number, phone or name) | Invoice number |
| Job card history | Job number, date opened, and the customer or the vehicle | Job number |
| Open Job Cards | Job number, date opened, the complaint or work requested, and the vehicle (VIN or plate) | Job number |

- **Staff** come in switched off, and nobody is emailed. After loading, the
  Owner presses **Send the invitations**: each person gets the welcome email
  with a one-time link to set their own password. Owner roles are never
  given by a file.
- **Customers without an email** are full records reached by phone; they
  have no customer-portal access until their own email is added. EJO never
  uses a made-up address.
- **Possible duplicates** (same phone, different name and number) are not
  added by default: they are listed with a link to the existing customer for
  someone to follow up. Nothing is merged silently.
- **Old data with gaps** loads with a note, not a rejection: no phone, no
  address, an email that is not valid (the customer is kept without it).
  Only a row without the required fields is rejected.
- **Invoice and job history** is read-only: it counts in each customer's
  spend, visits and last visit, and in the service tracker, always labelled
  **"Before EJO"**. Each invoice loads once; a negative amount is a credit
  note. Naira only.

## 6. File rules

- Excel (`.xlsx`) or CSV with a header row. Dates as DD/MM/YYYY (other
  common forms are understood); money in naira, with or without ₦ and
  commas; distances in km.
- One kind of record per file. A file with one row per invoice item is
  understood (the first row of each invoice is used).
- Loading the same file again adds nothing twice.
- The staged copy of a file is kept with its import and released once the
  import is finished (30 days by default); the summary, every row's outcome
  and what undo needs are kept.
- Before an import that would not fit in the database plan
  (`DATABASE_SPACE_LIMIT_MB`), EJO refuses it; a load near the limit pauses.

## 7. Undoing an import

**Undo** on a finished import moves exactly the records it added to the
Recycle bin, each its own item, restorable for 30 days. Records that have
been used since (a customer with a new Job Card, a part on an estimate) stay
and are listed. History rows are voided, not deleted, and loading the file
again restores them.

## 8. Exports: any list to Excel or CSV

Every list in the staff portal has **Export**: what the person sees, with
their filters, to Excel or CSV. Exports are recorded; a list with customers'
contact details or payments needs the right to export sensitive files
(Owner and Accounts by default). A long list comes in parts. Exports can be
scheduled (daily, weekly or monthly) and are then made fresh when they are
downloaded.

An export can come back in: edit it in Excel and import it as an
**update**; each change is previewed field by field before it is approved.
