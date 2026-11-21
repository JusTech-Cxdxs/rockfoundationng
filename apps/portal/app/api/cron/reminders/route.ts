import { logFailure } from '@/lib/log';
import { NextRequest, NextResponse } from 'next/server';
import { deliverDueBroadcastEmails } from '@/lib/broadcast-delivery';
import { recordJobRun } from '@/lib/job-runs';
import { setAuditActor } from '@ejo/database';
import { isCronRequest } from '@/lib/cron-auth';
import { deliverRoleAccessNotices } from '@/lib/access-notices';
import { deliverDueReminders } from '@/lib/reminders';

// Room for a batch of access-changed emails (a role with many holders).
export const maxDuration = 60;

/**
 * The 10-minute run (Supabase scheduler; protected by CRON_SECRET like every
 * cron route): scheduled notices go out by email at their start time, role
 * permission changes become one access-changed email per holder, and
 * personal reminders that are due reach the person's bell (and email when
 * they asked). Each part is recorded on the scheduler log page.
 */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  setAuditActor(null, 'cron:reminders');
  const broadcastEmails = await deliverDueBroadcastEmails().catch((err) => { logFailure('Scheduled notices failed', err); return null; });
  if (broadcastEmails !== null) await recordJobRun('scheduled-notices', { broadcastEmailsSent: broadcastEmails });
  const notices = await deliverRoleAccessNotices().catch((err) => { logFailure('Access notices failed', err); return null; });
  if (notices) await recordJobRun('access-notices', { rolesChanged: notices.roles, upTo: notices.upTo });
  const personal = await deliverDueReminders().catch((err) => { logFailure('Reminder delivery failed', err); return null; });
  if (personal) await recordJobRun('reminders', { remindersDelivered: personal.delivered, remindersEmailed: personal.emailed });
  return NextResponse.json({ ok: true, broadcastEmailsSent: broadcastEmails ?? 0, personalRemindersDelivered: personal?.delivered ?? 0 });
}
