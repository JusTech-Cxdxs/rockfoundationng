import { moduleIsOn } from './modules';

/** Departments the workflows depend on — renameable, never switched off. (Every edition's; see systemDepartments.) */
const ALL_SYSTEM_DEPARTMENTS: { slug: string; name: string; why: string }[] = [
  { slug: 'workshop', name: 'Workshop', why: 'Anchors the branch’s workshop (Job Cards, Vehicle Services, numbering).' },
  { slug: 'workshop-passenger', name: 'Passenger Vehicle Workshop', why: 'Job Cards for passenger vehicles route here.' },
  { slug: 'workshop-commercial', name: 'Commercial Vehicle Workshop', why: 'Job Cards for commercial vehicles route here.' },
  { slug: 'store', name: 'Store', why: 'Parts, stock, receipts and releases.' },
];
/** A department of one of these kinds is protected wherever it exists, whichever edition made it. */
export const SYSTEM_DEPARTMENT_SLUGS = new Set(ALL_SYSTEM_DEPARTMENTS.map((d) => d.slug));

/**
 * The standard departments as this edition creates them. With Inventory off
 * (lib/modules.ts) a workshop has no Store
 * department: parts bought for a job are priced on its estimate.
 */
export function systemDepartments(store: boolean = moduleIsOn('inventory')): { slug: string; name: string; why: string }[] {
  return store ? ALL_SYSTEM_DEPARTMENTS : ALL_SYSTEM_DEPARTMENTS.filter((d) => d.slug !== 'store');
}
/** This edition's standard departments (what a new workshop gets, and what the Structure page lists). */
export const SYSTEM_DEPARTMENTS = systemDepartments();
