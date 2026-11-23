# QuickBooks: getting EJO's figures into your books

For the accountant at Rock Foundation Automobile. QuickBooks stays your
accounting system. EJO runs the front desk, the workshop and the parts store,
and hands QuickBooks the figures: customers, items, invoices, counter sales,
payments, credit notes, refunds and stock count differences.

There are two ways to do it:

- **QuickBooks Desktop**: download one IIF file from EJO and import it
  (about ten minutes the first time, two minutes after that).
- **QuickBooks Online**: import the CSV files by hand, or have the Owner
  connect QuickBooks Online so EJO sends the figures for you.

Who can do this: the **Owner** and **Accounts**. Front Desk and the Store
Keeper cannot see this area.

---

## 1. Before the first export (once)

### 1.1 Back up the company file

In QuickBooks Desktop: **File → Back Up Company**. Always import into a
backed-up file. In QuickBooks Online there is no undo for an import either, so
try the first one on a quiet day and check it straight away.

### 1.2 Match the account names

In EJO, open **Settings → QuickBooks**. Every account EJO posts to is listed
with the name it will use. Each name must be **exactly** the name in your
chart of accounts (Lists → Chart of Accounts in Desktop; Accounting → Chart of
Accounts in Online). Either create the account in QuickBooks with EJO's name,
or type your own name into EJO and save.

| Used for | EJO's default name | Account type in QuickBooks |
|---|---|---|
| What customers owe | Accounts Receivable | Accounts Receivable |
| Cash received, not yet banked | Undeposited Funds | Other Current Asset |
| Bank transfers | Bank Account | Bank |
| POS card payments, until the bank settles them | POS Clearing | Bank (or Other Current Asset) |
| Labour, internal jobs, outside work charged on | Labour Income | Income |
| Parts sold (jobs and counter) | Parts Sales | Income |
| Car wash jobs | Car Wash Income | Income |
| Sundries | Sundry Income | Income |
| Discount on an invoice | Discounts Given | Expense (or Income) |
| Credit notes | Sales Returns and Allowances | Income |
| VAT charged (7.5%) | VAT Payable | Other Current Liability |
| Parts in the store | Inventory Asset | Other Current Asset |
| Cost of parts sold | Cost of Goods Sold | Cost of Goods Sold |
| Stock count differences | Inventory Adjustments | Expense |

