import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { PageHeader, SectionCard, StatTile, EmptyState, ResponsiveTable } from '@/components/ui';
import { getWarrantyReport } from '@/lib/actions/warranty';
import { naira } from '@/lib/money/rules';
import { formatDateOnly } from '@/lib/utils/format-date';
import { WarrantyTabs } from '@/components/money/WarrantyTabs';

export const dynamic = 'force-dynamic';

const PERIODS = [30, 90, 180, 365] as const;
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

/**
 * Warranty → Report (the Owner): how often vehicles come back while the
 * workshop's guarantee runs (by job type and by technician), what warranty
 * and goodwill work cost, and what is owed back by suppliers.
 */
export default async function WarrantyReportPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await guardPage('workshop.warranty.report', '/warranty');
  const sp = await searchParams;
  const days = PERIODS.find((d) => String(d) === sp.days) ?? 90;
  const r = await getWarrantyReport(days);
  return (
    <div className="p-4 sm:p-8">
      <PageHeader icon="shield-check" title="Warranty" description={`Comebacks while the workshop’s guarantee runs, what warranty work cost, and claims to suppliers: ${formatDateOnly(r.from)} to ${formatDateOnly(r.to)}.`} />
      <WarrantyTabs active="report" />
      <nav aria-label="Period" className="mb-6 inline-flex gap-1 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1 text-sm">
        {PERIODS.map((d) => <Link key={d} href={`/warranty?days=${d}`} aria-current={d === days ? 'page' : undefined} className={`rounded-full px-3.5 py-1.5 font-medium ${d === days ? 'bg-[var(--ejo-primary)] text-white' : 'text-[var(--ejo-text-muted)]'}`}>{d === 365 ? '12 months' : `${d} days`}</Link>)}
      </nav>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6" data-testid="warranty-tiles">
        <StatTile icon="check-circle" label="Jobs checked out" value={r.finished} />
        <StatTile icon="history" label="Comebacks" value={r.comebacks} tone={r.comebacks > 0 ? 'warning' : 'brand'} />
        <StatTile icon="trend-up" label="Comeback rate" value={pct(r.rate)} emphasis />
        <StatTile icon="money" label="Warranty work" value={naira(r.warrantyCost)} hint={`${r.warrantyJobs} ${r.warrantyJobs === 1 ? 'job' : 'jobs'}, not charged`} />
        <StatTile icon="handshake" label="Goodwill" value={naira(r.goodwillCost)} />
        <StatTile icon="boxes" label="Owed by suppliers" value={naira(r.claims.openAmount)} hint={`${r.claims.open} open ${r.claims.open === 1 ? 'claim' : 'claims'}; ${naira(r.claims.recovered)} recovered`} href="/warranty/claims" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard icon="wrench" title="Comebacks by job type" flush>
          {r.byJobType.length === 0 ? <EmptyState icon="check-circle" title="No jobs in this period" compact /> : (
            <ResponsiveTable label="Comebacks by job type"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-4 py-2">Job type</th><th className="px-4 py-2 text-right">Checked out</th><th className="px-4 py-2 text-right">Comebacks</th><th className="px-4 py-2 text-right">Rate</th></tr></thead>
              <tbody>{r.byJobType.map((g) => <tr key={g.label} className="border-b border-[var(--ejo-border)] last:border-0"><td className="px-4 py-2 font-medium">{g.label}</td><td data-label="Checked out" className="px-4 py-2 text-right">{g.finished}</td><td data-label="Comebacks" className="px-4 py-2 text-right">{g.comebacks}</td><td data-label="Rate" className="px-4 py-2 text-right font-semibold">{pct(g.rate)}</td></tr>)}</tbody></table></ResponsiveTable>
          )}
        </SectionCard>
        <SectionCard icon="users" title="Comebacks by technician" description="Counted against the technician on the original job." flush>
          {r.byTechnician.length === 0 ? <EmptyState icon="check-circle" title="No jobs in this period" compact /> : (
            <ResponsiveTable label="Comebacks by technician"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-4 py-2">Technician</th><th className="px-4 py-2 text-right">Checked out</th><th className="px-4 py-2 text-right">Comebacks</th><th className="px-4 py-2 text-right">Rate</th></tr></thead>
              <tbody>{r.byTechnician.map((g) => <tr key={g.name} className="border-b border-[var(--ejo-border)] last:border-0"><td className="px-4 py-2 font-medium">{g.name}</td><td data-label="Checked out" className="px-4 py-2 text-right">{g.finished}</td><td data-label="Comebacks" className="px-4 py-2 text-right">{g.comebacks}</td><td data-label="Rate" className="px-4 py-2 text-right font-semibold">{pct(g.rate)}</td></tr>)}</tbody></table></ResponsiveTable>
          )}
        </SectionCard>
      </div>
      <SectionCard icon="history" title="Latest comebacks" className="mt-6">
        {r.recent.length === 0 ? <EmptyState icon="check-circle" title="No comebacks in this period" compact /> : (
          <ul className="divide-y divide-[var(--ejo-border)] text-sm">
            {r.recent.map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><Link href={`/workshop/job-cards/${c.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{c.jobNumber}</Link> — back on <Link href={`/workshop/job-cards/${c.ofId}`} className="text-[var(--ejo-primary)] hover:underline">{c.of}</Link> ({c.jobType}{c.technician ? `, ${c.technician}` : ''})</span><span className="text-xs text-[var(--ejo-text-muted)]">{formatDateOnly(c.createdAt)}</span></li>)}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
