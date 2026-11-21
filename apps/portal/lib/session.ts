import { cache } from 'react';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

/**
 * Better Auth's session for this request: the person who signed in with
 * their own password. Server-only (not a 'use server' file).
 */
export const signedInSession = cache(async () => {
  // Outside a request (a scheduled job, or work still running once the
  // response has gone) there is no session: quietly, never Next's
  // "used headers inside after()" error.
  let h: Headers;
  try { h = await headers(); } catch { return null; }
  return auth.api.getSession({ headers: h });
});
