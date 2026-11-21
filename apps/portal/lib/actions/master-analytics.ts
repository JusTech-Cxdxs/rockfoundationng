'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { allows, orgWhere, reachWhere } from '@/lib/authz/server';
import { computeMasterAnalytics, type Job } from '@/lib/master-analytics';
import { lagosYmd } from '@/lib/nigeria-calendar';
import { moduleIsOn } from '@/lib/modules';

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export async function canSeeMasterAnalytics(): Promise<boolean> {
  await requireUser();
  // The Authorization Catalogue: Administrator (organisation-wide), Workshop
  // Manager and Finance Officer (their branch), Master Admin — plus any grant
  // added on the Roles page.
  return allows('analytics.business.view');
}

const PERIODS = ['today', 'this_month', 'last_month', 'last_30', 'this_quarter', 'this_year', 'custom'] as const;
type PeriodKey = (typeof PERIODS)[number];

function periodRange(key: PeriodKey, now: Date, custom?: { from?: string; to?: string }): { from: Date; to: Date; label: string } {
  const ymd = lagosYmd(now);
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(5, 7));
  const at = (yy: number, mm: number) => new Date(`${yy}-${String(mm).padStart(2, '0')}-01T00:00:00+01:00`);
  const tomorrow = new Date(`${ymd}T00:00:00+01:00`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (key === 'today') return { from: new Date(`${ymd}T00:00:00+01:00`), to: tomorrow, label: 'Today' };
  if (key === 'custom' && custom?.from && /^\d{4}-\d{2}-\d{2}$/.test(custom.from)) {
    const f = new Date(`${custom.from}T00:00:00+01:00`);
    const t = custom.to && /^\d{4}-\d{2}-\d{2}$/.test(custom.to) && custom.to >= custom.from ? new Date(new Date(`${custom.to}T00:00:00+01:00`).getTime() + 86400000) : tomorrow;
    const fmt = (d: Date) => d.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' });
    return { from: f, to: t, label: `${fmt(f)} – ${fmt(new Date(t.getTime() - 86400000))}` };
  }
  if (key === 'last_month') { const ly = m === 1 ? y - 1 : y, lm = m === 1 ? 12 : m - 1; return { from: at(ly, lm), to: at(y, m), label: at(ly, lm).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', month: 'long', year: 'numeric' }) }; }
  if (key === 'last_30') return { from: new Date(+tomorrow - 30 * 86400000), to: tomorrow, label: 'Last 30 days' };
  if (key === 'this_quarter') { const qm = Math.floor((m - 1) / 3) * 3 + 1; return { from: at(y, qm), to: tomorrow, label: `Q${Math.floor((m - 1) / 3) + 1} ${y} to date` }; }
  if (key === 'this_year') return { from: at(y, 1), to: tomorrow, label: `${y} to date` };
  return { from: at(y, m), to: tomorrow, label: `${at(y, m).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', month: 'long', year: 'numeric' })} to date` };
}

const SLIP_JOB = { slipLine: { select: { slip: { select: { jobCardId: true } } } } } as const;

/** `opts.history` false: leave out the invoices from the old system before EJO (EJO's own figures only). */
export async function getMasterAnalytics(periodKey?: string, custom?: { from?: string; to?: string }, opts: { history?: boolean } = {}) {
  if (!(await canSeeMasterAnalytics())) throw new Error('The master dashboard is for the Master Admin, Administrators, the Manager and Finance.');
  const now = new Date();
  const key = ((PERIODS as readonly string[]).includes(periodKey ?? '') ? periodKey : 'this_month') as PeriodKey;
  const { from, to, label } = periodRange(key, now, custom);
  const since = new Date(Math.min(+from - (+to - +from), +now - 100 * 86400000) - 86400000);
  // Branch-aware: a branch-scoped viewer sees exactly their branch's business.
  const reach = await reachWhere('analytics.business.view');
  // The Store (goods receipts, parts issued) only while it is on (lib/modules.ts):
  // otherwise not queried, and the parts cost is said plainly to be not tracked.
  const storeOn = moduleIsOn('inventory');
  const partsCostNote = storeOn ? null : 'Parts cost not tracked';

  const [jcs, grn] = await Promise.all([
    prisma.jobCard.findMany({
      where: { ...reach, OR: [{ createdAt: { gte: since } }, { status: { notIn: ['CHECKED_OUT', 'CANCELLED', 'CLOSED'] } }, { checkedOutAt: { gte: since } }, { completedAt: { gte: since } }, { closedAt: { gte: since } }, { payments: { some: { recordedAt: { gte: since } } } }, { refunds: { some: { recordedAt: { gte: since } } } }] },
      select: { id: true, jobNumber: true, status: true, createdAt: true, completedAt: true, checkedOutAt: true, closedAt: true, customerId: true, cancellationRequests: { where: { status: 'APPROVED' }, orderBy: { decidedAt: 'desc' }, take: 1, select: { decidedAt: true } }, customer: { select: { fullName: true, customerType: true } }, invoice: { select: { dueDate: true } }, estimate: { select: { lineItems: { select: { type: true, amount: true, billTo: true } } } }, payments: { select: { amount: true, recordedAt: true } }, refunds: { select: { amount: true, recordedAt: true } } },
    }),
    storeOn ? prisma.goodsReceiptLine.findMany({ where: { goodsReceipt: { ...reach, receivedAt: { gte: since } } }, select: { totalCost: true, goodsReceipt: { select: { receivedAt: true } } } }) : [],
  ]);

  // Parts cost of EXACTLY the jobs loaded above — whenever the parts were
  // issued (a job opened months ago still carries all of its cost) and
  // nothing for jobs outside the window.
  const jcIds = jcs.map((j: { id: string }) => j.id);
  const ofLoadedJobs = { jobCardId: { in: jcIds } };
  const [qty, batch, serial] = jcIds.length === 0 ? [[], [], []] as const : await Promise.all([
    storeOn ? prisma.partQuantityConsumption.findMany({ where: { slipLine: { slip: ofLoadedJobs } }, select: { quantityTaken: true, goodsReceiptLine: { select: { unitCost: true } }, ...SLIP_JOB } }) : [],
    storeOn ? prisma.partBatchConsumption.findMany({ where: { slipLine: { slip: ofLoadedJobs } }, select: { quantityTaken: true, batch: { select: { goodsReceiptLine: { select: { unitCost: true } } } }, ...SLIP_JOB } }) : [],
    storeOn ? prisma.partSerial.findMany({ where: { issuedToSlipLine: { slip: ofLoadedJobs } }, select: { goodsReceiptLine: { select: { unitCost: true } }, issuedToSlipLine: { select: { slip: { select: { jobCardId: true } } } } } }) : [],
  ]);

  // Parts cost per job (actual goods-receipt cost), and issues with no cost.
  const cost = new Map<string, number>();
  const uncosted = new Map<string, number>();
  const add = (job: { jobCardId: string | null } | undefined | null, qtyTaken: number, unitCost: unknown) => {
    const k = job?.jobCardId ? `JC:${job.jobCardId}` : null;
    if (!k) return;
    if (unitCost === null || unitCost === undefined) uncosted.set(k, (uncosted.get(k) ?? 0) + 1);
    else cost.set(k, (cost.get(k) ?? 0) + qtyTaken * Number(unitCost));
  };
  for (const q of qty) add(q.slipLine.slip, Number(q.quantityTaken), q.goodsReceiptLine?.unitCost);
  for (const b of batch) add(b.slipLine.slip, Number(b.quantityTaken), b.batch.goodsReceiptLine?.unitCost);
  for (const s of serial) add(s.issuedToSlipLine?.slip, 1, s.goodsReceiptLine?.unitCost);

  const jcCancelled = (j: { status: string; completedAt: Date | null; cancellationRequests: { decidedAt: Date | null }[] }) => {
    if (j.status === 'CANCELLED') return true;
    const c = j.cancellationRequests[0]?.decidedAt;
    return Boolean(c && (!j.completedAt || +new Date(c) > +new Date(j.completedAt)));
  };
  const pay = (xs: { amount: unknown; recordedAt: Date }[]) => xs.map((p) => ({ at: p.recordedAt, amount: num(p.amount) }));
  const jobs: Job[] = [
    ...jcs.map((j: (typeof jcs)[number]) => ({
      kind: 'JC' as const, id: j.id, number: j.jobNumber, customer: j.customer.fullName, customerId: j.customerId, status: j.status, openedAt: j.createdAt,
      // A cancelled hand-back (latest approved cancellation after its last
      // completion — even if it was later "checked out" to return the car)
      // earns nothing and owes nothing; its payments / refunds still count
      // as cash movements.
      finishedAt: jcCancelled(j) ? null : j.completedAt ?? j.checkedOutAt ?? j.closedAt ?? null,
      cancelled: jcCancelled(j),
      lines: (j.estimate?.lineItems ?? []).map((l: { type: string; amount: unknown; billTo: string }) => ({ type: l.type, amount: num(l.amount), billTo: l.billTo })),
      partsCost: cost.get(`JC:${j.id}`) ?? 0, partsIssuedWithoutCost: uncosted.get(`JC:${j.id}`) ?? 0, subletCost: 0,
      payments: pay(j.payments), refunds: pay(j.refunds),
      organisation: j.customer.customerType === 'ORGANIZATION', dueDate: j.invoice?.dueDate ?? null,
    })),
  ];
  const analytics = computeMasterAnalytics({
    jobs,
    purchases: grn.map((g: (typeof grn)[number]) => ({ at: g.goodsReceipt.receivedAt, cost: num(g.totalCost) })),
    from, to, now,
  });
  // Invoices from the previous system (brought in through Data Exchange) before EJO: read-only history, reported beside EJO's own figures (never mixed into
  // sales, margins or projections, which are EJO's) and added to the top customers, marked.
  const day = (d: Date) => new Date(`${lagosYmd(d)}T00:00:00.000Z`);
  const prevFrom = new Date(+from - (+to - +from));
  const fence = await orgWhere();
  const withHistory = opts.history !== false;
  const sapRows = fence.organisationId && withHistory
    ? await prisma.historicalInvoice.groupBy({
        by: ['customerId'],
        where: { organisationId: fence.organisationId, voidedAt: null, invoiceDate: { gte: day(from), lt: day(to) }, ...(reach.branchId ? { branchId: reach.branchId } : {}) },
        _sum: { amount: true }, _count: { _all: true },
      })
    : [];
  const sapPrev = fence.organisationId && withHistory
    ? await prisma.historicalInvoice.aggregate({ where: { organisationId: fence.organisationId, voidedAt: null, invoiceDate: { gte: day(prevFrom), lt: day(from) }, ...(reach.branchId ? { branchId: reach.branchId } : {}) }, _sum: { amount: true } })
    : null;
  const sapTotal = sapRows.reduce((t, r) => t + num(r._sum.amount), 0);
  const sapHistory = { invoices: sapRows.reduce((t, r) => t + r._count._all, 0), amount: Math.round(sapTotal * 100) / 100, previous: Math.round(num(sapPrev?._sum.amount) * 100) / 100 };
  let topCustomers: { id: string | null; name: string; value: number; fromSap?: number }[] = analytics.diagnostic.topCustomers;
  if (sapRows.length) {
    const by = new Map(topCustomers.map((c) => [c.id ?? c.name, { ...c, fromSap: 0 }]));
    const names = new Map((await prisma.customer.findMany({ where: { id: { in: sapRows.map((r) => r.customerId) } }, select: { id: true, fullName: true } })).map((c) => [c.id, c.fullName]));
    for (const r of sapRows) {
      const amount = num(r._sum.amount);
      const e = by.get(r.customerId) ?? { id: r.customerId, name: names.get(r.customerId) ?? 'Customer', value: 0, fromSap: 0 };
      e.value = Math.round((e.value + amount) * 100) / 100; e.fromSap = Math.round((e.fromSap + amount) * 100) / 100;
      by.set(r.customerId, e);
    }
    topCustomers = [...by.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  }
  return { ...analytics, diagnostic: { ...analytics.diagnostic, topCustomers }, sapHistory, partsCostNote, periodKey: key, periodLabel: label };
}
