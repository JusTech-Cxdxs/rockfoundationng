import { type NextRequest } from 'next/server';
import { openDocumentLink } from '@/lib/document-links';
import { documentPdf } from '@/lib/document-pdfs';
import { createHitLimiter, documentRefusalHtml, hashDocumentToken, isDocumentToken } from '@/lib/document-links-core';
import { logFailure } from '@/lib/log';

export const dynamic = 'force-dynamic';
// The PDF renderer and its fonts need Node.js, not the edge.
export const runtime = 'nodejs';

/**
 * GET /d/<token>: the customer's document from a WhatsApp message (an
 * estimate, an invoice or a payment receipt), as a PDF, without signing in
 * (middleware.ts lets /d/* through, and only that). Read-only: the PDF is
 * drawn from the live record by the same builders as the emailed copy
 * (lib/document-pdfs); the only write is the link's open count.
 *
 * Anything that does not open — a malformed, unknown, altered, expired or
 * revoked token, a document no longer there — gets the same small page,
 * which says nothing about why. At most 20 opens a minute per link and 60
 * per address, per server instance. The token is never logged.
 */
const perLink = createHitLimiter(20);
const perAddress = createHitLimiter(60);

const PRIVATE = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
} as const;

function refusal(status = 404): Response {
  return new Response(documentRefusalHtml(), {
    status,
    headers: { ...PRIVATE, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" },
  });
}

function clientAddress(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (perAddress(`a:${clientAddress(request)}`)) return refusal(429);
  if (!isDocumentToken(token)) return refusal();
  // Counted by the token's hash, so not even this server's memory keeps the token.
  if (perLink(`t:${hashDocumentToken(token)}`)) return refusal(429);
  try {
    const link = await openDocumentLink(token);
    if (!link) return refusal();
    const doc = await documentPdf(link.kind, link.recordId, link.organisationId);
    if (!doc) return refusal();
    return new Response(new Uint8Array(doc.pdf), {
      status: 200,
      headers: {
        ...PRIVATE,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${doc.fileName}"`,
        'Content-Length': String(doc.pdf.length),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    logFailure('Failed to open a document link', err);
    return refusal(503);
  }
}
