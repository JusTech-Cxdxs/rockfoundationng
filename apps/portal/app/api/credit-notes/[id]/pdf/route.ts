import { NextResponse } from 'next/server';
import { allows, myOrganisationId, seeJobCard } from '@/lib/authz/server';
import { requireUser } from '@/lib/actions/workshop';
import { creditNotePdfFor } from '@/lib/money/statements-server';

/** An approved credit note as a PDF, for staff who handle the Job Card's money and may open it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireUser();
    const organisationId = await myOrganisationId();
    const doc = organisationId && /^[a-z0-9]{20,40}$/.test(id) ? await creditNotePdfFor(id, organisationId) : null;
    if (!doc) return new NextResponse('Not found', { status: 404 });
    await seeJobCard(doc.jobCardId, 'creditNotePdf');
    const money = (await Promise.all([allows('money.credit_note.request'), allows('money.credit_note.approve'), allows('workshop.payment.record')])).some(Boolean);
    if (!money) return new NextResponse('Not found', { status: 404 });
    return new NextResponse(new Uint8Array(doc.pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${doc.fileName}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
