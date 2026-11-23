/**
 * QuickBooks Online (pure: no network, no database). The connection is OFF
 * unless the server has all of its settings (QBO_CLIENT_ID,
 * QBO_CLIENT_SECRET, QBO_REDIRECT_URI and QBO_TOKEN_KEY; QBO_ENVIRONMENT
 * "production" or, by default, "sandbox"). These functions build the OAuth 2
 * requests and the Accounting API payloads; lib/quickbooks/qbo-server.ts sends
 * them. Nothing here logs, and no secret ever appears in a returned message.
 */
import type { QbCreditNote, QbCustomer, QbInvoice, QbPayment, QbSalesReceipt } from './iif';
import { readMailKey } from '../mail/crypto';

export const QBO_ENV_NAMES = ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_REDIRECT_URI', 'QBO_TOKEN_KEY'] as const;
export const QBO_AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
export const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
export const QBO_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
export const QBO_SCOPE = 'com.intuit.quickbooks.accounting';
export const QBO_MINOR_VERSION = '75';
/** The one-time state of a connection in progress (an http-only cookie on /api/quickbooks). */
export const QBO_STATE_COOKIE = 'ejo_qbo_state';

export type QboEnvironment = 'sandbox' | 'production';
export type QboConfig = { clientId: string; clientSecret: string; redirectUri: string; environment: QboEnvironment; tokenKey: Buffer };

