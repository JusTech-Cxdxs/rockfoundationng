import { NextResponse } from 'next/server';
import { fleetPeriod } from '@ejo/utils/fleet-report';
import { authorize, myOrganisationId } from '@/lib/authz/server';
import { requireUser } from '@/lib/actions/workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { fleetReportPdfFor } from '@/lib/fleet/server';

/** A fleet customer's report as a PDF (front desk, Accounts, the Owner), inside their organisation only. ?period=this-month|last-month|last-3-months|this-year|custom&from&to */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let organisationId: string | null = null;
  let userId: string | null = null;
  try {
    userId = (await requireUser()).id;
    await authorize('money.fleet_report.view', undefined, 'fleetReportPdf');
    organisationId = await myOrganisationId();
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  const q = new URL(req.url).searchParams;
  const period = fleetPeriod(q.get('period') ?? undefined, new Date(), { from: q.get('from') ?? undefined, to: q.get('to') ?? undefined });
  const doc = organisationId && /^[a-z0-9]{20,40}$/.test(id) ? await fleetReportPdfFor(id, organisationId, period) : null;
  if (!doc) return new NextResponse('Not found', { status: 404 });
  await writeAuditLog({ userId, action: 'customer.fleet_report_downloaded', entityType: 'Customer', entityId: id, organisationId, metadata: { period: period.label } });
  return new NextResponse(new Uint8Array(doc.pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${doc.fileName}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
