import Link from 'next/link';
import { allows, guardAnyPage } from '@/lib/authz/server';
import { listImportJobs } from '@/lib/actions/data-exchange';
import { EDITION_ENTITY_KEYS, ENTITIES, type EntityKey } from '@/lib/data-exchange/fields';
import { bytesText, importStatus } from '@/lib/data-exchange/status';
import { StagingSettings } from '@/components/data-exchange/StagingSettings';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { EmptyState, Icon, PageHeader, ResponsiveTable, SectionCard, StatusChip } from '@/components/ui';
import { ExportAction } from '@/components/ExportAction';
import { DatabaseSpaceCard } from '@/components/data-exchange/DatabaseSpaceCard';

export const dynamic = 'force-dynamic';

const nf = (n: number) => n.toLocaleString('en-NG');

const ICON: Record<EntityKey, 'user' | 'users' | 'car' | 'truck' | 'boxes' | 'package' | 'receipt' | 'wrench' | 'clipboard'> = {
  staff: 'user', customers: 'users', vehicles: 'car', suppliers: 'truck', parts: 'boxes', stock: 'package', invoices: 'receipt', jobs: 'wrench', openJobs: 'clipboard',
};
const importWords = (k: EntityKey) => (k === 'stock' ? 'opening stock' : k === 'invoices' ? 'invoice history' : k === 'jobs' ? 'job card history' : ENTITIES[k].plural);

/** The lists this edition exports from here: the same Export button as on each list, for the whole list. */
const EXPORTS: { kind: string; label: string }[] = [
  { kind: 'customers', label: 'Customers' },
  { kind: 'vehicles', label: 'Vehicles' },
  { kind: 'job-cards', label: 'Job Cards' },
  { kind: 'invoices', label: 'Invoices' },
];

/**
 * Data Exchange: Excel and CSV in and out. Import (the kinds of record this
 * edition switches on, lib/modules.ts), export (the main lists), the
 * templates, and the history of imports. Every file is checked, approved by
 * a second person and can be undone.
 */
