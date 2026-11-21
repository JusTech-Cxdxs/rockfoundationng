import { moduleIsOn } from './modules';
import { ROLE_GRANTS, type PermissionKey } from './authz/catalogue';

/**
 * What the platform shows of the authorization catalogue while a module is
 * switched off (lib/modules.ts, the module switches). Permissions, roles and
 * grants stay in code; when their module is off they are left off the Roles,
 * Permissions and Users pages, the approvals lists and the access emails, and
 * refused on the server. Pure: safe in server and client code and in tests.
 */

/** Each switchable module and the permission keys that belong to it. */
const AREA_KEYS: { on: () => boolean; prefixes: string[]; keys: string[] }[] = [
  { on: () => moduleIsOn('inventory'), prefixes: ['store.'], keys: ['sourcing.request', 'analytics.inventory.view'] },
  { on: () => moduleIsOn('security'), prefixes: ['security.'], keys: [] },
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
 * and it does real work in a switched-off area (the Store or the gate).
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
