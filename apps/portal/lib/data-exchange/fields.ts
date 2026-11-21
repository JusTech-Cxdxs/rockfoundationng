/**
 * Data Exchange — what each kind of record looks like in a file. Pure (no
 * database, no framework; relative imports only), shared by the screens, the
 * server actions, the templates and the tests.
 *
 * Every field lists the column names it is recognised by: plain English as
 * people type them in Excel, and the column headers Zoho Books, Zoho Invoice
 * and Zoho CRM write in their exports ("Display Name", "EmailID", "Billing
 * City", "Invoice Number", "Account Name"…), so those files map themselves.
 * Matching ignores case, spaces, dots, dashes and underscores.
 */
import { moduleIsOn } from '../modules';

export type EntityKey = 'staff' | 'customers' | 'vehicles' | 'suppliers' | 'parts' | 'stock' | 'invoices' | 'jobs' | 'openJobs';

export type FieldDef = {
  key: string;
  label: string;
  /** What to put in the column (shown on the mapping screen and in the template). */
  help: string;
  /** Column names this field is recognised by (plain names and Zoho's). */
  aliases: string[];
  /** An example value for the template. */
  example: string;
  /** Required for every row; otherwise the row is rejected. */
  required?: boolean;
  /** A short list of accepted values (shown as a dropdown in the Excel template). */
  choices?: string[];
  /** Only for updating records from an edited export: read, never in a template. */
  roundTrip?: boolean;
};

export type EntityDef = {
  key: EntityKey;
  label: string;
  /** "customer" / "vehicle", for sentences. */
  noun: string;
  plural: string;
  description: string;
  /** Who may approve it (on top of the Data Exchange approval permission): the department that owns these records. */
  needs: 'crm.manage' | 'store.parts.manage' | 'workshop.close.approve' | 'admin.users.manage';
  /** Loads into one branch (its catalogue / stock / sales / workshop), chosen when the import starts. */
  branch?: boolean;
  /** What kind of branch it loads into (lib/branch-types.ts): a store (parts, stock, invoices) or a workshop (job history). */
  branchArea?: 'store' | 'workshop';
  /** Read-only history: shown and counted, never edited; undo voids it. */
  history?: boolean;
  /** Finance confirms the totals after loading (opening stock, invoice history). */
  financeSignOff?: boolean;
  /** Who approves, in words. */
  approver: string;
  /** In this order, a row is matched to an existing record. */
  matchOrder: string[];
  /** Load this before (e.g. customers before their vehicles). */
  after?: EntityKey;
  fields: FieldDef[];
};

