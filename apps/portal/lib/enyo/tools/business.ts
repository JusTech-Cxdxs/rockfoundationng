/**
 * Business figures: the same engine as the Analytics page (getMasterAnalytics,
 * branch-aware through analytics.business.view) and a technician ranking for
 * managers. Every figure is computed here; the model only quotes them.
 */
import { prisma } from '@ejo/database';
import { allows, reachWhere } from '@/lib/authz/server';
import { getMasterAnalytics } from '@/lib/actions/master-analytics';
import { ageingReport } from '@/lib/money/statements-server';
import { AGEING_LABEL, AGEING_ORDER } from '@/lib/money/rules';
import { day, lagosDayStart, lagosWeekStart, nothing, ok, r2, refused, text } from '../tool-helpers';
import type { StaffTool } from '../types';

const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
const MONEY_WHO = 'business figures (takings, revenue, profit) are for the Owner / GMD.';

async function scopeLabel(key: 'analytics.business.view' | 'workshop.close.approve'): Promise<{ where: Awaited<ReturnType<typeof reachWhere>>; label: string }> {
  const where = await reachWhere(key);
  if (typeof where.branchId === 'string') {
    const b = await prisma.branch.findUnique({ where: { id: where.branchId }, select: { name: true } });
    return { where, label: `${b?.name ?? 'Your branch'} only` };
  }
  return { where, label: 'Whole organisation' };
}

function monthStart(offset: number, now = new Date()): Date {
  const [y, m] = ymd(now).split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return new Date(`${d.toISOString().slice(0, 7)}-01T00:00:00+01:00`);
}

/** [from, to) for a ranking period, Lagos time. */
function rankingRange(period: string): { from: Date; to: Date; label: string } {
  const tomorrow = lagosDayStart(1);
  if (period === 'this_week') return { from: lagosWeekStart(), to: tomorrow, label: 'This week' };
  if (period === 'last_month') return { from: monthStart(-1), to: monthStart(0), label: 'Last month' };
  if (period === 'last_30_days') return { from: new Date(tomorrow.getTime() - 30 * 86_400_000), to: tomorrow, label: 'Last 30 days' };
  return { from: monthStart(0), to: tomorrow, label: 'This month to date' };
}

const LABOUR = new Set(['LABOUR', 'INTERNAL_JOB']);
const labourOf = (lines: { type: string; amount: unknown; billTo?: string | null }[]) =>
  lines.filter((l) => LABOUR.has(l.type) && l.billTo !== 'GOODWILL' && l.billTo !== 'INTERNAL').reduce((s, l) => s + (l.amount === null || l.amount === undefined ? 0 : Number(l.amount)), 0);

