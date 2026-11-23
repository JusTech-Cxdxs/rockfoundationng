import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fleetPeriod, fleetReport, type FleetJob, type FleetVehicle } from '@ejo/utils/fleet-report';
import { requireCustomer } from '@/lib/customer-portal/session';
import { loadServices, loadVehicles, nextServiceFor } from '@/lib/customer-portal/data';
import { fmtDate, itemKindLabel, naira } from '@/lib/customer-portal/format';
import { BackLink, Card } from '@/components/customer/ui';
import { PrintButton } from '@/components/customer/PrintButton';

export const metadata = { title: 'Fleet report' };

const PERIODS = [['this-month', 'This month'], ['last-month', 'Last month'], ['last-3-months', 'Last 3 months'], ['this-year', 'This year']] as const;
const PRINT_ONLY = '@media print { body * { visibility: hidden; } #fleet-report, #fleet-report * { visibility: visible; } #fleet-report { position: absolute; inset: 0 auto auto 0; width: 100%; } }';

/**
 * The fleet report for a company's own account (its fleet contact signed in):
 * vehicles seen, visits, what was charged, comebacks, what is still owed and
 * which vehicles are due for service — the same figures as the PDF front
 * desk sends (@ejo/utils/fleet-report). Print or save as PDF.
 */
export default async function FleetReportPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const me = await requireCustomer();
  if (me.customerType !== 'ORGANIZATION') notFound();
  const sp = await searchParams;
  const period = fleetPeriod(sp.period, new Date());
  const [items, vehicles] = await Promise.all([loadServices(me.id, 2000), loadVehicles(me.id)]);
  const jobs: FleetJob[] = items.map((i) => ({
    vehicleId: i.vehicle.id, jobNumber: i.number, jobType: i.jobType, status: i.status, openedAt: i.createdAt, checkedOutAt: i.collectedAt,
    charged: i.invoice?.total ?? i.money.estimateTotal ?? 0, paid: i.money.netPaid, credited: i.creditNotes.reduce((s, c) => s + c.amount, 0), comeback: i.comeback,
  }));
  const fleet: FleetVehicle[] = vehicles.map((v) => {
    const next = nextServiceFor(v.id, items);
    return { id: v.id, label: v.label, plate: v.plate, nextServiceDate: next?.date ?? null, nextServiceKm: next?.odometer ?? null };
  });
  const r = fleetReport(jobs, fleet, period.from, period.to);
  const kind = (t: string) => itemKindLabel({ isServiceJobCard: false, jobType: t });
  return (
    <div className="space-y-6">
      <style>{PRINT_ONLY}</style>
      <BackLink href="/customer-portal/dashboard">Overview</BackLink>
      <div className="flex flex-wrap items-center gap-2 print:hidden" role="navigation" aria-label="Period">
        {PERIODS.map(([k, label]) => (
          <Link key={k} href={`/customer-portal/dashboard/fleet-report?period=${k}`} aria-current={(sp.period ?? 'this-month') === k ? 'page' : undefined}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${(sp.period ?? 'this-month') === k ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] text-[var(--ejo-text-muted)]'}`}>{label}</Link>
        ))}
        <span className="ml-auto"><PrintButton /></span>
      </div>
      <Card className="p-5 sm:p-8" data-testid="fleet-report">
        <div id="fleet-report">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ejo-primary)]">Fleet report</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{me.fullName}</h1>
          <p className="text-sm text-[var(--ejo-text-muted)]">{period.label}</p>
          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[['Vehicles seen', String(r.vehiclesSeen)], ['Visits', String(r.visits)], ['Charged', naira(r.charged)], ['Comebacks', String(r.comebacks)], ['Still owed', naira(r.owed)], ['Due for service', String(r.dueForService)]].map(([k, v]) => (
              <div key={k}><dt className="text-xs text-[var(--ejo-text-muted)]">{k}</dt><dd className="text-lg font-bold tabular-nums text-[var(--ejo-text)]">{v}</dd></div>
            ))}
          </dl>
          {r.byType.length ? (
            <ul className="mt-5 flex flex-wrap gap-2 text-sm">{r.byType.map((t) => <li key={t.jobType} className="rounded-full bg-[var(--ejo-bg)] px-3 py-1 ring-1 ring-[var(--ejo-border)]">{kind(t.jobType)}: {t.visits} · {naira(t.charged)}</li>)}</ul>
          ) : null}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead><tr className="border-b border-[var(--ejo-border)] text-xs text-[var(--ejo-text-muted)]"><th className="py-2 pr-3">Vehicle</th><th className="py-2 pr-3">Visits</th><th className="py-2 pr-3">Charged</th><th className="py-2 pr-3">Still owed</th><th className="py-2 pr-3">Last visit</th><th className="py-2">Next service</th></tr></thead>
              <tbody>
                {r.vehicles.map((v) => (
                  <tr key={v.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="py-2 pr-3"><span className="font-medium text-[var(--ejo-text)]">{v.label}</span>{v.plate ? <span className="block text-xs text-[var(--ejo-text-muted)]">{v.plate}</span> : null}</td>
                    <td className="py-2 pr-3 tabular-nums">{v.visits}</td>
                    <td className="py-2 pr-3 tabular-nums">{naira(v.charged)}</td>
                    <td className="py-2 pr-3 tabular-nums">{v.owed > 0 ? naira(v.owed) : '—'}</td>
                    <td className="py-2 pr-3">{v.lastVisit ? fmtDate(v.lastVisit) : '—'}</td>
                    <td className="py-2">{[v.nextServiceDate ? fmtDate(v.nextServiceDate) : null, v.nextServiceKm ? `${v.nextServiceKm.toLocaleString('en-NG')} km` : null].filter(Boolean).join(' or ') || '—'}{v.dueSoon ? <span className="ml-2 rounded-full bg-[var(--ejo-warning)]/15 px-2 py-0.5 text-xs font-semibold">Due soon</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-[var(--ejo-text-muted)]">Charged: invoices, else estimates you were sent, VAT included, for visits opened in the period. Still owed: on every visit, after payments and credit notes. Next service: by date or distance, whichever comes first.</p>
        </div>
      </Card>
    </div>
  );
}
