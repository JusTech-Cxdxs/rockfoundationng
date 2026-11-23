/**
 * The fleet report: for a fleet customer (a company with several vehicles),
 * what the workshop did in a period: vehicles seen, visits, what was
 * charged, comebacks under guarantee, and, for the whole account, what is
 * still owed and which vehicles are due for service. Pure: both the staff
 * portal (PDF) and the customer portal (printable page) feed it the same
 * rows, so both always show the same figures.
 */

export type FleetJob = {
  vehicleId: string;
  jobNumber: string;
  jobType: string;
  status: string;
  openedAt: Date;
  checkedOutAt: Date | null;
  /** What the visit is charged at, VAT included (the invoice, else the estimate sent); 0 before either. */
  charged: number;
  /** Payments less refunds. */
  paid: number;
  /** Credit notes approved. */
  credited: number;
  /** Opened as a comeback under the workshop's guarantee. */
  comeback: boolean;
};

export type FleetVehicle = { id: string; label: string; plate: string | null; nextServiceDate: Date | null; nextServiceKm: number | null };

export type FleetVehicleLine = { id: string; label: string; plate: string | null; visits: number; charged: number; owed: number; lastVisit: Date | null; nextServiceDate: Date | null; nextServiceKm: number | null; dueSoon: boolean };

export type FleetReport = {
  from: Date;
  to: Date;
  vehiclesSeen: number;
  visits: number;
  charged: number;
  comebacks: number;
  /** For the whole account, whatever the period: still to pay on every visit. */
  owed: number;
  byType: { jobType: string; visits: number; charged: number }[];
  vehicles: FleetVehicleLine[];
  /** Vehicles whose next service falls within 30 days of the report's end (or is overdue). */
  dueForService: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const owedOn = (j: FleetJob) => (j.status === 'CANCELLED' ? 0 : Math.max(0, round2(j.charged - j.paid - j.credited)));

export function fleetReport(jobs: readonly FleetJob[], vehicles: readonly FleetVehicle[], from: Date, to: Date): FleetReport {
  const inPeriod = jobs.filter((j) => j.status !== 'CANCELLED' && j.openedAt >= from && j.openedAt <= to);
  const soon = new Date(to.getTime() + 30 * 86_400_000);
  const types = new Map<string, { visits: number; charged: number }>();
  for (const j of inPeriod) {
    const t = types.get(j.jobType) ?? { visits: 0, charged: 0 };
    t.visits += 1;
    t.charged = round2(t.charged + j.charged);
    types.set(j.jobType, t);
  }
  const lines: FleetVehicleLine[] = vehicles.map((v) => {
    const mine = inPeriod.filter((j) => j.vehicleId === v.id);
    const all = jobs.filter((j) => j.vehicleId === v.id);
    const last = all.reduce<Date | null>((d, j) => (!d || j.openedAt > d ? j.openedAt : d), null);
    return {
      id: v.id, label: v.label, plate: v.plate, visits: mine.length,
      charged: round2(mine.reduce((s, j) => s + j.charged, 0)),
      owed: round2(all.reduce((s, j) => s + owedOn(j), 0)),
      lastVisit: last, nextServiceDate: v.nextServiceDate, nextServiceKm: v.nextServiceKm,
      dueSoon: Boolean(v.nextServiceDate && v.nextServiceDate <= soon),
    };
  }).sort((a, b) => b.charged - a.charged || (a.plate ?? a.label).localeCompare(b.plate ?? b.label));
  return {
    from, to,
    vehiclesSeen: new Set(inPeriod.map((j) => j.vehicleId)).size,
    visits: inPeriod.length,
    charged: round2(inPeriod.reduce((s, j) => s + j.charged, 0)),
    comebacks: inPeriod.filter((j) => j.comeback).length,
    owed: round2(jobs.reduce((s, j) => s + owedOn(j), 0)),
    byType: [...types.entries()].map(([jobType, t]) => ({ jobType, ...t })).sort((a, b) => b.charged - a.charged),
    vehicles: lines,
    dueForService: lines.filter((l) => l.dueSoon).length,
  };
}

/** The period a fleet report covers: "this-month", "last-month", "last-3-months", "this-year", or a custom from/to (YYYY-MM-DD), Lagos days. */
export function fleetPeriod(kind: string | undefined, now: Date, custom?: { from?: string; to?: string }): { from: Date; to: Date; label: string } {
  const lagos = new Date(now.getTime() + 3_600_000);
  const y = lagos.getUTCFullYear();
  const m = lagos.getUTCMonth();
  const start = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 1) - 3_600_000);
  const fmt = (d: Date) => { const l = new Date(d.getTime() + 3_600_000); return `${String(l.getUTCDate()).padStart(2, '0')}/${String(l.getUTCMonth() + 1).padStart(2, '0')}/${l.getUTCFullYear()}`; };
  const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : null);
  if (kind === 'custom' && valid(custom?.from) && valid(custom?.to) && custom!.from! <= custom!.to!) {
    const from = new Date(`${custom!.from}T00:00:00+01:00`);
    const to = new Date(`${custom!.to}T23:59:59.999+01:00`);
    return { from, to, label: `${fmt(from)} to ${fmt(to)}` };
  }
  if (kind === 'last-month') { const from = start(y, m - 1); const to = new Date(start(y, m).getTime() - 1); return { from, to, label: `${fmt(from)} to ${fmt(to)}` }; }
  if (kind === 'last-3-months') { const from = start(y, m - 2); return { from, to: now, label: `${fmt(from)} to ${fmt(now)}` }; }
  if (kind === 'this-year') { const from = start(y, 0); return { from, to: now, label: `${fmt(from)} to ${fmt(now)}` }; }
  const from = start(y, m);
  return { from, to: now, label: `${fmt(from)} to ${fmt(now)}` };
}