/** The connection's settings, or which names are missing (never their values). */
export function qboConfig(env: Record<string, string | undefined> = process.env): { config: QboConfig } | { missing: string[] } {
  const missing = QBO_ENV_NAMES.filter((n) => !(env[n] ?? '').trim());
  const tokenKey = readMailKey({ MAILBOX_ENCRYPTION_KEY: env.QBO_TOKEN_KEY });
  if (!missing.includes('QBO_TOKEN_KEY') && !tokenKey) missing.push('QBO_TOKEN_KEY');
  if (missing.length) return { missing };
  const redirectUri = env.QBO_REDIRECT_URI!.trim();
  if (!/^https:\/\//.test(redirectUri) && !/^http:\/\/localhost(:\d+)?\//.test(redirectUri)) return { missing: ['QBO_REDIRECT_URI'] };
  return { config: { clientId: env.QBO_CLIENT_ID!.trim(), clientSecret: env.QBO_CLIENT_SECRET!.trim(), redirectUri, environment: env.QBO_ENVIRONMENT === 'production' ? 'production' : 'sandbox', tokenKey: tokenKey! } };
}

export function apiBase(environment: QboEnvironment): string {
  return environment === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com';
}

/** Where the Owner is sent to approve the connection at Intuit. */
export function authorizeUrl(c: Pick<QboConfig, 'clientId' | 'redirectUri'>, state: string): string {
  const q = new URLSearchParams({ client_id: c.clientId, response_type: 'code', scope: QBO_SCOPE, redirect_uri: c.redirectUri, state });
  return `${QBO_AUTHORIZE_URL}?${q.toString()}`;
}

export type HttpRequest = { url: string; method: 'GET' | 'POST'; headers: Record<string, string>; body?: string };

const basic = (c: Pick<QboConfig, 'clientId' | 'clientSecret'>) => `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`, 'utf8').toString('base64')}`;

/** Exchanging the code Intuit sends back, or refreshing the tokens. */
export function tokenRequest(c: Pick<QboConfig, 'clientId' | 'clientSecret' | 'redirectUri'>, grant: { code: string } | { refreshToken: string }): HttpRequest {
  const body = 'code' in grant
    ? new URLSearchParams({ grant_type: 'authorization_code', code: grant.code, redirect_uri: c.redirectUri })
    : new URLSearchParams({ grant_type: 'refresh_token', refresh_token: grant.refreshToken });
  return { url: QBO_TOKEN_URL, method: 'POST', headers: { Authorization: basic(c), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: body.toString() };
}

export function revokeRequest(c: Pick<QboConfig, 'clientId' | 'clientSecret'>, token: string): HttpRequest {
  return { url: QBO_REVOKE_URL, method: 'POST', headers: { Authorization: basic(c), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ token }) };
}

export type Tokens = { accessToken: string; refreshToken: string; accessExpiresAt: Date; refreshExpiresAt: Date };

/** Intuit's token answer, checked. A minute is kept in hand on each expiry. */
export function parseTokens(json: unknown, now: Date = new Date()): Tokens | null {
  const o = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const access = typeof o.access_token === 'string' ? o.access_token : '';
  const refresh = typeof o.refresh_token === 'string' ? o.refresh_token : '';
  const expires = Number(o.expires_in); const refreshExpires = Number(o.x_refresh_token_expires_in);
  if (!access || !refresh || !(expires > 60) || !(refreshExpires > 60)) return null;
  return { accessToken: access, refreshToken: refresh, accessExpiresAt: new Date(now.getTime() + (expires - 60) * 1000), refreshExpiresAt: new Date(now.getTime() + (refreshExpires - 60) * 1000) };
}

/** A company id as Intuit sends it: digits only. */
export function validRealmId(raw: unknown): string | null {
  const s = String(raw ?? '');
  return /^\d{1,30}$/.test(s) ? s : null;
}

/** An Accounting API request for the company. */
export function apiRequest(environment: QboEnvironment, realmId: string, accessToken: string, path: string, body?: unknown): HttpRequest {
  const sep = path.includes('?') ? '&' : '?';
  return {
    url: `${apiBase(environment)}/v3/company/${encodeURIComponent(realmId)}/${path}${sep}minorversion=${QBO_MINOR_VERSION}`,
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

/** A query by name, with the name's quotes escaped as the query language needs. */
export function queryPath(entity: 'Customer' | 'Item' | 'Account' | 'Invoice', field: 'DisplayName' | 'Name' | 'DocNumber', value: string): string {
  const v = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `query?query=${encodeURIComponent(`select Id from ${entity} where ${field} = '${v}'`)}`;
}

/** The first Id a query found, or null. */
export function firstId(json: unknown, entity: string): string | null {
  const q = (json as { QueryResponse?: Record<string, { Id?: string }[]> } | null)?.QueryResponse;
  const id = q?.[entity]?.[0]?.Id;
  return typeof id === 'string' && id ? id : null;
}

/** Intuit's error answer, in a sentence (its own message, never ours to make up). */
export function faultMessage(json: unknown): string {
  const f = (json as { Fault?: { Error?: { Message?: string; Detail?: string }[] } } | null)?.Fault?.Error?.[0];
  const text = [f?.Message, f?.Detail].filter(Boolean).join(': ');
  return text ? text.slice(0, 300) : 'QuickBooks Online did not accept it.';
}

/** The Lagos calendar day, as QuickBooks Online dates are written. */
export function qboDate(d: Date): string {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

const money = (n: number) => Math.round(n * 100) / 100;
const ref = (value: string) => ({ value });

export function customerPayload(c: QbCustomer): Record<string, unknown> {
  return {
    DisplayName: c.name,
    ...(c.companyName ? { CompanyName: c.companyName } : {}),
    ...(c.firstName ? { GivenName: c.firstName } : {}),
    ...(c.lastName ? { FamilyName: c.lastName } : {}),
    ...(c.phone ? { PrimaryPhone: { FreeFormNumber: c.phone } } : {}),
    ...(c.altPhone ? { Mobile: { FreeFormNumber: c.altPhone } } : {}),
    ...(c.email ? { PrimaryEmailAddr: { Address: c.email } } : {}),
    ...(c.addressLines?.[0] ? { BillAddr: { Line1: c.addressLines[0] } } : {}),
  };
}

type Line = Record<string, unknown>;
const itemLine = (amount: number, description: string, itemId: string, qty: number, unitPrice: number): Line => ({
  DetailType: 'SalesItemLineDetail', Amount: money(amount), Description: description.slice(0, 4000),
  SalesItemLineDetail: { ItemRef: ref(itemId), Qty: qty, UnitPrice: money(unitPrice) },
});

export type ItemIds = { byName: Map<string, string>; vat: string };

function salesLines(lines: QbInvoice['lines'], items: ItemIds): Line[] {
  return lines.map((l) => {
    const id = items.byName.get(l.item);
    if (!id) throw new Error(`The item “${l.item}” is not in QuickBooks Online yet. Create it there (or import the items file), then send again.`);
    return itemLine(l.amount, l.description, id, l.quantity, l.unitPrice);
  });
}

/**
 * An invoice for QuickBooks Online. VAT goes on its own line, through the VAT
 * item (a service item posting to VAT Payable), with tax calculation off, so
 * the total is exactly EJO's. The lines are checked to add up first.
 */
export function invoicePayload(inv: QbInvoice, customerId: string, items: ItemIds): Record<string, unknown> {
  const Line = salesLines(inv.lines, items);
  if (inv.discount > 0) Line.push({ DetailType: 'DiscountLineDetail', Amount: money(inv.discount), DiscountLineDetail: { PercentBased: false } });
  if (inv.vatAmount > 0) Line.push(itemLine(inv.vatAmount, `VAT ${inv.vatRate}%`, items.vat, 1, inv.vatAmount));
  const sum = inv.lines.reduce((s, l) => s + Math.round(l.amount * 100), 0) - Math.round(inv.discount * 100) + Math.round(inv.vatAmount * 100);
  if (Math.abs(sum - Math.round(inv.total * 100)) > 1) throw new Error(`Invoice ${inv.number} does not add up, so it was not sent.`);
  return {
    DocNumber: inv.number.slice(0, 21), TxnDate: qboDate(inv.date), ...(inv.dueDate ? { DueDate: qboDate(inv.dueDate) } : {}),
    CustomerRef: ref(customerId), GlobalTaxCalculation: 'NotApplicable', ...(inv.memo ? { PrivateNote: inv.memo.slice(0, 4000) } : {}), Line,
  };
}

/** A counter sale: a sales receipt, into the account for its payment method when that account is known. */
export function salesReceiptPayload(s: QbSalesReceipt, customerId: string, items: ItemIds, depositAccountId: string | null): Record<string, unknown> {
  const Line = salesLines(s.lines, items);
  if (s.vatAmount > 0) Line.push(itemLine(s.vatAmount, `VAT ${s.vatRate}%`, items.vat, 1, s.vatAmount));
  return {
    DocNumber: s.number.slice(0, 21), TxnDate: qboDate(s.date), CustomerRef: ref(customerId), GlobalTaxCalculation: 'NotApplicable',
    ...(s.reference ? { PaymentRefNum: s.reference.slice(0, 21) } : {}), ...(depositAccountId ? { DepositToAccountRef: ref(depositAccountId) } : {}),
    ...(s.memo ? { PrivateNote: s.memo.slice(0, 4000) } : {}), Line,
  };
}

/** A payment, applied to its invoice when that invoice is already in QuickBooks Online. */
export function paymentPayload(p: QbPayment, customerId: string, invoiceId: string | null, depositAccountId: string | null): Record<string, unknown> {
  return {
    TotalAmt: money(p.amount), CustomerRef: ref(customerId), TxnDate: qboDate(p.date), PaymentRefNum: p.reference.slice(0, 21),
    ...(depositAccountId ? { DepositToAccountRef: ref(depositAccountId) } : {}),
    ...(p.memo ? { PrivateNote: p.memo.slice(0, 4000) } : {}),
    Line: invoiceId ? [{ Amount: money(p.amount), LinkedTxn: [{ TxnId: invoiceId, TxnType: 'Invoice' }] }] : [],
  };
}

/** A credit note: a credit memo through the credit note item, with its VAT on its own line. */
export function creditMemoPayload(n: QbCreditNote, customerId: string, creditItemId: string, vatItemId: string): Record<string, unknown> {
  const Line: Line[] = [itemLine(n.netAmount, `${n.reason}${n.invoiceNumber ? ` (invoice ${n.invoiceNumber})` : ''}`, creditItemId, 1, n.netAmount)];
  if (n.vatAmount > 0) Line.push(itemLine(n.vatAmount, 'VAT', vatItemId, 1, n.vatAmount));
  return { DocNumber: n.number.slice(0, 21), TxnDate: qboDate(n.date), CustomerRef: ref(customerId), GlobalTaxCalculation: 'NotApplicable', Line };
}
