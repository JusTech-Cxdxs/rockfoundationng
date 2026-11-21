import Link from 'next/link';
import { EmptyState } from '@/components/ui';
import { BRANCH_TYPE_WORDS, isBranchType } from '@/lib/branch-types';

const AREA: Record<'workshop' | 'inventory', { name: string; holds: string; at: string }> = {
  workshop: { name: 'Workshop', holds: 'Job cards, estimates and refunds', at: 'a workshop branch' },
  inventory: { name: 'Inventory', holds: 'Parts, goods received, suppliers and prices', at: 'a branch with a parts store (a workshop or a warehouse)' },
};

/**
 * Shown in place of an area a person's own branch does not have (reached by a
 * pasted link or an old bookmark; the menu never offers it). It says why in
 * plain words and where to go, and shows none of the area's records.
 */
export function AreaNotHere({ area, branchName, branchType }: { area: 'workshop' | 'inventory'; branchName: string; branchType: string }) {
  const a = AREA[area];
  const kind = isBranchType(branchType) ? BRANCH_TYPE_WORDS[branchType].toLowerCase() : 'branch';
  return (
    <div className="w-full p-4 sm:p-8">
      <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]" data-testid="area-not-here" data-area={area}>
        <EmptyState icon="building" title={`${branchName} has no ${a.name}.`}>
          <span className="block">{a.holds} are kept at {a.at}. Your account is placed at {branchName} ({kind}), so there is nothing of yours to show here.</span>
          <span className="mt-2 block">If your work is at another branch, ask an administrator to move your account to it.</span>
          <span className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href="/dashboard" className="ejo-press rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white">Back to the dashboard</Link>
          </span>
        </EmptyState>
      </div>
    </div>
  );
}
