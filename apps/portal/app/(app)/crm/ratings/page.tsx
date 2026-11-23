import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { getRatings } from '@/lib/actions/customer-care';
import { CareTabs } from '@/components/crm/CareTabs';
import { EmptyState, Icon, PageHeader, SectionCard, StatTile } from '@/components/ui';
import { formatDateTime } from '@/lib/utils/format-date';

export const metadata = { title: 'Ratings' };
export const dynamic = 'force-dynamic';

function Stars({ score }: { score: number }) {
  return (
    <span className="inline-flex text-[var(--ejo-warning)]" aria-label={`${score} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} aria-hidden="true" className={i <= score ? '' : 'opacity-25'}>★</span>)}
    </span>
  );
}

export default async function RatingsPage() {
  await guardPage('crm.view', '/crm/ratings');
  const r = await getRatings();
  const max = Math.max(1, ...r.distribution.map((d) => d.count));
  const responseRate = r.sent ? Math.round((r.answered / r.sent) * 100) : null;
  return (
    <div className="w-full max-w-6xl p-4 sm:p-8">
      <PageHeader icon="star" title="Ratings" description="“How did we do?” after every collected vehicle. A rating of 3 or less opens a complaint and a callback for front desk automatically." />
      <CareTabs active="/crm/ratings" />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon="star" label="Average (90 days)" value={r.average ?? '–'} suffix={r.average ? ' / 5' : undefined} decimals={1} tone={r.average === null ? 'neutral' : r.average >= 4 ? 'success' : r.average >= 3 ? 'warning' : 'error'} />
        <StatTile icon="check-circle" label="Answered" value={r.answered} />
        <StatTile icon="megaphone" label="Asked" value={r.sent} />
        <StatTile icon="percent" label="Answer rate" value={responseRate ?? '–'} suffix={responseRate !== null ? '%' : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <SectionCard icon="bars" title="How customers rated us">
          <ul className="space-y-2">
            {r.distribution.map((d) => (
              <li key={d.score} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2 text-sm">
                <span>{d.label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-[var(--ejo-border)]"><span className="block h-full rounded-full bg-[var(--ejo-primary)]" style={{ width: `${(d.count / max) * 100}%` }} /></span>
                <span className="text-right font-semibold">{d.count}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard icon="chat" title="Latest answers">
          {r.recent.length ? (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {r.recent.map((x) => (
                <li key={x.id} className="py-3" data-testid="rating">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><Stars score={x.score} /><span className="text-sm font-medium">{x.label}</span></span>
                    <span className="text-xs text-[var(--ejo-text-muted)]">{formatDateTime(x.respondedAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
                    <Link href={`/crm/customers/${x.customer.id}`} className="hover:underline">{x.customer.name}</Link> · <Link href={`/workshop/job-cards/${x.job.id}`} className="hover:underline">{x.job.number}</Link>
                    {x.complaint ? <> · <span className="inline-flex items-center gap-1 text-[var(--ejo-error)]"><Icon name="alert" size={13} /> Complaint {x.complaint}</span></> : null}
                  </p>
                  {x.comment ? <p className="mt-1 text-sm text-[var(--ejo-text)]">“{x.comment}”</p> : null}
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="star" title="No ratings yet" compact>Every collected vehicle gets a “How did we do?” link by email, and front desk can send it on WhatsApp from the Job Card.</EmptyState>}
        </SectionCard>
      </div>
    </div>
  );
}
