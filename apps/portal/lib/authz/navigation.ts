import { platformModules } from '../modules';
import { branchHostsModule, moduleOfPath } from '../branch-types';
import { isOffPermission } from '../edition';
import { APPROVAL_PERMISSIONS, decide, PAGE_PERMISSIONS, scopeFor, type PermissionKey, type Principal } from './catalogue';

export type NavItem = { key: string; name: string; href: string; status: string };

/** What each module needs to appear in the menu (the pages enforce the same). */
const MODULE_NEEDS: Record<string, PermissionKey[]> = {
  ...Object.fromEntries(Object.entries(PAGE_PERMISSIONS).map(([k, v]) => [k, [v]])),
  workshop: ['workshop.view'],
  inventory: ['store.view'],
  security: ['security.view'],
};
/** Areas everyone signed in uses. */
const EVERYONE = new Set(['dashboard', 'notifications']);

/** The kind of branch a person belongs to, and the kind they are looking at through the branch bar (when one branch is chosen). */
export type BranchView = { ownBranchType?: string | null; lensBranchType?: string | null };

/**
 * Is this area part of the branch in view? The Workshop and Inventory exist
 * only on branches of the right kind:
 *  - looking at ONE branch through the branch bar: only that branch's areas;
 *  - someone who sees the whole organisation in the area (and has not chosen
 *    a branch): always — the organisation has every kind of branch;
 *  - someone whose access is to their own branch: only the areas their
 *    branch has.
 * It only ever hides a menu entry; what a person may do is decided by their
 * permissions, as before.
 */
export function moduleInView(p: Principal, key: string, needs: PermissionKey[], view: BranchView): boolean {
  if (view.lensBranchType) return branchHostsModule(key, view.lensBranchType);
  if (p.isSuperAdmin || needs.some((k) => scopeFor(p, k) === 'ALL')) return true;
  return branchHostsModule(key, view.ownBranchType);
}

/** The permission that opens each branch-bound area. */
export const AREA_VIEW: Record<string, PermissionKey> = { workshop: 'workshop.view', inventory: 'store.view' };

/** Is the page at this address part of the branch in view? (For dashboard tiles and shortcuts: never a link into an area the branch does not have.) */
export function hrefInView(p: Principal, href: string, view: BranchView): boolean {
  const area = moduleOfPath(href);
  return !area || moduleInView(p, area, [AREA_VIEW[area]!], view);
}

/**
 * The menu for one person: the same rule the pages enforce, so nobody is
 * shown a door they cannot open.
 */
export function navigationFor(p: Principal, view: BranchView = {}): NavItem[] {
  const can = (k: PermissionKey) => decide(p, k).allowed;
  const out: NavItem[] = [];
  const hosted = (key: string, needs: PermissionKey[] | undefined) => moduleInView(p, key, needs ?? [], view);
  for (const m of platformModules) {
    // Version 1: modules not yet live, and modules this edition switches off (DISABLED), are not shown to anyone.
    if (m.status !== 'LIVE') continue;
    if (m.key === 'dashboard') {
      out.push({ key: m.key, name: m.name, href: m.href, status: m.status });
      // People who decide things get one list of everything waiting for them.
      if (p.isSuperAdmin || APPROVAL_PERMISSIONS.some((k) => !isOffPermission(k) && can(k))) out.push({ key: 'approvals', name: 'Approvals', href: '/approvals', status: m.status });
      continue;
    }
    if (EVERYONE.has(m.key)) { out.push({ key: m.key, name: m.name, href: m.href, status: m.status }); continue; }
    const needs = MODULE_NEEDS[m.key];
    if ((!needs || needs.some(can)) && hosted(m.key, needs)) out.push({ key: m.key, name: m.name, href: m.href, status: m.status });
    // Customers handed over by Enyo, right under Customers.
    if (m.key === 'crm' && can('support.tickets.manage')) out.push({ key: 'support-inbox', name: 'Support centre', href: '/crm/support', status: m.status });
  }
  // Money: what customers owe (statements, ageing), credit notes and the QuickBooks export.
  if (can('money.statement.view') || can('money.credit_note.request') || can('money.credit_note.approve') || can('money.quickbooks.export')) out.push({ key: 'money', name: 'Money', href: can('money.statement.view') ? '/money/statements' : can('money.quickbooks.export') ? '/money/quickbooks' : '/money/credit-notes', status: 'LIVE' });
  // The workshop's warranty: comebacks, warranty cost and claims to suppliers.
  if (can('workshop.warranty.report') || can('workshop.warranty.claims')) out.push({ key: 'warranty', name: 'Warranty', href: can('workshop.warranty.report') ? '/warranty' : '/warranty/claims', status: 'LIVE' });
  // Everyone's own reminders.
  out.push({ key: 'reminders', name: 'Reminders', href: '/reminders', status: 'LIVE' });
  // Everyone in an organisation can ask for help (the platform team answers, it does not ask).
  if (!p.isSuperAdmin) out.push({ key: 'get-help', name: 'Get help', href: '/support/help', status: 'LIVE' });
  // Data Exchange: those who bring existing records in from other systems and spreadsheets, and those who approve it.
  if (can('dataexchange.import.run') || can('dataexchange.import.approve')) out.push({ key: 'data-exchange', name: 'Data Exchange', href: '/data-exchange', status: 'LIVE' });
  // Exports: everyone else who may export lists finds their files (Data Exchange shows them to its own people).
  else if (can('dataexchange.export.run')) out.push({ key: 'exports', name: 'Exports', href: '/data-exchange/exports', status: 'LIVE' });
  // The integrity watch: reviewers only.
  if (can('integrity.review')) out.push({ key: 'integrity', name: 'Integrity watch', href: '/integrity', status: 'LIVE' });
  return out;
}
