import { NextResponse } from 'next/server';
import { authorize, myOrganisationId } from '@/lib/authz/server';
import { requireUser } from '@/lib/actions/workshop';
import { statementPdfFor } from '@/lib/money/statements-server';

/** A customer's statement of account as a PDF (front desk, Accounts, the Owner), inside their organisation only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let organisationId: string | null = null;
  try {
    await requireUser();
    await authorize('money.statement.view', undefined, 'statementPdf');
    organisationId = await myOrganisationId();
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  const doc = organisationId && /^[a-z0-9]{20,40}$/.test(id) ? await statementPdfFor(id, organisationId) : null;
  if (!doc) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(doc.pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${doc.fileName}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