Names can be at most **31 characters** (QuickBooks Desktop's limit) and cannot
contain quotation marks. Cash, bank transfers, POS and Accounts Receivable must
be four different accounts; EJO will not save it otherwise.

### 1.3 Match the item names

Store parts use their **part number** as the QuickBooks item (for example
`04465-02220`). Everything else uses the items named in **Settings →
QuickBooks → Items**:

| Item | Default | Type in QuickBooks |
|---|---|---|
| Labour | Labour | Service, income account Labour Income |
| Store parts with no part number (older invoices) | Parts | Other Charge, income account Parts Sales |
| Sundries | Sundries | Other Charge, income account Sundry Income |
| Parts bought outside for a job | Parts bought outside | Other Charge, income account Parts Sales |
| Outside work charged on | Outside work | Service, income account Labour Income |
| Car wash | Car wash | Service, income account Car Wash Income |
| Credit note (QuickBooks Online only) | Credit note | Service, income account Sales Returns and Allowances |
| VAT (QuickBooks Online only) | VAT 7.5% | Service, posting to VAT Payable |

The first export with **Items** ticked creates the service items and your
parts in QuickBooks Desktop for you. For QuickBooks Online, create the items
once by hand (or import the items CSV).

### 1.4 The date order

EJO writes dates as **DD/MM/YYYY**, the Nigerian setting. If the computer that
runs QuickBooks Desktop uses US dates (check Windows → Region), choose
**MM/DD/YYYY** in **Settings → QuickBooks → File details**, or 03/04/2026 will
be read as 4 March instead of 3 April.

### 1.5 Walk-in counter sales

A counter sale to someone who is not a registered customer is recorded against
one customer, **Walk-in customer** by default (change it in Settings →
QuickBooks). The buyer's name goes in the memo.

---

## 2. Each time (weekly or monthly) — QuickBooks Desktop

1. In EJO, open **Money → QuickBooks**.
2. Choose **From** and **To** (Lagos days). Tick what goes in the file. Usually
   everything: customers, items, invoices, counter sales, payments received,
   credit notes, refunds and (the Owner only) stock count adjustments.
3. Leave **QuickBooks Desktop (IIF)** chosen and press **Check the figures**.
   EJO shows how many of each, the naira totals and the VAT. Compare them with
   EJO's own sales and money pages for the same days.
4. If EJO lists anything it **left out** (for example an invoice whose figures
   do not add up, or a stock surplus whose cost is not entered yet), fix it in
   EJO first and check again.
5. Press **Create the IIF file**, then **Download**. The file is named after
   the export, for example `QBX-2026-000004.iif`.
6. In QuickBooks Desktop: **File → Utilities → Import → IIF Files**, choose
   **Import for review** if you are asked, and pick the file. The file already
   has customers and items first and the transactions after, in the right
   order.
7. QuickBooks lists any line it could not take, with the reason, and saves
   those lines in a new file. Fix the cause (almost always an account or item
   name that does not match Settings → QuickBooks) and import that file again.
8. **Apply the payments.** QuickBooks records each payment against the
   customer. Where it has not matched it to the invoice, open
   **Customers → Receive Payments**, choose the customer and tick the invoice
   named in the memo ("For invoice INV-…").

**Nothing goes in twice.** EJO remembers what every export carried. The next
export leaves those records out by itself and tells you how many it left out.
Tick **Include records already exported** only to rebuild a company file that
lost them, because importing them again posts them again.

Every export stays under **Exports** on the same page, with its counts and
totals, and its file can be downloaded again exactly as it was first made.
Every download is recorded.

### What each record becomes in QuickBooks Desktop

| From EJO | In QuickBooks | Posting |
|---|---|---|
| Invoice (a Job Card's) | Invoice | Accounts Receivable up; income per line, VAT to VAT Payable, discount to Discounts Given |
| Counter sale | Sales Receipt (cash sale) | The payment method's account up; Parts Sales and VAT Payable |
| Payment received | Payment | Cash → Undeposited Funds, transfer → Bank Account, POS → POS Clearing; Accounts Receivable down |
| Credit note (approved by the Owner) | Credit Memo | Accounts Receivable down; Sales Returns and Allowances and VAT Payable |
| Refund | Cheque | Out of the account it was paid from; Accounts Receivable up |
| Stock count difference (approved) | Inventory Adjustment | Inventory Asset up or down at cost; Inventory Adjustments |

Lines on an invoice that the customer does not pay for (warranty, goodwill,
internal) are not sales, so they are not in the file. **Every transaction in
the file balances to the kobo**: EJO checks the whole file before it lets you
download it.

---

## 3. QuickBooks Online

### 3.1 By hand, with the CSV files

Choose **Excel / QuickBooks Online (CSV)** before **Check the figures**. You
get one file per kind (customers, items, invoices, counter sales, payments,
credit notes, refunds), each named after the export. In QuickBooks Online, go
to **Settings (the gear) → Import data**, choose what you are importing, and
match the columns on screen. Import customers and items before invoices.

### 3.2 Connected: EJO sends the figures

This is **off** until it is set up on the server, and only the **Owner** can
connect it.

**Once, by your developer** (never typed into an EJO page):

1. At developer.intuit.com, create an app for the QuickBooks Online
   Accounting API and add the redirect address
   `https://<your portal address>/api/quickbooks/callback`.
2. Put these settings in the portal's hosting (Vercel → Project → Settings →
   Environment Variables), then redeploy:
   - `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET`: from the Intuit app.
   - `QBO_REDIRECT_URI`: the redirect address above, exactly.
   - `QBO_TOKEN_KEY`: 32 random bytes, base64 (for example
     `openssl rand -base64 32`). It encrypts the connection in the database.
     Keep it: if it changes, the Owner simply connects again.
   - `QBO_ENVIRONMENT`: `sandbox` to try it with Intuit's test company,
     `production` for the real books.

**Then the Owner:** **Settings → QuickBooks → Connect QuickBooks Online**,
sign in at Intuit, choose the company, and come back. The page then says
**Connected**.

**Sending:** in **Money → QuickBooks**, choose the days and press **Send** in
the QuickBooks Online box. EJO sends the invoices, counter sales, payments and
credit notes for those days that are not there yet. Customers are found by
name or created. **Items and accounts must already exist** in QuickBooks
Online (section 1.3), including the VAT item and the credit note item. If
something is refused, EJO shows QuickBooks' own reason and sends the rest;
press Send again after fixing it, and only what is missing goes.

Refunds and stock adjustments are not sent to QuickBooks Online yet: use the
CSV files for those.

To stop: **Settings → QuickBooks → Disconnect QuickBooks Online** (the Owner).
EJO also tells Intuit to cancel the connection.

---

## 4. After every import: three checks

1. **Accounts Receivable** in QuickBooks (Reports → Customers & Receivables →
   A/R Ageing Summary) against **Money → What customers owe** in EJO for the
   same date.
2. **Sales** for the days exported (Reports → Sales by Customer Summary)
   against the export's invoice and counter sale totals.
3. **VAT Payable** for the period against the export's VAT figure. That is the
   output VAT for your FIRS return.

If a figure differs, the export's page in EJO shows exactly what it carried.

## Good to know

- **Nothing is deleted** in QuickBooks by an import. A mistake on an invoice is
  corrected in EJO with a credit note, which comes across as a Credit Memo.
- **Customer names** must be unique in QuickBooks. Where two EJO customers
  share a name, the newer one gets a short EJO reference in brackets, the same
  in every export, so QuickBooks recognises them again.
- **Customer details** (phones, emails) are in the file when Customers is
  ticked. Keep the file on the accounts computer and delete it after the
  import.
- **Bringing QuickBooks lists into EJO** (going the other way, for example on
  the go-live day): use **Data Exchange**. The QuickBooks customer list, item
  list and invoice list exports are recognised as they are.
