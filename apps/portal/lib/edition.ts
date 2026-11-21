import { featureOn, moduleIsOn } from './modules';
import { ROLE_GRANTS, type PermissionKey } from './authz/catalogue';

/**
 * What the D'Phoenix Autocare edition shows of the authorization catalogue
 * (the Zinox pattern, for the modules this edition switches off). Nothing is
 * deleted: permissions, roles and grants stay in code; when their module is
 * off they are left off the Roles, Permissions, Users, IT and Broadcast pages,
 * the approvals lists and the access emails. Pure: safe in server and client
 * code and in tests.
 */

/** Each switched-off area and the permission keys that belong to it. */
const AREA_KEYS: { on: () => boolean; prefixes: string[]; keys: string[] }[] = [
  { on: () => moduleIsOn('inventory'), prefixes: ['store.'], keys: ['sourcing.request', 'analytics.inventory.view'] },
  { on: () => featureOn('externalProcurement'), prefixes: ['procurement.'], keys: [] },
  { on: () => moduleIsOn('warranty'), prefixes: ['warranty.'], keys: ['analytics.warranty.view'] },
  { on: () => moduleIsOn('plant'), prefixes: ['plant.'], keys: ['vehicles.label.print'] },
  { on: () => featureOn('news'), prefixes: [], keys: ['website.news.manage'] },
  { on: () => featureOn('dataRequests'), prefixes: [], keys: ['privacy.requests.manage'] },
];

/** A permission that belongs to an area this edition switches off. */
export function isOffPermission(key: string): boolean {
  return AREA_KEYS.some((a) => !a.on() && (a.keys.includes(key) || a.prefixes.some((p) => key.startsWith(p))));
}

/** Whether a permission is shown to people in this edition. */
export function permissionShown(key: string): boolean {
  return !isOffPermission(key);
}

/**
 * A role whose default grants do nothing in this edition: once the switched-off
 * areas' keys and the read-only ".view" keys are set aside, nothing is left,
 * and it does real work in a switched-off area (Store, Warranty, the plant).
 */
export function isOffOnlyRole(slug: string): boolean {
  const grants = ROLE_GRANTS[slug];
  if (!grants) return false;
  const keys = Object.keys(grants);
  return keys.some((k) => isOffPermission(k) && !k.endsWith('.view')) && keys.every((k) => isOffPermission(k) || k.endsWith('.view'));
}

/** Whether a role is offered and listed in this edition (holders keep it either way). */
export function roleShown(slug: string): boolean {
  return !isOffOnlyRole(slug);
}

/** The permissions people see in this edition, in catalogue order. */
export function shownPermissions<K extends string>(keys: readonly K[]): K[] {
  return keys.filter((k) => permissionShown(k));
}

export type { PermissionKey };
