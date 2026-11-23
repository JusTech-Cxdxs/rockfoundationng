/**
 * Enyo's how-to guide: short, accurate steps for every live module, written
 * against the real pages and button names. Pure (no database, no session):
 * the guide_search tool passes the person's principal, and only entries whose
 * page they can open are returned. Entries that match but belong to someone
 * else's job are named (title only), so Enyo can say "that is done by …".
 *
 * Keep the button names here in step with the pages: Playwright selects by
 * the same names, so they rarely change.
 *
 * An entry marked `module` (the Parts store) is found only while that module
 * is switched on (lib/modules.ts). The steps stay in code.
 */
import { decide, type PermissionKey, type Principal } from '../authz/catalogue';
import { moduleIsOn } from '../modules';

export type GuideEntry = {
  id: string;
  title: string;
  /** Words people use for this ("deposit", "pay", "money in"). Lower case. */
  keywords: string[];
  /** Short numbered steps, in order. */
  steps: string[];
  /** The page where it is done (a portal path). */
  page: string;
  /** Opening the page needs ANY of these (empty: everyone signed in). */
  needs: PermissionKey[];
  /** Carrying the steps out needs ANY of these (empty: whoever can open the page). */
  does?: PermissionKey[];
  /** Who usually does it, in plain words. */
  who?: string;
  /** Only while this module is switched on (lib/modules.ts). */
  module?: string;
};

const WORKSHOP: PermissionKey[] = ['workshop.view'];
const STORE: PermissionKey[] = ['store.view'];
const EVERYONE: PermissionKey[] = [];

