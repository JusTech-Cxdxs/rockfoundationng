/**
 * Which "needs your attention" items are DECISIONS waiting on this person
 * (approve, authorise, decline), as opposed to work to carry out. Plain
 * functions, shared by the Approvals page, the menu badge and the tests.
 * Items are recognised by the id prefixes their sources give them
 * (lib/actions/dashboard.ts, workflow-actions.ts).
 */
import { moduleIsOn } from './modules';

export type ApprovalArea = 'Workshop' | 'Store' | 'Money';

const PREFIXES: [string, ApprovalArea][] = [
  ['cancel-', 'Workshop'],
  ['close-', 'Workshop'],
  ['review-', 'Workshop'],
  ['est-sub-', 'Workshop'],
  ['est-mgr-', 'Workshop'],
  ['prs-hod-', 'Store'],
  ['prs-store-', 'Store'],
  ['cn-', 'Money'],
];

/** The area of an approval item, or null when the item is not a decision. */
export function approvalArea(item: { id: string; title: string }): ApprovalArea | null {
  for (const [prefix, area] of PREFIXES) if (item.id.startsWith(prefix)) return area;
  return null;
}

export function isApproval(item: { id: string; title: string }): boolean {
  return approvalArea(item) !== null;
}

/** Whether an approval area is switched on: the Store's approvals go with the parts Store module (lib/modules.ts). */
export function approvalAreaOn(area: ApprovalArea): boolean {
  if (area === 'Store') return moduleIsOn('inventory');
  return true;
}

export const APPROVAL_AREAS: ApprovalArea[] = (['Workshop', 'Store', 'Money'] as ApprovalArea[]).filter(approvalAreaOn);
