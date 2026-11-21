/**
 * What this edition switches on, for the customer portal (apps/website).
 * Mirrors apps/portal/lib/modules.ts: tests/edition.test.ts fails if the two
 * disagree. D'Phoenix Autocare: no warranty or parts store screens. This
 * app is the customer portal only (the root opens its sign-in): the
 * business has its own website.
 */
export const EDITION_MODULES = {
  workshop: true,
  inventory: false,
  warranty: false,
  plant: false,
} as const;

export function moduleOn(key: keyof typeof EDITION_MODULES): boolean {
  return EDITION_MODULES[key];
}