export const ENTITIES: Record<EntityKey, EntityDef> = {
  staff: {
    key: 'staff',
    label: 'Staff',
    noun: 'staff member',
    plural: 'staff',
    description: 'The organisation’s people, from a staff list or an HR export (Zoho People and the like): each becomes an EJO account in their branch and department, with their roles, switched off until an administrator of the whole organisation sends them their invitation to set a password. Load staff first: open job cards and services find their technicians and supervisors by employee ID. Administrators are never brought in by a file.',
    needs: 'admin.users.manage',
    approver: 'an Organisation Administrator',
    matchOrder: ['work email', 'employee ID'],
    fields: [
      { key: 'fullName', label: 'Full name', help: 'As it should appear in EJO (first and last name together). A file with first and last names in two columns (Zoho People) needs no full-name column.', aliases: ['full name', 'name', 'employee name', 'staff name', 'employee', 'display name'], example: 'Adaeze Obi', required: true },
      { key: 'firstName', label: 'First name', help: 'Optional: when the file has first and last names in their own columns, they make the full name.', aliases: ['first name', 'firstname', 'given name', 'forename'], example: '' },
      { key: 'lastName', label: 'Last name', help: 'Optional: see First name.', aliases: ['last name', 'lastname', 'surname', 'family name'], example: '' },
      { key: 'email', label: 'Work email', help: 'The person’s own work address: they sign in with it and their invitation goes to it. Never a shared mailbox.', aliases: ['work email', 'email', 'e-mail', 'email address', 'email id', 'emailid', 'official email'], example: 'adaeze.obi@example.com', required: true },
      { key: 'phone', label: 'Phone', help: 'Optional: work phone.', aliases: ['phone', 'mobile', 'telephone', 'phone number', 'work phone', 'mobile phone'], example: '0803 123 4567' },
      { key: 'employeeId', label: 'Employee ID', help: 'Optional: the staff number EJO should use (the HR number). Empty: EJO issues one for the branch (ORG-BRANCH-NNNN). Open job cards and services find people by it.', aliases: ['employee id', 'employee number', 'employee no', 'staff id', 'staff number', 'staff no', 'emp id'], example: 'EMP-0042' },
      { key: 'personnelNumber', label: 'Personnel number', help: 'Optional: the number in the HR or payroll records, when it is not the employee ID. Kept and searchable.', aliases: ['personnel number', 'personnel no', 'staff number', 'hr number'], example: '00012345' },
      { key: 'branch', label: 'Branch', help: 'The branch they work at: its name or its code, as on the Structure page.', aliases: ['branch', 'branch name', 'location', 'location name', 'site', 'plant', 'work location'], example: 'Ota Workshop', required: true },
      { key: 'department', label: 'Department', help: 'Optional: their department in that branch, by name (as on the Structure page).', aliases: ['department', 'dept', 'unit', 'section', 'org unit'], example: 'Cars and SUVs' },
      { key: 'roles', label: 'Roles', help: 'Optional: their EJO roles by name, separated by ";" — e.g. "Technician; Front Desk". They must exist (Roles). Administrator roles are given by hand, never by a file. Empty: no role yet (they see only their own account).', aliases: ['roles', 'role', 'ejo role', 'ejo roles', 'access', 'position', 'job role'], example: 'Technician' },
    ],
  },
  customers: {
    key: 'customers',
    label: 'Customers',
    noun: 'customer',
    plural: 'customers',
    description: 'People and organisations you serve: names, phone numbers, emails, addresses, customer numbers — from Zoho Books or Zoho Invoice (Contacts → Export), Zoho CRM (Contacts or Accounts → Export), an old system or your own spreadsheet.',
    needs: 'crm.manage',
    approver: 'a Workshop manager, the Customer care lead or an administrator',
    matchOrder: ['customer number', 'email', 'phone'],
    fields: [
      { key: 'ejoRecord', label: 'EJO record', help: 'Only to update records from an edited export: the record’s EJO number, as the export writes it (“EJO record”, ZZ_EJO_ID). Leave it out to add new records.', aliases: ['EJO record', 'EJO ID', 'EJO record id', 'EJO number'], example: '', roundTrip: true },
      { key: 'externalId', label: 'Customer number', help: 'The customer’s number in Zoho (Customer ID, Contact ID) or your old system. Used to recognise the customer again in later files.', aliases: ['customer number', 'customer no', 'customer id', 'customer code', 'contact id', 'account id', 'record id', 'account number', 'account no', 'debtor', 'debtor number', 'bp number', 'business partner'], example: '1000123' },
      { key: 'fullName', label: 'Name', help: 'The person’s full name, or the organisation’s name (Zoho: Display Name). A file with first and last names in two columns, or only a company name, needs no name column.', aliases: ['name', 'full name', 'display name', 'contact name', 'customer name', 'customer', 'client name', 'client'], example: 'Ada Okafor', required: true },
      { key: 'firstName', label: 'First name', help: 'Optional (Zoho First Name): with Last name, makes the name when there is no name column.', aliases: ['first name', 'firstname', 'contact first name', 'given name'], example: '' },
      { key: 'lastName', label: 'Last name', help: 'Optional (Zoho Last Name).', aliases: ['last name', 'lastname', 'contact last name', 'surname'], example: '' },
      { key: 'name2', label: 'Name, second line', help: 'Optional: added after the name (e.g. a branch or "Attn" line).', aliases: ['name 2', 'second name', 'name line 2'], example: '' },
      { key: 'customerType', label: 'Type', help: 'Individual or Organisation. Left empty: Organisation when a company name is given, otherwise Individual.', aliases: ['customer type', 'customer sub type', 'customer subtype', 'type', 'category', 'customer category'], example: 'Individual', choices: ['Individual', 'Organisation'] },
      { key: 'companyName', label: 'Company name', help: 'For organisations: the registered company name, if different from the name.', aliases: ['company', 'company name', 'account name', 'organisation', 'organization', 'organisation name', 'business name', 'employer'], example: '' },
      { key: 'email', label: 'Email', help: 'Optional. Only the customer’s own address: it is how they sign in to the customer portal. Leave empty if there is none — never a made-up one.', aliases: ['email', 'e-mail', 'email address', 'email id', 'emailid', 'mail', 'e mail'], example: 'ada.okafor@example.com' },
      { key: 'phone', label: 'Phone', help: 'The main number, e.g. 0803 123 4567 or +234 803 123 4567.', aliases: ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'mobile number', 'gsm', 'cell', 'contact number'], example: '0803 123 4567' },
      { key: 'altPhone', label: 'Second phone', help: 'Optional second number.', aliases: ['second phone', 'alt phone', 'alternative phone', 'phone 2', 'mobile 2', 'other phone', 'mobile phone', 'mobilephone'], example: '' },
      { key: 'address', label: 'Address', help: 'Street and area, one line (e.g. "Plot 3, Cheesebrough"). Long addresses are kept in full as an extra address.', aliases: ['STREET', 'address', 'address line 1', 'street', 'street address', 'address 1', 'billing address', 'billing street', 'billing address line 1', 'mailing street', 'mailing address'], example: 'Plot 3, Adeola Odeku Street' },
      { key: 'city', label: 'City', help: 'Optional.', aliases: ['city', 'town', 'billing city', 'mailing city'], example: 'Lagos' },
      { key: 'state', label: 'State', help: 'Optional.', aliases: ['REGION', 'state', 'region', 'province', 'billing state', 'mailing state'], example: 'Lagos' },
      { key: 'taxId', label: 'Tax ID', help: 'Optional, for organisations (TIN / VAT number).', aliases: ['tin', 'tax id', 'tax number', 'vat', 'vat number', 'tax registration number', 'tax reg no'], example: '' },
      { key: 'paymentTerms', label: 'Payment terms', help: 'Optional (Zoho Payment Terms, e.g. "Net 30"). Kept on the customer as a tag; credit terms themselves are set in EJO by Finance or the Manager (Customers → the organisation’s page).', aliases: ['payment terms', 'payment terms label', 'terms', 'credit terms'], example: '' },
      { key: 'tags', label: 'Tags', help: 'Optional labels separated by commas, e.g. "Fleet, VIP".', aliases: ['tags', 'labels', 'group', 'segment', 'customer group'], example: 'Fleet' },
      { key: 'customerSince', label: 'Customer since', help: 'Optional: when they became a customer (Zoho Created Time, or the date the old system opened the account), e.g. 14.03.2019. Used for “customer since” and the analytics instead of the day of the import.', aliases: ['customer since', 'created on', 'creation date', 'date created', 'created', 'created time', 'opened on', 'account opened', 'first purchase', 'since'], example: '14.03.2019' },
    ],
  },
  vehicles: {
    key: 'vehicles',
    label: 'Vehicles',
    noun: 'vehicle',
    plural: 'vehicles',
    description: 'Customers’ vehicles: chassis number (VIN), plate, engine number, make, model, year, mileage — each linked to its customer.',
    needs: 'crm.manage',
    approver: 'a Workshop manager, the Customer care lead or an administrator',
    matchOrder: ['vehicle number', 'chassis number (VIN)', 'plate'],
    after: 'customers',
    fields: [
      { key: 'ejoRecord', label: 'EJO record', help: 'Only to update records from an edited export: the record’s EJO number, as the export writes it (“EJO record”, ZZ_EJO_ID). Leave it out to add new records.', aliases: ['EJO record', 'EJO ID', 'EJO record id', 'EJO number'], example: '', roundTrip: true },
      { key: 'customerExternalId', label: 'Customer number', help: 'Whose vehicle it is: the customer number from the customers file. Or give the customer’s email or phone instead.', aliases: ['customer number', 'customer no', 'customer id', 'customer code', 'owner number', 'account number', 'bp number', 'business partner'], example: '1000123' },
      { key: 'customerEmail', label: 'Customer email', help: 'Alternative way to find the customer.', aliases: ['customer email', 'owner email', 'email'], example: '' },
      { key: 'customerPhone', label: 'Customer phone', help: 'Alternative way to find the customer.', aliases: ['customer phone', 'owner phone', 'phone', 'telephone', 'mobile'], example: '' },
      { key: 'externalId', label: 'Vehicle number', help: 'Optional: the vehicle’s number in your old system or fleet list.', aliases: ['equipment', 'equipment number', 'vehicle id', 'vehicle number', 'asset number', 'fleet number'], example: '' },
      { key: 'chassisNumber', label: 'Chassis number (VIN)', help: 'The 17-character VIN. A chassis number or a plate is needed for every vehicle.', aliases: ['VIN', 'FIN', 'chassis', 'chassis number', 'chassis no', 'vin number', 'frame number'], example: 'AHTGB3CD401234567' },
      { key: 'plateNumber', label: 'Plate number', help: 'The registration plate, e.g. LND 123 AB.', aliases: ['plate', 'plate number', 'plate no', 'registration', 'registration number', 'reg no', 'reg number', 'number plate'], example: 'LND 123 AB' },
      { key: 'engineNumber', label: 'Engine number', help: 'Optional.', aliases: ['engine number', 'engine no', 'ENGINE_NO', 'motor number'], example: '2GD-1234567' },
      { key: 'engineType', label: 'Engine type', help: 'Optional, e.g. 2GD-FTV, 2.5 petrol.', aliases: ['engine type', 'engine', 'engine model'], example: '2GD-FTV' },
      { key: 'make', label: 'Make', help: 'e.g. Toyota, Ford, Nissan, Mitsubishi, Hyundai, Mercedes-Benz.', aliases: ['make', 'brand', 'manufacturer', 'MAKE', 'vehicle make'], example: 'Toyota' },
      { key: 'model', label: 'Model', help: 'e.g. Hilux, Hiace, Land Cruiser, Camry, Ranger.', aliases: ['model', 'MODEL', 'vehicle model', 'model name', 'model description'], example: 'Hilux' },
      { key: 'year', label: 'Year', help: 'Year of manufacture, e.g. 2024.', aliases: ['year', 'model year', 'MODEL_YEAR', 'year of manufacture', 'yom', 'manufacture year'], example: '2024' },
      { key: 'vehicleType', label: 'Passenger or Commercial', help: 'Passenger (cars, SUVs) or Commercial (trucks, buses, vans). Left empty: worked out from the model where it is obvious, otherwise left blank.', aliases: ['vehicle type', 'category', 'vehicle category', 'type', 'segment'], example: 'Commercial', choices: ['Passenger', 'Commercial'] },
      { key: 'mileage', label: 'Mileage (km)', help: 'Last known odometer reading in kilometres.', aliases: ['mileage', 'odometer', 'km', 'kilometres', 'kilometers', 'odometer reading', 'last mileage'], example: '45200' },
    ],
  },
  suppliers: {
    key: 'suppliers',
    label: 'Suppliers',
    noun: 'supplier',
    plural: 'suppliers',
    description: 'The organisation’s suppliers: names, vendor numbers, contacts. Shared by every branch; goods receipts link to them.',
    needs: 'store.parts.manage',
    approver: 'a Store manager or an administrator',
    matchOrder: ['old system number', 'name'],
    fields: [
      { key: 'ejoRecord', label: 'EJO record', help: 'Only to update records from an edited export: the record’s EJO number, as the export writes it (“EJO record”, ZZ_EJO_ID). Leave it out to add new records.', aliases: ['EJO record', 'EJO ID', 'EJO record id', 'EJO number'], example: '', roundTrip: true },
      { key: 'externalId', label: 'Supplier number (old system)', help: 'The vendor number in QuickBooks or your old system.', aliases: ['vendor', 'vendor number', 'vendor no', 'supplier number', 'supplier no', 'supplier code', 'creditor', 'creditor number'], example: '0000300045' },
      { key: 'name', label: 'Name', help: 'The supplier’s name.', aliases: ['name', 'supplier', 'supplier name', 'vendor name', 'company'], example: 'Ota Auto Parts Ltd', required: true },
      { key: 'name2', label: 'Name, second line', help: 'Optional: added after the name.', aliases: ['name 2'], example: '' },
      { key: 'contactName', label: 'Contact person', help: 'Optional.', aliases: ['contact', 'contact person', 'contact name', 'attention'], example: 'Sales desk' },
      { key: 'phone', label: 'Phone', help: 'Optional.', aliases: ['phone', 'telephone', 'tel', 'mobile'], example: '+27 41 403 9111' },
      { key: 'email', label: 'Email', help: 'Optional.', aliases: ['email', 'e-mail'], example: 'orders@example.com' },
      { key: 'address', label: 'Address', help: 'Optional, one line.', aliases: ['address', 'street'], example: 'Struandale, Port Elizabeth' },
      { key: 'city', label: 'City', help: 'Optional.', aliases: ['city', 'town'], example: '' },
      { key: 'taxId', label: 'Tax ID', help: 'Optional (TIN / VAT number).', aliases: ['tin', 'tax id', 'vat'], example: '' },
    ],
  },
  parts: {
    key: 'parts',
    label: 'Parts',
    noun: 'part',
    plural: 'parts',
    description: 'The parts catalogue: part numbers, descriptions, units, material groups, tracking, prices, reorder levels — into one branch’s Store.',
    needs: 'store.parts.manage',
    approver: 'a Store manager or an administrator',
    branch: true,
    matchOrder: ['old system number', 'part number'],
    fields: [
      { key: 'ejoRecord', label: 'EJO record', help: 'Only to update records from an edited export: the record’s EJO number, as the export writes it (“EJO record”, ZZ_EJO_ID). Leave it out to add new records.', aliases: ['EJO record', 'EJO ID', 'EJO record id', 'EJO number'], example: '', roundTrip: true },
      { key: 'partNumber', label: 'Part number', help: 'The part number. Unique in the branch.', aliases: ['material', 'material number', 'part number', 'part no', 'part code', 'item code', 'item number', 'sku', 'article number'], example: '04465-02220', required: true },
      { key: 'name', label: 'Description', help: 'What the part is called.', aliases: ['material description', 'description', 'part name', 'name', 'item description', 'short text'], example: 'Brake pad set, front (Toyota Corolla)', required: true },
      { key: 'category', label: 'Material group / category', help: 'Optional: the part’s group or category.', aliases: ['material group', 'category', 'product group', 'group'], example: 'BRAKES' },
      { key: 'baseUnit', label: 'Base unit', help: 'The unit stock is counted in (Piece, Litre, Set, or a code such as EA, PC, L, KG). Empty: Piece.', aliases: ['base unit', 'unit', 'uom', 'unit of measure', 'bun'], example: 'ST' },
      { key: 'trackingType', label: 'Tracking', help: 'Quantity, Batch or Serial. Empty: Quantity.', aliases: ['tracking', 'tracking type', 'batch managed', 'serial profile'], example: 'Quantity', choices: ['Quantity', 'Batch', 'Serial'] },
      { key: 'barcode', label: 'Barcode', help: 'Optional: the barcode on the pack.', aliases: ['barcode', 'ean', 'gtin', 'upc'], example: '' },
      { key: 'sellingPrice', label: 'Selling price (₦)', help: 'Optional: the price per base unit.', aliases: ['selling price', 'price', 'list price', 'sales price', 'retail price'], example: '45000' },
      { key: 'reorderPoint', label: 'Reorder point', help: 'Optional: reorder when stock falls to this.', aliases: ['reorder point', 'reorder level', 'min stock', 'minimum stock'], example: '4' },
      { key: 'safetyStock', label: 'Safety stock', help: 'Optional: stock kept back for emergencies.', aliases: ['safety stock', 'buffer stock'], example: '2' },
      { key: 'altUnit', label: 'Alternative unit', help: 'Optional: a unit it also comes in, e.g. Carton, Drum.', aliases: ['alternative unit', 'alt unit', 'pack unit', 'purchase unit'], example: '' },
      { key: 'altFactor', label: 'Base units in the alternative unit', help: 'How many base units one alternative unit holds, e.g. 12.', aliases: ['conversion', 'conversion factor', 'pack size', 'units per pack'], example: '' },
      { key: 'externalId', label: 'Number in the old system', help: 'Optional, when it differs from the part number (e.g. the QuickBooks item name).', aliases: ['old material number', 'old part number', 'legacy number'], example: '' },
    ],
  },
  stock: {
    key: 'stock',
    label: 'Opening stock',
    noun: 'stock line',
    plural: 'stock lines',
    description: 'What each part of one branch’s Store holds at the cut-over, with its cost. Loaded as opening-balance goods receipts, so stock value, FIFO costs and the inventory analytics include it.',
    needs: 'store.parts.manage',
    approver: 'a Store manager or an administrator, then Finance confirms the totals',
    branch: true,
    financeSignOff: true,
    matchOrder: ['part number'],
    after: 'parts',
    fields: [
      { key: 'partNumber', label: 'Part number', help: 'The part number. The part must be in the branch’s catalogue already.', aliases: ['material', 'material number', 'part number', 'part no', 'item code', 'sku'], example: '04465-02220', required: true },
      { key: 'quantity', label: 'Quantity on hand', help: 'Stock on hand, in the unit below.', aliases: ['unrestricted', 'unrestricted stock', 'quantity', 'qty', 'on hand', 'stock', 'quantity on hand', 'closing stock'], example: '12', required: true },
      { key: 'unit', label: 'Unit', help: 'Optional: the unit of the quantity. Empty: the part’s base unit.', aliases: ['unit', 'uom', 'bun'], example: 'ST' },
      { key: 'totalValue', label: 'Stock value (₦)', help: 'The value of this stock. Give this or the unit cost.', aliases: ['stock value', 'total value', 'value', 'valuation', 'amount'], example: '540000' },
      { key: 'unitCost', label: 'Unit cost (₦)', help: 'The cost of one unit (average or standard cost). Used when no stock value is given.', aliases: ['unit cost', 'cost price', 'cost', 'moving average price', 'standard price', 'price'], example: '45000' },
      { key: 'priceUnit', label: 'Price unit', help: 'The number of units the unit cost is for (a cost per 100 has 100 here). Empty: 1.', aliases: ['price unit', 'per'], example: '' },
      { key: 'batch', label: 'Batch', help: 'The batch or lot number. Needed for batch-tracked parts.', aliases: ['batch', 'batch number', 'lot', 'lot number'], example: '' },
      { key: 'serials', label: 'Serial numbers', help: 'For serial-tracked parts: one per unit, separated by commas or semicolons.', aliases: ['serial', 'serials', 'serial numbers', 'serial number'], example: '' },
      { key: 'storageLocation', label: 'Storage location', help: 'Optional: where it is kept. Kept on the receipt’s notes.', aliases: ['storage location', 'sloc', 'location', 'bin'], example: '0001' },
    ],
  },
  invoices: {
    key: 'invoices',
    label: 'Invoice history',
    noun: 'invoice',
    plural: 'invoices',
    description: 'Invoices from before EJO: Zoho Books or Zoho Invoice (Invoices → Export), QuickBooks, an old system or your own spreadsheet: date, number, customer, vehicle, amount. Read-only history that counts in each customer’s spend, last visit and the analytics. A Zoho export with one row per item is understood: the first row of each invoice is loaded with the invoice total; its other rows are reported as the same invoice.',
    needs: 'crm.manage',
    approver: 'a Workshop manager, the Customer care lead or an administrator, then Finance confirms the totals',
    branch: true,
    history: true,
    financeSignOff: true,
    matchOrder: ['invoice number'],
    after: 'customers',
    fields: [
      { key: 'invoiceNumber', label: 'Invoice number', help: 'The invoice’s number in Zoho or the old system. Each invoice is loaded once.', aliases: ['invoice number', 'invoice no', 'invoice#', 'invoice', 'billing document', 'document number', 'doc no', 'document no', 'reference'], example: 'INV-000123', required: true },
      { key: 'invoiceDate', label: 'Invoice date', help: 'The date on the invoice, e.g. 14.03.2023.', aliases: ['invoice date', 'billing date', 'posting date', 'document date', 'date'], example: '14.03.2023', required: true },
      { key: 'customerExternalId', label: 'Customer number', help: 'The customer the invoice is for, by the number in the customers file (Zoho Customer ID). The customer must be imported first.', aliases: ['customer number', 'customer no', 'customer id', 'contact id', 'customer', 'sold-to', 'sold to party', 'payer', 'account number', 'bp number'], example: '1000123' },
      { key: 'customerPhone', label: 'Customer phone', help: 'Alternative way to find the customer.', aliases: ['customer phone', 'phone', 'telephone', 'mobile'], example: '' },
      { key: 'customerName', label: 'Customer name', help: 'Optional (Zoho Customer Name): finds the customer when there is no number or phone, if exactly one customer has that name.', aliases: ['customer name', 'contact name', 'client name', 'display name', 'bill to'], example: '' },
      { key: 'amount', label: 'Amount (₦)', help: 'The invoice amount in naira (Zoho Total). A net amount: add the tax column below to make it gross. Negative for a credit note (100- is understood).', aliases: ['amount (incl. tax)', 'amount', 'total', 'invoice total', 'invoice amount', 'grand total', 'gross amount', 'net value', 'value'], example: '485000.00', required: true },
      { key: 'balance', label: 'Balance (₦)', help: 'Optional (Zoho Balance): what was still owed when the file was made. Shown with the invoice.', aliases: ['balance', 'balance due', 'amount due', 'outstanding', 'open amount'], example: '' },
      { key: 'dueDate', label: 'Due date', help: 'Optional (Zoho Due Date). Shown with the invoice.', aliases: ['due date', 'payment due date', 'due on'], example: '' },
      { key: 'invoiceStatus', label: 'Status', help: 'Optional (Zoho Invoice Status: Paid, Overdue, Sent, Partially Paid, Void). Shown with the invoice; a void invoice is reported, never loaded.', aliases: ['invoice status', 'status', 'payment status'], example: '' },
      { key: 'tax', label: 'Tax (₦)', help: 'Optional: the tax amount, added to a net amount.', aliases: ['tax', 'tax amount', 'vat', 'vat amount'], example: '36375.00' },
      { key: 'currency', label: 'Currency', help: 'Optional: the currency code. Only naira (NGN) is loaded.', aliases: ['currency', 'currency code', 'curr'], example: 'NGN' },
      { key: 'vin', label: 'Chassis number (VIN)', help: 'Optional: the vehicle the work was on. Links the invoice to the vehicle when it is in the system.', aliases: ['VIN', 'chassis', 'chassis number', 'chassis no', 'vehicle', 'frame number'], example: 'AHTGB3CD401234567' },
      { key: 'documentType', label: 'Document type', help: 'Optional: the kind of document, e.g. Invoice or Credit note.', aliases: ['document type', 'billing type', 'doc type', 'type'], example: 'F2' },
      { key: 'description', label: 'Description', help: 'Optional: what the invoice was for (Zoho Item Name or Item Desc).', aliases: ['description', 'item name', 'item desc', 'item description', 'text', 'item text', 'narration', 'details'], example: 'Routine service and brake pads' },
      { key: 'itemQuantity', label: 'Quantity', help: 'Optional (Zoho Quantity): added to the description.', aliases: ['quantity', 'qty', 'item quantity'], example: '' },
      { key: 'itemPrice', label: 'Item price (₦)', help: 'Optional (Zoho Item Price or Rate): added to the description.', aliases: ['item price', 'rate', 'unit price', 'price'], example: '' },
    ],
  },
  jobs: {
    key: 'jobs',
    label: 'Job card history',
    noun: 'past job card',
    plural: 'past job cards',
    description: 'Job cards closed before EJO: from Zoho, an old system or your own spreadsheet: the vehicle, the customer, when it was opened and finished, the mileage, the work and the amount. Read-only history: shown on the customer and the vehicle, counted as a visit; a job card whose work was a service also starts the vehicle’s next-service clock.',
    needs: 'workshop.close.approve',
    approver: 'a Workshop manager or an administrator',
    branch: true,
    branchArea: 'workshop',
    history: true,
    matchOrder: ['job number'],
    after: 'customers',
    fields: [
      { key: 'jobNumber', label: 'Job number', help: 'The job card’s number in the old system. Each job card is loaded once.', aliases: ['order', 'order number', 'service order', 'job number', 'job no', 'job card number', 'job card no', 'job card', 'jc number', 'jc no', 'work order', 'work order number', 'wo number', 'ro number', 'repair order'], example: '482913', required: true },
      { key: 'customerExternalId', label: 'Customer number', help: 'Whose vehicle it was: the customer number from the customers file. Or give the customer’s phone or email. When the vehicle is already in EJO, its owner is used.', aliases: ['customer number', 'customer no', 'customer', 'sold-to', 'account number', 'bp number', 'partner'], example: '1000123' },
      { key: 'customerPhone', label: 'Customer phone', help: 'Alternative way to find the customer.', aliases: ['customer phone', 'phone', 'telephone', 'mobile'], example: '' },
      { key: 'customerEmail', label: 'Customer email', help: 'Alternative way to find the customer.', aliases: ['customer email', 'email', 'e-mail'], example: '' },
      { key: 'vin', label: 'Chassis number (VIN)', help: 'The vehicle the work was on. Links the job card to the vehicle when it is in EJO; a VIN or a plate is needed for the service clock.', aliases: ['VIN', 'chassis', 'chassis number', 'chassis no', 'frame number', 'vehicle'], example: 'AHTGB3CD401234567' },
      { key: 'plateNumber', label: 'Plate number', help: 'Optional: the registration plate, used to find the vehicle when there is no VIN.', aliases: ['plate', 'plate number', 'plate no', 'registration', 'registration number', 'reg no'], example: 'LND 123 AB' },
      { key: 'openedAt', label: 'Opened on', help: 'When the job card was opened, e.g. 14.03.2023.', aliases: ['opened on', 'opened', 'date opened', 'created on', 'creation date', 'start date', 'date in', 'check-in date', 'received', 'date'], example: '14.03.2023', required: true },
      { key: 'completedAt', label: 'Completed on', help: 'When the work was finished. Empty: shown as opened only; the service clock then counts from the day it was opened.', aliases: ['completed on', 'completed', 'date completed', 'finished on', 'finished', 'closed on', 'closed', 'date out', 'completion date', 'checkout date', 'checked out'], example: '16.03.2023' },
      { key: 'mileage', label: 'Mileage (km)', help: 'The odometer reading at the visit, in kilometres. It anchors the next-service clock.', aliases: ['mileage', 'odometer', 'km', 'kilometres', 'kilometers', 'odometer reading', 'mileage at service', 'counter reading'], example: '41200' },
      { key: 'description', label: 'Complaint / work requested', help: 'What was written on the job card, e.g. "Carry out service". A job card whose text says service is also treated as a service inside EJO (it starts the next-service clock).', aliases: ['description', 'short text', 'complaint', 'work requested', 'request', 'text', 'details', 'job description'], example: 'Carry out service 40,000 km; brakes squeal' },
      { key: 'workDone', label: 'Work done', help: 'Optional: what was done.', aliases: ['work done', 'work performed', 'operations', 'repairs', 'remarks', 'notes', 'findings'], example: 'Oil and filters changed; front pads replaced' },
      { key: 'technician', label: 'Technician', help: 'Optional: who did the work (name or employee ID). Seen by staff only, never by customers.', aliases: ['technician', 'mechanic', 'done by', 'worked by', 'assigned to', 'personnel number'], example: 'E. Okoro' },
      { key: 'labourAmount', label: 'Labour (₦)', help: 'Optional: labour charged, in naira.', aliases: ['labour', 'labor', 'labour amount', 'labour charge', 'labour cost'], example: '35000' },
      { key: 'partsAmount', label: 'Parts (₦)', help: 'Optional: parts charged, in naira.', aliases: ['parts', 'parts amount', 'parts charge', 'parts cost', 'materials'], example: '128500' },
      { key: 'totalAmount', label: 'Total (₦)', help: 'Optional: the total charged. Empty: labour + parts when either is given.', aliases: ['total', 'total amount', 'amount', 'invoice amount', 'invoice total', 'value', 'gross amount'], example: '163500' },
      { key: 'invoiceNumber', label: 'Invoice number', help: 'Optional: the invoice the job card was billed on — shown beside it, and matched to the invoice history when it is loaded.', aliases: ['invoice', 'invoice number', 'invoice no', 'invoice#', 'billing document', 'bill number'], example: 'INV-000123' },
      { key: 'status', label: 'Status', help: 'Optional: Closed or Cancelled. Empty: Closed. A job card still open belongs in the open job cards file, not here.', aliases: ['status', 'order status', 'system status', 'user status'], example: 'Closed', choices: ['Closed', 'Cancelled'] },
      { key: 'branch', label: 'Branch', help: 'Optional: the branch the work was done at. When given it must be the branch chosen for this import.', aliases: ['branch', 'branch name', 'workshop', 'location', 'plant'], example: 'Ota Workshop' },
    ],
  },
  openJobs: {
    key: 'openJobs',
    label: 'Open job cards (at the cut-over)',
    noun: 'open job card',
    plural: 'open job cards',
    description: 'The job cards still in the workshop on the day EJO takes over: each becomes a live EJO job card at its stage — old number kept, estimate marked approved before EJO, parts issued before EJO, deposits as opening payments that Finance confirms — with the customer and vehicle already in EJO. No emails are sent.',
    needs: 'workshop.close.approve',
    approver: 'a Workshop manager or an administrator, then Finance confirms the opening payments',
    branch: true,
    branchArea: 'workshop',
    financeSignOff: true,
    matchOrder: ['job number'],
    after: 'vehicles',
    fields: [
      { key: 'jobNumber', label: 'Job number', help: 'The job card’s number in the old system. Kept on the EJO job card and searchable; EJO gives it its own JC number.', aliases: ['order', 'order number', 'service order', 'job number', 'job no', 'job card number', 'job card no', 'job card', 'jc number', 'work order', 'wo number', 'repair order'], example: '483211', required: true },
      { key: 'customerExternalId', label: 'Customer number', help: 'Whose vehicle it is: the customer number from the customers file, or give the phone or email. When the vehicle is in EJO, its owner is used.', aliases: ['customer number', 'customer no', 'customer', 'account number', 'bp number', 'partner'], example: '1000123' },
      { key: 'customerPhone', label: 'Customer phone', help: 'Alternative way to find the customer.', aliases: ['customer phone', 'phone', 'telephone', 'mobile'], example: '' },
      { key: 'customerEmail', label: 'Customer email', help: 'Alternative way to find the customer.', aliases: ['customer email', 'email', 'e-mail'], example: '' },
      { key: 'vin', label: 'Chassis number (VIN)', help: 'The vehicle in the workshop. It must already be in EJO (load the vehicles file first); give the VIN or the plate.', aliases: ['VIN', 'chassis', 'chassis number', 'chassis no', 'frame number', 'vehicle'], example: 'AHTGB3CD401234567' },
      { key: 'plateNumber', label: 'Plate number', help: 'Alternative way to find the vehicle.', aliases: ['plate', 'plate number', 'plate no', 'registration', 'registration number', 'reg no'], example: 'LND 123 AB' },
      { key: 'openedAt', label: 'Opened on', help: 'When the vehicle came in, e.g. 28.10.2026. The EJO job card carries this date.', aliases: ['opened on', 'opened', 'date opened', 'created on', 'check-in date', 'date in', 'received', 'date'], example: '28.10.2026', required: true },
      { key: 'status', label: 'Stage', help: 'Where the job card is: Checked in, In progress, Awaiting parts, Quality check, Awaiting customer approval, Completed or Ready for collection. A closed or cancelled job card belongs in the job card history file.', aliases: ['stage', 'status', 'job status', 'order status', 'system status', 'user status'], example: 'In progress', choices: ['Checked in', 'In progress', 'Awaiting parts', 'Quality check', 'Awaiting customer approval', 'Completed', 'Ready for collection'] },
      { key: 'mileage', label: 'Mileage at check-in (km)', help: 'Optional: the odometer reading when the vehicle came in.', aliases: ['mileage', 'odometer', 'km', 'mileage at check-in', 'odometer reading'], example: '41200' },
      { key: 'complaint', label: 'Complaint / work requested', help: 'What the customer asked for, as written on the job card. Several complaints: separate them with ";".', aliases: ['complaint', 'complaints', 'work requested', 'description', 'short text', 'request', 'job description'], example: 'Carry out service 40,000 km; brakes squeal', required: true },
      { key: 'diagnosis', label: 'Findings so far', help: 'Optional: the technician’s findings or work done so far.', aliases: ['findings', 'diagnosis', 'work done', 'work so far', 'notes', 'remarks'], example: 'Front pads worn to the metal' },
      { key: 'technician', label: 'Technician (employee ID)', help: 'Optional: the technician’s employee ID in EJO. A name is tried too; nobody found leaves the job card unassigned.', aliases: ['technician', 'technician id', 'mechanic', 'assigned to', 'employee id', 'personnel number'], example: 'EMP-0042' },
      { key: 'supervisor', label: 'Supervisor (employee ID)', help: 'Optional: the supervising person’s employee ID in EJO. Empty: left for the workshop to set.', aliases: ['supervisor', 'supervisor id', 'service advisor', 'advisor', 'foreman'], example: 'EMP-0007' },
      { key: 'labourAmount', label: 'Labour estimate (₦)', help: 'Optional: labour on the approved estimate, in naira.', aliases: ['labour', 'labor', 'labour amount', 'labour estimate', 'labour charge'], example: '35000' },
      { key: 'partsAmount', label: 'Parts estimate (₦)', help: 'Optional: parts on the approved estimate, in naira (the part lines below add up to it; any remainder is one line).', aliases: ['parts', 'parts amount', 'parts estimate', 'materials'], example: '128500' },
      { key: 'estimateTotal', label: 'Estimate total (₦)', help: 'Optional: the approved estimate’s total. Empty: labour + parts.', aliases: ['estimate', 'estimate total', 'quotation', 'quote', 'total', 'total amount', 'amount'], example: '163500' },
      { key: 'estimateApproved', label: 'Estimate approved', help: 'Yes when the customer approved the estimate before EJO (the default when amounts are given); No when it is still waiting for the customer.', aliases: ['estimate approved', 'approved', 'customer approved', 'approval'], example: 'Yes', choices: ['Yes', 'No'] },
      { key: 'partsIssued', label: 'Parts issued', help: 'Optional: parts already issued from the store before EJO, one per item separated by ";" — part number or name, "x" quantity, "@" unit price: "8-97366-430-0 x2 @45000; Oil filter x1 @6500". Shown on the estimate as issued before EJO; stock is not moved (the opening stock already counts them out).', aliases: ['parts issued', 'issued parts', 'parts used', 'materials issued', 'components', 'items'], example: '8-97366-430-0 x2 @45000; Oil filter x1 @6500' },
      { key: 'paidAmount', label: 'Paid so far (₦)', help: 'Optional: deposits or payments already taken on this job card before EJO. Recorded as an opening payment; Finance confirms the total after the load.', aliases: ['paid', 'paid so far', 'deposit', 'deposit paid', 'amount paid', 'payments', 'advance'], example: '50000' },
      { key: 'paymentMethod', label: 'How it was paid', help: 'Optional: Bank transfer or Cash. Empty: Bank transfer.', aliases: ['payment method', 'how paid', 'method', 'paid by'], example: 'Bank transfer', choices: ['Bank transfer', 'Cash'] },
      { key: 'paymentReference', label: 'Payment reference', help: 'Optional: the receipt or transfer reference from the old system.', aliases: ['payment reference', 'receipt', 'receipt number', 'receipt no', 'transfer reference', 'reference'], example: 'RCPT-2026-0412' },
      { key: 'paidOn', label: 'Paid on', help: 'Optional: when the deposit was taken. Empty: the opening date.', aliases: ['paid on', 'payment date', 'receipt date', 'date paid'], example: '28.10.2026' },
      { key: 'notes', label: 'Notes', help: 'Optional: anything the workshop should know (kept on the job card’s notes).', aliases: ['note', 'internal notes', 'comments', 'memo'], example: 'Customer wants the old parts back' },
      { key: 'branch', label: 'Branch', help: 'Optional: the branch the job card is in. When given it must be the branch chosen for this import.', aliases: ['branch', 'branch name', 'workshop', 'location', 'plant'], example: 'Ota Workshop' },
    ],
  },
};

