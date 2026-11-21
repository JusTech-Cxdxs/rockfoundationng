import type { ServerSettings } from './transport';
import { decryptSecret, secretAad, MailCryptoError } from './crypto';
import { mailAllowInsecure, mailKey } from './config';
import { securityFromFlag } from './rules';

/**
 * A stored support mailbox: the settings to connect with. The password is
 * decrypted only here, only in memory, only for the connection being made.
 * Server-only.
 */
export type StoredAccount = {
  id: string;
  userId: string;
  address: string;
  displayName: string | null;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  secret: string;
};

export function connectionSettings(a: StoredAccount): { imap: ServerSettings; smtp: ServerSettings } {
  const key = mailKey();
  if (!key) throw new MailCryptoError('Email is not set up by your administrator yet.');
  const password = decryptSecret(a.secret, key, secretAad(a.userId, a.address));
  const insecure = mailAllowInsecure();
  return {
    imap: { host: a.imapHost, port: a.imapPort, security: securityFromFlag(a.imapSecure, insecure), username: a.username, password },
    smtp: { host: a.smtpHost, port: a.smtpPort, security: securityFromFlag(a.smtpSecure, insecure), username: a.username, password },
  };
}

const SOURCE_MAX_BYTES = 2_500_000;

export type Fetched = { uid: number; flags: Set<string>; internalDate: Date | null; source: Buffer | null; size: number };

/**
 * Sizes first (cheap), then the full message for those within the limit, and
 * only the headers for the rest. Each fetch stream is read to the end before
 * the next command.
 */
export async function fetchChunk(client: import('imapflow').ImapFlow, uids: number[]): Promise<Fetched[]> {
  const meta = new Map<number, { flags: Set<string>; internalDate: Date | null; size: number }>();
  for await (const m of client.fetch(uids, { uid: true, flags: true, internalDate: true, size: true }, { uid: true })) {
    meta.set(m.uid, { flags: m.flags ?? new Set(), internalDate: m.internalDate ? new Date(m.internalDate) : null, size: m.size ?? 0 });
  }
  const small = [...meta.entries()].filter(([, x]) => x.size <= SOURCE_MAX_BYTES).map(([u]) => u);
  const large = [...meta.entries()].filter(([, x]) => x.size > SOURCE_MAX_BYTES).map(([u]) => u);
  const sources = new Map<number, Buffer>();
  if (small.length) for await (const m of client.fetch(small, { uid: true, source: true }, { uid: true })) if (m.source) sources.set(m.uid, m.source);
  if (large.length) for await (const m of client.fetch(large, { uid: true, headers: true }, { uid: true })) if (m.headers) sources.set(m.uid, Buffer.concat([m.headers, Buffer.from('\r\n')]));
  return [...meta.entries()].map(([uid, x]) => ({ uid, ...x, source: sources.get(uid) ?? null }));
}
