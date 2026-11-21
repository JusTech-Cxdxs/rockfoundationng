/**
 * The customer's secure estimate-approval link, shared by both apps: the
 * staff portal makes the link, the customer website checks it. The token is
 * 32 random bytes in base64url (43 characters), shown once in the message
 * to the customer; only its SHA-256 (hex) is stored, so a copy of the
 * database never holds a usable link. Server only (node:crypto).
 */
import { createHash, randomBytes } from 'node:crypto';

/** How long a link works. */
export const APPROVAL_LINK_DAYS = 7;
export const APPROVAL_LINK_MS = APPROVAL_LINK_DAYS * 86_400_000;

/** Exactly what newApprovalToken makes: 43 base64url characters. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isApprovalToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN.test(token);
}

/** The stored form of a token: its SHA-256, in hex. */
export function hashApprovalToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** A new token and its hash. Keep the hash; put the token only in the message. */
export function newApprovalToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashApprovalToken(token) };
}

/** The page on the customer website (no sign-in needed). */
export function approvalLinkUrl(websiteUrl: string, token: string): string {
  return `${websiteUrl.replace(/\/+$/, '')}/estimate/approve/${token}`;
}

// The WhatsApp helpers (whatsAppNumber, whatsAppShareUrl) are in ./whatsapp, which any page can use.
