import { guardAnyPage } from '@/lib/authz/server';
import { JobRef } from '@/components/JobRef';
import { listVehiclesClearedToLeave } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityTable } from '@/components/SecurityTable';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { HeaderAction, PageHeader } from '@/components/ui';

export default async function ClearedToLeavePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await guardAnyPage(['security.view'], '/security/vehicles');
  const { q } = await searchParams;
  const all = await listVehiclesClearedToLeave();
  const term = (q ?? '').trim().toLowerCase();
  const rows = all.filter((v) => !term || [v.number, v.vehicle.plateNumber, v.vehicle.chassisNumber, v.customer, v.collectedBy, v.vehicle.make, v.vehicle.model].some((x) => (x ?? '').toLowerCase().includes(term)));
  const link = 'text-[var(--ejo-primary)] hover:underline';
  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        icon="car"
        title="Vehicles leaving"
        description={<>{pluralize(all.length, 'vehicle')} released by the Workshop and waiting at the gate. A vehicle not on this list has not been released.</>}
        actions={<HeaderAction href="/security/vehicles/exits" icon="history" variant="secondary">Gate passes</HeaderAction>}
      />
      <SecurityNav active="/security/vehicles" />
      <form className="mb-4 flex max-w-xl gap-2">
        <LiveSearchInput name="q" defaultValue={q ?? ''} placeholder="Search plate, VIN, Job Card, customer, collector" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
      </form>
      <SecurityTable headers={['Job Card', 'Vehicle', 'Plate / VIN', 'Customer', 'Released', 'Collected by', '']} widths={['13%', '17%', '17%', '17%', '13%', '12%', '11%']} empty={rows.length ? null : term ? 'No vehicles match.' : 'No vehicles waiting to leave.'}>
        {rows.map((v) => (
          <tr key={v.id}>
            <td><JobRef kind="JOB_CARD" id={v.id} number={v.number} className={`font-medium ${link}`} /></td>
            <td>{[v.vehicle.make, v.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}</td>
            <td><span className="font-medium">{v.vehicle.plateNumber ?? '—'}</span>{v.vehicle.chassisNumber ? <span className="block text-xs text-[var(--ejo-text-muted)]">{v.vehicle.chassisNumber}</span> : null}</td>
            <td>{v.customer}</td>
            <td className="text-xs">{v.releasedAt ? formatDateTimeCompact(v.releasedAt) : '—'}</td>
            <td className="text-xs">{v.collectedBy ?? '—'}</td>
            <td><LoadingLink href={`/security/vehicles/release/${v.id}`} className="inline-block rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Confirm exit</LoadingLink></td>
          </tr>
        ))}
      </SecurityTable>
    </div>
  );
}
