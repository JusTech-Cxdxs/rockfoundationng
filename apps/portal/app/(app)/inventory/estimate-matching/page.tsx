import { guardAnyPage } from '@/lib/authz/server';
import { listUnmatchedStorePartLines, getStoreBranchId } from '@/lib/actions/store';
import { LoadingLink } from '@/components/LoadingLink';
import { pluralize } from '@/lib/utils/pluralize';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { EmptyState, PageHeader } from '@/components/ui';

const WRENCH_ICON = (
  <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 shrink-0 text-[var(--ejo-warning)]">
    <path
      d="M14.5 3.5a3 3 0 00-3.86 3.86L4 14l2 2 6.64-6.64a3 3 0 003.86-3.86l-2.1 2.1-1.9-.5-.5-1.9 2.1-2.1z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

type MatchingGroup = {
  id: string;
  number: string;
  vehicleId: string;
  vehicleLine: string;
  count: number;
};

/**
 * One queue of Job Cards waiting on the Store. Matching itself happens on
 * each Job Card's own page.
 */
export default async function EstimateMatchingPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await guardAnyPage(['store.view'], '/inventory');
  const { q } = await searchParams;
  const branchId = await getStoreBranchId();
  const jcLines = await listUnmatchedStorePartLines(branchId);

  const groupsById = new Map<string, MatchingGroup>();
  for (const line of jcLines) {
    const jc = line.estimate.jobCard;
    const existing = groupsById.get(`JOB_CARD-${jc.id}`);
    if (existing) {
      existing.count += 1;
    } else {
      groupsById.set(`JOB_CARD-${jc.id}`, {
        id: jc.id,
        number: jc.jobNumber,
        vehicleId: jc.vehicle.id,
        vehicleLine: [jc.vehicle.year, jc.vehicle.make, jc.vehicle.model, jc.vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file',
        count: 1,
      });
    }
  }
  let groups = [...groupsById.values()];
  const query = q?.trim().toLowerCase();
  if (query) {
    groups = groups.filter((g) => g.number.toLowerCase().includes(query) || g.vehicleLine.toLowerCase().includes(query));
  }
  groups.sort((a, b) => a.number.localeCompare(b.number));

  return (
    <div className="p-8">
      <PageHeader
        icon="match"
        back={{ href: "/inventory", label: "Back to Inventory" }}
        title="Estimate Matching"
        description={<>Every Job Card currently waiting on Store — open one to match its own Store Part lines.</>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form className="flex gap-2" action="/inventory/estimate-matching">
          <LiveSearchInput
            type="text" name="q"
            defaultValue={q}
            placeholder="Search Job Card number or vehicle…"
            className="w-72 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
          <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">
            Search
          </button>
        </form>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]"><EmptyState compact icon="match" title="Nothing waiting on Store right now." /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.id} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
              <LoadingLink
                href={`/inventory/estimate-matching/${group.id}`}
                className="block transition hover:opacity-80"
              >
                <div className="flex items-center gap-2">
                  {WRENCH_ICON}
                  <span className="text-sm font-semibold text-[var(--ejo-text)]">{group.number}</span>
                  <span className="rounded-full bg-[var(--ejo-text-muted)]/10 px-2 py-0.5 text-[9px] font-medium uppercase text-[var(--ejo-text-muted)]">
                    Job Card
                  </span>
                </div>
                <span className="mt-3 inline-block rounded-full bg-[var(--ejo-warning)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-warning)]">
                  {pluralize(group.count, 'line')} to match
                </span>
              </LoadingLink>
              <LoadingLink href={`/workshop/vehicles/${group.vehicleId}/edit`} className="mt-1 block pl-7 text-xs text-[var(--ejo-primary)] hover:underline">
                {group.vehicleLine}
              </LoadingLink>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