export const ENTITY_KEYS = Object.keys(ENTITIES) as EntityKey[];

/**
 * The module each kind of record loads into, for the kinds that belong to a
 * module this edition can switch off (lib/modules.ts): the Store's
 * suppliers, parts and opening stock. Kinds not listed are always on.
 */
const ENTITY_MODULE: Partial<Record<EntityKey, string>> = {
  suppliers: 'inventory', parts: 'inventory', stock: 'inventory',
};

/** Whether a kind of record can be imported in this edition (its module is switched on). */
export function entityInEdition(k: EntityKey, isOn: (key: string) => boolean = moduleIsOn): boolean {
  const m = ENTITY_MODULE[k];
  return !m || isOn(m);
}

/** The kinds of record offered for import in this edition, in the order above. */
export const EDITION_ENTITY_KEYS: EntityKey[] = ENTITY_KEYS.filter((k) => entityInEdition(k));

/**
 * Where imported records came from, stamped on each one (externalSource):
 * Zoho, an old system or a spreadsheet. Numbers in the file are kept under
 * it, so a later file from the same place recognises them.
 */
export const IMPORT_SOURCE = 'LEGACY' as const;
export type ImportSource = typeof IMPORT_SOURCE;

/** Where an import's file came from, in words. */
export function sourceWords(sourceSystem: string): string {
  return sourceSystem === 'LEGACY' ? 'Zoho, an old system or a spreadsheet' : 'an old system or a spreadsheet';
}

