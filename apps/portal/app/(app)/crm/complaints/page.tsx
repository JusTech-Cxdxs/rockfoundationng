import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { listComplaints } from '@/lib/actions/customer-care';
import { logComplaintForm } from '@/lib/actions/customer-care-form-handlers';
import { COMPLAINT_CATEGORIES, COMPLAINT_CHANNELS, COMPLAINT_SEVERITY } from '@/lib/customer-care/rules';
import { SUPPORT_STATUS_LABEL } from '@/lib/support-rules';
import { CareTabs } from '@/components/crm/CareTabs';
import { CustomerSearchField } from '@/components/CustomerSearchField';
import { SubmitButton } from '@/components/SubmitButton';
import { EmptyState, PageHeader, RevealPanel, SectionCard, StatusChip } from '@/components/ui';
import { formatDateTime } from '@/lib/utils/format-date';

export const metadata = { title: 'Complaints' };
export const dynamic = 'force-dynamic';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-sm font-medium text-[var(--ejo-text)]';

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<{ show?: string; category?: string; error?: string; customer?: string; customerName?: string; jobCardId?: string }> }) {
  await guardPage('support.tickets.manage', '/crm/complaints');
  const sp = await searchParams;
  const data = await listComplaints({ show: sp.show, category: sp.category });
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const v = { show: sp.show, category: sp.category, ...patch };
    if (v.show && v.show !== 'open') p.set('show', v.show);
    if (v.category) p.set('category', v.category);
    const s = p.toString();
    return `/crm/complaints${s ? `?${s}` : ''}`;
  };
  return (
    <div className="w-full max-w-6xl p-4 sm:p-8">
      <PageHeader icon="alert" title="Complaints" description="Every complaint, from the front desk, the phone, WhatsApp or a low rating, tracked to resolution with an owner and a response target. Each one opens in the Support centre for replies and updates." />
      <CareTabs active="/crm/complaints" />
      {sp.error ? <p role="alert" className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/10 px-4 py-3 text-sm">{sp.error}</p> : null}

      <RevealPanel label="Log a complaint" icon="plus" open={Boolean(sp.customer)} className="mb-6">
        <form action={logComplaintForm} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="returnTo" value={qs({})} />
          {sp.jobCardId ? <input type="hidden" name="jobCardId" value={sp.jobCardId} /> : null}
          <div className="sm:col-span-2"><span className={label}>Customer</span><CustomerSearchField required defaultValue={sp.customer} defaultLabel={sp.customerName} /></div>
          <label><span className={label}>What it is about</span>
            <select name="category" required className={field} defaultValue="">
              <option value="" disabled>Choose…</option>
              {COMPLAINT_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <label><span className={label}>How it came in</span>
            <select name="channel" required className={field} defaultValue="WALK_IN">{COMPLAINT_CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
          </label>
          <label><span className={label}>How serious</span>
            <select name="severity" className={field} defaultValue="NORMAL">{COMPLAINT_SEVERITY.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
          </label>
          <label className="sm:col-span-2"><span className={label}>What the customer said</span>
            <textarea name="details" required minLength={5} maxLength={4000} rows={4} className={field} placeholder="In their words where you can: what happened, and what they want done." />
          </label>
          <div className="sm:col-span-2"><SubmitButton className="min-h-11 rounded-full bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white" label="Log the complaint" pendingLabel="Logging…" /></div>
        </form>
      </RevealPanel>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label="Show" className="inline-flex gap-1 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1 text-sm">
          {(['open', 'resolved', 'all'] as const).map((s) => (
            <Link key={s} href={qs({ show: s })} aria-current={data.show === s ? 'page' : undefined} className={`rounded-full px-3.5 py-1.5 font-medium ${data.show === s ? 'bg-[var(--ejo-primary)] text-white' : 'text-[var(--ejo-text-muted)]'}`}>
              {s === 'open' ? 'Open' : s === 'resolved' ? 'Resolved' : 'All'}
            </Link>
          ))}
        </nav>
        {sp.category ? <Link href={qs({ category: undefined })} className="rounded-full border border-[var(--ejo-border)] px-3 py-1.5 text-sm">Clear category ×</Link> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <SectionCard icon="alert" title={`${data.rows.length} complaint${data.rows.length === 1 ? '' : 's'}`}>
          {data.rows.length ? (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {data.rows.map((r) => (
                <li key={r.id} className="py-3" data-testid="complaint">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/crm/support/${r.id}`} className="font-semibold text-[var(--ejo-text)] hover:underline">{r.number} · {r.category}</Link>
                    <StatusChip status={r.status} label={SUPPORT_STATUS_LABEL[r.status as keyof typeof SUPPORT_STATUS_LABEL] ?? r.status} />
                  </div>
                  <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
                    {r.customer.id ? <Link href={`/crm/customers/${r.customer.id}`} className="hover:underline">{r.customer.name}</Link> : r.customer.name}
                    {r.job ? <> · <Link href={`/workshop/job-cards/${r.job.id}`} className="hover:underline">{r.job.number}</Link></> : null}
                    {' · '}{formatDateTime(r.createdAt)}{r.priority !== 'NORMAL' ? ` · ${r.priority === 'URGENT' ? 'Urgent' : 'Serious'}` : ''}
                    {' · '}{r.assignedTo ? `With ${r.assignedTo}` : 'Not assigned yet'}
                  </p>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="check-circle" title={data.show === 'open' ? 'No open complaints' : 'No complaints here'} compact />}
        </SectionCard>
        <SectionCard icon="pie" title="Last 90 days by kind">
          {data.byCategory.length ? (
            <ul className="space-y-2 text-sm">
              {data.byCategory.map((c) => (
                <li key={c.key}><Link href={qs({ category: c.key, show: 'all' })} className="flex justify-between gap-2 hover:underline"><span>{c.label}</span><span className="font-semibold">{c.count}</span></Link></li>
              ))}
            </ul>
          ) : <p className="text-sm text-[var(--ejo-text-muted)]">No complaints in the last 90 days.</p>}
        </SectionCard>
      </div>
    </div>
  );
}
