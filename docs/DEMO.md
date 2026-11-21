# The demo: Rock Foundation Automobile (Demo)

How to show the system to the GMD and the board without touching real
records.

## The demo organisation

The demo lives in its own organisation, **Rock Foundation Automobile
(Demo)** (short name `rock-foundation-demo`, or `DEMO_ORG_SLUG`), with its
own Ota Workshop, invented customers and fleet companies, vehicles, Job
Cards, parts and payments. Every record is marked as sample data. It never
mixes with the real organisation: the demo tools refuse the real
organisation, and any organisation that already has its own customers or
Job Cards.

Every demo address ends with `@demo.rockfoundation.example.com`, a domain
that can never receive email, and the names are roles, not people.

## Switching it on

On Vercel (staff portal project), set `DEMO_STAFF_PASSWORD` (8 characters or
more) and, optionally, `DEMO_CUSTOMER_PASSWORD`, then redeploy. The build
makes the demo organisation, its people and sign-ins and, the first time, its
records. To load it again from scratch on a computer with the database
details:

```bash
npm run demo:reset
```

Against a production database the reset also needs
`DEMO_RESET_CONFIRM="replace the demo records"`; it replaces only the
previous demo's records. To remove the demo records and load nothing:

```bash
npm run demo:reset -- --remove
```

To stop the demo altogether, take `DEMO_STAFF_PASSWORD` out of Vercel and
redeploy; the demo people are switched off.

## Who to sign in as

All demo staff share `DEMO_STAFF_PASSWORD`. All five optional roles are
switched on in the demo organisation, so every role can be shown.

| Sign in as | Address | Shows |
|---|---|---|
| Owner (Demo) | `gmd@demo.rockfoundation.example.com` | Everything: approvals, cost prices and profit, analytics, settings |
| Front Desk (Demo) | `frontdesk@demo.rockfoundation.example.com` | Receiving vehicles, Job Cards, estimates, payments, customers, the Support centre |
| Service Advisor (Demo) | `advisor@demo.rockfoundation.example.com` | Assigning technicians, inspections, checking estimates |
| Technician 1 (Demo) | `tech.1@demo.rockfoundation.example.com` | Only their own jobs |
| Store Keeper (Demo) | `store@demo.rockfoundation.example.com` | Parts, stock, goods received, issuing parts; no cost prices |
| Accounts (Demo) | `accounts@demo.rockfoundation.example.com` | Payments, refunds, exports |
| Security (Demo) | `gate@demo.rockfoundation.example.com` | The gate |

Technicians 2 and 3 (`tech.2@…`, `tech.3@…`) work electrical and body
jobs. Demo customers sign in to the customer portal with
`DEMO_CUSTOMER_PASSWORD` (or the staff password when it is not set); their
addresses are on each customer's page in the staff portal.

## A 15-minute tour for the GMD and the board

Use a laptop on a projector for the staff portal and a phone for the
customer's side.

1. **Sign in as Front Desk (2 minutes).** The dashboard shows today's work:
   vehicles in the workshop, estimates waiting, payments due. Open
   **Workshop → Job Cards** and receive a vehicle: customer, vehicle,
   mileage, complaints. The Job Card number is given at once.
2. **The estimate and the customer's approval (3 minutes).** Add labour and
   parts at selling price; VAT is worked out. Send the estimate: the email
   goes out and **Send on WhatsApp** opens WhatsApp with the message and a
   secure link. On the phone, open the link and approve. The Job Card moves
   on by itself.
3. **Sign in as Service Advisor and Technician (2 minutes).** The advisor
   assigns a technician; the technician sees only their own jobs, inspects
   the vehicle item by item and raises a parts request.
4. **Sign in as Store Keeper (2 minutes).** Approve and issue the parts to
   the Job Card. The Store Keeper sees selling prices, not cost prices.
5. **Back to Front Desk (2 minutes).** The work is done: invoice, record a
   payment (cash or bank transfer), and print or WhatsApp the receipt. The
   vehicle is released and leaves through the gate with a gate pass.
6. **Sign in as the Owner (3 minutes).** Approvals waiting; revenue invoiced
   against money collected; outstanding balances; the parts store's value
   and low stock; Business Analytics with cost and profit, which only the
   Owner sees. Open **Settings → Roles** to show the optional roles and how
   Front Desk covers a role that is off.
7. **The customer portal (1 minute).** On the phone, a fleet company's
   customer sees its vehicles, live job status, estimates, invoices and
   payments.

Close on the audit trail (every step, who and when) and the plan for the
next phases (README, "Build phases").