export default async function DataExchangePage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  await guardAnyPage(['dataexchange.import.run', 'dataexchange.import.approve'], '/data-exchange');
  const canExport = await allows('dataexchange.export.run');
  const canDocuments = await allows('dataexchange.export.sensitive');
  const { before } = await searchParams;
  const { jobs, canRun, staging, space } = await listImportJobs({ take: 30, before });
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader
        hero
        icon="layers"
        eyebrow="Data Exchange"
        title="Excel in, Excel out"
        description={`Bring records in from an Excel or CSV file — from QuickBooks, an old system or your own spreadsheet — and take any list out to Excel. Every file is checked first, approved by the department that owns the records, and can be undone.`}
      />

      <SectionCard icon="plus" title="Import" description="Choose what to bring in. Load customers before their vehicles, and vehicles before job cards."
        actions={<Link href="/data-exchange/cutover" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Going live? The cut-over checklist →</Link>}>
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {EDITION_ENTITY_KEYS.map((k) => {
            const e = ENTITIES[k];
            return (
              <li key={k} className="flex flex-col justify-between gap-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ejo-text)]"><Icon name={ICON[k]} size={16} /> {e.label}</p>
                  <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Recognised by {e.matchOrder.join(', then ')}.{e.after ? ` Load the ${ENTITIES[e.after].plural} file first.` : ''}</p>
                </div>
                {canRun ? <Link href={`/data-exchange/new?entity=${k}`} className="inline-flex w-fit items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"><Icon name="plus" size={14} /> Import {importWords(k)}</Link> : null}
              </li>
            );
          })}
        </ul>
      </SectionCard>

      {canExport ? (
        <SectionCard icon="download" title="Export" description="The whole list, as Excel (.xlsx) or CSV. Every list in EJO also has its own Export button, which follows its filters and search."
          actions={<Link href="/data-exchange/exports" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Exports made and scheduled →</Link>}>
          <div className="flex flex-wrap gap-3">
            {EXPORTS.map((x) => <ExportAction key={x.kind} kind={x.kind} label={x.label} align="left" />)}
            {canDocuments ? <Link href="/data-exchange/documents" className="inline-flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/60 hover:text-[var(--ejo-primary)]"><Icon name="file" size={16} /> Invoices and receipts as PDF</Link> : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard icon="file" title="Templates" description="An empty file with the right columns: the Excel one has a sheet that explains every column, and dropdowns for the columns with fixed choices. Your own column names also work — they are matched when the file is uploaded." flush>
        <ul className="divide-y divide-[var(--ejo-border)]">
          {EDITION_ENTITY_KEYS.map((k) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm text-[var(--ejo-text)]">{ENTITIES[k].label}</span>
              <span className="flex flex-wrap gap-3 text-sm">
                <a href={`/data-exchange/templates/${k}`} className="inline-flex items-center gap-1.5 font-medium text-[var(--ejo-primary)] hover:underline"><Icon name="download" size={14} /> Excel template</a>
                <a href={`/data-exchange/templates/${k}?format=csv`} className="inline-flex items-center gap-1.5 font-medium text-[var(--ejo-primary)] hover:underline"><Icon name="download" size={14} /> CSV template</a>
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard icon="history" title="History of imports" description="Newest first. Open one to see its check, approval, load and report." flush
        actions={<span className="flex flex-wrap items-center gap-3"><ExportAction kind="imports" label="Export the list" /><Link href="/data-exchange/timeline" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Day by day →</Link></span>}>
        {jobs.length === 0 ? (
          <div className="p-4"><EmptyState icon="inbox" title="No imports yet" compact>Download a template above, or start with your QuickBooks export or spreadsheet: common column names are matched automatically.</EmptyState></div>
        ) : (
          <ResponsiveTable>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-3 font-medium">Import</th>
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Rows</th>
                  <th className="px-4 py-3 text-right font-medium">Added</th>
                  <th className="px-4 py-3 text-right font-medium">Staged file</th>
                  <th className="px-4 py-3 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const st = importStatus(j.status);
                  return (
                    <tr key={j.id} className="border-b border-[var(--ejo-border)] last:border-0">
                      <td className="px-4 py-3"><Link href={`/data-exchange/imports/${j.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{j.number}</Link><span className="block text-xs text-[var(--ejo-text-muted)]">{ENTITIES[j.entity].label}</span></td>
                      <td className="max-w-[16rem] truncate px-4 py-3 text-[var(--ejo-text)]">{j.fileName}</td>
                      <td className="px-4 py-3"><StatusChip label={st.label} tone={st.tone} /></td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--ejo-text)]">{nf(j.fileRows)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--ejo-text)]">{nf(j.createdRows)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--ejo-text)]">{bytesText(j.stagedBytes)}{j.rowsReleasedAt ? <span className="block text-xs text-[var(--ejo-text-muted)]">released</span> : null}</td>
                      <td className="px-4 py-3 text-[var(--ejo-text-muted)]">{j.createdBy}<span className="block text-xs">{formatDateTimeCompact(j.createdAt)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
        {jobs.length === 30 ? <div className="border-t border-[var(--ejo-border)] p-3 text-center"><Link href={`/data-exchange?before=${encodeURIComponent(jobs[jobs.length - 1]!.createdAt.toISOString())}`} className="text-sm font-medium text-[var(--ejo-primary)] hover:underline">View older imports</Link></div> : null}
      </SectionCard>

      <SectionCard icon="layers" title="Space used by staged files" description={`Each import keeps a copy of its file while it is checked, approved and loaded. Once it is finished — and Finance has confirmed the totals, where needed — the copy is released after ${staging.days === 0 ? 'no set period (kept for ever)' : `${staging.days} days`}. The summary, every row’s outcome, rejected rows and what undo needs are kept.`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="text-sm text-[var(--ejo-text)]"><span className="text-2xl font-semibold tabular-nums">{bytesText(staging.totalBytes)}</span> <span className="text-[var(--ejo-text-muted)]">in staged files now</span></p>
          {staging.canSet ? <StagingSettings days={staging.days} /> : null}
        </div>
      </SectionCard>

      <DatabaseSpaceCard space={space} />
    </div>
  );
}
