import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { listCallbacks, getCareOverview, type CallbackRow } from '@/lib/actions/customer-care';
import { addCallbackForm, callbackNoAnswerForm, cancelCallbackForm, completeCallbackForm } from '@/lib/actions/customer-care-form-handlers';
import { FOLLOW_UP_REASONS, FOLLOW_UP_STATUS_LABEL, MANUAL_FOLLOW_UP_REASONS, lagosDay } from '@/lib/customer-care/rules';
import { CareTabs } from '@/components/crm/CareTabs';
import { CustomerSearchField } from '@/components/CustomerSearchField';
import { SubmitButton } from '@/components/SubmitButton';
import { EmptyState, Icon, PageHeader, RevealPanel, SectionCard, StatTile } from '@/components/ui';
import { formatDateTime } from '@/lib/utils/format-date';

export const metadata = { title: 'Callbacks' };
export const dynamic = 'force-dynamic';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-sm font-medium text-[var(--ejo-text)]';

const NOTICE: Record<string, string> = {
  callback_added: 'Call added to the list.',
  callback_done: 'Call marked done. Thank you.',
  callback_no_answer: 'Noted: no answer. It is back on the list for tomorrow.',
  callback_no_answer_closed: 'No answer after several tries: the call is closed.',
  callback_cancelled: 'Call cancelled.',
};

function CallbackCard({ r, returnTo }: { r: CallbackRow; returnTo: string }) {
  const tone = r.bucket === 'overdue' ? 'border-[var(--ejo-error)]/40' : r.bucket === 'today' ? 'border-[var(--ejo-warning)]/40' : 'border-[var(--ejo-border)]';
  return (
    <li className={`rounded-[var(--ejo-radius-lg)] border ${tone} bg-[var(--ejo-bg)] p-4`} data-testid="callback">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{r.reasonLabel}</p>
          <Link href={`/crm/customers/${r.customer.id}`} className="mt-0.5 block text-base font-semibold text-[var(--ejo-text)] hover:underline">{r.customer.name}</Link>
          <p className="mt-0.5 text-sm text-[var(--ejo-text-muted)]">
            {r.customer.phone ?? 'No phone on file'}{r.vehicle ? ` · ${r.vehicle}` : ''}{r.job ? <> · <Link className="hover:underline" href={`/workshop/job-cards/${r.job.id}`}>{r.job.number}</Link></> : null}
          </p>
          {r.note ? <p className="mt-2 text-sm text-[var(--ejo-text)]">{r.note}</p> : null}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ejo-text-muted)]">
            <span className="inline-flex items-center gap-1"><Icon name="clock" size={13} /> {formatDateTime(r.dueAt)}</span>
            {r.attempts ? <span>{r.attempts} unanswered {r.attempts === 1 ? 'try' : 'tries'}</span> : null}
            {r.assignedTo ? <span>For {r.mine ? 'you' : r.assignedTo}</span> : null}
            {r.customer.preferred === 'WHATSAPP' ? <span>Prefers WhatsApp</span> : r.customer.preferred === 'PHONE' ? <span>Prefers a call</span> : <span>Prefers email</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.callUrl ? <a href={r.callUrl} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--ejo-border)] px-4 text-sm font-semibold text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]"><Icon name="phone" size={16} /> Call</a> : null}
          {r.whatsAppUrl ? <a href={r.whatsAppUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--whatsapp)] px-4 text-sm font-semibold text-white hover:bg-[var(--whatsapp-dark)]"><Icon name="chat" size={16} /> WhatsApp</a> : null}
        </div>
      </div>
      <div className="mt-3 grid gap-2 border-t border-dashed border-[var(--ejo-border)] pt-3 sm:grid-cols-[1fr_auto_auto]">
        <form action={completeCallbackForm} className="flex gap-2">
          <input type="hidden" name="id" value={r.id} /><input type="hidden" name="returnTo" value={returnTo} />
          <label className="sr-only" htmlFor={`outcome-${r.id}`}>What came of the call</label>
          <input id={`outcome-${r.id}`} name="outcome" required minLength={2} maxLength={500} placeholder="What came of it? e.g. Happy with the work" className={field} />
          <SubmitButton className="min-h-11 shrink-0 rounded-full bg-[var(--ejo-primary)] px-4 text-sm font-semibold text-white" label="Done" pendingLabel="Saving…" />
        </form>
        <form action={callbackNoAnswerForm}>
          <input type="hidden" name="id" value={r.id} /><input type="hidden" name="returnTo" value={returnTo} />
          <SubmitButton className="min-h-11 w-full rounded-full border border-[var(--ejo-border)] px-4 text-sm font-semibold text-[var(--ejo-text)]" label="No answer" pendingLabel="Saving…" />
        </form>
        <details className="text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center justify-center rounded-full px-3 text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">Not needed</summary>
          <form action={cancelCallbackForm} className="mt-2 flex gap-2">
            <input type="hidden" name="id" value={r.id} /><input type="hidden" name="returnTo" value={returnTo} />
            <input name="reason" required minLength={2} maxLength={300} placeholder="Why?" className={field} aria-label="Why the call is not needed" />
            <SubmitButton className="shrink-0 rounded-full border border-[var(--ejo-border)] px-3 text-sm" label="Cancel call" pendingLabel="Cancelling…" />
          </form>
        </details>
      </div>
    </li>
  );
}

