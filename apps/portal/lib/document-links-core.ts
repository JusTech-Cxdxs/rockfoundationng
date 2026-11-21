/**
 * The secure link a WhatsApp message carries to a customer document (the
 * estimate, the invoice, a payment receipt). A wa.me message cannot attach
 * a file, so it carries https://<staff portal>/d/<token>, which opens the
 * PDF without signing in (app/d/[token]/route.ts).
 *
 * The token is 32 random bytes in base64url (43 characters), shown once in
 * the message; only its SHA-256 (hex) is stored (DocumentLink.tokenHash), so
 * a copy of the database never holds a usable link. Never logged, never in
 * the audit trail. A link works for 30 days, unless it is revoked.
 *
 * Pure apart from node:crypto: no database, so the tests and the route use
 * it alike.
 */
import { createHash, randomBytes } from 'node:crypto';

export const DOCUMENT_LINK_DAYS = 30;
export const DOCUMENT_LINK_MS = DOCUMENT_LINK_DAYS * 86_400_000;

export const DOCUMENT_KINDS = ['ESTIMATE', 'INVOICE', 'RECEIPT'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export function isDocumentKind(v: unknown): v is DocumentKind {
  return typeof v === 'string' && (DOCUMENT_KINDS as readonly string[]).includes(v);
}

/** Exactly what newDocumentToken makes: 43 base64url characters. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isDocumentToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN.test(token);
}

/** The stored form of a token: its SHA-256, in hex. */
export function hashDocumentToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** A new token and its hash. Keep the hash; put the token only in the message. */
export function newDocumentToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashDocumentToken(token) };
}

/** https://<staff portal>/d/<token> */
export function documentLinkUrl(portalUrl: string, token: string): string {
  return `${portalUrl.replace(/\/+$/, '')}/d/${token}`;
}

/** Whether a stored link still opens: not revoked, not past its 30 days. */
export function documentLinkOpen(link: { expiresAt: Date; revokedAt: Date | null }, now: Date = new Date()): boolean {
  return !link.revokedAt && link.expiresAt.getTime() > now.getTime();
}

/**
 * Opening a link, in one statement ($1 = the token's hash): only a link that
 * is not revoked and not past its 30 days matches, and its open count goes
 * up atomically, so two opens at once both count and a refused link is
 * never counted. lib/document-links openDocumentLink runs it; the tests run
 * it against a real database.
 */
export const OPEN_DOCUMENT_LINK_SQL =
  'UPDATE document_links SET "openCount" = "openCount" + 1, "lastOpenedAt" = NOW() '
  + 'WHERE "tokenHash" = $1 AND "revokedAt" IS NULL AND "expiresAt" > NOW() '
  + 'RETURNING kind::text AS kind, "recordId", "organisationId"';

/** "INV-2026-000012.pdf": the document's own number, nothing a browser or phone could misread. */
export function documentPdfFileName(kind: DocumentKind, number: string): string {
  const safe = number.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document';
  return kind === 'ESTIMATE' ? `Estimate-${safe}.pdf` : `${safe}.pdf`;
}

/**
 * The one page shown when a link does not open: unknown, altered, expired,
 * revoked, or the document is no longer available. The same words for every
 * reason, so the page tells nobody whether a link ever existed.
 */
export function documentRefusalHtml(): string {
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow"><title>This link does not open</title>',
    '<style>body{font-family:Arial,Helvetica,sans-serif;background:#F8FAFC;color:#0F172A;margin:0;padding:48px 16px}main{max-width:480px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:24px}h1{font-size:18px;margin:0 0 8px}p{font-size:14px;line-height:1.5;color:#475569;margin:0}</style>',
    '</head><body><main><h1>This link does not open</h1>',
    '<p>It may have expired (document links work for 30 days) or been replaced. Please ask the workshop to send the document again.</p>',
    '</main></body></html>',
  ].join('');
}

/**
 * At most `max` hits a minute for one key (a link, an address), per server
 * instance, as the other in-memory limiters. The map is cleared if it grows
 * past 5,000 keys, so it never holds much.
 */
export function createHitLimiter(max: number, windowMs = 60_000): (key: string, now?: number) => boolean {
  const hits = new Map<string, number[]>();
  return (key, now = Date.now()) => {
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    list.push(now);
    if (hits.size > 5000) hits.clear();
    hits.set(key, list);
    return list.length > max;
  };
}
