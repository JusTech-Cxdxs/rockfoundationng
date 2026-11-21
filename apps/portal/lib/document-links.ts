import { prisma } from '@ejo/database';
import { portalBaseUrl } from '@/lib/portal-url';
import { DOCUMENT_LINK_MS, OPEN_DOCUMENT_LINK_SQL, documentLinkUrl, hashDocumentToken, isDocumentKind, isDocumentToken, newDocumentToken, type DocumentKind } from '@/lib/document-links-core';

/**
 * Document links (server only, not a server action): made by the guarded
 * "Send on WhatsApp" action (lib/actions/whatsapp.ts), opened by the public
 * route app/d/[token]. The token goes back to the caller once, for the
 * message; only its SHA-256 is written.
 */

/** A new 30-day link to one document. Every press makes its own link. */
export async function issueDocumentLink(o: { organisationId: string; kind: DocumentKind; recordId: string; createdById: string }): Promise<{ url: string; expiresAt: Date }> {
  const { token, tokenHash } = newDocumentToken();
  const expiresAt = new Date(Date.now() + DOCUMENT_LINK_MS);
  await prisma.documentLink.create({ data: { organisationId: o.organisationId, kind: o.kind, recordId: o.recordId, tokenHash, expiresAt, createdById: o.createdById }, select: { id: true } });
  return { url: documentLinkUrl(portalBaseUrl(), token), expiresAt };
}

/**
 * The document behind a token, counted as opened — or null for a token that
 * is malformed, unknown, revoked or past its 30 days (one statement:
 * lib/document-links-core OPEN_DOCUMENT_LINK_SQL).
 */
export async function openDocumentLink(token: string): Promise<{ kind: DocumentKind; recordId: string; organisationId: string } | null> {
  if (!isDocumentToken(token)) return null;
  // A plain statement, with the hash as its only parameter (never the token).
  const rows = await prisma.$queryRawUnsafe<{ kind: DocumentKind; recordId: string; organisationId: string }[]>(OPEN_DOCUMENT_LINK_SQL, hashDocumentToken(token));
  const row = rows[0];
  return row && isDocumentKind(row.kind) ? row : null;
}
