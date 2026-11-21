import { updatePrimaryServiceIntervalFormAction } from '@/lib/actions/service-tracking-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { pluralize } from '@/lib/utils/pluralize';

/**
 * The organisation's Primary Service interval (the default next-service
 * interval when a vehicle has none of its own), as on the Service Tracker
 * page: the same action, which checks the person may change it. Shown only
 * to those who may (the page decides). `path` is the page it sits on.
 */
export function ServiceIntervalForm({ organisation, editing, path }: {
  organisation: { id: string; primaryServiceIntervalKm: number | null; primaryServiceIntervalDays: number | null };
  editing: boolean;
  path: string;
}) {
  if (!editing) {
    return (
      <LoadingLink
        href={`${path}?editInterval=true`}
        data-testid="service-interval"
        className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
      >
        Primary Service every{' '}
        {organisation.primaryServiceIntervalKm ? `${organisation.primaryServiceIntervalKm.toLocaleString('en-NG')} km` : null}
        {organisation.primaryServiceIntervalKm && organisation.primaryServiceIntervalDays ? ' or ' : null}
        {organisation.primaryServiceIntervalDays ? pluralize(organisation.primaryServiceIntervalDays, 'day') : null}
        {!organisation.primaryServiceIntervalKm && !organisation.primaryServiceIntervalDays ? 'Not set — click to set' : ''}
      </LoadingLink>
    );
  }
  return (
    <form action={updatePrimaryServiceIntervalFormAction} className="flex flex-wrap items-end gap-2" data-testid="service-interval-form">
      <FormPendingOverlay />
      <input type="hidden" name="organisationId" value={organisation.id} />
      <input type="hidden" name="returnTo" value={path} />
      <div>
        <label htmlFor="service-interval-km" className="mb-1 block text-[10px] text-[var(--ejo-text-muted)]">Every (km)</label>
        <input
          id="service-interval-km"
          name="primaryServiceIntervalKm"
          type="number"
          min="0"
          defaultValue={organisation.primaryServiceIntervalKm ?? undefined}
          placeholder="e.g. 10000"
          className="w-28 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
        />
      </div>
      <div>
        <label htmlFor="service-interval-days" className="mb-1 block text-[10px] text-[var(--ejo-text-muted)]">Every (days)</label>
        <input
          id="service-interval-days"
          name="primaryServiceIntervalDays"
          type="number"
          min="0"
          defaultValue={organisation.primaryServiceIntervalDays ?? undefined}
          placeholder="e.g. 180"
          className="w-28 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
        />
      </div>
      <SubmitButton
        label="Save"
        pendingLabel="Saving…"
        className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
      />
    </form>
  );
}
