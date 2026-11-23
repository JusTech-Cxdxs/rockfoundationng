/**
 * QuickBooks Online over the network (server only, not a server action:
 * lib/actions/quickbooks.ts guards every call). Off unless the server has the
 * connection's settings (lib/quickbooks/qbo.ts). Tokens are kept encrypted and
 * refreshed shortly before they run out; nothing here logs a token or an
 * answer's body. Each record sent is remembered (QuickBooksSync), so it is
 * never sent twice.
 */
import { prisma } from '@ejo/database';
import type { QuickBooksSettings } from './settings';
import { paymentAccountFor } from './iif';
import { openToken, sealToken } from './token-crypto';
import {
  apiRequest, creditMemoPayload, customerPayload, faultMessage, firstId, invoicePayload, parseTokens, paymentPayload, qboConfig, queryPath, revokeRequest, salesReceiptPayload, tokenRequest,
  type HttpRequest, type ItemIds, type QboConfig,
} from './qbo';
import type { Collected } from './collect-server';

const TIMEOUT_MS = 20_000;

export class QboError extends Error {}

async function send(req: HttpRequest): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export function qboReady(): QboConfig | null {
  const c = qboConfig();
  return 'config' in c ? c.config : null;
}

/** Exchanges the code Intuit sent back and keeps the tokens, encrypted. */
export async function connectWithCode(organisationId: string, userId: string, code: string, realmId: string): Promise<void> {
  const cfg = qboReady();
  if (!cfg) throw new QboError('QuickBooks Online is not set up on this server.');
  const res = await send(tokenRequest(cfg, { code }));
  const tokens = res.ok ? parseTokens(res.json) : null;
  if (!tokens) throw new QboError('Intuit did not complete the connection. Try connecting again.');
  const data = {
    realmId, environment: cfg.environment,
    accessToken: sealToken(tokens.accessToken, cfg.tokenKey, organisationId), refreshToken: sealToken(tokens.refreshToken, cfg.tokenKey, organisationId),
    accessExpiresAt: tokens.accessExpiresAt, refreshExpiresAt: tokens.refreshExpiresAt, connectedById: userId, connectedAt: new Date(), lastError: null,
  };
  await prisma.quickBooksConnection.upsert({ where: { organisationId }, create: { organisationId, ...data }, update: data });
}

/** Ends the connection: the refresh token is revoked at Intuit (best effort) and the row removed. */
export async function disconnect(organisationId: string): Promise<boolean> {
  const conn = await prisma.quickBooksConnection.findUnique({ where: { organisationId } });
  if (!conn) return false;
  const cfg = qboReady();
  if (cfg) {
    try { await send(revokeRequest(cfg, openToken(conn.refreshToken, cfg.tokenKey, organisationId))); } catch { /* the row goes either way */ }
  }
  await prisma.quickBooksConnection.delete({ where: { organisationId } });
  return true;
}

/** A live session with the company: a fresh access token, refreshed when it is about to run out. */
async function session(organisationId: string): Promise<{ cfg: QboConfig; realmId: string; token: string }> {
  const cfg = qboReady();
  if (!cfg) throw new QboError('QuickBooks Online is not set up on this server.');
  const conn = await prisma.quickBooksConnection.findUnique({ where: { organisationId } });
  if (!conn) throw new QboError('QuickBooks Online is not connected. The Owner connects it in Settings → QuickBooks.');
  if (conn.environment !== cfg.environment) throw new QboError('The connection was made for the other QuickBooks Online environment. Connect it again.');
  if (conn.accessExpiresAt.getTime() > Date.now()) return { cfg, realmId: conn.realmId, token: openToken(conn.accessToken, cfg.tokenKey, organisationId) };
  if (conn.refreshExpiresAt.getTime() <= Date.now()) throw new QboError('The QuickBooks Online connection has expired. The Owner connects it again in Settings → QuickBooks.');
  const res = await send(tokenRequest(cfg, { refreshToken: openToken(conn.refreshToken, cfg.tokenKey, organisationId) }));
  const tokens = res.ok ? parseTokens(res.json) : null;
  if (!tokens) {
    await prisma.quickBooksConnection.update({ where: { organisationId }, data: { lastError: 'Intuit refused to renew the connection.' } });
    throw new QboError('Intuit refused to renew the connection. The Owner connects it again in Settings → QuickBooks.');
  }
  await prisma.quickBooksConnection.update({ where: { organisationId }, data: {
    accessToken: sealToken(tokens.accessToken, cfg.tokenKey, organisationId), refreshToken: sealToken(tokens.refreshToken, cfg.tokenKey, organisationId),
    accessExpiresAt: tokens.accessExpiresAt, refreshExpiresAt: tokens.refreshExpiresAt, lastError: null,
  } });
  return { cfg, realmId: conn.realmId, token: tokens.accessToken };
}

export type PushResult = { sent: Record<string, number>; skipped: Record<string, number>; errors: string[] };

/**
 * Sends the export's invoices, counter sales, payments and credit notes that
 * are not in QuickBooks Online yet. Customers are found by name or created;
 * items must already exist there (the accountant's chart of accounts is
 * theirs). Stops after a few errors; what went is remembered.
 */
