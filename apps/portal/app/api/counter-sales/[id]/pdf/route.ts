import { NextResponse } from 'next/server';
import { myOrganisationId } from '@/lib/authz/server';
import { getCounterSale } from '@/lib/actions/counter-sales';
import { counterSalePdfFor } from '@/lib/document-pdfs';

/** A counter sale's receipt as a PDF, for staff who may see the sale (to print or send to the buyer). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // getCounterSale checks the sign-in, the organisation and the branch reach.
  const sale = await getCounterSale(id).catch(() => null);
  if (!sale) return new NextResponse('Not found', { status: 404 });
  const doc = await counterSalePdfFor(sale.id, (await myOrganisationId()) ?? undefined);
  if (!doc) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(doc.pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${doc.fileName}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
