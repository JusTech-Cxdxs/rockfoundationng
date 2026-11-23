import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { PageHeader, SectionCard, EmptyState, StatTile } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { MoneyTabs } from '@/components/money/MoneyTabs';
import { createQuickBooksExportForm, getQuickBooksPage, sendToQuickBooksOnlineForm } from '@/lib/actions/quickbooks';
import { EXPORT_KINDS, EXPORT_KIND_LABEL, type ExportKind } from '@/lib/quickbooks/assemble';
import { naira } from '@/lib/money/rules';
import { formatDateTime } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
const primary = 'min-h-11 rounded-full bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white hover:opacity-90';
const secondary = 'inline-flex min-h-11 items-center rounded-full border border-[var(--ejo-border)] px-5 text-sm font-semibold text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]';
/** YYYY-MM-DD → DD/MM/YYYY */
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const MONEY_OF: Partial<Record<ExportKind, string>> = { invoices: 'invoices', counterSales: 'counterSales', payments: 'payments', creditNotes: 'creditNotes', refunds: 'refunds', stockMovements: 'stockMovements' };

/**
 * Money → QuickBooks (the Owner and Accounts): choose the days and what to
 * send, check the counts and totals, then make the file for QuickBooks
 * Desktop (IIF) or Excel (CSV). Records already exported are left out unless
 * asked for. Every export stays here to download again.
 */
