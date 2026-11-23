import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { authorize, myOrganisationId } from '@/lib/authz/server';
import { requireUser } from '@/lib/actions/workshop';
import { validRealmId, QBO_STATE_COOKIE } from '@/lib/quickbooks/qbo';
import { connectWithCode, QboError } from '@/lib/quickbooks/qbo-server';
import { writeAuditLog } from '@/lib/workshop-core';
import { portalBaseUrl } from '@/lib/portal-url';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Intuit sends the Owner back here with a code: the state must match the
 * cookie set when they left (no one else's approval can be slipped in), then
 * the code is exchanged and the tokens kept, encrypted. Audited.
 */
export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(`${portalBaseUrl().replace(/\/$/, '')}/settings/quickbooks?${q}`);
    res.cookies.set(QBO_STATE_COOKIE, '', { httpOnly: true, path: '/api/quickbooks', maxAge: 0 });
    return res;
  };
  const url = req.nextUrl;
  const state = url.searchParams.get('state') ?? '';
  const expected = req.cookies.get(QBO_STATE_COOKIE)?.value ?? '';
  if (!state || !expected || !same(state, expected)) return back('error=' + encodeURIComponent('The connection could not be confirmed. Start it again from this page.'));
  if (url.searchParams.get('error')) return back('error=' + encodeURIComponent('QuickBooks Online was not connected (the approval was cancelled at Intuit).'));
  const code = url.searchParams.get('code') ?? '';
  const realmId = validRealmId(url.searchParams.get('realmId'));
  if (!code || code.length > 2000 || !realmId) return back('error=' + encodeURIComponent('Intuit did not send the company back. Start the connection again.'));
  let userId: string;
  let organisationId: string | null;
  try {
    userId = (await requireUser()).id;
    await authorize('admin.organisation.manage', undefined, 'connectQuickBooksOnline', 'Only the Owner connects QuickBooks Online.');
    organisationId = await myOrganisationId();
  } catch {
    return back('error=' + encodeURIComponent('Only the Owner connects QuickBooks Online.'));
  }
  if (!organisationId) return back('error=' + encodeURIComponent('No organisation to connect.'));
  try {
    await connectWithCode(organisationId, userId, code, realmId);
  } catch (err) {
    return back('error=' + encodeURIComponent(err instanceof QboError ? err.message : 'QuickBooks Online could not be connected. Try again.'));
  }
  await writeAuditLog({ userId, action: 'quickbooks.online_connected', entityType: 'Organisation', entityId: organisationId, organisationId, metadata: { realmId } });
  return back('status=connected');
}
