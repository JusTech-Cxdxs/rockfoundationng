import { guardAnyPage, allows } from '@/lib/authz/server';
import { JobRef } from '@/components/JobRef';
import { listVehicleExits } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityTable } from '@/components/SecurityTable';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { PageHeader } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';

export default async function VehicleExitsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await guardAnyPage(['security.view'], '/security/vehicles');
  const { q } = await searchParams;
  // Customer names link to their Customers (CRM) page for those who may open it.
  const canSeeCustomers = await allows('crm.view');
  const rows = await listVehicleExits(q);
  const link = 'text-[var(--ejo-primary)] hover:underline';
  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        icon="car"
        title="Gate passes"
        description="Every vehicle recorded leaving through the gate, newest first."
      />
      <SecurityNav active="/security/vehicles/exits" />
      <form className="mb-4 flex max-w-xl gap-2">
        <LiveSearchInput name="q" defaultValue={q ?? ''} placeholder="Search gate pass number, plate, Job Card, collector" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm text-[var(--ejo-text)]">Search</button>
      </form>
      <SecurityTable headers={['Gate pass', 'Left', 'Vehicle', 'Plate', 'Job Card', 'Customer', 'Collected by', '']} widths={['13%', '12%', '15%', '10%', '12%', '15%', '14%', '9%']} empty={rows.length ? null : q ? 'Nothing matches.' : 'No vehicles have left yet.'}>
        {rows.map((x) => (
          <tr key={x.id}>
            <td className="font-medium">{x.exitNumber}</td>
            <td className="text-xs">{formatDateTimeCompact(x.exitedAt)}</td>
            <td><LoadingLink href={`/workshop/vehicles/${x.vehicle.id}/edit`} className={link}>{[x.vehicle.make, x.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}</LoadingLink></td>
            <td className="font-medium">{x.vehicle.plateNumber ?? '—'}</td>
            <td>{x.jobCard ? <JobRef kind="JOB_CARD" id={x.jobCard.id} number={x.jobCard.jobNumber} className={link} /> : '—'}</td>
            <td>{x.jobCard ? <CustomerLink id={x.jobCard.customer.id} name={x.jobCard.customer.fullName} canView={canSeeCustomers} /> : '—'}</td>
            <td className="text-xs">{x.driverName ?? '—'}</td>
            <td><LoadingLink href={`/security/vehicles/exits/${x.id}`} className={`text-xs ${link}`}>Open</LoadingLink></td>
          </tr>
        ))}
      </SecurityTable>
    </div>
  );
}