export default async function QuickBooksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await guardPage('money.quickbooks.export', '/money/quickbooks');
  const sp = await searchParams;
  const page = await getQuickBooksPage(sp);
  const req = page.request;
  const chosen = new Set<string>(req?.kinds ?? []);
  const error = typeof sp.error === 'string' ? sp.error : page.error;
  const status = typeof sp.status === 'string' ? sp.status : null;
  const sent = status?.startsWith('sent:') ? status.split(':') : null;
  const kinds = EXPORT_KINDS.filter((k) => k !== 'stockMovements' || page.seesCosts);
  const anything = page.preview ? Object.values(page.preview.counts).some((n) => n > 0) : false;

  return (
    <div className="p-4 sm:p-8">
      <PageHeader icon="receipt" title="QuickBooks" description="Your sales, payments, credit notes and refunds for QuickBooks: a file for QuickBooks Desktop (IIF) or Excel (CSV). Nothing is posted twice: records already exported are left out unless you ask for them." />
      <MoneyTabs active="quickbooks" />
      {error ? <div className="mb-4"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {sent ? <div className="mb-4"><FormFeedbackBanner kind="success" message={`Sent to QuickBooks Online: ${sent[1]}. Already there: ${sent[2]}.`} /></div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <SectionCard icon="calendar" title="What to export" description="Choose the days (Lagos time) and what goes in the file, then check the figures below.">
            <form method="get" action="/money/quickbooks" className="space-y-4" data-testid="qb-choose">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label htmlFor="qb-from" className={label}>From</label><input id="qb-from" type="date" name="from" required defaultValue={page.range.fromDay} className={field} /></div>
                <div><label htmlFor="qb-to" className={label}>To</label><input id="qb-to" type="date" name="to" required defaultValue={page.range.toDay} className={field} /></div>
              </div>
              <fieldset>
                <legend className={label}>In the file</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {kinds.map((k) => (
                    <label key={k} className="flex min-h-11 items-center gap-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 text-sm">
                      <input type="checkbox" name="kind" value={k} defaultChecked={!req || chosen.has(k)} className="h-4 w-4" />
                      {EXPORT_KIND_LABEL[k]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className={label}>File</legend>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="radio" name="format" value="IIF" defaultChecked={(req?.format ?? 'IIF') === 'IIF'} /> QuickBooks Desktop (IIF)</label>
                  <label className="flex items-center gap-2"><input type="radio" name="format" value="CSV" defaultChecked={req?.format === 'CSV'} /> Excel / QuickBooks Online (CSV)</label>
                </div>
              </fieldset>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="includeExported" value="1" defaultChecked={req?.includeExported} className="mt-1 h-4 w-4" />
                <span><span className="block font-medium text-[var(--ejo-text)]">Include records already exported</span><span className="block text-xs text-[var(--ejo-text-muted)]">Only to make a file again for a company file that lost them. Importing them twice posts them twice.</span></span>
              </label>
              <button type="submit" className={secondary}>Check the figures</button>
            </form>
          </SectionCard>

          {page.preview && req ? (
            <SectionCard icon="chart" title={`${dmy(req.fromDay)} to ${dmy(req.toDay)}`} description="What the file will carry. Compare the totals with your sales and receipts for the same days before importing.">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="qb-preview">
                {req.kinds.map((k) => (
                  <StatTile key={k} icon="receipt" label={EXPORT_KIND_LABEL[k]} value={page.preview!.counts[k] ?? 0}
                    hint={MONEY_OF[k] ? naira(page.preview!.totals[MONEY_OF[k]!] ?? 0) : undefined} />
                ))}
              </div>
              {page.preview.totals.invoicesVat || page.preview.totals.counterSalesVat ? (
                <p className="mt-3 text-sm text-[var(--ejo-text-muted)]">VAT in the file: {naira((page.preview.totals.invoicesVat ?? 0) + (page.preview.totals.counterSalesVat ?? 0))} (invoices {naira(page.preview.totals.invoicesVat ?? 0)}, counter sales {naira(page.preview.totals.counterSalesVat ?? 0)}).</p>
              ) : null}
              {Object.keys(page.preview.alreadyExported).length ? (
                <p className="mt-3 text-sm text-[var(--ejo-text-muted)]" data-testid="qb-already">Left out, already exported: {Object.entries(page.preview.alreadyExported).map(([k, n]) => `${n} ${EXPORT_KIND_LABEL[k as ExportKind].toLowerCase()}`).join(', ')}.</p>
              ) : null}
              {page.preview.problems.length ? (
                <ul className="mt-3 space-y-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-3 text-sm" data-testid="qb-problems">
                  {page.preview.problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              ) : null}
              <form action={createQuickBooksExportForm} className="mt-4 flex flex-wrap items-center gap-3">
                <input type="hidden" name="from" value={req.fromDay} /><input type="hidden" name="to" value={req.toDay} />
                <input type="hidden" name="format" value={req.format} />
                {req.includeExported ? <input type="hidden" name="includeExported" value="1" /> : null}
                {req.kinds.map((k) => <input key={k} type="hidden" name="kind" value={k} />)}
                {anything ? <SubmitButton label={`Create the ${req.format === 'IIF' ? 'IIF file' : 'CSV files'}`} pendingLabel="Making the file…" className={primary} /> : <span className="text-sm text-[var(--ejo-text-muted)]">Nothing to export for these days.</span>}
              </form>
            </SectionCard>
          ) : null}

          <SectionCard icon="history" title="Exports" description="Each export keeps its files exactly as first made. Downloads are recorded.">
            {page.history.length === 0 ? <EmptyState icon="inbox" title="No exports yet" compact /> : (
              <ul className="divide-y divide-[var(--ejo-border)]" data-testid="qb-history">
                {page.history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <Link href={`/money/quickbooks/exports/${h.id}`} className="font-semibold text-[var(--ejo-primary)] hover:underline">{h.number}</Link>
                      <p className="text-xs text-[var(--ejo-text-muted)]">{dmy(h.fromDay)} to {dmy(h.toDay)} · {h.format} · {Object.entries(h.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${EXPORT_KIND_LABEL[k as ExportKind]?.toLowerCase() ?? k}`).join(', ') || 'empty'}</p>
                    </div>
                    <p className="text-xs text-[var(--ejo-text-muted)]">{h.createdBy} · {formatDateTime(h.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard icon="settings" title="Your QuickBooks names" description="The file uses your company file's account and item names, and its date order.">
            <Link href="/settings/quickbooks" className={secondary}>Settings → QuickBooks</Link>
            <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">New to this? The step-by-step guide for the accountant is in the Help guides (QuickBooks import).</p>
          </SectionCard>
          <SectionCard icon="layers" title="QuickBooks Online" description="Optional: send invoices, counter sales, payments and credit notes straight to QuickBooks Online.">
            {!page.qbo.serverReady ? (
              <p className="text-sm text-[var(--ejo-text-muted)]" data-testid="qbo-status">Not set up on this server. The CSV files import into QuickBooks Online by hand.</p>
            ) : !page.qbo.connected ? (
              <p className="text-sm text-[var(--ejo-text-muted)]" data-testid="qbo-status">Not connected. The Owner connects it in <Link href="/settings/quickbooks" className="text-[var(--ejo-primary)] underline">Settings → QuickBooks</Link>.</p>
            ) : (
              <form action={sendToQuickBooksOnlineForm} className="space-y-3">
                <p className="text-sm text-[var(--ejo-text)]" data-testid="qbo-status">Connected ({page.qbo.environment === 'production' ? 'live company' : 'sandbox'}){page.qbo.lastUsedAt ? `, last used ${formatDateTime(page.qbo.lastUsedAt)}` : ''}.</p>
                {page.qbo.lastError ? <p className="text-xs text-[var(--ejo-error)]">Last problem: {page.qbo.lastError}</p> : null}
                <input type="hidden" name="from" value={page.range.fromDay} /><input type="hidden" name="to" value={page.range.toDay} />
                <SubmitButton label={`Send ${dmy(page.range.fromDay)} to ${dmy(page.range.toDay)}`} pendingLabel="Sending…" className={primary} />
                <p className="text-xs text-[var(--ejo-text-muted)]">Only what is not there yet is sent. Items and accounts must already exist in QuickBooks Online.</p>
              </form>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
