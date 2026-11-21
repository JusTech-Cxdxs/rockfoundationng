/**
 * Leadership and IT tools: a full briefing on the business for the Owner and
 * managers, and plain-words explanations of the error log for IT. Both run
 * the pages' own authorised code as the signed-in person (the dashboard's
 * overview, Business analytics, Team performance, the Error log) and return
 * figures computed here — the model only quotes.
 */
import { prisma } from '@ejo/database';
import { allows, authorize, orgWhere } from '@/lib/authz/server';
import { getLeadershipPulse } from '@/lib/actions/leadership';
import { getMasterAnalytics } from '@/lib/actions/master-analytics';
import { getTeamPerformance } from '@/lib/actions/team';
import { KIND_LABEL, KIND_TODO, isErrorKind, normaliseRef } from '@/lib/error-events-core';
import { nothing, ok, r2, refused, text, when } from '../tool-helpers';
import type { StaffTool } from '../types';

const LEADERS = 'the branch briefing is for directors, administrators and managers with Business analytics.';
const IT = 'the error log is for IT and administrators (audit trail access).';

export const leadershipTools: StaffTool[] = [
  {
    name: 'branch_briefing',
    kind: 'read',
    status: 'Preparing the briefing…',
    description:
      'A complete briefing for the Owner and managers on the business this month: the money (sales, gross profit and margin, takings, what the sales are made of: labour, parts, outside work, sundry, what is owed), the workshop now (Job Cards in, ready, waiting for parts or the customer, turnaround), decisions waiting by queue and the oldest, customer support, the team (who needs attention, who is strong), and what to look at first. Use it for "brief me", "how are we doing", "give me the overview". For stock details also use stock_alerts. Needs Business analytics.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      if (!(await allows('analytics.business.view'))) return refused(LEADERS);
      const [pulse, a, team] = await Promise.all([
        getLeadershipPulse().catch(() => null),
        getMasterAnalytics('this_month').catch(() => null),
        getTeamPerformance('this_month').catch(() => null),
      ]);
      if (!pulse && !a) return nothing('The figures could not be read just now. Try again in a moment.');
      return ok({
        scope: pulse?.scope === 'branch' ? 'Own branch' : 'Whole business',
        asOf: when(pulse?.asOf ?? new Date()),
        money: a ? {
          sales: a.current.sales, salesChangePercent: a.changes.sales, grossProfit: a.current.grossProfit, grossMarginPercent: a.current.grossMargin,
          takings: a.current.collections, jobsFinished: a.current.jobsCompleted, averageJob: a.current.averageJob,
          madeOf: { labour: a.current.labour, parts: a.current.parts, outsideWork: a.current.sublet, sundry: a.current.sundry },
          owedOnFinishedJobs: a.position.receivables, monthProjection: a.predictive.monthProjection, lastMonthSales: a.predictive.lastMonthSales,
          biggestCustomers: a.diagnostic.topCustomers.slice(0, 3).map((c) => ({ name: c.name, value: r2(c.value) })),
          whatToDo: a.actions.slice(0, 4).map((x) => x.title),
        } : null,
        workshopNow: pulse ? { jobCardsIn: pulse.workshop.jobCardsIn, readyToCollect: pulse.workshop.ready, waitingForParts: pulse.workshop.awaitingParts, waitingForCustomer: pulse.workshop.awaitingCustomer, medianTurnaroundHours30d: pulse.workshop.turnaroundHours } : null,
        decisionsWaiting: pulse ? pulse.waiting.filter((w) => w.count > 0).map((w) => ({ what: w.label, count: w.count, oldestHours: w.oldestHours })) : [],
        support: pulse?.support ?? null,
        team: team ? { peopleWhoHandledWork: team.totals.people, withinStandardPercent: team.totals.withinPct, needsAttention: team.people.filter((p) => p.rating === 'attention').slice(0, 5).map((p) => ({ name: p.name, roles: p.roles, withinStandardPercent: p.withinPct, rework: p.rework })), strong: team.people.filter((p) => p.rating === 'strong').slice(0, 5).map((p) => p.name) } : null,
        readAloudTip: 'When asked to brief aloud: start with the one-line verdict, then money, workshop, decisions waiting, team, customers; end with the two or three things to do first. Round money to the nearest thousand naira when speaking.',
      }, [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Business analytics', href: '/analytics' }]);
    },
  },
  {
    name: 'explain_error',
    kind: 'read',
    status: 'Reading the error log…',
    description:
      'For IT: explains an error from the Error log in plain words — what kind it is, where it happened (page, action, method), when, who met it (name only), the technical message and the first lines of the stack, and what to check next. Give the reference the person quoted (e.g. "1914370005" or "ERR-…"); without one, the latest errors are summarised. Needs audit trail access.',
    parameters: {
      type: 'object',
      properties: { ref: { type: 'string', description: 'The error reference the person was shown. Empty for the latest errors.', maxLength: 60 } },
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('audit.view'))) return refused(IT);
      await authorize('audit.view', undefined, 'enyo.explain_error');
      const fence = await orgWhere();
      const ref = normaliseRef(text(args.ref, 60));
      if (!ref) {
        const latest = await prisma.errorEvent.findMany({ where: fence, orderBy: { createdAt: 'desc' }, take: 8, select: { ref: true, createdAt: true, kind: true, message: true, path: true, route: true } });
        if (!latest.length) return nothing('No errors are recorded.');
        return ok({
          latest: latest.map((e) => ({ ref: e.ref, at: when(e.createdAt), kind: isErrorKind(e.kind) ? KIND_LABEL[e.kind] : 'Other', page: e.path ?? e.route, message: e.message.slice(0, 200) })),
          tip: 'Group them by kind and page; say which look like one cause. Offer to explain any one by its reference.',
        }, [{ label: 'Error log', href: '/audit-logs/errors' }]);
      }
      const e = await prisma.errorEvent.findFirst({ where: { ...fence, ref }, select: { ref: true, createdAt: true, app: true, kind: true, name: true, message: true, method: true, path: true, route: true, stack: true, userId: true, customerId: true } });
      if (!e) return nothing(`No error with reference ${ref} in this organisation's log (references are kept 90 days).`);
      const who = e.userId ? await prisma.user.findFirst({ where: { id: e.userId, ...(fence.organisationId ? { organisationId: fence.organisationId } : {}) }, select: { fullName: true } }) : null;
      const kind = isErrorKind(e.kind) ? e.kind : 'unknown';
      return ok({
        ref: e.ref, at: when(e.createdAt), app: e.app === 'website' ? 'Website / customer portal' : 'Staff portal',
        kind: KIND_LABEL[kind], whatToCheck: KIND_TODO[kind],
        where: { page: e.path, route: e.route, method: e.method },
        who: who?.fullName ?? (e.customerId ? 'A customer' : 'Nobody signed in'),
        technical: { name: e.name, message: e.message.slice(0, 600), firstStackLines: e.stack ? e.stack.split('\n').slice(0, 5).map((l) => l.trim()) : [] },
        tip: 'Explain it to an IT person: what happened in one sentence, the likely cause (from the message and kind), whether data could be affected (changes run in transactions — nothing is half-saved), and the next check. Never invent details not in the record.',
      }, [{ label: `Error ${e.ref}`, href: `/audit-logs/errors?ref=${encodeURIComponent(e.ref)}` }]);
    },
  },
];
