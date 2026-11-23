import { notFound } from 'next/navigation';
import { guardPage } from '@/lib/authz/server';
import { BackLink, PageHeader, SectionCard, StatTile } from '@/components/ui';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { getQuickBooksExport } from '@/lib/actions/quickbooks';
import { EXPORT_KIND_LABEL, type ExportKind } from '@/lib/quickbooks/assemble';
import { naira } from '@/lib/money/rules';
import { formatDateTime } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const MONEY_OF: Partial<Record<ExportKind, string>> = { invoices: 'invoices', counterSales: 'counterSales', payments: 'payments', creditNotes: 'creditNotes', refunds: 'refunds', stockMovements: 'stockMovements' };
const size = (b: number) => (b < 1024 ? `${b} bytes` : `${(b / 1024).toFixed(1)} KB`);

/** One QuickBooks export: what it carried, its totals, and its files to download again. */
export default async function QuickBooksExportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> }) {
  await guardPage('money.quickbooks.export', '/money/quickbooks');
  const { id } = await params;
  const sp = await searchParams;
  const x = await getQuickBooksExport(id);
  if (!x) notFound();
  const kinds = x.kinds.filter((k): k is ExportKind => k in EXPORT_KIND_LABEL);
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <BackLink href="/money/quickbooks" label="QuickBooks" className="mb-4" />
      <PageHeader icon="receipt" title={`Export ${x.number}`} description={`${dmy(x.fromDay)} to ${dmy(x.toDay)} · ${x.format === 'IIF' ? 'QuickBooks Desktop (IIF)' : 'Excel / QuickBooks Online (CSV)'} · made by ${x.createdBy}, ${formatDateTime(x.createdAt)}`} />
      {sp.status === 'created' ? <div className="mb-4"><FormFeedbackBanner kind="success" message="Export made. Download the file and import it into QuickBooks; it stays here if you need it again." /></div> : null}
      <div className="space-y-6">
        <SectionCard icon="download" title="Files" description={x.format === 'IIF' ? 'In QuickBooks Desktop: File → Utilities → Import → IIF Files. Back up the company file first.' : 'Open in Excel, or import in QuickBooks Online (Settings → Import data).'}>
          <ul className="divide-y divide-[var(--ejo-border)]" data-testid="qb-files">
            {x.files.map((f) => (
              <li key={f.name} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="font-mono text-sm text-[var(--ejo-text)]">{f.name} <span className="text-xs text-[var(--ejo-text-muted)]">· {size(f.bytes)}</span></span>
                <a href={`/api/quickbooks/exports/${x.id}/${encodeURIComponent(f.name)}`} className="inline-flex min-h-11 items-center rounded-full bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white hover:opacity-90" download>Download</a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Downloaded {x.downloads} {x.downloads === 1 ? 'time' : 'times'}.{x.sensitive ? ' It holds customers’ contact details: keep it to the accounts computer.' : ''}{x.includeExported ? ' It includes records an earlier export already carried.' : ''}</p>
        </SectionCard>
        <SectionCard icon="chart" title="What it carries" description="Check these against QuickBooks after the import: the same counts and the same totals.">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="qb-export-counts">
            {kinds.map((k) => <StatTile key={k} icon="receipt" label={EXPORT_KIND_LABEL[k]} value={x.counts[k] ?? 0} hint={MONEY_OF[k] ? naira(x.totals[MONEY_OF[k]!] ?? 0) : undefined} />)}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