export const GUIDE: GuideEntry[] = [
  // ── Job Cards ─────────────────────────────────────────────────────
  {
    id: 'job-card-open', title: 'Receive a vehicle and open a Job Card', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.job_card.create'], who: 'Front Desk',
    keywords: ['open', 'new', 'create', 'job card', 'check in', 'receive', 'register job', 'jc', 'repair', 'complaint', 'book in'],
    steps: [
      'Go to Workshop → Job Cards.',
      'In the "Open Job Card" form, search for the customer by name, email or phone.',
      'Pick the vehicle (only that customer\'s vehicles are listed; register a new one under Workshop → Vehicles first).',
      'Under "What is this visit for?", choose Service, Repair or both, and choose the supervisor.',
      'Enter the mileage at check-in and list each complaint (use "+ Add another complaint" for more).',
      'Press "Open Job Card". The supervisor is told to inspect the vehicle.',
    ],
  },
  {
    id: 'job-card-review', title: 'Accept or turn down a new Job Card (supervisor)', page: '/approvals', needs: EVERYONE, does: ['workshop.job.supervise'], who: 'The Workshop Supervisor (Front Desk when that role is off)',
    keywords: ['approve', 'reject', 'review', 'job card', 'supervisor', 'accept job', 'supervise'],
    steps: [
      'Open Approvals (or the Job Card from your dashboard).',
      'In "Review this Job Card", check the customer, vehicle and complaints.',
      'Press "Approve", or "Reject" with a short reason.',
    ],
  },
  {
    id: 'job-card-inspection', title: 'Inspect the vehicle at check-in', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.inspection.perform'], who: 'The technician or supervisor on the job',
    keywords: ['inspection', 'inspect', 'checklist', 'condition', 'findings', 'multi-point', 'check in'],
    steps: [
      'Open the Job Card and, in "Vehicle inspection", press "Start or skip the inspection".',
      'Work through each section of the checklist, marking the condition and anything that needs doing.',
      'Press "Complete Inspection". The findings guide the estimate. If no inspection is needed, skip it and give the reason.',
    ],
  },
  {
    id: 'job-card-assign', title: 'Assign a technician to a Job Card', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.technician.assign'], who: 'The Workshop Supervisor (Front Desk when that role is off)',
    keywords: ['assign', 'technician', 'allocate', 'give job', 'mechanic', 'reassign'],
    steps: [
      'Open the Job Card (it must be accepted first).',
      'In "Assign technician", choose the technician.',
      'Press "Assign". The technician sees it under "Respond to this assignment" and presses "Accept" or "Reject" with a reason.',
    ],
  },
  {
    id: 'job-card-accept', title: 'Accept or turn down a job (technician)', page: '/dashboard', needs: EVERYONE, does: ['workshop.job.work'], who: 'The assigned technician',
    keywords: ['accept', 'turn down', 'reject assignment', 'my job', 'technician', 'respond'],
    steps: [
      'Open the Job Card from "My jobs" on your dashboard.',
      'In "Respond to this assignment", press "Accept", or "Reject" and give a reason.',
    ],
  },
  {
    id: 'job-card-estimate', title: 'Prepare and submit an estimate', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.estimate.edit'], who: 'Front Desk, the supervisor or the technician on the job',
    keywords: ['estimate', 'quote', 'quotation', 'price', 'line', 'labour', 'parts', 'submit', 'cost', 'outside part'],
    steps: [
      'Open the Job Card and go to the Estimate section.',
      'Under "Add a line", choose the type (Store Part, Labour, part or job bought outside, Internal Job, Sundry), describe it, enter the quantity and price where you may, and press "Add".',
      // Store matching only while the Parts store is switched on.
      ...(moduleIsOn('inventory') ? ['For Store Part lines, press "Request Store Matching" so the store matches them to parts in stock and prices them.'] : []),
      'When every line is priced, press "Submit for validation". The supervisor checks it, then the Owner approves it.',
    ],
  },
  {
    id: 'job-card-estimate-approve', title: 'Approve an estimate (supervisor, then the Owner)', page: '/approvals', needs: EVERYONE, does: ['workshop.estimate.approve', 'workshop.estimate.final_approve'], who: 'The supervisor, then the Owner / GMD',
    keywords: ['approve estimate', 'final approval', 'owner', 'gmd', 'send back', 'validate', 'estimate', 'discount'],
    steps: [
      'Open Approvals and choose the estimate.',
      'Supervisor: check the lines and press "Approve estimate", or "Send back" with a reason.',
      'Owner: check the total and any discount above the limit, and give the final approval (or send it back).',
    ],
  },
  {
    id: 'job-card-notify', title: 'Send an approved estimate to the customer', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.customer.notify'], who: 'Front Desk',
    keywords: ['notify', 'customer', 'send estimate', 'tell customer', 'email customer', 'whatsapp', 'approval link'],
    steps: [
      'Open the Job Card once the Owner has approved the estimate.',
      'In the Estimate section, press "Notify customer". The customer is emailed the estimate with a secure link to approve or decline it.',
      'Press "Send on WhatsApp" to send the same message and link from your own WhatsApp.',
      'The Job Card waits for the customer, who can approve by the link, in the customer portal, or by phone ("Customer approved by phone"), and pay the deposit when the workshop asks for one.',
    ],
  },
  {
    id: 'job-card-payment', title: 'Record a payment on a Job Card', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.payment.record'], who: 'Front Desk or Accounts',
    keywords: ['payment', 'pay', 'deposit', 'balance', 'money', 'cash', 'transfer', 'pos', 'receipt', 'takings', 'credit'],
    steps: [
      'Open the Job Card and go to Payments.',
      'Enter the amount (the suggestions fill in the deposit when one applies, the full amount or the remaining balance) and choose how they paid.',
      'Add the transfer reference or POS slip number in the notes, then press "Record payment". The receipt can go by email and WhatsApp.',
      'While the estimate waits for the customer, paying at the counter counts as their approval. The Job Card then moves to In Progress by itself.',
      'A fleet company on credit can leave with a balance once its invoice is issued (the Owner approves release on credit); record its payments here until it is paid.',
    ],
  },
  {
    id: 'job-card-status', title: 'Move a Job Card to its next status', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.job.work', 'workshop.job.supervise'], who: 'The technician and supervisor on the job',
    keywords: ['status', 'in progress', 'awaiting parts', 'quality check', 'completed', 'ready for collection', 'ready for pickup', 'rework', 'update'],
    steps: [
      'Open the Job Card and go to the Status section.',
      'Choose the next status (only the steps you may take are offered) and press "Update status".',
      'The supervisor does the quality check and marks the job Ready for Collection; "Send back for rework" returns it to the technician.',
    ],
  },
  {
    id: 'job-card-close', title: 'Close a Job Card and check the vehicle out', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.close.request', 'workshop.close.approve'], who: 'Front Desk or the supervisor asks; the Owner approves',
    keywords: ['close', 'check out', 'checkout', 'collect', 'collection', 'pickup', 'release vehicle', 'finish', 'done', 'gate pass'],
    steps: [
      'When the customer has paid in full (or the Owner has approved release on credit), open the Job Card and press "Request close".',
      'The Owner presses "Approve close" (or "Decline" with a note).',
      'Front Desk then checks the vehicle out in the Status section, entering the name of the person collecting it.',
      'At the gate, the vehicle leaves on its gate pass ("Confirm exit").',
    ],
  },
  {
    id: 'job-card-cancel', title: 'Cancel a Job Card', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.close.request', 'workshop.close.approve'], who: 'Front Desk or the supervisor asks; the Owner approves',
    keywords: ['cancel', 'cancellation', 'stop job', 'customer withdrew', 'abandon'],
    steps: [
      'Open the Job Card, fill in "Request cancellation" with the reason and press "Request cancellation".',
      'The Owner presses "Approve cancellation" or "Decline".',
      'If the customer paid anything, the refund is recorded before the vehicle is handed back.',
    ],
  },
  {
    id: 'refund', title: 'Record a refund', page: '/workshop/refunds', needs: WORKSHOP, does: ['workshop.refund.record'], who: 'Accounts (Front Desk when that role is off)',
    keywords: ['refund', 'money back', 'return money', 'overpaid', 'repay'],
    steps: [
      'Open the Job Card that was cancelled or overpaid.',
      'In the Refunds panel, enter the amount, method, who received it and the reason, then press "Record refund".',
      'The customer is emailed a receipt. Every refund is listed under Workshop → Refunds.',
    ],
  },
  {
    id: 'job-card-parts', module: 'inventory', title: 'Request parts from the store for a job', page: '/workshop/parts-requests', needs: WORKSHOP, does: ['sourcing.request'], who: 'The technician or supervisor on the job',
    keywords: ['parts request', 'prs', 'request parts', 'store parts', 'spare', 'reserve', 'issue parts'],
    steps: [
      'Make sure the Store Part lines on the estimate are matched by the store.',
      'Open the Job Card and press "+ Request Store Parts" in Sourcing.',
      'Check the quantities and press "Raise Parts Request".',
      'The supervisor gives the first approval, then the Store Keeper presses "Approve & Reserve" and finally "Release" when handing the parts over. The parts then show on the vehicle\'s history.',
    ],
  },
  {
    id: 'who-pays', title: 'Mark an estimate line Under warranty, goodwill or internal', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.estimate.final_approve'], who: 'The Owner / GMD',
    keywords: ['who pays', 'warranty', 'under warranty', 'comeback', 'goodwill', 'internal', 'not charged', 'bill to', 'free'],
    steps: [
      'Open the Job Card and find the "Who pays" panel next to the estimate.',
      'For the line, choose Under warranty (the workshop\'s own warranty on earlier work or a part), Goodwill or Internal, give the reason, and press "Save".',
      'The customer\'s total, deposit and balance are recalculated straight away.',
    ],
  },
  {
    id: 'custody', title: 'See which vehicles are in the workshop', page: '/workshop/custody', needs: WORKSHOP,
    keywords: ['custody', 'in workshop', 'vehicles in', 'yard', 'waiting', 'in service', 'compound'],
    steps: ['Go to Workshop → In custody to see every vehicle being worked on, or waiting for approval or collection.'],
  },
  {
    id: 'job-card-service', title: 'Open a service Job Card', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.job_card.create'], who: 'Front Desk',
    keywords: ['service', 'routine service', 'oil change', 'maintenance', 'open service', 'book service', 'next service', 'servicing'],
    steps: [
      'Go to Workshop → Job Cards (or press "Open a service Job Card" on the vehicle, the customer or the Service Tracker).',
      'In the "Open Job Card" form, under "What is this visit for?", choose "Service".',
      'Pick the customer, the vehicle and the supervisor, enter the mileage at check-in and list what the customer asked for.',
      'Press "Open Job Card". The work, estimate, payment and check-out are the same as for a repair.',
      'Once the vehicle is checked out, the Job Card shows when the next service is due (in km and by date) and the Service Tracker follows it.',
    ],
  },
  {
    id: 'service-tracker', title: 'See vehicles due for a service and send reminders', page: '/workshop/service-tracker', needs: WORKSHOP,
    keywords: ['service due', 'overdue', 'reminder', 'next service', 'tracker', 'due soon', 'follow up'],
    steps: [
      'Go to Workshop → Service tracker. Vehicles are grouped as Overdue, Due soon and On track.',
      'Press "Send reminder" to email the customer the reminder that is due, or send it on WhatsApp.',
      'When the customer is already being looked after, press "Attend To" to take the vehicle off the overdue list.',
    ],
  },
  // ── Customers and vehicles ────────────────────────────────────────
  {
    id: 'customer-add', title: 'Register a new customer', page: '/crm', needs: ['crm.view', 'workshop.view'], does: ['workshop.customer.manage', 'crm.manage'], who: 'Front Desk',
    keywords: ['new customer', 'register customer', 'add customer', 'client', 'customer', 'fleet', 'company'],
    steps: [
      'Go to Customers and press "Register customer" (or Workshop → Customers, "Add customer").',
      'Choose Individual or Organisation (a company with a fleet), then enter the name, primary address, email and phone (and a second phone if they have one).',
      'Press "Register customer". A customer with an email is sent a link to set their own customer portal password.',
    ],
  },
  {
    id: 'vehicle-add', title: 'Register a vehicle', page: '/workshop/vehicles', needs: WORKSHOP, does: ['workshop.customer.manage'], who: 'Front Desk',
    keywords: ['register vehicle', 'add vehicle', 'new car', 'plate', 'vin', 'chassis'],
    steps: [
      'Go to Workshop → Vehicles and use "Register vehicle".',
      'Choose the owner, then enter the plate, chassis number (VIN), make, model, year and mileage (km).',
      'Press "Register vehicle". No two vehicles may share a plate or VIN.',
    ],
  },
  {
    id: 'crm-360', title: 'See everything about a customer', page: '/crm', needs: ['crm.view'],
    keywords: ['customer', '360', 'history', 'spend', 'crm', 'profile', 'outstanding', 'visits', 'balance'],
    steps: [
      'Go to Customers and search by name, phone or email.',
      'Open the customer to see their vehicles, Job Cards, payments and refunds, what they owe, notes and activity.',
    ],
  },
  {
    id: 'crm-portal', title: 'Give a customer access to the customer portal', page: '/crm', needs: ['crm.view'], does: ['crm.manage'], who: 'Front Desk',
    keywords: ['portal', 'customer portal', 'password', 'set-password', 'sign in', 'access', 'login link'],
    steps: [
      'Open the customer under Customers and find the "Customer portal" card.',
      'Press "Send set-password link". The link is valid for 72 hours; no password is ever emailed.',
      'To stop access, give a reason and press "Switch off and sign out"; "Switch on" restores it.',
    ],
  },
  {
    id: 'crm-notes', title: 'Add a note to a customer', page: '/crm', needs: ['crm.view'], does: ['crm.manage'],
    keywords: ['note', 'customer note', 'remark', 'pin', 'preference'],
    steps: ['Open the customer under Customers and go to Notes.', 'Type the note, tick "Pin to the top" if it matters, and press "Add note".'],
  },
  // ── Parts store ───────────────────────────────────────────────────
  {
    id: 'part-add', module: 'inventory', title: 'Add a part to the catalogue', page: '/inventory/parts', needs: STORE, does: ['store.parts.manage'], who: 'The Store Keeper (Front Desk when that role is off)',
    keywords: ['add part', 'new part', 'catalogue', 'catalog', 'item', 'stock item', 'spare part'],
    steps: [
      'Go to Parts store → Parts and use "Add a Part".',
      'Enter the name, part number, type, unit and how it is tracked (Quantity, Batch or Serialized).',
      'Press "Add Part". Set its selling price, reorder level and the vehicles it fits on the part\'s own page.',
    ],
  },
  {
    id: 'part-price', module: 'inventory', title: 'Set a part\'s selling price or reorder level', page: '/inventory/parts', needs: STORE, does: ['store.parts.manage'], who: 'The Store Keeper or the Owner',
    keywords: ['price', 'selling price', 'margin', 'markup', 'pricing', 'reorder point', 'reorder level', 'safety stock'],
    steps: [
      'Open the part under Parts store → Parts.',
      'Enter the selling price and press "Save". Only the Owner sees cost prices and margins.',
      'The reorder level and safety stock are set on the same page.',
    ],
  },
  {
    id: 'goods-receipt', module: 'inventory', title: 'Record goods received from a supplier', page: '/inventory/goods-receipts', needs: ['store.grn.record', 'store.cost.view'], does: ['store.grn.record'], who: 'The Store Keeper (Front Desk when that role is off)',
    keywords: ['goods receipt', 'grn', 'receive', 'delivery', 'stock in', 'supplier', 'restock', 'purchase'],
    steps: [
      'Go to Parts store → Goods Receipts and open "Record Goods Receipt".',
      'Enter the supplier, then for each part the quantity, unit and total cost from the supplier\'s invoice (batch or serial numbers when the part needs them).',
      'Press "Record Goods Receipt". Stock goes up at once, and a pricing alert is raised for the Owner if the new cost hurts the margin.',
    ],
  },
  {
    id: 'store-matching', module: 'inventory', title: 'Match estimate parts to stock (store matching)', page: '/inventory/estimate-matching', needs: STORE, does: ['store.matching'], who: 'The Store Keeper (Front Desk when that role is off)',
    keywords: ['matching', 'match', 'estimate parts', 'store matching', 'unmatched'],
    steps: ['Go to Parts store → Estimate Matching to see estimates waiting on the store.', 'Open one and press "Match" next to the right part for each line. The line is priced from the part\'s selling price.'],
  },
  {
    id: 'parts-request-store', module: 'inventory', title: 'Reserve and issue parts to a job (store)', page: '/workshop/parts-requests', needs: WORKSHOP, does: ['store.prs.release'], who: 'The Store Keeper (Front Desk when that role is off)',
    keywords: ['release', 'reserve', 'parts request', 'prs', 'hand over parts', 'issue parts', 'issue to job'],
    steps: [
      'Open the parts request from Approvals or Workshop → Parts Requests.',
      'Press "Approve & Reserve" to hold the stock.',
      'When handing the parts over, press "Release". Stock goes down and the parts show on the vehicle\'s history with the date and technician.',
    ],
  },
  {
    id: 'pricing-alerts', module: 'inventory', title: 'Deal with pricing alerts', page: '/inventory/pricing', needs: ['store.cost.view'], does: ['store.cost.view'], who: 'The Owner / GMD',
    keywords: ['pricing alert', 'margin', 'loss', 'below cost', 'price alert', 'pricing command'],
    steps: ['Go to Parts store → Pricing Command Center.', 'For each alert press "Sync Price to Target" to reprice, or "Dismiss" with a reason to keep the current price.'],
  },
  {
    id: 'inventory-analytics', module: 'inventory', title: 'Read parts store analytics (stock value, movers)', page: '/inventory/analytics', needs: ['analytics.inventory.view'], who: 'The Owner / GMD',
    keywords: ['inventory analytics', 'stock value', 'turnover', 'dead stock', 'slow movers', 'fast movers', 'overstock', 'low stock'],
    steps: ['Go to Parts store → Analytics.', '"What to do now" lists parts at or below their reorder level and stock that is not moving, with the value held.'],
  },
  // ── The gate ──────────────────────────────────────────────────────
  {
    id: 'vehicle-exit', title: 'Let a vehicle leave through the gate', page: '/security/vehicles', needs: ['security.view'], does: ['security.gate.operate'], who: 'Security (Front Desk when that role is off)',
    keywords: ['vehicle exit', 'gate', 'gate pass', 'release vehicle', 'leave', 'vx', 'cleared to leave', 'qr'],
    steps: ['Go to Gate → Cleared to leave.', 'Open the vehicle, check the gate pass and who is collecting it, and press "Confirm exit".'],
  },
  {
    id: 'vehicles-inside', title: 'See the vehicles in the compound', page: '/security/vehicles-inside', needs: ['security.view'], who: 'Security and Front Desk',
    keywords: ['compound', 'vehicles inside', 'in the compound', 'yard', 'parked'],
    steps: ['Go to Gate → Vehicles in the compound.', 'Each vehicle shows its Job Card and stage; those cleared to leave have a "Release" button.'],
  },
  // ── Notifications and approvals ───────────────────────────────────
  {
    id: 'broadcast', title: 'Send a notice to staff or customers', page: '/notifications/broadcasts/new', needs: ['notifications.broadcast.send'],
    keywords: ['broadcast', 'notice', 'announcement', 'bc', 'message everyone', 'circular'],
    steps: [
      'Go to Notifications → Broadcasts and open "New broadcast".',
      'Choose who it is for, write the title and message, set when it starts and how long it runs, and whether to email it too.',
      'Press "Publish broadcast". You can stop it early from its page ("Stop broadcast").',
    ],
  },
  {
    id: 'notifications', title: 'See my notifications', page: '/notifications', needs: EVERYONE,
    keywords: ['notification', 'bell', 'alerts', 'messages', 'notification center'],
    steps: ['Press the bell, or go to the Notification Center, to see what needs your attention and the notices running for you.'],
  },
  {
    id: 'approvals', title: 'See everything waiting for my decision', page: '/approvals', needs: EVERYONE,
    keywords: ['approvals', 'pending', 'waiting', 'decide', 'to approve', 'my approvals'],
    steps: ['Open Approvals from the menu. Items are grouped by area, oldest first.', 'Open one to approve or decline it on its own page.'],
  },
  {
    id: 'dashboard', title: 'Find my work for today', page: '/dashboard', needs: EVERYONE,
    keywords: ['my work', 'today', 'dashboard', 'my jobs', 'my numbers', 'to do'],
    steps: ['Open the Dashboard: "My jobs" lists the work assigned to you and "My numbers this month" shows your figures.', 'The bell and Approvals list what is waiting for you.'],
  },
  // ── Administration ────────────────────────────────────────────────
  {
    id: 'recycle-bin', title: 'Restore something deleted by mistake', page: '/recycle-bin', needs: ['admin.recycle_bin.manage'],
    keywords: ['recycle bin', 'restore', 'deleted', 'undo delete', 'bin', 'removed'],
    steps: ['Go to the Recycle bin.', 'Find the item and press "Restore". Items are kept for a limited time before being removed for good.', 'Records are moved there from their own page with "Move to Recycle bin".'],
  },
  {
    id: 'users', title: 'Add a member of staff and give them a role', page: '/users/new', needs: ['admin.users.manage'],
    keywords: ['user', 'staff', 'employee', 'add staff', 'role', 'new user', 'account', 'switch off'],
    steps: [
      'Go to Staff and press "Add staff member": their name, work email, department and first role (the page shows what the role allows before you give it).',
      'Press "Add and send the welcome email". They set their own password from the email.',
      'To give another role, choose it next to their name and press "Give".',
    ],
  },
  {
    id: 'roles', title: 'Change what a role can do, or switch an optional role on', page: '/roles', needs: ['admin.roles.manage'], who: 'The Owner / GMD',
    keywords: ['role', 'permission', 'access', 'grant', 'rights', 'optional role', 'switch on role', 'store keeper', 'accounts', 'security', 'technician', 'supervisor'],
    steps: [
      'Go to Roles. Owner and Front Desk are always on; Workshop Supervisor, Technician, Store Keeper, Accounts and Security can be switched on or off. While one is off, Front Desk does its steps.',
      'Open a role to see what it can do and who holds it. Press "Change permissions", pick a permission and press "Add permission". Everyone holding the role is emailed their new access.',
    ],
  },
  {
    id: 'structure', title: 'Add a department', page: '/structure', needs: ['admin.structure.manage'],
    keywords: ['department', 'structure', 'team', 'section', 'bay'],
    steps: ['Go to Departments.', 'Add the department (for example Mechanical, Electrical, Spraying or Car wash) and place staff in it from their page under Staff.'],
  },
  {
    id: 'business-analytics', title: 'Read business analytics (revenue, profit, cash)', page: '/analytics', needs: ['analytics.business.view'], who: 'The Owner / GMD',
    keywords: ['analytics', 'sales', 'revenue', 'profit', 'takings', 'collections', 'business', 'report', 'outstanding'],
    steps: ['Go to Business Analytics and choose the period.', 'See revenue, gross profit, collections, work in progress, money owed and what to do now.'],
  },
  {
    id: 'data-exchange', title: 'Bring in customers, vehicles or parts from Excel or QuickBooks', page: '/data-exchange', needs: ['dataexchange.import.run', 'dataexchange.import.approve'], does: ['dataexchange.import.run'], who: 'Front Desk prepares; the Owner approves',
    keywords: ['import', 'excel', 'csv', 'upload', 'quickbooks', 'spreadsheet', 'bring in', 'migrate', 'data exchange'],
    steps: [
      'Go to Data Exchange and start a new import: choose what the file holds (customers, vehicles, parts…).',
      'Upload the Excel or CSV file and match its columns. Each row is checked: duplicates and errors are flagged before anything is saved.',
      'Send it for approval. A second person (the Owner) approves it before it loads; a finished import can be undone.',
    ],
  },
  {
    id: 'quickbooks-export', title: 'Send the month to QuickBooks', page: '/money/quickbooks', needs: ['money.quickbooks.export'], who: 'Accounts (or the Owner)',
    keywords: ['quickbooks', 'qb', 'iif', 'accounts', 'books', 'post', 'accounting', 'month end', 'export sales', 'vat return', 'quickbooks online'],
    steps: [
      'Once: open Settings → QuickBooks and make each account and item name match your QuickBooks company file exactly.',
      'Go to Money → QuickBooks, choose the days, tick what goes in (customers, items, invoices, counter sales, payments, credit notes, refunds) and press "Check the figures".',
      'Compare the counts and totals with your own figures, then press "Create the IIF file" (QuickBooks Desktop) or choose CSV for Excel and QuickBooks Online.',
      'Download it and import it in QuickBooks Desktop: File → Utilities → Import → IIF Files. Records already exported are left out next time, so nothing is posted twice.',
    ],
  },
  {
    id: 'export-list', title: 'Export a list to Excel', page: '/data-exchange/exports', needs: ['dataexchange.export.run'],
    keywords: ['export', 'excel', 'csv', 'download list', 'spreadsheet'],
    steps: ['On any list you can open, press "Export" and choose Excel or CSV. The file has what you see, with your filters.', 'Your exports are listed under Exports; each link works for 24 hours.'],
  },
  {
    id: 'error-reference', title: 'What to do with an error reference number', page: '/dashboard', needs: EVERYONE,
    keywords: ['error', 'reference', 'something went wrong', 'quote reference', 'bug', 'problem'],
    steps: ['When a message says "quote reference" and a 10-digit number, try again once.', 'If it keeps happening, press "Ask for help with this error" or give that number to the Owner: it can be looked up in the Error log.'],
  },
  {
    id: 'error-log', title: 'Look up an error reference', page: '/audit-logs/errors', needs: ['audit.view'],
    keywords: ['error log', 'reference', 'look up error', 'audit', 'troubleshoot'],
    steps: ['Go to Audit Logs → Error log.', 'Paste the 10-digit reference and press "Search" to see when, where and for whom it happened.'],
  },
  {
    id: 'password', title: 'Change my password', page: '/profile', needs: EVERYONE,
    keywords: ['password', 'change password', 'profile', 'my account', 'appearance', 'dark mode'],
    steps: ['Open your Profile from the account menu.', 'Use "Change my password". You can also choose light or dark appearance there.'],
  },
  // ── Enyo and reminders ────────────────────────────────────────────
  {
    id: 'enyo', title: 'Use Enyo, the assistant', page: '/dashboard', needs: EVERYONE,
    keywords: ['enyo', 'assistant', 'ai', 'chat', 'ask', 'remember', 'forget', 'help'],
    steps: [
      'Open Enyo from its button on any page and ask in your own words, for example "What is waiting for me?", "Status of JC-2026-000412" or "Summarise this vehicle\'s history".',
      'Enyo only sees what your role can see, and links to the record so you can check it.',
      'Enyo can prepare drafts (a Job Card form, a reminder, a message to a customer) but never saves or sends anything: you check and press the normal button.',
      'Say "Remember that …" for things it should keep in mind, and "Forget …" to remove them. Rate answers with the thumbs.',
    ],
  },
  {
    id: 'enyo-settings', title: 'Switch Enyo features on or off', page: '/settings/enyo', needs: ['admin.settings.manage'], does: ['enyo.manage'], who: 'The Owner / GMD',
    keywords: ['enyo settings', 'switch off ai', 'ai settings', 'display name', 'test connection', 'model'],
    steps: ['Go to Settings → Enyo.', 'Turn the staff assistant, the customer assistant or the website assistant on or off and set the display name, then save.', 'Press "Test connection" to check that the AI service answers.'],
  },
  {
    id: 'enyo-memory', title: 'See or delete what Enyo remembers about me', page: '/profile/enyo', needs: EVERYONE,
    keywords: ['enyo memory', 'what do you remember', 'forget me', 'remembered facts', 'privacy'],
    steps: ['Open your Profile and choose "My Enyo memory".', 'Each fact you asked Enyo to remember is listed. Press "Delete" next to any you want gone.'],
  },
  {
    id: 'enyo-learning', title: 'Approve what Enyo learns', page: '/enyo/learning', needs: ['enyo.manage'], who: 'The Owner / GMD',
    keywords: ['learning', 'learned answers', 'approve answers', 'teach enyo', 'corrections'],
    steps: ['Go to Settings → Enyo learning.', 'Each answer people marked helpful, or a correction from the Support centre, waits here. Press "Approve" to let Enyo reuse it, or remove it.'],
  },
  {
    id: 'support-inbox', title: 'Work the Support centre (emails, chat hand-overs, calls, complaints)', page: '/crm/support', needs: ['crm.view'], does: ['support.tickets.manage'], who: 'Front Desk / Customer Care',
    keywords: ['support', 'ticket', 'handover', 'customer care', 'complaint', 'sup', 'customer message', 'inbox', 'support centre', 'helpdesk', 'late', 'sla'],
    steps: [
      'Go to Customers → Support centre. Late and urgent requests are at the top; the tiles show Open, Unassigned, Late, Waiting on customers and Mine.',
      'Open a request: read Enyo\'s summary, check the customer\'s vehicles and jobs on the right, and whether they are verified before discussing their records or money.',
      'Reply in the box (or start from Enyo\'s suggested reply). It is emailed in the same thread and shows in their customer portal. Choose what happens next: wait for the customer, resolved, or on hold.',
      'Add an internal note for colleagues (the customer never sees notes), change the priority, or assign it.',
    ],
  },
  {
    id: 'support-new', title: 'Log a phone call, WhatsApp message or walk-in as a support request', page: '/crm/support/new', needs: ['crm.view'], does: ['support.tickets.manage'], who: 'Front Desk / Customer Care',
    keywords: ['log a call', 'new ticket', 'new support request', 'walk in', 'whatsapp', 'phone complaint', 'open a ticket', 'complaint'],
    steps: ['Go to Customers → Support centre → New request.', 'Enter the customer, what it is about and what they said, and the priority.', 'Open it: it gets a SUP number, a target time and an owner, and is followed to resolution.'],
  },
  {
    id: 'support-numbers', title: 'See the Support centre numbers (speed, targets, satisfaction)', page: '/crm/support/analytics', needs: ['crm.view'], does: ['support.tickets.manage'],
    keywords: ['support numbers', 'support analytics', 'first response', 'csat', 'satisfaction', 'rating', 'sla', 'how fast'],
    steps: ['Go to Customers → Support centre → Numbers.', 'Choose the period: first-answer time, targets met, reopen rate, satisfaction and topics.', 'Ask Enyo: "How is customer care doing this month?" for the same figures in a sentence.'],
  },
  {
    id: 'support-setup', title: 'Set up the Support centre (email address, hours, targets)', page: '/settings/support', needs: ['admin.settings.manage'], does: ['support.manage'], who: 'The Owner / GMD',
    keywords: ['support setup', 'support email', 'customercare@', 'queue', 'team', 'auto reply', 'opening hours', 'targets', 'sla', 'public holidays', 'holiday', 'closed days'],
    steps: [
      'Go to Settings → Support centre set-up.',
      'Teams & addresses → add a team (for example Customer care & complaints), choose how Enyo helps (people only, Enyo drafts, or Enyo answers general questions), its targets and whether to send an acknowledgement.',
      'Open the team: connect its email address with an app password (new mail becomes numbered requests within minutes), and tick who works it.',
      'Hours & holidays: set opening hours. Nigerian public holidays are worked out automatically each year.',
    ],
  },
  {
    id: 'support-enyo-replies', title: 'Check and correct Enyo’s support replies', page: '/crm/support/enyo', needs: ['crm.view'], does: ['support.tickets.manage'], who: 'Front Desk / Customer Care and the Owner',
    keywords: ['enyo replies', 'check enyo', 'ai answers', 'review ai', 'correct enyo', 'wrong answer', 'why handed over', 'quality'],
    steps: [
      'Go to Customers → Support centre → Enyo’s replies.',
      'Under "To check" open each answer Enyo sent by itself: read their message and Enyo’s reply.',
      'Choose Good, Needed a correction (write the right answer) or Wrong, and save. A correction waits on the Enyo learning page for the Owner to approve.',
    ],
  },
  {
    id: 'get-help', title: 'Ask for help (the Owner or the EJO platform team)', page: '/support/help', needs: EVERYONE,
    keywords: ['help', 'get help', 'support', 'problem', 'error', 'not working', 'cannot', 'can\'t', 'stuck', 'access', 'permission', 'contact admin', 'report a problem', 'bug'],
    steps: [
      'Open Get help in the menu (on an error screen, press "Ask for help with this error": the reference comes along).',
      'Say what you need and what happened, choose "Our administrators" (access, how to, a record) or "The EJO platform team" (an error in the system), and send.',
      'Enyo may answer at once with the steps for your role; press "I still need a person" if it did not help. Answers come to your notifications and email.',
    ],
  },
  {
    id: 'reminders', title: 'Set a reminder', page: '/reminders', needs: EVERYONE,
    keywords: ['reminder', 'remind me', 'follow up', 'callback', 'call back', 'alarm', 'due'],
    steps: ['Go to Reminders and create a new one.', 'Give it a title and the date and time it is due, then save. You are reminded when it is due.', 'You can also ask Enyo: "Remind me to call Mrs Okafor at 3 pm" — check the draft and save it.'],
  },
  {
    id: 'reminders-delegate', title: 'Let a colleague set reminders for me', page: '/reminders', needs: EVERYONE,
    keywords: ['reminder for someone', 'delegate', 'set reminders for me', 'permission'],
    steps: ['Go to Reminders and open "Who may set reminders for me".', 'Choose the colleague and press allow. They can now set reminders for you; you can withdraw it at any time.', 'To set one for a colleague, they must have allowed you first.'],
  },
];

