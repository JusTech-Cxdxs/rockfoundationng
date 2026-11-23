import { guardPage } from '@/lib/authz/server';
import { BackLink, PageHeader, SectionCard } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { disconnectQuickBooksOnlineForm, getQuickBooksSettingsPage, saveQuickBooksSettingsForm } from '@/lib/actions/quickbooks';
import { ACCOUNT_FIELDS, ITEM_FIELDS } from '@/lib/quickbooks/settings';
import { formatDateTime } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
const primary = 'min-h-11 rounded-full bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white hover:opacity-90';
const SAVED: Record<string, string> = { saved: 'QuickBooks names saved.', connected: 'QuickBooks Online is connected.', disconnected: 'QuickBooks Online is disconnected.' };

/**
 * Settings → QuickBooks (the Owner and Accounts): the account and item names
 * in the workshop's QuickBooks company file (the export uses exactly these),
 * the date order, the walk-in customer, and — for the Owner — the optional
 * QuickBooks Online connection, which stays off unless the server is set up.
 */
export default async function QuickBooksSettingsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardPage('money.quickbooks.export', '/settings/quickbooks');
  const sp = await searchParams;
  const { settings, isOwner, qbo } = await getQuickBooksSettingsPage();
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <BackLink href="/settings" label="Settings" className="mb-4" />
      <PageHeader icon="layers" title="QuickBooks" description="The names in your QuickBooks company file, so every export lands in the right accounts. Ask your accountant if you are not sure." />
      {sp.error ? <div className="mb-4"><FormFeedbackBanner kind="error" message={sp.error} /></div> : null}
      {sp.status && SAVED[sp.status] ? <div className="mb-4"><FormFeedbackBanner kind="success" message={SAVED[sp.status]!} /></div> : null}

      <div className="space-y-6">
        <form action={saveQuickBooksSettingsForm} className="space-y-6" data-testid="qb-settings-form">
          <SectionCard icon="receipt" title="Accounts" description="Type each account exactly as it is named in QuickBooks (at most 31 characters). Create any that do not exist yet before the first import.">
            <div className="grid gap-4 sm:grid-cols-2">
              {ACCOUNT_FIELDS.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`account_${f.key}`} className={label}>{f.label} <span className="font-normal">({f.kind})</span></label>
                  <input id={`account_${f.key}`} name={`account_${f.key}`} required maxLength={31} defaultValue={settings.accounts[f.key]} className={field} />
                  <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">{f.help}</p>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard icon="boxes" title="Items" description="Store parts use their own part number as the item. These items are for everything else.">
            <div className="grid gap-4 sm:grid-cols-2">
              {ITEM_FIELDS.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`item_${f.key}`} className={label}>{f.label}</label>
                  <input id={`item_${f.key}`} name={`item_${f.key}`} required maxLength={31} defaultValue={settings.items[f.key]} className={field} />
                  <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">{f.help}</p>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard icon="settings" title="File details">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="walkInCustomer" className={label}>Customer for walk-in counter sales</label>
                <input id="walkInCustomer" name="walkInCustomer" required maxLength={31} defaultValue={settings.walkInCustomer} className={field} />
                <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">A counter sale to someone not registered is recorded against this customer; the buyer’s name goes in the memo.</p>
              </div>
              <div>
                <label htmlFor="dateFormat" className={label}>Dates in the file</label>
                <select id="dateFormat" name="dateFormat" defaultValue={settings.dateFormat} className={field}>
                  <option value="DD/MM/YYYY">DD/MM/YYYY (QuickBooks set to Nigeria or the UK)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (QuickBooks set to the United States)</option>
                </select>
                <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">Match the date order your QuickBooks uses (Windows region settings), or dates will be misread.</p>
              </div>
            </div>
          </SectionCard>
          <SubmitButton label="Save QuickBooks names" pendingLabel="Saving…" className={primary} />
        </form>

        <SectionCard icon="layers" title="QuickBooks Online" description="Optional. Send invoices, counter sales, payments and credit notes straight to QuickBooks Online instead of importing files.">
          <div data-testid="qbo-connection">
            {!qbo.serverReady ? (
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-[var(--ejo-text)]">Not connected</p>
                <p className="text-[var(--ejo-text-muted)]">QuickBooks Online is off on this server. Your developer switches it on by adding these settings to the server (never in this page): {qbo.missing.join(', ')}. Until then, the CSV files from Money → QuickBooks import into QuickBooks Online by hand.</p>
              </div>
            ) : qbo.connected ? (
              <div className="space-y-3 text-sm">
                <p className="font-semibold text-[var(--ejo-success)]">Connected ({qbo.environment === 'production' ? 'live company' : 'sandbox'})</p>
                <p className="text-[var(--ejo-text-muted)]">{qbo.realmConnectedAt ? `Connected ${formatDateTime(qbo.realmConnectedAt)}.` : ''} {qbo.lastUsedAt ? `Last used ${formatDateTime(qbo.lastUsedAt)}.` : 'Not used yet.'}</p>
                {qbo.lastError ? <p className="text-[var(--ejo-error)]">Last problem: {qbo.lastError}</p> : null}
                {isOwner ? (
                  <form action={disconnectQuickBooksOnlineForm}>
                    <SubmitButton label="Disconnect QuickBooks Online" pendingLabel="Disconnecting…" className="min-h-11 rounded-full border border-[var(--ejo-error)] px-5 text-sm font-semibold text-[var(--ejo-error)]" />
                  </form>
                ) : <p className="text-xs text-[var(--ejo-text-muted)]">Only the Owner connects or disconnects it.</p>}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="font-semibold text-[var(--ejo-text)]">Not connected</p>
                <p className="text-[var(--ejo-text-muted)]">You will be sent to Intuit to sign in and choose the company, then brought back here.</p>
                {isOwner ? <a href="/api/quickbooks/connect" className="inline-flex min-h-11 items-center rounded-full bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white hover:opacity-90">Connect QuickBooks Online</a> : <p className="text-xs text-[var(--ejo-text-muted)]">Only the Owner connects it.</p>}
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
