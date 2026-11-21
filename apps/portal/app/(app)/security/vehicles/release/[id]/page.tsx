import { allows, guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getClearedVehicle, getSecurityRoles } from '@/lib/actions/security';
import { confirmVehicleExitFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { formatDateTime } from '@/lib/utils/format-date';
import { BackLink, PageTitle } from '@/components/ui';

/** One released vehicle: check it against what is at the gate, then
 * confirm the exit. */
export default async function ReleaseVehiclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await guardAnyPage(['security.view'], '/security/vehicles');
  const { id } = await params;
  const { error } = await searchParams;
  const [v, roles] = await Promise.all([getClearedVehicle(id), getSecurityRoles()]);
  if (!v) notFound();
  const naira = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const Row = ({ k, val }: { k: string; val: string | null | undefined }) => <div className="flex justify-between gap-3 py-1.5 text-sm"><dt className="text-[var(--ejo-text-muted)]">{k}</dt><dd className="text-right font-medium text-[var(--ejo-text)]">{val || '—'}</dd></div>;
  return (
    <div className="p-4 sm:p-8">
      <BackLink href="/security/vehicles" label="Back to Vehicles leaving" className="mb-4" />
      <PageTitle icon="car">{[v.vehicle.make, v.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}{v.vehicle.plateNumber ? ` — ${v.vehicle.plateNumber}` : ''}</PageTitle>
      <p className="mb-4 mt-1 text-sm text-[var(--ejo-text-muted)]">Released on Job Card {v.number}</p>
      <SecurityNav active="/security/vehicles" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <dl className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <Row k="Plate" val={v.vehicle.plateNumber} />
          <Row k="VIN" val={v.vehicle.chassisNumber} />
          <Row k="Odometer" val={v.vehicle.mileage !== null && v.vehicle.mileage !== undefined ? `${v.vehicle.mileage.toLocaleString('en-NG')} km` : null} />
          <Row k="Job Card" val={v.number} />
          <Row k="Customer" val={`${v.customer.fullName}${v.customer.phone ? ` · ${v.customer.phone}` : ''}`} />
          <Row k="Released by the Workshop" val={v.releasedAt ? formatDateTime(v.releasedAt) : null} />
          <Row k="Collected by (at checkout)" val={v.collectedBy} />
          <Row k="Customer total / paid" val={`${naira(v.total)} / ${naira(v.paid)}`} />
          {(await allows('workshop.job_card.view')) ? <p className="mt-2 text-xs"><LoadingLink href={`/workshop/job-cards/${v.id}`} className="text-[var(--ejo-primary)] hover:underline">Open {v.number}</LoadingLink></p> : null}
        </dl>
        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          {v.exit ? (
            <>
              <p className="text-sm text-[var(--ejo-text)]">This vehicle has already left on gate pass {v.exit.exitNumber}.</p>
              <LoadingLink href={`/security/vehicles/exits/${v.exit.id}`} className="mt-2 inline-block text-sm text-[var(--ejo-primary)] hover:underline">Open the gate pass</LoadingLink>
            </>
          ) : !v.released ? (
            <p className="text-sm text-[var(--ejo-error)]">Not released by the Workshop. This vehicle may not leave.</p>
          ) : roles.isGate ? (
            <form action={confirmVehicleExitFormAction} className="space-y-3">
              <FormPendingOverlay />
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Confirm exit through the gate</h2>
              <input type="hidden" name="recordId" value={v.id} />
              <div><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Collected by (person taking the vehicle out)</label><input name="collectedBy" defaultValue={v.collectedBy ?? ''} required className={input} /></div>
              <div><label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Notes (optional)</label><input name="notes" placeholder="e.g. plate and VIN checked" className={input} /></div>
              <p className="text-xs text-[var(--ejo-text-muted)]">Check the plate and VIN on the vehicle against this record before confirming.</p>
              <SubmitButton label="Confirm exit" pendingLabel="Recording…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
            </form>
          ) : (
            <p className="text-sm text-[var(--ejo-text-muted)]">Security confirms the exit at the gate.</p>
          )}
        </div>
      </div>
    </div>
  );
}