export async function pushToQbo(organisationId: string, userId: string, docs: Collected, settings: QuickBooksSettings): Promise<PushResult> {
  const s = await session(organisationId);
  const call = async (path: string, body?: unknown) => {
    const res = await send(apiRequest(s.cfg.environment, s.realmId, s.token, path, body));
    if (!res.ok) throw new QboError(faultMessage(res.json));
    return res.json;
  };
  const lookup = async (entity: 'Customer' | 'Item' | 'Account' | 'Invoice', field: 'DisplayName' | 'Name' | 'DocNumber', value: string) => firstId(await call(queryPath(entity, field, value)), entity);

  const synced = await prisma.quickBooksSync.findMany({ where: { organisationId, recordId: { in: [...docs.ids.invoices, ...docs.ids.counterSales, ...docs.ids.payments, ...docs.ids.creditNotes] } }, select: { kind: true, recordId: true } });
  const done = new Set(synced.map((x) => `${x.kind}:${x.recordId}`));
  const result: PushResult = { sent: {}, skipped: {}, errors: [] };
  const remember = async (kind: string, recordId: string, qboId: string) => {
    await prisma.quickBooksSync.upsert({ where: { organisationId_kind_recordId: { organisationId, kind, recordId } }, create: { organisationId, kind, recordId, qboId, syncedById: userId }, update: { qboId, syncedAt: new Date(), syncedById: userId } });
    result.sent[kind] = (result.sent[kind] ?? 0) + 1;
  };

  const customerIds = new Map<string, string>();
  const customerId = async (name: string) => {
    if (customerIds.has(name)) return customerIds.get(name)!;
    let id = await lookup('Customer', 'DisplayName', name);
    if (!id) {
      const full = docs.customers.find((c) => c.name === name) ?? { name };
      const made = await call('customer', customerPayload(full));
      id = (made as { Customer?: { Id?: string } })?.Customer?.Id ?? null;
      if (!id) throw new QboError(`The customer “${name}” could not be created in QuickBooks Online.`);
    }
    customerIds.set(name, id);
    return id;
  };
  const itemCache = new Map<string, string | null>();
  const items: ItemIds = { byName: new Map(), vat: '' };
  const needItems = async (names: string[]) => {
    for (const n of names) {
      if (!itemCache.has(n)) itemCache.set(n, await lookup('Item', 'Name', n));
      const id = itemCache.get(n);
      if (id) items.byName.set(n, id);
    }
  };
  const accountCache = new Map<string, string | null>();
  const accountId = async (name: string) => {
    if (!accountCache.has(name)) accountCache.set(name, await lookup('Account', 'Name', name));
    return accountCache.get(name) ?? null;
  };
  const vatItem = async () => {
    await needItems([settings.items.vat]);
    const id = items.byName.get(settings.items.vat);
    if (!id) throw new QboError(`The VAT item “${settings.items.vat}” is not in QuickBooks Online. Create it (a service item posting to ${settings.accounts.vat}), then send again.`);
    items.vat = id;
  };

  const attempt = async (kind: string, recordId: string, label: string, run: () => Promise<string | null>) => {
    if (result.errors.length >= 5) return;
    if (done.has(`${kind}:${recordId}`)) { result.skipped[kind] = (result.skipped[kind] ?? 0) + 1; return; }
    try {
      const id = await run();
      if (!id) throw new QboError('QuickBooks Online did not return the new record.');
      await remember(kind, recordId, id);
    } catch (err) {
      result.errors.push(`${label}: ${err instanceof Error ? err.message : 'not sent'}`);
    }
  };

  for (const [i, inv] of docs.invoices.entries()) {
    await attempt('invoice', docs.ids.invoices[i]!, `Invoice ${inv.number}`, async () => {
      if (inv.vatAmount > 0) await vatItem();
      await needItems(inv.lines.map((l) => l.item));
      const made = await call('invoice', invoicePayload(inv, await customerId(inv.customer), items));
      return (made as { Invoice?: { Id?: string } })?.Invoice?.Id ?? null;
    });
  }
  for (const [i, sr] of docs.counterSales.entries()) {
    await attempt('counterSale', docs.ids.counterSales[i]!, `Counter sale ${sr.number}`, async () => {
      if (sr.vatAmount > 0) await vatItem();
      await needItems(sr.lines.map((l) => l.item));
      const made = await call('salesreceipt', salesReceiptPayload(sr, await customerId(sr.customer), items, await accountId(paymentAccountFor(sr.method, settings.accounts))));
      return (made as { SalesReceipt?: { Id?: string } })?.SalesReceipt?.Id ?? null;
    });
  }
  for (const [i, p] of docs.payments.entries()) {
    await attempt('payment', docs.ids.payments[i]!, `Payment ${p.reference}`, async () => {
      const invoiceId = p.invoiceNumber ? await lookup('Invoice', 'DocNumber', p.invoiceNumber) : null;
      const made = await call('payment', paymentPayload(p, await customerId(p.customer), invoiceId, await accountId(paymentAccountFor(p.method, settings.accounts))));
      return (made as { Payment?: { Id?: string } })?.Payment?.Id ?? null;
    });
  }
  for (const [i, n] of docs.creditNotes.entries()) {
    await attempt('creditNote', docs.ids.creditNotes[i]!, `Credit note ${n.number}`, async () => {
      await vatItem();
      await needItems([settings.items.creditNote]);
      const creditItem = items.byName.get(settings.items.creditNote);
      if (!creditItem) throw new QboError(`The item “${settings.items.creditNote}” is not in QuickBooks Online. Create it (a service item posting to ${settings.accounts.salesReturns}), then send again.`);
      const made = await call('creditmemo', creditMemoPayload(n, await customerId(n.customer), creditItem, items.vat));
      return (made as { CreditMemo?: { Id?: string } })?.CreditMemo?.Id ?? null;
    });
  }
  await prisma.quickBooksConnection.update({ where: { organisationId }, data: { lastUsedAt: new Date(), lastError: result.errors[0]?.slice(0, 300) ?? null } });
  return result;
}
