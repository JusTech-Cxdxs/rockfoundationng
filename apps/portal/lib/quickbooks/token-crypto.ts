/**
 * QuickBooks Online tokens at rest: AES-256-GCM (lib/mail/crypto.ts) with the
 * server key QBO_TOKEN_KEY, bound to the organisation, so a token copied onto
 * another organisation's row cannot be read. Tokens are never shown, logged
 * or returned to the browser. Relative imports only (unit-tested on its own).
 */
import { decryptSecret, encryptSecret } from '../mail/crypto';

export class TokenError extends Error {}

const aad = (organisationId: string) => `quickbooks-online:${organisationId}`;

export function sealToken(token: string, key: Buffer, organisationId: string): string {
  return encryptSecret(token, key, aad(organisationId));
}

export function openToken(sealed: string, key: Buffer, organisationId: string): string {
  try {
    return decryptSecret(sealed, key, aad(organisationId));
  } catch {
    throw new TokenError('The QuickBooks Online connection could not be read. Connect it again in Settings → QuickBooks.');
  }
}
