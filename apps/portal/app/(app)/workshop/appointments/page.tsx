import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { getAppointmentDay, listWaitingAppointments, upcomingCounts, type AppointmentRow } from '@/lib/actions/appointments';
import { bookForCustomerForm, cancelAppointmentForm, confirmAppointmentForm, rescheduleAppointmentForm } from '@/lib/actions/appointment-form-handlers';
import { addDays, BOOKABLE_JOB_TYPES, JOB_TYPE_WORDS } from '@ejo/utils/appointments';
import { CustomerSearchField } from '@/components/CustomerSearchField';
import { SubmitButton } from '@/components/SubmitButton';
import { EmptyState, Icon, PageHeader, RevealPanel, SectionCard, StatTile } from '@/components/ui';

export const metadata = { title: 'Bookings' };
export const dynamic = 'force-dynamic';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-sm font-medium text-[var(--ejo-text)]';
const pill = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold';

const STATUS: Record<string, { label: string; cls: string }> = {
  REQUESTED: { label: 'To confirm', cls: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]' },
  CONFIRMED: { label: 'Confirmed', cls: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' },
  ARRIVED: { label: 'Arrived', cls: 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary-text)]' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]' },
  NO_SHOW: { label: 'Did not come', cls: 'bg-[var(--ejo-error)]/10 text-[var(--ejo-error)]' },
};
const SOURCE: Record<string, string> = { WEBSITE: 'Booked on the website', PORTAL: 'Booked in the customer portal', STAFF: 'Booked by front desk' };
const NOTICE: Record<string, string> = { confirmed: 'Booking confirmed. The customer has been told.', moved: 'Booking moved. The customer has been told.', cancelled: 'Booking cancelled. The customer has been told.' };

function Booking({ a, returnTo, canManage }: { a: AppointmentRow; returnTo: string; canManage: boolean }) {
  const s = STATUS[a.status] ?? STATUS.REQUESTED!;
  return (
    <li className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4" data-testid="appointment">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{a.slot} · {a.visit} · {a.number}</p>
          <p className="mt-0.5 text-base font-semibold text-[var(--ejo-text)]">
            {a.customer ? <Link href={`/crm/customers/${a.customer.id}`} className="hover:underline">{a.customer.name}</Link> : a.name}
          </p>
          <p className="mt-0.5 text-sm text-[var(--ejo-text-muted)]">{a.phone}{a.vehicle ? ` · ${a.vehicle}` : ''}</p>
          {a.note ? <p className="mt-1 text-sm text-[var(--ejo-text)]">&ldquo;{a.note}&rdquo;</p> : null}
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{SOURCE[a.source] ?? a.source}{!a.customer ? ' · not yet a registered customer' : ''}{a.reminderSentAt ? ' · reminder sent' : ''}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`} data-testid="appointment-status">{s.label}</span>
      </div>
      {a.jobCard ? <p className="mt-3 text-sm">Job Card <Link href={`/workshop/job-cards/${a.jobCard.id}`} className="font-semibold text-[var(--ejo-primary)] hover:underline">{a.jobCard.number}</Link></p> : null}
      {canManage && a.open ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {a.status === 'REQUESTED' ? (
            <form action={confirmAppointmentForm}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="returnTo" value={returnTo} /><SubmitButton className={`${pill} bg-[var(--ejo-primary)] text-white`} label="Confirm" pendingLabel="Confirming…" /></form>
          ) : null}
          <Link href={`/workshop/job-cards?appointment=${a.id}#open-job-card`} className={`${pill} border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]`}><Icon name="wrench" size={16} /> Vehicle arrived: open the Job Card</Link>
          {a.whatsAppUrl ? <a href={a.whatsAppUrl} target="_blank" rel="noopener noreferrer" className={`${pill} bg-[var(--whatsapp)] text-white hover:bg-[var(--whatsapp-dark)]`}><Icon name="chat" size={16} /> WhatsApp</a> : null}
          <a href={`tel:${a.phone}`} className={`${pill} border border-[var(--ejo-border)] text-[var(--ejo-text)]`}><Icon name="phone" size={16} /> Call</a>
          <details className="w-full">
            <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-primary)]">Move or cancel</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <form action={rescheduleAppointmentForm} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={a.id} /><input type="hidden" name="returnTo" value={returnTo} />
                <label className="flex-1"><span className={label}>New day</span><input type="date" name="day" required defaultValue={a.day} className={field} /></label>
                <label><span className={label}>Time</span><input name="slot" required defaultValue={a.slot} pattern="[0-2][0-9]:[0-5][0-9]" className={`${field} w-24`} aria-label="Time, HH:MM" /></label>
                <SubmitButton className={`${pill} border border-[var(--ejo-border)] text-[var(--ejo-text)]`} label="Move" pendingLabel="Moving…" />
              </form>
              <form action={cancelAppointmentForm} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={a.id} /><input type="hidden" name="returnTo" value={returnTo} />
                <label className="flex-1"><span className={label}>Why cancel?</span><input name="reason" required minLength={2} maxLength={300} placeholder="e.g. The customer called to cancel" className={field} /></label>
                <SubmitButton className={`${pill} border border-[var(--ejo-error)]/40 text-[var(--ejo-error)]`} label="Cancel booking" pendingLabel="Cancelling…" />
              </form>
            </div>
          </details>
        </div>
      ) : null}
    </li>
  );
}