export default async function CallbacksPage({ searchParams }: { searchParams: Promise<{ show?: string; status?: string; error?: string; customer?: string; customerName?: string; jobCardId?: string }> }) {
  await guardPage('crm.manage', '/crm/callbacks');
  const sp = await searchParams;
  const [list, overview] = await Promise.all([listCallbacks({ show: sp.show }), getCareOverview()]);
  const returnTo = `/crm/callbacks${list.show === 'open' ? '' : `?show=${list.show}`}`;
  const defaultDue = `${lagosDay(new Date(Date.now() + 86_400_000))}T10:00`;
  const groups: { key: 'overdue' | 'today' | 'upcoming'; title: string; rows: CallbackRow[] }[] = [
    { key: 'overdue', title: 'Overdue', rows: list.overdue },
    { key: 'today', title: 'Today', rows: list.today },
    { key: 'upcoming', title: 'Coming up', rows: list.upcoming },
  ];
  return (
    <div className="w-full max-w-6xl p-4 sm:p-8">
      <PageHeader icon="phone" title="Callbacks" description="The calls and messages front desk owes customers: after every job, service due, birthdays, low ratings and complaints. Work from the top." />
      <CareTabs active="/crm/callbacks" />
      {sp.status && NOTICE[sp.status] ? <p role="status" className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/10 px-4 py-3 text-sm text-[var(--ejo-text)]">{NOTICE[sp.status]}</p> : null}
      {sp.error ? <p role="alert" className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/10 px-4 py-3 text-sm text-[var(--ejo-text)]">{sp.error}</p> : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon="alert" label="Overdue" value={overview.callbacksOverdue} tone={overview.callbacksOverdue ? 'error' : 'neutral'} />
        <StatTile icon="phone" label="Due today" value={overview.callbacksToday} tone={overview.callbacksToday ? 'warning' : 'neutral'} />
        <StatTile icon="star" label="Rating (30 days)" value={overview.average30 ?? '–'} suffix={overview.average30 ? ' / 5' : undefined} decimals={1} />
        <StatTile icon="chat" label="Open complaints" value={overview.openComplaints} href="/crm/complaints" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Show" className="inline-flex gap-1 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1 text-sm">
          {(['open', 'mine', 'closed'] as const).map((s) => (
            <Link key={s} href={s === 'open' ? '/crm/callbacks' : `/crm/callbacks?show=${s}`} aria-current={list.show === s ? 'page' : undefined} className={`rounded-full px-3.5 py-1.5 font-medium ${list.show === s ? 'bg-[var(--ejo-primary)] text-white' : 'text-[var(--ejo-text-muted)]'}`}>
              {s === 'open' ? 'All to do' : s === 'mine' ? 'Mine' : 'Done'}
            </Link>
          ))}
        </nav>
      </div>

      <RevealPanel label="Add a call" icon="plus" open={Boolean(sp.customer)}>
        <form action={addCallbackForm} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="returnTo" value={returnTo} />
          {sp.jobCardId ? <input type="hidden" name="jobCardId" value={sp.jobCardId} /> : null}
          <div className="sm:col-span-2"><span className={label}>Customer</span><CustomerSearchField required defaultValue={sp.customer} defaultLabel={sp.customerName} /></div>
          <label><span className={label}>Why</span>
            <select name="reason" className={field} required defaultValue="CALLBACK">{MANUAL_FOLLOW_UP_REASONS.map((r) => <option key={r} value={r}>{FOLLOW_UP_REASONS[r]}</option>)}</select>
          </label>
          <label><span className={label}>When</span><input type="datetime-local" name="dueAt" required defaultValue={defaultDue} className={field} /></label>
          <label className="sm:col-span-2"><span className={label}>Note (optional)</span><input name="note" maxLength={500} placeholder="e.g. Wants a quote for brake pads" className={field} /></label>
          <div className="sm:col-span-2"><SubmitButton className="min-h-11 rounded-full bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white" label="Add to the list" pendingLabel="Adding…" /></div>
        </form>
      </RevealPanel>

      {list.show === 'closed' ? (
        <SectionCard icon="check" title="Done recently">
          {list.closed.length ? (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {list.closed.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                  <span><Link href={`/crm/customers/${r.customer.id}`} className="font-medium hover:underline">{r.customer.name}</Link> · {r.reasonLabel}{r.outcome ? ` · ${r.outcome}` : ''}</span>
                  <span className="text-xs text-[var(--ejo-text-muted)]">{FOLLOW_UP_STATUS_LABEL[r.status]}{r.doneAt ? ` · ${formatDateTime(r.doneAt)}` : ''}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="inbox" title="Nothing closed yet" compact />}
        </SectionCard>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`cb-${g.key}`}>
              <h2 id={`cb-${g.key}`} className="mb-3 text-base font-semibold text-[var(--ejo-text)]">{g.title} <span className="text-sm font-normal text-[var(--ejo-text-muted)]">({g.rows.length})</span></h2>
              {g.rows.length ? <ul className="space-y-3">{g.rows.map((r) => <CallbackCard key={r.id} r={r} returnTo={returnTo} />)}</ul> : <p className="rounded-[var(--ejo-radius-md)] border border-dashed border-[var(--ejo-border)] px-4 py-6 text-center text-sm text-[var(--ejo-text-muted)]">{g.key === 'overdue' ? 'Nothing overdue. Well done.' : 'Nothing here.'}</p>}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