const STOP = new Set(['how', 'do', 'i', 'a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'my', 'me', 'is', 'can', 'what', 'where', 'and', 'or', 'with', 'please', 'you', 'it', 'this', 'that', 'should', 'does', 'one', 'we']);

/** Lower-case words of a question, without filler. */
export function guideWords(q: string): string[] {
  return q.toLowerCase().replace(/[^a-z0-9%\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
}

/** How well one entry matches the question (0 = not at all). */
export function guideScore(e: GuideEntry, q: string): number {
  const words = guideWords(q);
  if (!words.length) return 0;
  const phrase = words.join(' ');
  const title = e.title.toLowerCase();
  let s = 0;
  if (title.includes(phrase)) s += 6;
  for (const k of e.keywords) {
    if (phrase.includes(k)) s += k.includes(' ') ? 5 : 3;
  }
  for (const w of words) {
    if (title.split(/[^a-z0-9%]+/).includes(w)) s += 2;
    else if (e.keywords.some((k) => k.split(' ').includes(w))) s += 1;
  }
  return s;
}

/** Whether this person may open the entry's page (the same rule the page enforces). */
export function canOpenGuide(e: GuideEntry, p: Principal): boolean {
  return e.needs.length === 0 || e.needs.some((k) => decide(p, k).allowed);
}

export type GuideHit = { id: string; title: string; href: string; youCanDoThis: boolean; who?: string; steps: string[] };

/**
 * The best matching entries this person can open, plus the titles of
 * matches they can't (so Enyo can say it exists but is someone else's).
 */
/** Whether an entry is offered now (the Parts store's steps only while that module is on). */
export function guideInEdition(e: GuideEntry, isOn: (key: string) => boolean = moduleIsOn): boolean {
  return !e.module || isOn(e.module);
}

export function searchGuide(q: string, p: Principal, limit = 3): { results: GuideHit[]; notYours: string[] } {
  const ranked = GUIDE.filter((e) => guideInEdition(e)).map((e) => ({ e, s: guideScore(e, q) })).filter((x) => x.s >= 3).sort((a, b) => b.s - a.s);
  const results: GuideHit[] = [];
  const notYours: string[] = [];
  for (const { e } of ranked) {
    if (canOpenGuide(e, p)) {
      if (results.length < limit) {
        const youCanDoThis = !e.does?.length || e.does.some((k) => decide(p, k).allowed);
        results.push({ id: e.id, title: e.title, href: e.page, youCanDoThis, ...(e.who ? { who: e.who } : {}), steps: e.steps });
      }
    } else if (notYours.length < 3) notYours.push(e.title);
  }
  return { results, notYours };
}