const TAKINGS_WHO = 'takings are for Accounts and the Owner.';
const METHOD_WORDS: Record<string, string> = { CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', POS: 'POS (card)', CHEQUE: 'Cheque', OTHER: 'Other' };

/** [from, to) for a takings period, Lagos time. */
function takingsRange(period: string): { from: Date; to: Date; label: string } {
  if (period === 'today') return { from: lagosDayStart(0), to: lagosDayStart(1), label: 'Today' };
  if (period === 'yesterday') return { from: lagosDayStart(-1), to: lagosDayStart(0), label: 'Yesterday' };
  return rankingRange(period);
}

export const businessTools: StaffTool[] = [
  {
    name: 'takings_summary',
    kind: 'read',
    status: 'Adding up the money received…',
    description:
      'Money received (takings) for today, yesterday, this week, this month, last month or the last 30 days: payments on jobs and counter sales by method (cash, transfer, POS), refunds paid out, credit notes approved, and what customers owe now by how long it has been owed. No revenue, costs or profit (Owner only, business_summary). Needs "See takings" (Accounts, the Owner).',
    parameters: {
      type: 'object',
      properties: { period: { type: 'string', enum: ['today', 'yesterday', 'this_week', 'this_month', 'last_month', 'last_30_days'], description: 'Which period.' } },
      required: ['period'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('money.takings.view'))) return refused(TAKINGS_WHO);
      const { from, to, label } = takingsRange(text(args.period, 20));
      // The person's reach: their organisation's branches (or the branch they look at), never another organisation's.
      const reach = await reachWhere('money.takings.view');
      const jobFence = reach;
      const [payments, refunds, sales, credits, ageing] = await Promise.all([
        prisma.payment.groupBy({ by: ['method'], where: { recordedAt: { gte: from, lt: to }, jobCard: jobFence }, _sum: { amount: true }, _count: { _all: true } }),
        prisma.refund.aggregate({ where: { recordedAt: { gte: from, lt: to }, jobCard: jobFence }, _sum: { amount: true }, _count: { _all: true } }),
        prisma.counterSale.groupBy({ by: ['paymentMethod'], where: { soldAt: { gte: from, lt: to }, ...reach }, _sum: { total: true }, _count: { _all: true } }),
        prisma.creditNote.aggregate({ where: { status: 'APPROVED', decidedAt: { gte: from, lt: to }, jobCard: jobFence }, _sum: { amount: true }, _count: { _all: true } }),
        ageingReport(reach),
      ]);
      const byMethod = new Map<string, number>();
      for (const p of payments) byMethod.set(String(p.method), r2((byMethod.get(String(p.method)) ?? 0) + Number(p._sum.amount ?? 0)));
      for (const c of sales) byMethod.set(String(c.paymentMethod), r2((byMethod.get(String(c.paymentMethod)) ?? 0) + Number(c._sum.total ?? 0)));
      const received = r2([...byMethod.values()].reduce((a, b) => a + b, 0));
      const refunded = r2(Number(refunds._sum.amount ?? 0));
      return ok({
        period: label,
        scope: typeof reach.branchId === 'string' ? 'One branch' : 'Whole organisation',
        takings: r2(received - refunded),
        received,
        byMethod: [...byMethod.entries()].map(([m, amount]) => ({ method: METHOD_WORDS[m] ?? m, amount })),
        jobPayments: payments.reduce((n, p) => n + p._count._all, 0),
        counterSales: { count: sales.reduce((n, c) => n + c._count._all, 0), amount: r2(sales.reduce((s, c) => s + Number(c._sum.total ?? 0), 0)) },
        refundsPaidOut: { count: refunds._count._all, amount: refunded },
        creditNotesApproved: { count: credits._count._all, amount: r2(Number(credits._sum.amount ?? 0)) },
        owedNow: { total: ageing.owed, pastDue: ageing.overdue, byAge: AGEING_ORDER.map((b) => ({ age: AGEING_LABEL[b], amount: r2(ageing.totals[b]) })), customers: ageing.customers.length },
        definitions: {
          takings: 'Payments received in the period (on jobs and counter sales, VAT included) minus refunds paid out in the period.',
          owedNow: 'What customers owe on issued invoices today, after payments and approved credit notes, by how long it has been owed.',
        },
      }, [{ label: 'What customers owe', href: '/money/statements' }]);
    },
  },
  {
    name: 'business_summary',
    kind: 'read',
    status: 'Adding up the business figures…',
    description:
      'Takings (money received, net of refunds) and revenue (value of jobs completed) for today, this week, this month, last month, the last 30 days, this quarter, this year or a custom range, with gross profit, jobs completed, the previous period for comparison and money owed. Same figures as the Analytics page. Needs Business Analytics.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'this_week', 'this_month', 'last_month', 'last_30_days', 'this_quarter', 'this_year', 'custom'], description: 'Which period. Use custom with from/to for anything else.' },
        from: { type: 'string', format: 'date', description: 'Custom range start, YYYY-MM-DD.' },
        to: { type: 'string', format: 'date', description: 'Custom range end (inclusive), YYYY-MM-DD.' },
      },
      required: ['period'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('analytics.business.view'))) return refused(MONEY_WHO);
      const period = text(args.period, 20);
      let key = period === 'last_30_days' ? 'last_30' : period;
      let custom: { from?: string; to?: string } | undefined;
      if (period === 'this_week') { key = 'custom'; custom = { from: ymd(lagosWeekStart()), to: ymd(new Date()) }; }
      if (period === 'custom') {
        const from = text(args.from, 10);
        const to = text(args.to, 10) || ymd(new Date());
        if (!from) return nothing('A custom period needs a start date (from).');
        if (to < from) return nothing('The end date is before the start date.');
        custom = { from, to };
      }
      const a = await getMasterAnalytics(key, custom);
      const { label } = await scopeLabel('analytics.business.view');
      const c = a.current;
      const p = a.previous;
      return ok({
        period: period === 'this_week' ? `This week (${a.periodLabel})` : a.periodLabel,
        scope: label,
        takings: c.collections,
        refundsPaidOut: c.refunds,
        revenue: c.sales,
        revenueBreakdown: { labour: c.labour, parts: c.parts, outsideWork: c.sublet, sundry: c.sundry, chargedToCustomers: c.customerSales, underWarranty: c.warrantySales },
        notCharged: c.givenAway,
        grossProfit: c.grossProfit,
        grossMarginPercent: c.grossMargin,
        jobsCompleted: c.jobsCompleted,
        jobsOpened: c.jobsOpened,
        averageJob: c.averageJob,
        previousPeriod: { revenue: p.sales, takings: p.collections, jobsCompleted: p.jobsCompleted },
        changePercent: { revenue: a.changes.sales, takings: a.changes.collections, jobsCompleted: a.changes.jobsCompleted },
        rightNow: { jobsInProgress: a.position.wipJobs, valueInProgress: a.position.wipValue, owedOnFinishedJobs: a.position.receivables, owedJobs: a.position.receivableJobs, overpaidToRefund: a.position.overpaidTotal },
        definitions: {
          takings: 'Payments received in the period minus refunds paid in the period, whatever job they were for.',
          revenue: 'Value of the jobs completed in the period (customer lines and lines under the workshop\'s own warranty; goodwill and internal lines excluded).',
          grossProfit: 'Revenue minus the recorded cost of parts issued and outside work on those jobs.',
        },
      }, [{ label: 'Business analytics', href: '/analytics' }]);
    },
  },
  {
    name: 'technician_leaderboard',
    kind: 'read',
    status: 'Ranking the technicians…',
    description:
      'Technicians ranked by Job Cards completed this week, this month, last month or the last 30 days, with their average time from start of work to completion compared with the team average, and the labour they billed (only for people who see business figures). Includes the formula used. For managers and business analytics.',
    parameters: {
      type: 'object',
      properties: { period: { type: 'string', enum: ['this_week', 'this_month', 'last_month', 'last_30_days'], description: 'Which period (default this month).' } },
      additionalProperties: false,
    },
    run: async (args) => {
      const [money, manager] = await Promise.all([allows('analytics.business.view'), allows('workshop.close.approve')]);
      if (!money && !manager) return refused('the technician ranking is for the Owner / GMD.');
      const { from, to, label } = rankingRange(text(args.period, 20) || 'this_month');
      const { where: reach, label: scope } = await scopeLabel(money ? 'analytics.business.view' : 'workshop.close.approve');
      const done = { completedAt: { gte: from, lt: to }, assignedTechnicianId: { not: null } };
      const jcs = await prisma.jobCard.findMany({ where: { ...reach, ...done, status: { not: 'CANCELLED' } }, take: 2000, select: { assignedTechnicianId: true, assignedTechnician: { select: { fullName: true } }, workStartedAt: true, completedAt: true, estimate: { select: { lineItems: { select: { type: true, amount: true, billTo: true } } } } } });
      type Acc = { name: string; jobs: number; hours: number[]; labour: number };
      const by = new Map<string, Acc>();
      const add = (id: string, name: string, started: Date | null, completed: Date | null, labour: number) => {
        const a = by.get(id) ?? { name, jobs: 0, hours: [], labour: 0 };
        a.jobs += 1;
        if (started && completed && +completed > +started) a.hours.push((+completed - +started) / 3_600_000);
        a.labour += labour;
        by.set(id, a);
      };
      for (const j of jcs) add(j.assignedTechnicianId!, j.assignedTechnician?.fullName ?? 'Former staff member', j.workStartedAt, j.completedAt, labourOf(j.estimate?.lineItems ?? []));
      if (!by.size) return ok({ period: label, scope, from: day(from), to: day(new Date(to.getTime() - 1)), ranking: [], note: 'No technician completed a job in this period.' }, [{ label: 'Business analytics', href: '/analytics' }]);
      const all = [...by.values()].flatMap((a) => a.hours);
      const teamAvg = all.length ? all.reduce((s, h) => s + h, 0) / all.length : null;
      const ranking = [...by.values()]
        .map((a) => {
          const avg = a.hours.length ? a.hours.reduce((s, h) => s + h, 0) / a.hours.length : null;
          return {
            technician: a.name,
            jobsCompleted: a.jobs,
            averageHoursStartToComplete: avg === null ? null : Math.round(avg * 10) / 10,
            versusTeamAverage: avg !== null && teamAvg ? `${Math.round((avg / teamAvg) * 100)}% of the team average` : null,
            ...(money ? { labourBilled: r2(a.labour) } : {}),
          };
        })
        .sort((x, y) => y.jobsCompleted - x.jobsCompleted || (x.averageHoursStartToComplete ?? 1e9) - (y.averageHoursStartToComplete ?? 1e9))
        .map((r, i) => ({ rank: i + 1, ...r }));
      return ok({
        period: label,
        scope,
        from: day(from),
        to: day(new Date(to.getTime() - 1)),
        teamAverageHours: teamAvg === null ? null : Math.round(teamAvg * 10) / 10,
        ranking: ranking.slice(0, 15),
        formula:
          'Ranked by jobs completed in the period (Job Cards whose work was completed; cancelled ones excluded), ties broken by the shorter average time. Time per job = from the first start of work to completion, in hours (waiting for parts included). No planned time is recorded per job, so each technician\'s average is compared with the team average instead.' +
          (money ? ' Labour billed = Labour and Internal Job lines on those jobs\' estimates (goodwill and internal lines excluded).' : ''),
      }, [{ label: 'Business analytics', href: '/analytics' }]);
    },
  },
];