/** Workshop bookings: the day's list by time, what is waiting to be confirmed, booking for a caller, and the next days at a glance. */
export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ day?: string; status?: string; error?: string }> }) {
  await guardPage('workshop.appointment.view', '/workshop/appointments');
  const sp = await searchParams;
  const [d, waiting, week] = await Promise.all([getAppointmentDay(sp.day), listWaitingAppointments(), upcomingCounts(7)]);
  const returnTo = `/workshop/appointments?day=${d.day}`;
  const booked = sp.status?.startsWith('booked:') ? sp.status.slice(7) : null;
  const live = d.rows.filter((a) => a.status !== 'CANCELLED');
  return (
    <div className="w-full max-w-6xl p-4 sm:p-8">
      <PageHeader icon="calendar" title="Bookings" description="Customers book a day and a time on the website or by phone. Confirm each booking, and open the Job Card from it when the vehicle arrives." />
      {booked ? <p role="status" className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/10 px-4 py-3 text-sm">Booking {booked} made and confirmed. The customer has been told.</p> : null}
      {sp.status && NOTICE[sp.status] ? <p role="status" className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/10 px-4 py-3 text-sm">{NOTICE[sp.status]}</p> : null}
      {sp.error ? <p role="alert" className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/10 px-4 py-3 text-sm">{sp.error}</p> : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon="calendar" label={d.day === week[0]?.day ? 'Booked today' : 'Booked this day'} value={live.length} />
        <StatTile icon="alert" label="To confirm" value={d.waiting} tone={d.waiting ? 'warning' : 'neutral'} />
        <StatTile icon="check" label="Arrived" value={d.rows.filter((a) => a.status === 'ARRIVED').length} />
        <StatTile icon="clock" label="Did not come" value={d.rows.filter((a) => a.status === 'NO_SHOW').length} tone={d.rows.some((a) => a.status === 'NO_SHOW') ? 'error' : 'neutral'} />
      </div>

      <nav aria-label="Days" className="mb-6 flex gap-2 overflow-x-auto pb-1" data-testid="booking-days">
        {week.map((w) => (
          <Link key={w.day} href={`/workshop/appointments?day=${w.day}`} aria-current={w.day === d.day ? 'page' : undefined}
            className={`shrink-0 rounded-[var(--ejo-radius-lg)] border px-3 py-2 text-center text-sm ${w.day === d.day ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'}`}>
            <span className="block font-semibold">{w.when.split(' ')[0]}</span>
            <span className="block text-xs text-[var(--ejo-text-muted)]">{w.when.split(' ')[1]}</span>
            <span className="mt-0.5 block text-xs font-semibold text-[var(--ejo-primary-text)]">{w.count} booked</span>
          </Link>
        ))}
      </nav>

      {d.canManage ? (
        <RevealPanel label="Book for a caller" icon="plus" className="mb-6">
          <form action={bookForCustomerForm} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="sm:col-span-2"><span className={label}>Registered customer (or fill in the name and phone below)</span><CustomerSearchField /></div>
            <label><span className={label}>Name, if not registered</span><input name="name" maxLength={120} className={field} /></label>
            <label><span className={label}>Mobile number, if not registered</span><input name="phone" inputMode="tel" maxLength={20} placeholder="0803 304 9194" className={field} /></label>
            <label><span className={label}>What the visit is for</span>
              <select name="jobType" required defaultValue="SERVICE" className={field}>{BOOKABLE_JOB_TYPES.map((t) => <option key={t} value={t}>{JOB_TYPE_WORDS[t]}</option>)}</select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label><span className={label}>Day</span><input type="date" name="day" required defaultValue={addDays(week[0]!.day, 1)} className={field} /></label>
              <label><span className={label}>Time</span>
                <select name="slot" required className={field}>{d.settings.slots.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </label>
            </div>
            <label className="sm:col-span-2"><span className={label}>Note (optional)</span><input name="note" maxLength={500} placeholder="e.g. Brakes squeal; wants it back the same day" className={field} /></label>
            <div className="sm:col-span-2"><SubmitButton className={`${pill} bg-[var(--ejo-primary)] text-white`} label="Book and confirm" pendingLabel="Booking…" /></div>
          </form>
        </RevealPanel>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <SectionCard icon="calendar" title={d.when}>
          {d.rows.length ? (
            <ul className="space-y-3">{d.rows.map((a) => <Booking key={a.id} a={a} returnTo={returnTo} canManage={d.canManage} />)}</ul>
          ) : <EmptyState icon="calendar" title="No bookings for this day" compact />}
        </SectionCard>
        <div className="space-y-6">
          <SectionCard icon="alert" title={`To confirm (${waiting.length})`}>
            {waiting.length ? (
              <ul className="divide-y divide-[var(--ejo-border)]">
                {waiting.map((a) => (
                  <li key={a.id} className="py-2.5 text-sm">
                    <Link href={`/workshop/appointments?day=${a.day}`} className="font-medium hover:underline">{a.when}</Link>
                    <span className="block text-[var(--ejo-text-muted)]">{a.name} · {a.visit}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-[var(--ejo-text-muted)]">Nothing waiting.</p>}
          </SectionCard>
          <SectionCard icon="gauge" title="Places this day">
            <ul className="space-y-1.5 text-sm">
              {BOOKABLE_JOB_TYPES.map((t) => (
                <li key={t} className="flex justify-between"><span>{JOB_TYPE_WORDS[t]}</span><span className="font-semibold">{d.booked[t]} of {d.settings.capacity[t]}</span></li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Days, times and places are set in <Link href="/settings/appointments" className="underline">Settings → Bookings</Link>.</p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
