import Link from 'next/link';
import { getCustomerCare } from '@/lib/actions/customer-care';
import { setCustomerCareDetailsForm } from '@/lib/actions/customer-care-form-handlers';
import { SUPPORT_STATUS_LABEL } from '@/lib/support-rules';
import { formatDateOnly, formatDateTimeCompact } from '@/lib/utils/format-date';
import { SubmitButton } from '@/components/SubmitButton';
import { Section } from '@/components/crm/ui';
import { CrmIcon } from '@/components/crm/CrmIcon';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const PREFERRED: Record<string, string> = { WHATSAPP: 'WhatsApp', PHONE: 'Phone call', EMAIL: 'Email' };

/** Customer care on the customer's page: how they like to be reached, their birthday, open calls, complaints and ratings. */
export async function CustomerCarePanel({ customerId, customerName }: { customerId: string; customerName: string }) {
  const care = await getCustomerCare(customerId);
  if (!care) return null;
  const who = `customer=${encodeURIComponent(customerId)}&customerName=${encodeURIComponent(customerName)}`;
  return (
    <Section icon="phone" title="Customer care" subtitle={`Prefers ${PREFERRED[care.preferredContact]}${care.birthday ? ` · birthday ${care.birthday}` : ''}`}
      action={care.canManage ? <Link href={`/crm/callbacks?${who}`} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ejo-primary)] hover:underline"><CrmIcon name="plus" size={12} />Add a call</Link> : undefined}>
      {care.canManage ? (
        <details className="mb-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3">
          <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-text)]">Contact preferences and birthday</summary>
          <form action={setCustomerCareDetailsForm} className="mt-3 grid gap-3">
            <input type="hidden" name="customerId" value={customerId} />
            <input type="hidden" name="returnTo" value={`/crm/customers/${customerId}`} />
            <label className="text-sm"><span className="mb-1 block font-medium">Prefers</span>
              <select name="preferredContact" defaultValue={care.preferredContact} className={field}>
                <option value="WHATSAPP">WhatsApp</option><option value="PHONE">Phone call</option>{care.hasEmail ? <option value="EMAIL">Email</option> : null}
              </select>
            </label>
            <label className="text-sm"><span className="mb-1 block font-medium">WhatsApp number (if not the main phone)</span>
              <input name="whatsappPhone" defaultValue={care.whatsappPhone ?? ''} inputMode="tel" placeholder="+234 803 000 0000" className={field} />
            </label>
            <label className="text-sm"><span className="mb-1 block font-medium">Birthday (day/month)</span>
              <input name="birthday" defaultValue={care.birthday ?? ''} placeholder="14/02" className={field} />
            </label>
            <SubmitButton className="min-h-10 rounded-full bg-[var(--ejo-primary)] px-4 text-sm font-semibold text-white" label="Save" pendingLabel="Saving…" />
          </form>
        </details>
      ) : null}
      <div className="space-y-3 text-sm">
        <div>
          <p className="font-medium text-[var(--ejo-text)]">Calls to make</p>
          {care.openCallbacks.length ? <ul className="mt-1 space-y-1">{care.openCallbacks.map((f) => <li key={f.id} className="text-[var(--ejo-text-muted)]">{f.reason} · {formatDateTimeCompact(f.dueAt)}</li>)}</ul> : <p className="text-[var(--ejo-text-muted)]">None open.</p>}
        </div>
        {care.canComplaints ? (
          <div>
            <p className="flex items-center justify-between font-medium text-[var(--ejo-text)]">Complaints <Link href={`/crm/complaints?${who}`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Log one</Link></p>
            {care.complaints.length ? <ul className="mt-1 space-y-1">{care.complaints.map((t) => <li key={t.id}><Link href={`/crm/support/${t.id}`} className="hover:underline">{t.number}</Link> <span className="text-[var(--ejo-text-muted)]">· {t.category} · {SUPPORT_STATUS_LABEL[t.status as keyof typeof SUPPORT_STATUS_LABEL] ?? t.status}</span></li>)}</ul> : <p className="text-[var(--ejo-text-muted)]">No complaints.</p>}
          </div>
        ) : null}
        <div>
          <p className="font-medium text-[var(--ejo-text)]">Ratings</p>
          {care.ratings.length ? <ul className="mt-1 space-y-1">{care.ratings.map((r, i) => <li key={i} className="text-[var(--ejo-text-muted)]"><span className="text-[var(--ejo-warning)]" aria-hidden="true">{'★'.repeat(r.score)}</span> {r.label} · {r.jobNumber} · {formatDateOnly(r.respondedAt)}</li>)}</ul> : <p className="text-[var(--ejo-text-muted)]">No ratings yet.</p>}
        </div>
      </div>
    </Section>
  );
}
