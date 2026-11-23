/**
 * The parts store report: what was sold (on jobs and over the counter), what
 * is running low, and what has not moved. Pure, so the page and the tests
 * agree. Costs are only worked out when `withCosts` is true (the Owner): the
 * Store Keeper's report carries quantities and selling prices alone.
 */

export type Movement = { partId: string; at: Date; qty: number; channel: 'JOB' | 'COUNTER'; unitPrice: number | null; unitCost: number | null };
export type ReportPart = { id: string; name: string; partNumber: string | null; category: string | null; unit: string; onHand: number; reserved: number; reorderPoint: number | null; lastCost: number | null };

export type SoldRow = { partId: string; name: string; unit: string; jobQty: number; counterQty: number; jobRevenue: number; counterRevenue: number; revenue: number; cost: number | null; profit: number | null };
export type LowRow = { partId: string; name: string; unit: string; onHand: number; reserved: number; free: number; reorderPoint: number | null; outOfStock: boolean };
export type SlowRow = { partId: string; name: string; unit: string; onHand: number; lastMovedAt: Date | null; daysIdle: number | null; value: number | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const DAY = 86400000;

export function partsReport(input: { parts: ReportPart[]; movements: Movement[]; from: Date; to: Date; now: Date; slowDays?: number; withCosts: boolean }) {
  const { parts, movements, from, to, now, withCosts } = input;
  const slowDays = input.slowDays ?? 90;
  const byId = new Map(parts.map((p) => [p.id, p]));
  const sold = new Map<string, SoldRow & { costKnown: boolean }>();
  const lastMoved = new Map<string, Date>();
  for (const m of movements) {
    const prev = lastMoved.get(m.partId);
    if (!prev || +m.at > +prev) lastMoved.set(m.partId, m.at);
    if (+m.at < +from || +m.at >= +to) continue;
    const p = byId.get(m.partId);
    if (!p) continue;
    const row = sold.get(m.partId) ?? { partId: p.id, name: p.name, unit: p.unit, jobQty: 0, counterQty: 0, jobRevenue: 0, counterRevenue: 0, revenue: 0, cost: 0, profit: 0, costKnown: true };
    const revenue = m.unitPrice === null ? 0 : m.qty * m.unitPrice;
    if (m.channel === 'JOB') { row.jobQty += m.qty; row.jobRevenue += revenue; } else { row.counterQty += m.qty; row.counterRevenue += revenue; }
    row.revenue += revenue;
    if (m.unitCost === null) row.costKnown = false;
    else row.cost = (row.cost ?? 0) + m.qty * m.unitCost;
    sold.set(m.partId, row);
  }
  const soldRows: SoldRow[] = [...sold.values()]
    .map(({ costKnown, ...r }) => ({
      ...r,
      jobQty: r4(r.jobQty), counterQty: r4(r.counterQty), jobRevenue: r2(r.jobRevenue), counterRevenue: r2(r.counterRevenue), revenue: r2(r.revenue),
      cost: withCosts && costKnown ? r2(r.cost ?? 0) : null,
      profit: withCosts && costKnown ? r2(r.revenue - (r.cost ?? 0)) : null,
    }))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

  const low: LowRow[] = parts
    .map((p) => ({ partId: p.id, name: p.name, unit: p.unit, onHand: r4(p.onHand), reserved: r4(p.reserved), free: r4(Math.max(0, p.onHand - p.reserved)), reorderPoint: p.reorderPoint, outOfStock: p.onHand - p.reserved <= 0 }))
    .filter((p) => p.outOfStock ? p.reserved > 0 || (p.reorderPoint ?? 0) > 0 : p.reorderPoint !== null && p.reorderPoint > 0 && p.free <= p.reorderPoint)
    .sort((a, b) => Number(b.outOfStock) - Number(a.outOfStock) || a.free - b.free || a.name.localeCompare(b.name));

  const slow: SlowRow[] = parts
    .filter((p) => p.onHand > 0)
    .map((p) => {
      const last = lastMoved.get(p.id) ?? null;
      const daysIdle = last ? Math.floor((+now - +last) / DAY) : null;
      return { partId: p.id, name: p.name, unit: p.unit, onHand: r4(p.onHand), lastMovedAt: last, daysIdle, value: withCosts && p.lastCost !== null ? r2(p.onHand * p.lastCost) : null };
    })
    .filter((p) => p.daysIdle === null || p.daysIdle >= slowDays)
    .sort((a, b) => (b.daysIdle ?? 1e9) - (a.daysIdle ?? 1e9) || a.name.localeCompare(b.name));

  const totals = {
    revenue: r2(soldRows.reduce((s, r) => s + r.revenue, 0)),
    jobRevenue: r2(soldRows.reduce((s, r) => s + r.jobRevenue, 0)),
    counterRevenue: r2(soldRows.reduce((s, r) => s + r.counterRevenue, 0)),
    cost: withCosts && soldRows.every((r) => r.cost !== null) ? r2(soldRows.reduce((s, r) => s + (r.cost ?? 0), 0)) : null,
  };
  return { sold: soldRows, low, slow, totals: { ...totals, profit: totals.cost === null ? null : r2(totals.revenue - totals.cost) } };
}

export const REPORT_PERIODS = { this_month: 'This month', last_month: 'Last month', last_30: 'Last 30 days', this_year: 'This year' } as const;
export type ReportPeriod = keyof typeof REPORT_PERIODS;

/** The period in Lagos time (UTC+1, no daylight saving). */
export function reportRange(key: string, now: Date): { key: ReportPeriod; from: Date; to: Date } {
  const k = (key in REPORT_PERIODS ? key : 'this_month') as ReportPeriod;
  const lagos = new Date(+now + 3600000);
  const y = lagos.getUTCFullYear();
  const m = lagos.getUTCMonth();
  const at = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 1) - 3600000);
  if (k === 'last_month') return { key: k, from: at(y, m - 1), to: at(y, m) };
  if (k === 'last_30') return { key: k, from: new Date(+now - 30 * DAY), to: now };
  if (k === 'this_year') return { key: k, from: at(y, 0), to: now };
  return { key: k, from: at(y, m), to: now };
}
