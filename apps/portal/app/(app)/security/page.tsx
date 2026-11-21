import { guardAnyPage } from '@/lib/authz/server';
import { getSecurityDashboard } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { PageHeader, HeaderAction, SectionCard, StatTile, Icon } from '@/components/ui';

const row = 'flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ejo-border)] py-2 text-sm last:border-0';
const car = (v: { make: string | null; model: string | null; plateNumber: string | null }) => `${[v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}${v.plateNumber ? `, ${v.plateNumber}` : ''}`;

/** The gate desk: what is in the compound, what may leave, what has left. */
export default async function SecurityDashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await guardAnyPage(['security.view'], '/security');
  const { error } = await searchParams;
  const d = await getSecurityDashboard();

  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="lock"
        eyebrow="Gate"
        title="Gate"
        description="Vehicles in the compound, vehicles cleared to leave, and the gate passes issued today."
        actions={<HeaderAction href="/security/vehicles" icon="car">Vehicles leaving ({d.vehicles.length})</HeaderAction>}
      />
      <SecurityNav active="/security" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ejo-text-muted)]"><Icon name="pin" size={13} />In the compound now</h2>
      <div className="ejo-stagger mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon="garage" label="Vehicles inside" value={d.compound.vehiclesInside} hint="In the workshop or waiting to leave" href="/security/vehicles-inside" tone="brand" />
        <StatTile icon="wrench" label="In the workshop" value={d.compound.workshopVehicles} hint="Job Cards not yet released" href="/security/vehicles-inside?type=workshop" tone="brand" />
        <StatTile icon="check-circle" label="Cleared to leave" value={d.compound.awaitingExit} hint="Released, waiting at the gate" href="/security/vehicles" tone={d.compound.awaitingExit > 0 ? 'warning' : 'brand'} emphasis={d.compound.awaitingExit > 0} />
        <StatTile icon="history" label="Left today" value={d.compound.exitsToday} hint="Gate passes issued today" href="/security/vehicles/exits" tone="brand" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard icon="car" title="Cleared to leave">
          {d.vehicles.length === 0 ? <p className="flex items-center gap-2 text-xs text-[var(--ejo-text-muted)]"><Icon name="check" size={14} />No vehicles waiting at the gate.</p> : d.vehicles.slice(0, 8).map((v) => (
            <div key={v.id} className={row}>
              <span className="min-w-0">
                {car(v.vehicle)}
                <span className="block text-xs text-[var(--ejo-text-muted)]">{v.number} · {v.customer}</span>
              </span>
              <LoadingLink href={`/security/vehicles/release/${v.id}`} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Confirm exit</LoadingLink>
            </div>
          ))}
        </SectionCard>
        <SectionCard icon="history" title="Latest gate passes">
          {d.recentExits.length === 0 ? <p className="flex items-center gap-2 text-xs text-[var(--ejo-text-muted)]"><Icon name="check" size={14} />No vehicles have left yet.</p> : d.recentExits.map((x) => (
            <div key={x.id} className={row}>
              <span className="min-w-0">
                <LoadingLink href={`/security/vehicles/exits/${x.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{x.exitNumber}</LoadingLink>
                <span className="block text-xs text-[var(--ejo-text-muted)]">{car(x.vehicle)}{x.jobCard ? ` · ${x.jobCard.jobNumber}` : ''} · {formatDateTimeCompact(x.exitedAt)}{x.driverName ? ` · ${x.driverName}` : ''}</span>
              </span>
            </div>
          ))}
        </SectionCard>
      </div>
    </div>
  );
}
