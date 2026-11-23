import { NextResponse } from 'next/server';
import { readQuickBooksExportFile } from '@/lib/actions/quickbooks';
import { downloadHeaders } from '@/lib/quickbooks/files';

/** One file of a QuickBooks export, exactly as first made, for the Owner and Accounts of its organisation (audited). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  try {
    const doc = await readQuickBooksExportFile(id, decodeURIComponent(file));
    if (!doc) return new NextResponse('Not found', { status: 404 });
    const h = downloadHeaders(doc.name);
    return new NextResponse(doc.text, { headers: { 'Content-Type': h.contentType, 'Content-Disposition': h.disposition, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
