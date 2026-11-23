import { guardPage } from '@/lib/authz/server';
import { BackLink, PageHeader, SectionCard } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { getMoneySettings, saveCarWashPricesForm, saveEstimateApprovalForm, saveWarrantyTermsForm } from '@/lib/actions/money-settings';
import { WASH_PACKAGES, jobTypeLabel } from '@/lib/workshop/job-types';
import { WARRANTY_JOB_TYPES, termText } from '@/lib/money/warranty';

export const dynamic = 'force-dynamic';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
const save = 'min-h-11 rounded-full bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white hover:opacity-90';
const SAVED: Record<string, string> = { approval: 'Estimate approval saved.', wash: 'Car wash prices saved.', warranty: 'Workshop guarantee saved.' };

/**
 * Settings → Estimates, car wash and warranty (the Owner): when the Owner
 * gives an estimate its final approval, the car wash price list (a priced
 * package makes a car wash a quick check-in), and the guarantee on the
 * workshop's work per job type.
 */
export default async function MoneySettingsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardPage('admin.organisation.manage', '/settings/money');
  const sp = await searchParams;
  const s = await getMoneySettings();
  if (!s) return null;
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <BackLink href="/settings" label="Settings" className="mb-4" />
      <PageHeader icon="receipt" title="Estimates, car wash and warranty" description="When you give an estimate its final approval, the car wash price list, and the guarantee on the workshop’s work." />
      {sp.error ? <div className="mb-4"><FormFeedbackBanner kind="error" message={sp.error} /></div> : null}
      {sp.status && SAVED[sp.status] ? <div className="mb-4"><FormFeedbackBanner kind="success" message={SAVED[sp.status]!} /></div> : null}

      <div className="space-y-6">
        <SectionCard icon="check-circle" title="Estimate approval" description="Front desk prepares the estimate and the supervisor checks it. That check is enough unless you must decide.">
          <form action={saveEstimateApprovalForm} className="space-y-4" data-testid="estimate-approval-form">
            <label className="flex items-start gap-3">
              <input type="checkbox" name="ownerApprovesEstimates" defaultChecked={s.ownerApprovesEstimates} className="mt-1 h-4 w-4" />
              <span>
                <span className="block text-sm font-medium text-[var(--ejo-text)]">The Owner approves every estimate</span>
                <span className="block text-xs text-[var(--ejo-text-muted)]">Every estimate waits for your final approval before the customer is sent it.</span>
              </span>
            </label>
            <div className="max-w-xs">
              <label htmlFor="ownerApprovalAbove" className={label}>Or only estimates above (₦, VAT included)</label>
              <input id="ownerApprovalAbove" name="ownerApprovalAbove" inputMode="numeric" defaultValue={s.ownerApprovalAbove ?? ''} placeholder="Blank: no amount" className={field} />
            </div>
            <p className="text-xs text-[var(--ejo-text-muted)]">You always approve an estimate with a discount above the discount limit, lines not charged to the customer (warranty, goodwill, internal) and a comeback on earlier work.</p>
            <SubmitButton label="Save estimate approval" pendingLabel="Saving…" className={save} />
          </form>
        </SectionCard>

        <SectionCard icon="sparkles" title="Car wash prices" description="A car wash whose package has a price is a quick check-in: priced at the list price, started at once, then finished, paid and checked out. No supervisor review or estimate to send.">
          <form action={saveCarWashPricesForm} className="space-y-4" data-testid="car-wash-prices-form">
            <div className="grid gap-4 sm:grid-cols-2">
              {WASH_PACKAGES.map((p) => (
                <div key={p.key}>
                  <label htmlFor={`wash_${p.key}`} className={label}>{p.label} (₦)</label>
                  <input id={`wash_${p.key}`} name={`wash_${p.key}`} inputMode="numeric" defaultValue={s.carWashPrices[p.key] ?? ''} placeholder="Blank: priced on the estimate" className={field} />
                </div>
              ))}
            </div>
            <SubmitButton label="Save car wash prices" pendingLabel="Saving…" className={save} />
          </form>
        </SectionCard>

        <SectionCard icon="shield" title="Workshop guarantee" description="How long the workshop guarantees its own work, per kind of job, whichever comes first. It is fixed on the Job Card when the vehicle is checked out and printed on the invoice. A vehicle back within it is a comeback, put right under warranty.">
          <form action={saveWarrantyTermsForm} className="space-y-3" data-testid="warranty-terms-form">
            <div className="hidden grid-cols-[1fr_8rem_8rem] gap-3 text-xs font-medium text-[var(--ejo-text-muted)] sm:grid"><span>Job type</span><span>Days</span><span>Kilometres</span></div>
            {WARRANTY_JOB_TYPES.map((k) => (
              <div key={k} className="grid grid-cols-2 items-end gap-3 border-b border-[var(--ejo-border)] pb-3 last:border-0 sm:grid-cols-[1fr_8rem_8rem]">
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-sm font-medium text-[var(--ejo-text)]">{jobTypeLabel(k)}</span>
                  <span className="block text-xs text-[var(--ejo-text-muted)]">Now: {termText(s.warranty[k])}</span>
                </div>
                <label><span className={`${label} sm:sr-only`}>Days</span><input name={`days_${k}`} inputMode="numeric" defaultValue={s.warranty[k].days ?? ''} placeholder="None" aria-label={`${jobTypeLabel(k)}: days`} className={field} /></label>
                <label><span className={`${label} sm:sr-only`}>Kilometres</span><input name={`km_${k}`} inputMode="numeric" defaultValue={s.warranty[k].km ?? ''} placeholder="None" aria-label={`${jobTypeLabel(k)}: kilometres`} className={field} /></label>
              </div>
            ))}
            <SubmitButton label="Save the guarantee" pendingLabel="Saving…" className={save} />
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