/** Common unit codes → the words the Store uses. Anything else is kept as written. */
const UNIT_CODES: Record<string, string> = {
  ST: 'Piece', PC: 'Piece', PCE: 'Piece', EA: 'Each', EACH: 'Each', PCS: 'Piece', NOS: 'Piece', NO: 'Piece',
  L: 'Litre', LTR: 'Litre', LT: 'Litre', ML: 'Millilitre', KG: 'Kilogram', G: 'Gram', M: 'Metre', MTR: 'Metre', CM: 'Centimetre', MM: 'Millimetre',
  SET: 'Set', ST2: 'Set', PAA: 'Pair', PR: 'Pair', PAIR: 'Pair', CAR: 'Carton', CTN: 'Carton', CT: 'Carton', BOX: 'Box', BX: 'Box', DR: 'Drum', DRM: 'Drum',
  KIT: 'Kit', ROL: 'Roll', RL: 'Roll', PAK: 'Pack', PAC: 'Pack', PK: 'Pack', CAN: 'Can', BOT: 'Bottle', BT: 'Bottle', TUB: 'Tube', GAL: 'Gallon',
};
export function unitWord(raw: string): string {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  return UNIT_CODES[v.toUpperCase()] ?? v.replace(/^./, (c) => c.toUpperCase());
}

