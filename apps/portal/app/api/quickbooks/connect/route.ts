import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/server';
import { requireUser } from '@/lib/actions/workshop';
import { authorizeUrl, qboConfig, QBO_STATE_COOKIE } from '@/lib/quickbooks/qbo';
import { portalBaseUrl } from '@/lib/portal-url';

/**
 * The Owner starts the QuickBooks Online connection: a one-time state is kept
 * in a short-lived, http-only cookie and the browser goes to Intuit to approve.
 * Off (back to Settings with a message) unless the server has the settings.
 */
export async function GET() {
  const back = (q: string) => NextResponse.redirect(`${portalBaseUrl().replace(/\/$/, '')}/settings/quickbooks?${q}`);
  try {
    await requireUser();
    await authorize('admin.organisation.manage', undefined, 'connectQuickBooksOnline', 'Only the Owner connects QuickBooks Online.');
  } catch {
    return back('error=' + encodeURIComponent('Only the Owner connects QuickBooks Online.'));
  }
  const cfg = qboConfig();
  if (!('config' in cfg)) return back('error=' + encodeURIComponent('QuickBooks Online is not set up on this server yet.'));
  const state = randomBytes(24).toString('base64url');
  const res = NextResponse.redirect(authorizeUrl(cfg.config, state));
  res.cookies.set(QBO_STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/quickbooks', maxAge: 600 });
  return res;
}
