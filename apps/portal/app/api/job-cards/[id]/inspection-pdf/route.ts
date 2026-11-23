import { NextResponse } from 'next/server';
import { seeJobCard, myOrganisationId } from '@/lib/authz/server';
import { requireUser } from '@/lib/actions/workshop';
import { inspectionPdfFor } from '@/lib/document-pdfs';

/** The Job Card's inspection report as a PDF, for staff who may open the Job Card (to send to the customer or keep). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireUser();
    await seeJobCard(id, 'inspectionPdf');
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  const doc = await inspectionPdfFor(id, (await myOrganisationId()) ?? undefined);
  if (!doc) return new NextResponse('The inspection is not completed yet.', { status: 404 });
  return new NextResponse(new Uint8Array(doc.pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${doc.fileName}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
