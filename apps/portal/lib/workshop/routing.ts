/**
 * Which workshop department a Job Card is filed under. The department follows
 * the work (never the customer's choice): services and repairs go to
 * Mechanical, diagnostics to Electrical and diagnostics, spraying to Body and
 * spraying, washes to Car wash. A branch without that department files the
 * job under its Workshop. Pure, so the rule is tested without a database.
 */
export const WORK_DEPARTMENTS = [
  { slug: 'mechanical', name: 'Mechanical', why: 'Services and repairs are filed here.' },
  { slug: 'electrical', name: 'Electrical and diagnostics', why: 'Diagnostics and electrical faults are filed here.' },
  { slug: 'body-spray', name: 'Body and spraying', why: 'Panel work and spraying are filed here.' },
  { slug: 'car-wash', name: 'Car wash', why: 'Washes are filed here.' },
] as const;

export type WorkDepartmentSlug = (typeof WORK_DEPARTMENTS)[number]['slug'];

/** The anchor department every workshop branch has; the fallback for any job. */
export const WORKSHOP_SLUG = 'workshop';

const BY_KIND: Record<string, WorkDepartmentSlug> = {
  SERVICE: 'mechanical',
  REPAIR: 'mechanical',
  SERVICE_AND_REPAIR: 'mechanical',
  DIAGNOSTICS: 'electrical',
  SPRAYING: 'body-spray',
  CAR_WASH: 'car-wash',
};

/** The department slug for a kind of work; anything unknown is mechanical work. */
export function departmentSlugFor(kind?: string | null): WorkDepartmentSlug {
  return kind && Object.hasOwn(BY_KIND, kind) ? BY_KIND[kind]! : 'mechanical';
}
