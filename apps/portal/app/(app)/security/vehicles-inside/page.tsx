import { guardAnyPage } from '@/lib/authz/server';
import { listVehiclesInside } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityTable } from '@/components/SecurityTable';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';
import { PageHeader } from '@/components/ui';

const TABS = [['all', 'All'], ['workshop', 'In the workshop'], ['cleared', 'Cleared, not yet out']] as const;
const STAGE: Record<string, string> = { WORKSHOP: 'In the workshop', CLEARED: 'Cleared to leave' };

export default async function VehiclesInsidePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await guardAnyPage(['security.view'], '/security/vehicles-inside');
  const { type } = await searchParams;
  const all = await listVehiclesInside();
  const t = TABS.some(([k]) => k === type) ? type! : 'all';
  const rows = all.filter((r) => t === 'all' || r.stage === t.toUpperCase());
  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        icon="garage"
        title="Vehicles in the compound"
        description={<>{pluralize(all.length, 'vehicle')} inside right now.</>}
      />
      <SecurityNav active="/security/vehicles-inside" />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([k, l]) => {
          const n = k === 'all' ? all.length : all.filter((r) => r.stage === k.toUpperCase()).length;
          return <LoadingLink key={k} href={`/security/vehicles-inside?type=${k}`} className={`rounded-full px-3 py-1 text-xs font-medium ${t === k ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{l} ({n})</LoadingLink>;
        })}
      </div>
      <SecurityTable headers={['Status', 'Job Card', 'Vehicle', 'Plate', 'Customer', 'Since', '']} widths={['15%', '14%', '19%', '12%', '20%', '13%', '7%']} empty={rows.length ? null : 'No vehicles here.'}>
        {rows.map((r) => (
          <tr key={`${r.stage}-${r.id}`}>
            <td className="text-xs font-medium">{STAGE[r.stage]}</td>
            <td className="font-medium">{r.number}</td>
            <td>{r.description}</td>
            <td className="font-medium">{r.plate ?? '—'}</td>
            <td>{r.who}</td>
            <td className="text-xs">{r.since ? formatDateTimeCompact(r.since) : '—'}</td>
            <td>{r.href ? <LoadingLink href={r.href} className="text-xs text-[var(--ejo-primary)] hover:underline">{r.stage === 'CLEARED' ? 'Release' : 'Open'}</LoadingLink> : <span className="text-xs text-[var(--ejo-text-muted)]">In the workshop</span>}</td>
          </tr>
        ))}
      </SecurityTable>
    </div>
  );
}
