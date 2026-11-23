import { prisma } from '@ejo/database';

/**
 * Scheduled jobs leave a trace: every run is written to the audit trail as
 * `system.job_run` (what ran, when, and what it did), so "is it working?"
 * is answered on the Settings page instead of guessed. Never throws.
 */
export async function recordJobRun(job: string, result: Record<string, unknown>): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { userId: null, action: 'system.job_run', entityType: 'ScheduledJob', entityId: job, metadata: result as never } });
  } catch {
    /* a missing trace never breaks the job itself */
  }
}

export const JOBS: { key: string; name: string; when: string; does: string }[] = [
  { key: 'scheduled-notices', name: 'Scheduled notices', when: 'Every 10 minutes (Supabase scheduler)', does: 'Sends notices to staff and customers by email at the start time they were scheduled for.' },
  { key: 'access-notices', name: 'Access-changed emails', when: 'Every 10 minutes, with the scheduled notices', does: 'When permissions are added to or removed from a role, emails everyone who holds it their full, current access — one email per batch of changes.' },
  { key: 'reminders', name: 'Personal reminders', when: 'Every 10 minutes, with the scheduled notices', does: 'Puts reminders that are due into each person\'s bell and emails them when they asked for it. Each reminder is delivered once.' },
  { key: 'low-ratings', name: 'Low ratings become complaints', when: 'Every 10 minutes, with the scheduled notices', does: 'A “How did we do?” rating of 3 or less opens a complaint in the Support centre and a call for front desk the same day.' },
  { key: 'callback-list', name: 'Callback list', when: '8:00 am daily, with the pricing digest (Vercel)', does: 'Adds the day’s calls to the callback list: customers whose birthday it is, and vehicles due for service within a week. Each call is added once.' },
  { key: 'support', name: 'Support centre', when: 'Every 2–5 minutes (Supabase scheduler)', does: 'Reads new mail to the support addresses into tickets with an acknowledgement; Enyo reads them (and answers general questions where a queue allows it); warns before targets are missed; sends reminders when a request waits on the customer, resolves and closes old ones, and asks “How did we do?”.' },
  { key: 'support-enyo', name: 'Support centre: Enyo reads new requests', when: 'Every 2 minutes (Supabase scheduler)', does: 'Enyo reads new email requests (topic, urgency, mood, summary) and, in teams that allow it, answers general questions by itself when every rule allows; otherwise leaves a draft and says why a person is needed.' },
  { key: 'integrity-scan', name: 'Integrity watch checks', when: 'Daily between 1 and 5 am, with the Support centre run (Supabase scheduler)', does: 'Looks for unusual or risky activity (same person asking and approving, refunds above what was paid, vehicles leaving with work open, money out of hours, password guessing, unusual spikes) and raises alerts for reviewers on the Integrity watch page.' },
  { key: 'pricing-alerts', name: 'Pricing alerts digest', when: '8:00 am daily (Vercel)', does: 'Emails Store staff one summary of open pricing alerts — only when there are open alerts.' },
  { key: 'error-log-cleanup', name: 'Error log clean-up', when: '8:00 am daily, with the pricing digest (Vercel)', does: 'Removes error references older than 90 days from the Error log.' },
  { key: 'enyo-cleanup', name: 'Enyo chat clean-up', when: '8:00 am daily, with the pricing digest (Vercel)', does: 'Removes Enyo conversations 12 months after their last message (staff and customers) and website chats after 90 days.' },
  { key: 'reminder-retention', name: 'Reminder clean-up', when: '8:00 am daily, with the pricing digest (Vercel)', does: 'Removes reminders that were done or cancelled more than 12 months ago.' },
  { key: 'enyo-chat-learning', name: 'Enyo learns from customer and website chats', when: '8:00 am daily, with the pricing digest (Vercel)', does: 'General questions customers and visitors asked Enyo (answered from public information, without a hand-over) become answers waiting for an administrator’s approval on the Enyo learning page. Names and contact details are removed.' },
  { key: 'import-staging-release', name: 'Imported files released', when: '8:00 am daily, with the pricing digest (Vercel)', does: 'Releases the staged copy of each finished import’s file once its period has passed (30 days unless the organisation sets otherwise; never while Accounts has still to confirm its totals). The summary, every row’s outcome, rejected rows and what undo needs are kept.' },
  { key: 'recycle-bin-purge', name: 'Recycle bin clean-up', when: '8:00 am daily, with the pricing digest (Vercel)', does: 'Permanently removes Recycle bin items whose restore period has ended (30 days unless RECYCLE_BIN_DAYS says otherwise). A short record of what was removed, by whom and why stays.' },
];

export type JobStatus = { key: string; name: string; when: string; does: string; lastRun: Date | null; lastResult: Record<string, unknown> | null; runs7d: number };

/** Last run and 7-day count per job, plus email delivery health. */
export async function jobStatuses(): Promise<{ jobs: JobStatus[]; emails7d: { sent: number; failed: number; lastError: string | null } }> {
  const since = new Date(Date.now() - 7 * 86400000);
  const jobs = await Promise.all(
    JOBS.map(async (j) => {
      const [last, runs7d] = await Promise.all([
        prisma.auditLog.findFirst({ where: { action: 'system.job_run', entityType: 'ScheduledJob', entityId: j.key }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, metadata: true } }),
        prisma.auditLog.count({ where: { action: 'system.job_run', entityType: 'ScheduledJob', entityId: j.key, createdAt: { gte: since } } }),
      ]);
      return { ...j, lastRun: last?.createdAt ?? null, lastResult: (last?.metadata as Record<string, unknown> | null) ?? null, runs7d };
    }),
  );
  const [sent, failed, lastFail] = await Promise.all([
    prisma.securityEmailLog.count({ where: { sent: true, createdAt: { gte: since } } }),
    prisma.securityEmailLog.count({ where: { sent: false, createdAt: { gte: since } } }),
    prisma.securityEmailLog.findFirst({ where: { sent: false }, orderBy: { createdAt: 'desc' }, select: { error: true } }),
  ]);
  return { jobs, emails7d: { sent, failed, lastError: lastFail?.error ?? null } };
}

/** A job not running on time: never ran, or quiet for longer than its rhythm allows (frequent jobs 1 hour, daily ones 3 days). */
export function jobIsLate(j: { key: string; lastRun: Date | null }, now = Date.now()): boolean {
  return !j.lastRun || now - j.lastRun.getTime() > (j.key === 'appointment-reminders' || j.key.startsWith('support') ? 3_600_000 : 3 * 86_400_000);
}
