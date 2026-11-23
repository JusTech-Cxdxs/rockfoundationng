'use client';

import { useActionState, useMemo, useState } from 'react';
import { bookVisitAction, type BookingState } from '@/app/book/actions';

const field = 'w-full rounded-xl border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3.5 py-3 text-base text-[var(--ejo-text)]';
const label = 'mb-1.5 block text-sm font-medium text-[var(--ejo-text)]';

type Day = { day: string; when: string; left: number };

/** The booking form: a day with a place left, a time, and who and what is coming. A signed-in customer chooses one of their vehicles. */
export function BookingForm({ jobType, days, slots, signedIn, vehicles }: { jobType: string; days: Day[]; slots: string[]; signedIn: { name: string } | null; vehicles: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<BookingState, FormData>(bookVisitAction, null);
  const firstOpen = useMemo(() => days.find((d) => d.left > 0)?.day ?? '', [days]);
  const [day, setDay] = useState(firstOpen);
  // Two weeks at first (a long list on a phone); the rest on request.
  const [allDays, setAllDays] = useState(false);
  const FIRST_DAYS = 14;
  const shownDays = allDays ? days : days.slice(0, FIRST_DAYS);
  if (state?.ok && state.number) {
    return (
      <div role="status" data-testid="booking-done" className="rounded-2xl border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/10 p-6">
        <p className="text-lg font-semibold text-[var(--ejo-text)]">Booking {state.number}</p>
        <p className="mt-2 text-[var(--ejo-text)]">{state.message}</p>
      </div>
    );
  }
  if (!firstOpen) return <p className="rounded-2xl border border-[var(--ejo-border)] p-6 text-[var(--ejo-text-muted)]">There are no places left for this kind of visit in the coming weeks. Please call us and we will fit you in.</p>;
  return (
    <form action={action} className="space-y-5" data-testid="booking-form">
      <input type="hidden" name="jobType" value={jobType} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <fieldset>
        <legend className={label}>Choose a day</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {shownDays.map((d) => (
            <label key={d.day} className={`flex cursor-pointer flex-col rounded-xl border px-3 py-2.5 text-sm ${d.left === 0 ? 'cursor-not-allowed opacity-50' : ''} ${day === d.day ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10' : 'border-[var(--ejo-border)]'}`}>
              <input type="radio" name="day" value={d.day} disabled={d.left === 0} checked={day === d.day} onChange={() => setDay(d.day)} className="sr-only" />
              <span className="font-semibold text-[var(--ejo-text)]">{d.when}</span>
              <span className="text-xs text-[var(--ejo-text-muted)]">{d.left === 0 ? 'Full' : d.left <= 2 ? `${d.left} place${d.left === 1 ? '' : 's'} left` : 'Places available'}</span>
            </label>
          ))}
        </div>
        {!allDays && days.length > FIRST_DAYS ? (
          <button type="button" onClick={() => setAllDays(true)} className="mt-3 min-h-11 w-full rounded-xl border border-[var(--ejo-border)] px-4 text-sm font-semibold text-[var(--ejo-primary)] hover:border-[var(--ejo-primary)]">
            Show more days
          </button>
        ) : null}
      </fieldset>
      <label className="block"><span className={label}>Time</span>
        <select name="slot" required className={field} defaultValue={slots[0]}>{slots.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      </label>
      {signedIn ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">Booking as {signedIn.name}. We will use the phone and email on your account.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className={label}>Your name</span><input name="name" required minLength={2} maxLength={120} autoComplete="name" className={field} /></label>
          <label className="block"><span className={label}>Mobile number</span><input name="phone" required inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" maxLength={20} className={field} /></label>
          <label className="block"><span className={label}>WhatsApp number (if different)</span><input name="whatsapp" inputMode="tel" maxLength={20} className={field} /></label>
          <label className="block sm:col-span-2"><span className={label}>Email (optional)</span><input name="email" type="email" autoComplete="email" maxLength={160} className={field} /></label>
        </div>
      )}
      {vehicles.length ? (
        <label className="block"><span className={label}>Vehicle</span>
          <select name="vehicleId" required className={field}>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select>
        </label>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={label}>Vehicle (make, model, year)</span><input name="vehicle" required maxLength={120} placeholder="Toyota Corolla 2016" className={field} /></label>
          <label className="block"><span className={label}>Plate number (optional)</span><input name="plate" maxLength={20} placeholder="KJA 901 XY" className={field} /></label>
        </div>
      )}
      <label className="block"><span className={label}>Anything we should know? (optional)</span><textarea name="note" rows={3} maxLength={500} placeholder="e.g. Brakes squeal when stopping" className={field} /></label>
      {state && !state.ok ? <p role="alert" className="rounded-xl border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/10 px-4 py-3 text-sm text-[var(--ejo-text)]">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="min-h-12 w-full rounded-full bg-[var(--ejo-primary)] px-6 text-base font-semibold text-white hover:bg-[var(--ejo-primary-dark)] disabled:opacity-60 sm:w-auto">{pending ? 'Booking…' : 'Book this visit'}</button>
      <p className="text-xs text-[var(--ejo-text-muted)]">Front desk confirms every booking by phone or WhatsApp. We use your details only for this visit (see our privacy notice).</p>
    </form>
  );
}