export function isEntityKey(x: unknown): x is EntityKey {
  return typeof x === 'string' && x in ENTITIES;
}

/** "Customer No.", "customer_no", "CUSTOMER-NO" → "customerno". */
export function headerKey(h: string): string {
  return String(h ?? '').toLowerCase().replace(/[\s._\-/\\()#:]+/g, '').replace(/[^a-z0-9]/g, '');
}

export type Mapping = Record<string, number | null>;

/**
 * Which column feeds which field, from the headers alone: an exact field key
 * or label first, then any alias. Each column is used once (first match
 * wins, in the field order above), so "phone" goes to the main phone and
 * not also to the second phone.
 */
export function autoMap(entity: EntityKey, headers: string[]): Mapping {
  const keys = headers.map(headerKey);
  const used = new Set<number>();
  const out: Mapping = {};
  for (const f of ENTITIES[entity].fields) {
    const wanted = [f.key, f.label, ...f.aliases].map(headerKey);
    let idx: number | null = null;
    for (const w of wanted) {
      const i = keys.findIndex((k, j) => k === w && !used.has(j));
      if (i >= 0) { idx = i; break; }
    }
    if (idx !== null) used.add(idx);
    out[f.key] = idx;
  }
  return out;
}

/** A saved profile maps by header NAME; turn it into column positions for this file's headers. */
export function mappingFromProfile(entity: EntityKey, profile: Record<string, string>, headers: string[]): Mapping {
  const keys = headers.map(headerKey);
  const out: Mapping = {};
  for (const f of ENTITIES[entity].fields) {
    const name = profile[f.key];
    const i = name ? keys.indexOf(headerKey(name)) : -1;
    out[f.key] = i >= 0 ? i : null;
  }
  return out;
}

/** The mapping as header names, for saving as a profile. */
export function profileFromMapping(mapping: Mapping, headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, i] of Object.entries(mapping)) if (typeof i === 'number' && headers[i] !== undefined) out[k] = headers[i]!;
  return out;
}

