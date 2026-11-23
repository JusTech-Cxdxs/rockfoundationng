import type { Metadata } from 'next';
import { viewRating } from '@/lib/job-rating';
import { submitRating } from './actions';

export const dynamic = 'force-dynamic';
// The link is the customer's key: never indexed, never passed on to another site.
export const metadata: Metadata = { title: 'How did we do?', robots: { index: false, follow: false }, referrer: 'no-referrer' };

const WORDS: Record<number, string> = { 1: 'Very poor', 2: 'Poor', 3: 'Okay', 4: 'Good', 5: 'Excellent' };

/**
 * "How did we do?" (the link in our email or WhatsApp message after a vehicle
 * is collected, no sign-in): five large buttons and an optional comment.
 * Works without JavaScript. Opening the page changes nothing; the answer is
 * saved once.
 */
export default async function RatePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ thanks?: string; pick?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const view = await viewRating(token);
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-28 sm:px-6 sm:pt-32">
      <div className="rounded-3xl border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-6 shadow-sm sm:p-8">{children}</div>
    </main>
  );
  if (view.state === 'invalid' || view.state === 'expired') {
    return shell(
      <div className="text-center" data-testid="rating-link-problem">
        <h1 className="text-xl font-bold text-[var(--ejo-text)]">{view.state === 'expired' ? 'This link has expired' : 'This link does not work'}</h1>
        <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">Please call the workshop if you would like to tell us how we did. We are always glad to hear from you.</p>
      </div>,
    );
  }
  if (view.state === 'answered') {
    const happy = (view.score ?? 0) >= 4;
    return shell(
      <div className="text-center" data-testid="rating-thanks">
        <p className="text-4xl text-[var(--ejo-warning)]" aria-label={`${view.score} out of 5`}>{'★'.repeat(view.score ?? 0)}<span className="opacity-25">{'★'.repeat(5 - (view.score ?? 0))}</span></p>
        <h1 className="mt-3 text-2xl font-bold text-[var(--ejo-text)]">Thank you{sp.thanks ? '!' : ''}</h1>
        <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">
          {happy ? `We are glad you were happy with the work on your ${view.vehicle}. See you at the next service.` : `We are sorry it was not what you expected. Someone from ${view.workshop} will call you to put it right.`}
        </p>
      </div>,
    );
  }
  const open = view;
  return shell(
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ejo-primary-text)]">{open.workshop} · Job {open.jobNumber}</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--ejo-text)]">How did we do?</h1>
      <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">Your {open.vehicle}. Your answer goes straight to our management.</p>
      <form action={submitRating} className="mt-6" data-testid="rating-form">
        <input type="hidden" name="token" value={token} />
        <fieldset>
          <legend className="text-sm font-medium text-[var(--ejo-text)]">Tap one</legend>
          {sp.pick ? <p role="alert" className="mt-1 text-sm text-[var(--ejo-error)]">Please choose a rating first.</p> : null}
          <div className="mt-3 grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-[var(--ejo-border)] px-1 py-3 text-center has-[:checked]:border-[var(--ejo-primary)] has-[:checked]:bg-[var(--ejo-primary)]/10">
                <input type="radio" name="score" value={n} required className="sr-only" />
                <span className="text-2xl text-[var(--ejo-warning)]" aria-hidden="true">{'★'.repeat(n)}</span>
                <span className="text-xs font-medium text-[var(--ejo-text)]">{WORDS[n]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-5 block text-sm font-medium text-[var(--ejo-text)]">
          Anything to tell us? (optional)
          <textarea name="comment" rows={3} maxLength={1000} className="mt-1 w-full rounded-xl border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" placeholder="What went well, or what we should do better" />
        </label>
        <button type="submit" className="mt-5 min-h-12 w-full rounded-full bg-[var(--ejo-primary)] px-5 text-base font-semibold text-white hover:bg-[var(--ejo-primary-dark)]">Send my rating</button>
      </form>
      <p className="mt-6 text-xs text-[var(--ejo-text-muted)]">This link is only for you and saves one answer.</p>
    </>,
  );
}
