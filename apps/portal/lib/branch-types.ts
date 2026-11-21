/**
 * What kind of place a branch is, and which work happens there. Pure.
 *
 * Rock Foundation Automobile runs one workshop with its parts store. The
 * kinds stay so the records are ready for more places later: job cards live
 * only on a WORKSHOP branch; a WAREHOUSE keeps stock only; HEAD_OFFICE holds
 * no workshop or store records of its own.
 */

export const BRANCH_TYPES = ['WORKSHOP', 'HEAD_OFFICE', 'WAREHOUSE'] as const;
export type BranchType = (typeof BRANCH_TYPES)[number];
export const isBranchType = (v: unknown): v is BranchType => BRANCH_TYPES.includes(v as BranchType);

export const BRANCH_TYPE_WORDS: Record<BranchType, string> = {
  WORKSHOP: 'Workshop',
  HEAD_OFFICE: 'Head office',
  WAREHOUSE: 'Warehouse',
};

export const BRANCH_TYPE_HINTS: Record<BranchType, string> = {
  WORKSHOP: 'The workshop and its parts store: job cards, goods received, parts requests and counter sales.',
  HEAD_OFFICE: 'Administration, accounts and management. No workshop or store records of its own.',
  WAREHOUSE: 'A parts store with no workshop: goods received and parts issued only.',
};

/** Which branch types each area's records may live on. */
export const AREA_BRANCH_TYPES = {
  /** Job cards and the workshop's own store. */
  workshop: ['WORKSHOP'] as BranchType[],
  /** The parts store: goods receipts, parts requests, stock. */
  store: ['WORKSHOP', 'WAREHOUSE'] as BranchType[],
} as const;
export type BranchArea = keyof typeof AREA_BRANCH_TYPES;

/** Whether records of an area may live on a branch of this type. */
export function branchTypeFits(area: BranchArea, type: BranchType | string | null | undefined): boolean {
  return AREA_BRANCH_TYPES[area].includes(type as BranchType);
}

/** Why a branch of this type cannot hold an area's records, in plain words (null when it can). */
export function branchTypeMismatch(area: BranchArea, branchName: string, type: BranchType | string | null | undefined): string | null {
  if (branchTypeFits(area, type)) return null;
  const words = isBranchType(type) ? BRANCH_TYPE_WORDS[type].toLowerCase() : 'branch';
  const need = AREA_BRANCH_TYPES[area].map((t) => BRANCH_TYPE_WORDS[t].toLowerCase()).join(' or ');
  const what = area === 'store' ? 'store records' : 'workshop records';
  return `${branchName} is ${/^[aeiou]/.test(words) ? 'an' : 'a'} ${words}, so it cannot hold ${what}: they belong on ${/^[aeiou]/.test(need) ? 'an' : 'a'} ${need} branch.`;
}

/**
 * The menu areas whose records live only on certain kinds of branch. Every
 * other area (customers, the gate, analytics, administration…) belongs to
 * the organisation or to every branch. Used by the menu, the dashboard and
 * the branch bar.
 */
export const MODULE_AREA: Record<string, BranchArea> = { workshop: 'workshop', inventory: 'store' };

/** The area a page belongs to, from its address ("/inventory/parts" → "inventory"); null when the page is not tied to a kind of branch. */
export function moduleOfPath(pathname: string | null | undefined): string | null {
  const first = String(pathname ?? '').split('?')[0]!.split('/').filter(Boolean)[0] ?? '';
  return first in MODULE_AREA ? first : null;
}

/** Whether a branch of this type has this area at all. Areas not tied to a kind of branch, and a branch whose type is unknown, always do. */
export function branchHostsModule(moduleKey: string | null | undefined, type: BranchType | string | null | undefined): boolean {
  const area = moduleKey ? MODULE_AREA[moduleKey] : undefined;
  if (!area || !type) return true;
  return branchTypeFits(area, type);
}
