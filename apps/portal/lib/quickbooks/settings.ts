/**
 * The workshop's QuickBooks settings (pure: no database). The account and item
 * names in its QuickBooks company file, the date order its QuickBooks expects,
 * and what a walk-in buyer is called there. Kept on the organisation
 * (Organisation.quickbooksSettings) and edited in Settings → QuickBooks by the
 * Owner or Accounts; anything not saved yet is the default below.
 */
import { DEFAULT_QB_ACCOUNTS, type QbAccounts, type QbDateFormat } from './iif';

export type QuickBooksSettings = {
  accounts: QbAccounts;
  dateFormat: QbDateFormat;
  /** Item names for lines that are not stock parts. */
  items: { labour: string; parts: string; sundry: string; outsidePart: string; outsideWork: string; carWash: string; creditNote: string; vat: string };
  /** The QuickBooks customer a walk-in counter sale is recorded against. */
  walkInCustomer: string;
};

export const DEFAULT_QB_SETTINGS: QuickBooksSettings = {
  accounts: DEFAULT_QB_ACCOUNTS,
  dateFormat: 'DD/MM/YYYY',
  items: { labour: 'Labour', parts: 'Parts', sundry: 'Sundries', outsidePart: 'Parts bought outside', outsideWork: 'Outside work', carWash: 'Car wash', creditNote: 'Credit note', vat: 'VAT 7.5%' },
  walkInCustomer: 'Walk-in customer',
};

/** What each account is for, in the order the Settings page shows them. */
export const ACCOUNT_FIELDS: { key: keyof QbAccounts; label: string; help: string; kind: 'Income' | 'Asset' | 'Liability' | 'Expense' | 'Bank' }[] = [
  { key: 'receivable', label: 'Accounts Receivable', help: 'What customers owe: every invoice is posted here.', kind: 'Asset' },
  { key: 'undepositedFunds', label: 'Cash received', help: 'Cash payments and cash counter sales wait here until they are banked (QuickBooks: Undeposited Funds).', kind: 'Asset' },
  { key: 'bank', label: 'Bank transfers', help: 'The bank account transfers are paid into.', kind: 'Bank' },
  { key: 'pos', label: 'POS card payments', help: 'Card payments on the POS terminal, until the bank settles them.', kind: 'Bank' },
  { key: 'labourIncome', label: 'Labour and workshop income', help: 'Labour, internal jobs and outside work charged to the customer.', kind: 'Income' },
  { key: 'partsIncome', label: 'Parts sales', help: 'Stock parts and parts bought outside, on jobs and over the counter.', kind: 'Income' },
  { key: 'carWashIncome', label: 'Car wash income', help: 'Car wash jobs.', kind: 'Income' },
  { key: 'sundryIncome', label: 'Sundry income', help: 'Sundries (consumables, disposal fees and the like).', kind: 'Income' },
  { key: 'discounts', label: 'Discounts given', help: 'The discount on an invoice.', kind: 'Expense' },
  { key: 'salesReturns', label: 'Credit notes', help: 'What an approved credit note takes back (QuickBooks: Sales Returns and Allowances).', kind: 'Income' },
  { key: 'vat', label: 'VAT payable', help: 'Output VAT on invoices and counter sales (7.5%), owed to FIRS.', kind: 'Liability' },
  { key: 'inventoryAsset', label: 'Stock (inventory asset)', help: 'The value of parts in the store.', kind: 'Asset' },
  { key: 'costOfGoodsSold', label: 'Cost of parts sold', help: 'What the parts sold cost.', kind: 'Expense' },
  { key: 'stockAdjustment', label: 'Stock adjustments', help: 'Differences found at a stock count and approved by the Owner.', kind: 'Expense' },
];

