/**
 * Which "needs your attention" items are DECISIONS waiting on this person
 * (approve, authorise, decline) — as opposed to work to carry out. Plain
 * functions, shared by the Approvals page, the menu badge and the tests.
 * Items are recognised by the id prefixes their sources give them
 * (lib/actions/dashboard.ts, workflow-actions.ts, security.ts, warranty*.ts).
 */
import { featureOn, moduleIsOn } from './modules';

export type ApprovalArea = 'Workshop' | 'Store' | 'Money' | 'Warranty' | 'Security' | 'Plant';

const PREFIXES: [string, ApprovalArea][] = [
  ['service-cancel-', 'Workshop'],
  ['service-close-', 'Workshop'],
  ['service-review-', 'Workshop'],
  ['cancel-', 'Workshop'],
  ['close-', 'Workshop'],
  ['review-', 'Workshop'],
  ['est-sub-', 'Workshop'],
  ['sest-sub-', 'Workshop'],
  ['est-mgr-', 'Workshop'],
  ['sest-mgr-', 'Workshop'],
  ['prs-hod-', 'Store'],
  ['prs-store-', 'Store'],
  ['epr-fin-', 'Money'],
  ['epr-mgr-', 'Money'],
  ['warranty-verify-', 'Warranty'],
  ['policy-delete-', 'Warranty'],
  ['provider-delete-', 'Warranty'],
  ['exitpass-', 'Security'],
  ['roadtest-', 'Security'],
  ['ctr-d-', 'Security'],
  ['pdi-approve-', 'Plant'],
  ['kit-release-', 'Plant'],
  ['gate-pass-', 'Plant'],
  ['defect-verify-', 'Plant'],
];

/** The area of an approval item, or null when the item is not a decision. */
export function approvalArea(item: { id: string; title: string }): ApprovalArea | null {
  // Warranty claims share one prefix for "approve", "submit" and "deadline close".
  if (item.id.startsWith('warranty-claim-')) return item.title.startsWith('Approve') ? 'Warranty' : null;
  for (const [prefix, area] of PREFIXES) if (item.id.startsWith(prefix)) return area;
  return null;
}

export function isApproval(item: { id: string; title: string }): boolean {
  return approvalArea(item) !== null;
}

/** Whether an approval area is part of this edition: Store, Money (outside purchases), Warranty and the plant can be switched off (lib/modules.ts). */
export function approvalAreaOn(area: ApprovalArea): boolean {
  if (area === 'Store') return moduleIsOn('inventory');
  if (area === 'Money') return featureOn('externalProcurement');
  if (area === 'Warranty') return moduleIsOn('warranty');
  if (area === 'Plant') return moduleIsOn('plant');
  return true;
}

export const APPROVAL_AREAS: ApprovalArea[] = (['Workshop', 'Store', 'Money', 'Warranty', 'Security', 'Plant'] as ApprovalArea[]).filter(approvalAreaOn);