/** A mapping sent from the browser, checked: known fields only, each pointing at a real column, each column used once. */
export function cleanMapping(entity: EntityKey, raw: unknown, columnCount: number): Mapping {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Mapping = {};
  const used = new Set<number>();
  for (const f of ENTITIES[entity].fields) {
    const v = src[f.key];
    const i = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
    if (Number.isInteger(i) && i >= 0 && i < columnCount && !used.has(i)) { out[f.key] = i; used.add(i); } else out[f.key] = null;
  }
  return out;
}

/** What is missing before checking can start (a required field, or no way to find a vehicle's customer). */
export function mappingProblems(entity: EntityKey, mapping: Mapping): string[] {
  const out: string[] = [];
  // A name from first and last name (Zoho, staff lists), or a company's name alone, stands in for the name column.
  const nameFromParts = (entity === 'customers' || entity === 'staff') && (mapping.firstName != null || mapping.lastName != null || (entity === 'customers' && mapping.companyName != null));
  for (const f of ENTITIES[entity].fields) if (f.required && mapping[f.key] == null && !(f.key === 'fullName' && nameFromParts)) out.push(`Choose the column for “${f.label}”.`);
  if (entity === 'stock' && mapping.totalValue == null && mapping.unitCost == null) out.push('Choose the column for the stock value or the unit cost: stock is valued at what it cost.');
  if (entity === 'invoices' && mapping.customerExternalId == null && mapping.customerPhone == null && mapping.customerName == null) out.push('Choose how to find each invoice’s customer: their customer number, phone or name.');
  if (entity === 'openJobs' && mapping.vin == null && mapping.plateNumber == null) out.push('Choose the column for the vehicle’s chassis number (VIN) or plate: an open job card is on a vehicle.');
  if (entity === 'jobs' && mapping.customerExternalId == null && mapping.customerPhone == null && mapping.customerEmail == null && mapping.vin == null && mapping.plateNumber == null) out.push('Choose how to find each job’s customer: their customer number, phone or email — or the vehicle’s chassis number or plate.');
  if (entity === 'vehicles') {
    if (mapping.customerExternalId == null && mapping.customerEmail == null && mapping.customerPhone == null) out.push('Choose how to find each vehicle’s customer: their customer number, email or phone.');
    if (mapping.chassisNumber == null && mapping.plateNumber == null) out.push('Choose the column for the chassis number (VIN) or the plate.');
  }
  return out;
}
