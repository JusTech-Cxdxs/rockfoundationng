import { getJobCardRating } from '@/lib/actions/customer-care';
import { allows } from '@/lib/authz/server';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { Icon } from '@/components/ui';

/** "How did we do?" on a collected Job Card: the customer's answer, or the WhatsApp button to ask (front desk). */
export async function JobCardRatingCard({ jobCardId }: { jobCardId: string }) {
  if (!(await allows('workshop.customer.notify'))) return null;
  const r = await getJobCardRating(jobCardId).catch(() => null);
  if (!r) return null;
  return (
    <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 print:hidden" data-testid="job-card-rating">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ejo-text)]"><Icon name="star" size={16} /> How did we do?</h2>
      {r.score ? (
        <div className="mt-2 text-sm">
          <p><span className="text-[var(--ejo-warning)]" aria-hidden="true">{'★'.repeat(r.score)}{'☆'.repeat(5 - r.score)}</span> <span className="font-medium">{r.label}</span> <span className="text-[var(--ejo-text-muted)]">({r.score}/5{r.respondedAt ? `, ${formatDateTimeCompact(r.respondedAt)}` : ''})</span></p>
          {r.comment ? <p className="mt-1 text-[var(--ejo-text)]">“{r.comment}”</p> : null}
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">The customer was sent a link to rate this job. Send it on WhatsApp too: it takes them ten seconds.</p>
          {r.whatsAppUrl ? (
            <a href={r.whatsAppUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--whatsapp)] px-4 text-sm font-semibold text-white hover:bg-[var(--whatsapp-dark)]">
              <Icon name="chat" size={16} /> Send on WhatsApp
            </a>
          ) : <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No usable phone number on the customer’s file.</p>}
        </>
      )}
    </div>
  );
}
