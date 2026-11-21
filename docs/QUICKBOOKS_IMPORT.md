# How to import into QuickBooks Desktop

For the accountant at Rock Foundation Automobile. QuickBooks stays your
accounting system; EJO runs the front desk, the workshop and the store, and
hands QuickBooks the figures. This page takes about ten minutes the first time
and two minutes after that.

## Before the first import (once)

1. **Back up the company file** (File → Back Up Company). Always import into a
   backed-up file first.
2. **Check the account names.** In EJO, open **Settings → QuickBooks**. Each
   account EJO posts to is listed with the name it will use. In QuickBooks,
   make sure an account with exactly that name exists (Lists → Chart of
   Accounts), or change the name in EJO to the one you already use:

   | Used for | Default name | Type in QuickBooks |
   |---|---|---|
   | What customers owe | Accounts Receivable | Accounts Receivable |
   | Payments not yet banked | Undeposited Funds | Other Current Asset |
   | Labour | Labour Income | Income |
   | Parts sold | Parts Sales | Income |
   | Sundries and credit notes | Sundry Income | Income |
   | VAT charged | VAT Payable | Other Current Liability |
   | Discounts given | Discounts Given | Income (or Expense) |
   | Stock on hand | Inventory Asset | Other Current Asset |
   | Cost of parts sold | Cost of Goods Sold | Cost of Goods Sold |
   | Stock count differences | Inventory Adjustments | Expense |

3. **Check the date format.** EJO writes dates as DD/MM/YYYY, the Nigerian
   setting. If your computer's region is set to US dates, choose MM/DD/YYYY in
   **Settings → QuickBooks** instead.

## Each time (weekly or monthly)

1. In EJO, open **Accounts → QuickBooks export**, choose the dates, and
   download. You get one file per kind, in this order:
   1. `customers.iif`: new and changed customers
   2. `items.iif`: parts, labour and sundries
   3. `invoices.iif`: invoices and counter-sale receipts
   4. `payments.iif`: money received
   5. `credit-notes.iif`: credit notes approved by the GMD
   6. `stock-adjustments.iif`: stock count and write-off differences
2. In QuickBooks: **File → Utilities → Import → IIF Files**, choose
   **Import for review**, and import the files **in the order above**.
   Customers and items must exist before the invoices that use them.
3. QuickBooks shows any line it could not take, with the reason, and saves
   those lines in a new file. Fix the cause (usually an account name) and
   import that file again. Nothing that imported is duplicated.
4. **Apply the payments.** QuickBooks records each payment against the
   customer but does not always match it to the invoice. Open
   **Customers → Receive Payments**, choose the customer and tick the invoice
   shown in the payment's memo ("For invoice INV-…").
5. Back in EJO, press **Mark as imported**. The next export then starts after
   these records, so nothing goes in twice.

## Good to know

- **VAT** is posted to the VAT account as its own line, so the files import
  whether or not sales tax is switched on in QuickBooks.
- **Lists in Excel instead:** customers and items also download as CSV for
  **File → Utilities → Import → Excel Files**, where you match the columns on
  screen.
- **Nothing is deleted** in QuickBooks by an import. A cancelled invoice comes
  as a credit note, never as a removal.
- **QuickBooks Online** works differently: an administrator can connect it in
  **Settings → QuickBooks Online**, and customers, invoices and payments then
  go across on their own. It is off until you switch it on.
