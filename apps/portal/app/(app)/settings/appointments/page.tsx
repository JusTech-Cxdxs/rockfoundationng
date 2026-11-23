import { guardPage } from '@/lib/authz/server';
import { BackLink, PageHeader, SectionCard } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { getAppointmentSettings } from '@/lib/actions/appointments';
import { saveAppointmentSettingsForm } from '@/lib/actions/appointment-form-handlers';
import { BOOKABLE_JOB_TYPES, JOB_TYPE_WORDS } from '@ejo/utils/appointments';

export const dynamic = 'force-dynamic';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Settings → Bookings (the Owner): days open, time slots, vehicles a day per kind of visit, how far ahead and how much notice. */
export default async function AppointmentSettingsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardPage('admin.organisation.manage', '/settings/appointments');
  const sp = await searchParams;
  const s = await getAppointmentSettings();
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <BackLink href="/settings" label="Settings" className="mb-4" />
      <PageHeader icon="calendar" title="Bookings" description="What customers can book on the website: the days, the times, and how many vehicles of each kind the workshop takes a day. Front desk can still book anyone by phone." />
      {sp.status === 'saved' ? <div className="mb-4"><FormFeedbackBanner kind="success" message="Booking settings saved." /></div> : null}
      {sp.error ? <div className="mb-4"><FormFeedbackBanner kind="error" message={sp.error} /></div> : null}
      <form action={saveAppointmentSettingsForm} className="space-y-6">
        <SectionCard icon="calendar" title="Days and times">
          <fieldset>
            <legend className={label}>Days the workshop takes bookings</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <label key={d} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--ejo-border)] px-3 text-sm has-[:checked]:border-[var(--ejo-primary)] has-[:checked]:bg-[var(--ejo-primary)]/10">
                  <input type="checkbox" name="openDays" value={i + 1} defaultChecked={s.openDays.includes(i + 1)} /> {d}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="sm:col-span-3"><span className={label}>Time slots (start times, 24-hour, separated by commas)</span><input name="slots" required defaultValue={s.slots.join(', ')} className={field} /></label>
            <label><span className={label}>Bookings open up to (days ahead)</span><input name="maxDaysAhead" type="number" min={1} max={90} required defaultValue={s.maxDaysAhead} className={field} /></label>
            <label><span className={label}>Notice needed on the day (hours)</span><input name="minHoursNotice" type="number" min={0} max={48} required defaultValue={s.minHoursNotice} className={field} /></label>
          </div>
        </SectionCard>
        <SectionCard icon="gauge" title="Vehicles a day, per kind of visit">
          <p className="mb-3 text-sm text-[var(--ejo-text-muted)]">When a day is full for a kind of visit, the website offers the next day with a place. 0 means it is not booked online.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {BOOKABLE_JOB_TYPES.map((t) => (
              <label key={t}><span className={label}>{JOB_TYPE_WORDS[t]}</span><input name={`capacity_${t}`} type="number" min={0} max={200} required defaultValue={s.capacity[t]} className={field} /></label>
            ))}
          </div>
        </SectionCard>
        <SubmitButton className="min-h-11 rounded-full bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white hover:opacity-90" label="Save booking settings" pendingLabel="Saving…" />
      </form>
    </div>
  );
}
