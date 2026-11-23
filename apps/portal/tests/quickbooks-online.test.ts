/**
 * QuickBooks Online (lib/quickbooks/qbo.ts, token-crypto.ts): off unless the
 * server has every setting, the OAuth 2 requests, the payloads the
 * Accounting API receives (VAT on its own line, totals exactly EJO's), and the
 * tokens encrypted at rest, bound to their organisation. No network here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  apiRequest, authorizeUrl, creditMemoPayload, customerPayload, faultMessage, firstId, invoicePayload, parseTokens, paymentPayload, qboConfig, qboDate, queryPath, revokeRequest, salesReceiptPayload, tokenRequest, validRealmId,
  QBO_TOKEN_URL,
} from '../lib/quickbooks/qbo';
import { openToken, sealToken, TokenError } from '../lib/quickbooks/token-crypto';
import type { QbInvoice } from '../lib/quickbooks/iif';

const KEY = randomBytes(32).toString('base64');
const ENV = { QBO_CLIENT_ID: 'client-id-example', QBO_CLIENT_SECRET: 'client-secret-example', QBO_REDIRECT_URI: 'https://portal.example.com/api/quickbooks/callback', QBO_TOKEN_KEY: KEY };

test('off unless every setting is there; only the names of the missing ones are given, never a value', () => {
  assert.deepEqual(qboConfig({}), { missing: ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_REDIRECT_URI', 'QBO_TOKEN_KEY'] });
  assert.deepEqual(qboConfig({ ...ENV, QBO_TOKEN_KEY: 'too-short' }), { missing: ['QBO_TOKEN_KEY'] });
  assert.deepEqual(qboConfig({ ...ENV, QBO_REDIRECT_URI: 'http://portal.example.com/cb' }), { missing: ['QBO_REDIRECT_URI'] }, 'plain http only on localhost');
  const ok = qboConfig(ENV);
  assert.ok('config' in ok);
  assert.equal(ok.config.environment, 'sandbox', 'sandbox unless production is chosen');
  assert.equal((qboConfig({ ...ENV, QBO_ENVIRONMENT: 'production' }) as { config: { environment: string } }).config.environment, 'production');
  assert.ok(!JSON.stringify(qboConfig({ ...ENV, QBO_CLIENT_ID: '' })).includes('client-secret-example'));
});

test('OAuth 2: the approval link, the code exchange, the refresh and the revoke', () => {
  const url = new URL(authorizeUrl({ clientId: 'abc', redirectUri: ENV.QBO_REDIRECT_URI }, 'state123'));
  assert.equal(url.origin + url.pathname, 'https://appcenter.intuit.com/connect/oauth2');
  assert.equal(url.searchParams.get('scope'), 'com.intuit.quickbooks.accounting');
  assert.equal(url.searchParams.get('state'), 'state123');
  assert.equal(url.searchParams.get('response_type'), 'code');
  const ex = tokenRequest({ clientId: 'abc', clientSecret: 'shh', redirectUri: ENV.QBO_REDIRECT_URI }, { code: 'code1' });
  assert.equal(ex.url, QBO_TOKEN_URL);
  assert.equal(ex.headers.Authorization, `Basic ${Buffer.from('abc:shh').toString('base64')}`);
  assert.equal(new URLSearchParams(ex.body).get('grant_type'), 'authorization_code');
  assert.equal(new URLSearchParams(tokenRequest({ clientId: 'a', clientSecret: 'b', redirectUri: 'x' }, { refreshToken: 'r1' }).body).get('refresh_token'), 'r1');
  assert.equal(JSON.parse(revokeRequest({ clientId: 'a', clientSecret: 'b' }, 'r1').body!).token, 'r1');
});

test('the token answer is checked, a minute kept in hand; a company id is digits only', () => {
  const now = new Date('2026-11-23T10:00:00Z');
  const t = parseTokens({ access_token: 'a', refresh_token: 'r', expires_in: 3600, x_refresh_token_expires_in: 8640000 }, now)!;
  assert.equal(t.accessExpiresAt.toISOString(), '2026-11-23T10:59:00.000Z');
  assert.equal(parseTokens({ access_token: 'a' }, now), null);
  assert.equal(validRealmId('9130354981234567'), '9130354981234567');
  assert.equal(validRealmId('91303;drop'), null);
});

test('API requests: sandbox or live, the minor version, queries with quotes escaped', () => {
  const r = apiRequest('sandbox', '123', 'tok', 'invoice', { a: 1 });
  assert.equal(r.url, 'https://sandbox-quickbooks.api.intuit.com/v3/company/123/invoice?minorversion=75');
  assert.equal(r.method, 'POST');
  assert.equal(r.headers.Authorization, 'Bearer tok');
  assert.equal(apiRequest('production', '123', 'tok', 'query?query=x').url, 'https://quickbooks.api.intuit.com/v3/company/123/query?query=x&minorversion=75');
  assert.equal(decodeURIComponent(queryPath('Customer', 'DisplayName', "Ade's Motors")), "query?query=select Id from Customer where DisplayName = 'Ade\\'s Motors'");
  assert.equal(firstId({ QueryResponse: { Item: [{ Id: '42' }] } }, 'Item'), '42');
  assert.equal(firstId({ QueryResponse: {} }, 'Item'), null);
  assert.equal(faultMessage({ Fault: { Error: [{ Message: 'Duplicate Document Number Error', Detail: 'INV-1' }] } }), 'Duplicate Document Number Error: INV-1');
  assert.equal(qboDate(new Date('2026-11-20T23:30:00Z')), '2026-11-21');
});

const inv: QbInvoice = {
  number: 'INV-2026-000009', date: new Date('2026-11-20T09:00:00Z'), dueDate: null, customer: 'Ada Example', memo: 'Job card JC-1',
  lines: [{ kind: 'LABOUR', item: 'Labour', description: 'Brake service', quantity: 1, unitPrice: 30000, amount: 30000 }, { kind: 'PART', item: 'BP-1', description: 'Brake pads', quantity: 2, unitPrice: 18000, amount: 36000 }],
  discount: 2000, vatRate: 7.5, vatAmount: 4800, total: 68800,
};
const items = { byName: new Map([['Labour', '1'], ['BP-1', '2']]), vat: '9' };

test('an invoice payload: lines, the discount, VAT on its own line through the VAT item, tax calculation off', () => {
  const p = invoicePayload(inv, '55', items) as { Line: { DetailType: string; Amount: number; SalesItemLineDetail?: { ItemRef: { value: string }; Qty: number } }[]; GlobalTaxCalculation: string; CustomerRef: { value: string }; TxnDate: string; DocNumber: string };
  assert.equal(p.GlobalTaxCalculation, 'NotApplicable');
  assert.equal(p.CustomerRef.value, '55');
  assert.equal(p.TxnDate, '2026-11-20');
  assert.deepEqual(p.Line.map((l) => [l.DetailType, l.Amount, l.SalesItemLineDetail?.ItemRef.value ?? null]), [['SalesItemLineDetail', 30000, '1'], ['SalesItemLineDetail', 36000, '2'], ['DiscountLineDetail', 2000, null], ['SalesItemLineDetail', 4800, '9']]);
  assert.throws(() => invoicePayload({ ...inv, total: 1 }, '55', items), /does not add up/);
  assert.throws(() => invoicePayload({ ...inv, lines: [{ ...inv.lines[0]!, item: 'Missing item' }], discount: 0, vatAmount: 0, total: 30000 }, '55', items), /not in QuickBooks Online yet/);
});

test('sales receipt, payment and credit memo payloads', () => {
  const sr = salesReceiptPayload({ number: 'CS-1', date: inv.date, customer: 'Walk-in customer', method: 'POS', reference: 'T-7', memo: null, lines: [inv.lines[1]!], vatRate: 7.5, vatAmount: 2700, total: 38700 }, '7', items, '33') as Record<string, unknown>;
  assert.deepEqual([sr.PaymentRefNum, (sr.DepositToAccountRef as { value: string }).value], ['T-7', '33']);
  const pay = paymentPayload({ reference: 'RCT-1', date: inv.date, customer: 'A', amount: 68800, method: 'BANK_TRANSFER', invoiceNumber: 'INV-2026-000009' }, '55', '901', null) as { Line: { LinkedTxn: { TxnId: string; TxnType: string }[] }[]; TotalAmt: number; DepositToAccountRef?: unknown };
  assert.equal(pay.TotalAmt, 68800);
  assert.deepEqual(pay.Line[0]!.LinkedTxn[0], { TxnId: '901', TxnType: 'Invoice' });
  assert.equal(pay.DepositToAccountRef, undefined);
  assert.deepEqual((paymentPayload({ reference: 'RCT-2', date: inv.date, customer: 'A', amount: 5, method: 'CASH' }, '55', null, null) as { Line: unknown[] }).Line, [], 'a deposit before the invoice is an unapplied payment');
  const cm = creditMemoPayload({ number: 'CN-1', date: inv.date, customer: 'A', reason: 'Overcharge', netAmount: 10000, vatAmount: 750, total: 10750, invoiceNumber: 'INV-1' }, '55', '12', '9') as { Line: { Amount: number }[] };
  assert.deepEqual(cm.Line.map((l) => l.Amount), [10000, 750]);
  assert.deepEqual(customerPayload({ name: 'Ada Example', firstName: 'Ada', lastName: 'Example', phone: '0800 000 0101', email: 'ada@example.com', addressLines: ['5 Example Road'] }), { DisplayName: 'Ada Example', GivenName: 'Ada', FamilyName: 'Example', PrimaryPhone: { FreeFormNumber: '0800 000 0101' }, PrimaryEmailAddr: { Address: 'ada@example.com' }, BillAddr: { Line1: '5 Example Road' } });
});

test('tokens at rest: encrypted, readable only with the key and by the same organisation', () => {
  const key = Buffer.from(KEY, 'base64');
  const sealed = sealToken('access-token-example', key, 'org_1');
  assert.ok(!sealed.includes('access-token-example'));
  assert.equal(openToken(sealed, key, 'org_1'), 'access-token-example');
  assert.throws(() => openToken(sealed, key, 'org_2'), TokenError);
  assert.throws(() => openToken(sealed, randomBytes(32), 'org_1'), /Connect it again/);
  assert.notEqual(sealToken('x', key, 'org_1'), sealToken('x', key, 'org_1'), 'a fresh IV every time');
});
