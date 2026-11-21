import { notFound } from 'next/navigation';
import { guardAnyPage } from '@/lib/authz/server';
import { getVehiclePassport, type VehiclePassport } from '@/lib/actions/vehicle-passport';
import { LoadingLink } from '@/components/LoadingLink';
import { EmptyState, Icon, PageHeader, SectionCard } from '@/components/ui';
import { referenceUrl } from '@/lib/search-plan';
import { formatDateOnly } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

/**
 * One vehicle, by its VIN: the vehicle and its owner, then every Job Card,
 * gate exit and job brought in from the old system. Each part only for
 * those who may see it.
 */
export default async function VehiclePassportPage({ params }: { params: Promise<{ vin: string }> }) {
  const { vin: raw } = await params;
  await guardAnyPage(['workshop.view', 'security.view', 'crm.view'], `/vehicles/${raw}`);
  const p = await getVehiclePassport(decodeURIComponent(raw));
  if (!p) notFound();
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader
        icon="car"
        back={{ href: '/workshop/vehicles', label: 'Back to Vehicles' }}
        eyebrow="Vehicle"
        title={p.vin}
        description={<>{p.description ?? 'Model not recorded yet'}{p.vehicle?.plate ? <> · plate <span className="font-medium text-[var(--ejo-text)]">{p.vehicle.plate}</span></> : null}</>}
        actions={p.may.editVehicle && p.vehicle ? <LoadingLink href={`/workshop/vehicles/${p.vehicle.id}/edit`} className="inline-flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/60 hover:text-[var(--ejo-primary)]"><Icon name="wrench" size={16} />Workshop record</LoadingLink> : undefined}
      />

      <SectionCard icon="car" title="The vehicle">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">VIN</dt>
            <dd className="mt-0.5 font-mono font-medium tracking-wide text-[var(--ejo-text)]">{p.vin}</dd>
            {p.checkDigitOk === false ? <dd className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">Its 9th character is not a North American check digit (most other markets do not use one). Compare it with the chassis plate.</dd> : null}
          </div>
          <Fact label="Model" value={p.description} />
          <Fact label="Plate" value={p.vehicle?.plate ?? null} mono />
          <Fact label="Engine number" value={p.vehicle?.engineNumber ?? null} mono />
          <Fact label="Mileage" value={p.vehicle?.mileage ? `${p.vehicle.mileage.toLocaleString('en-NG')} km` : null} />
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">Customer</dt>
            <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{p.vehicle?.customer ? <LoadingLink href={`/crm/customers/${p.vehicle.customer.id}`} className="text-[var(--ejo-primary)] hover:underline">{p.vehicle.customer.name}</LoadingLink> : p.vehicle ? (p.may.customers ? '—' : 'Customer details are for Customers') : 'Not registered to a customer yet'}</dd>
          </div>
        </dl>
      </SectionCard>

      <AfterSale p={p} />
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-[var(--ejo-text-muted)]">{label}</dt>
      <dd className={`mt-0.5 font-medium text-[var(--ejo-text)] ${mono ? 'font-mono tracking-wide' : ''}`}>{value ?? '—'}</dd>
    </div>
  );
}

function AfterSale({ p }: { p: VehiclePassport }) {
  const a = p.after;
  const lists: { title: string; icon: 'clipboard' | 'exit'; rows: { id: string; number: string; href: string; when: Date; text: string }[] | null }[] = [
    { title: 'Job Cards', icon: 'clipboard', rows: a.jobCards?.map((r) => ({ id: r.id, number: r.number, href: referenceUrl('JC', r.id), when: r.at, text: [r.status, r.branch, r.summary].filter(Boolean).join(' · ') })) ?? null },
    { title: 'Gate exits', icon: 'exit', rows: a.gateExits?.map((r) => ({ id: r.id, number: r.number, href: referenceUrl('VX', r.id), when: r.at, text: r.branch })) ?? null },
    // Read-only history from the old system: the number is its job number; it opens the vehicle's workshop page where the whole history sits.
    { title: 'From the old system', icon: 'clipboard', rows: a.beforeEjo?.map((r) => ({ id: r.id, number: r.number, href: p.vehicle ? `/workshop/vehicles/${p.vehicle.id}/edit` : '#', when: r.at, text: [r.kind, r.status === 'Cancelled' ? 'cancelled' : null, r.mileage !== null ? `${r.mileage.toLocaleString('en-NG')} km` : null, r.summary, r.total !== null ? `₦${r.total.toLocaleString('en-NG')}` : null].filter(Boolean).join(' · ') })) ?? null },
  ];
  const shown = lists.filter((l) => l.rows !== null);
  if (!shown.length) return null;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {shown.map((l) => (
        <SectionCard key={l.title} icon={l.icon} title={`${l.title}${l.rows!.length ? ` (${l.rows!.length})` : ''}`} flush>
          {l.rows!.length === 0 ? <div className="p-4"><EmptyState compact icon={l.icon} title={`No ${l.title.toLowerCase()} for this vehicle.`} /></div> : (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {l.rows!.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0"><LoadingLink href={r.href} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{r.number}</LoadingLink><span className="block break-words text-xs text-[var(--ejo-text-muted)]">{r.text}</span></span>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--ejo-text-muted)]">{formatDateOnly(r.when)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ))}
    </div>
  );
}
