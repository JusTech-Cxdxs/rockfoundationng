import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import { guardAnyPage } from '@/lib/authz/server';
import { listPartRequestSlips } from '@/lib/actions/sourcing';
import { getStoreBranchId } from '@/lib/actions/store';
import { LoadingLink } from '@/components/LoadingLink';
import { pluralize } from '@/lib/utils/pluralize';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { PageHeader } from '@/components/ui';

const STATUS_LABEL: Record<string, string> = {
  PENDING_HOD_APPROVAL: 'Awaiting first approval',
  PENDING_STORE_APPROVAL: 'Awaiting Store approval',
  APPROVED: 'Approved — awaiting release',
  RELEASED: 'Released',
  REJECTED: 'Rejected',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  PENDING_HOD_APPROVAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  PENDING_STORE_APPROVAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  APPROVED: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  RELEASED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  REJECTED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};

/**
 * Parts requests across the branch. The Workshop Supervisor and the Store all
 * work from this list; each slip shows the action for its current stage.
 * Searchable by reference or Job Card number.
 */
export default async function PartsRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await guardAnyPage(['workshop.view'], '/workshop');
  const { q } = await searchParams;
  const branchId = await getStoreBranchId();
  const slips = await listPartRequestSlips(branchId, q);

  return (
    <div className="p-8">
      <PageHeader
        icon="package"
        back={{ href: "/workshop", label: "Back to Workshop" }}
        title="Parts Requests"
        description={<>Every Store Parts request raised across active Job Cards.</>}
      />

      <form className="mb-6 flex gap-2" action="/workshop/parts-requests">
        <LiveSearchInput
          type="search" name="q"
          defaultValue={q ?? ''}
          placeholder="Search by reference or Job Card number…"
          className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button
          type="submit"
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
        >
          Search
        </button>
        {q ? (
          <LoadingLink
            href="/workshop/parts-requests"
            className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
          >
            Clear
          </LoadingLink>
        ) : null}
      </form>

      {slips.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">{q ? 'No parts requests match your search.' : 'No parts requests raised yet.'}</p>
      ) : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Job Card / Service</th>
                <th className="px-4 py-2">Requested By</th>
                <th className="px-4 py-2">Lines</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((slip: (typeof slips)[number]) => (
                <tr key={slip.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className="px-4 py-2">
                    <LoadingLink href={`/workshop/parts-requests/${slip.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                      {slip.referenceNumber}
                    </LoadingLink>
                  </td>
                  <td data-label="Job Card / Service" className="px-4 py-2">
                    {slip.jobCard ? (
                      <LoadingLink href={`/workshop/job-cards/${slip.jobCard.id}`} className="text-[var(--ejo-primary)] hover:underline">
                        {slip.jobCard.jobNumber}
                      </LoadingLink>
                    ) : (
                      <span className="text-[var(--ejo-text-muted)]">—</span>
                    )}
                  </td>
                  <td data-label="Requested By" className="px-4 py-2 text-[var(--ejo-text-muted)]">{slip.requestedBy.fullName}</td>
                  <td data-label="Lines" className="px-4 py-2 text-[var(--ejo-text-muted)]">{pluralize(slip.lines.length, 'line')}</td>
                  <td data-label="Status" className="px-4 py-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[slip.status] ?? 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]'}`}>
                      {STATUS_LABEL[slip.status] ?? slip.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