export const ITEM_FIELDS: { key: keyof QuickBooksSettings['items']; label: string; help: string }[] = [
  { key: 'labour', label: 'Labour item', help: 'The service item labour lines use.' },
  { key: 'parts', label: 'Store parts item', help: 'For a store part on an invoice whose part number is not known (older invoices). Parts with a part number use it as their item.' },
  { key: 'sundry', label: 'Sundries item', help: 'For sundry lines.' },
  { key: 'outsidePart', label: 'Parts bought outside', help: 'For parts bought outside for a job (not in the store).' },
  { key: 'outsideWork', label: 'Outside work item', help: 'For work done by another workshop and charged on.' },
  { key: 'carWash', label: 'Car wash item', help: 'For car wash jobs.' },
  { key: 'creditNote', label: 'Credit note item (QuickBooks Online only)', help: 'A service item posting to your credit notes account, used when credit notes are sent to QuickBooks Online.' },
  { key: 'vat', label: 'VAT item (QuickBooks Online only)', help: 'A service item posting to VAT Payable, used when invoices are sent to QuickBooks Online.' },
];

/** QuickBooks Desktop's own limit for account and item names. */
const MAX = 31;

/** A name QuickBooks will accept in an IIF file: no tabs, line breaks or quotes; not empty; at most 31 characters. */
export function cleanQbName(raw: unknown): string | null {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > MAX || /["\t\r\n]/.test(s)) return null;
  return s;
}

/** The saved settings merged over the defaults; anything unusable falls back to its default. */
export function quickBooksSettings(saved: unknown): QuickBooksSettings {
  const o = saved && typeof saved === 'object' && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {};
  const acc = o.accounts && typeof o.accounts === 'object' ? (o.accounts as Record<string, unknown>) : {};
  const items = o.items && typeof o.items === 'object' ? (o.items as Record<string, unknown>) : {};
  const accounts = { ...DEFAULT_QB_ACCOUNTS };
  for (const f of ACCOUNT_FIELDS) accounts[f.key] = cleanQbName(acc[f.key]) ?? DEFAULT_QB_ACCOUNTS[f.key];
  const outItems = { ...DEFAULT_QB_SETTINGS.items };
  for (const f of ITEM_FIELDS) outItems[f.key] = cleanQbName(items[f.key]) ?? DEFAULT_QB_SETTINGS.items[f.key];
  return {
    accounts,
    items: outItems,
    dateFormat: o.dateFormat === 'MM/DD/YYYY' ? 'MM/DD/YYYY' : 'DD/MM/YYYY',
    walkInCustomer: cleanQbName(o.walkInCustomer) ?? DEFAULT_QB_SETTINGS.walkInCustomer,
  };
}

/** The Settings form, checked: the settings, or the first problem in words. */
export function parseQuickBooksForm(get: (name: string) => unknown): QuickBooksSettings | string {
  const accounts = { ...DEFAULT_QB_ACCOUNTS };
  for (const f of ACCOUNT_FIELDS) {
    const v = cleanQbName(get(`account_${f.key}`));
    if (!v) return `Give the QuickBooks account for “${f.label}” (at most ${MAX} characters, no quotes).`;
    accounts[f.key] = v;
  }
  const items = { ...DEFAULT_QB_SETTINGS.items };
  for (const f of ITEM_FIELDS) {
    const v = cleanQbName(get(`item_${f.key}`));
    if (!v) return `Give the QuickBooks item for “${f.label}” (at most ${MAX} characters, no quotes).`;
    items[f.key] = v;
  }
  const walkIn = cleanQbName(get('walkInCustomer'));
  if (!walkIn) return 'Give the QuickBooks customer walk-in counter sales are recorded against.';
  const df = String(get('dateFormat') ?? '');
  if (df !== 'DD/MM/YYYY' && df !== 'MM/DD/YYYY') return 'Choose the date order your QuickBooks uses.';
  // Money must never land in the wrong place: receivable, cash, bank and POS are four different accounts.
  const money = [accounts.receivable, accounts.undepositedFunds, accounts.bank, accounts.pos].map((a) => a.toLowerCase());
  if (new Set(money).size !== money.length) return 'Accounts Receivable, cash, bank transfers and POS must be four different accounts.';
  if (accounts.vat.toLowerCase() === accounts.receivable.toLowerCase()) return 'VAT payable cannot be the same account as Accounts Receivable.';
  return { accounts, items, dateFormat: df, walkInCustomer: walkIn };
}
