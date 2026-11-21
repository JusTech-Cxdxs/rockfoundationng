import type { PlatformModuleDescriptor } from '@ejo/types';

/**
 * Module registry and the module switches: the in-code mirror of the
 * PlatformModule / OrganisationModule tables. The sidebar, route guards,
 * search, Enyo and the customer portal read it, so switching a module off
 * (status DISABLED) takes it off every one of them; no routing or sidebar
 * code changes. Later upgrades (payroll and HR, vehicle sales, more branches)
 * arrive as new modules here.
 */
export const platformModules: PlatformModuleDescriptor[] = [
  { key: 'dashboard', name: 'Dashboard', status: 'LIVE', href: '/dashboard', icon: 'layout-dashboard' },
  { key: 'workshop', name: 'Workshop', status: 'LIVE', href: '/workshop', icon: 'wrench' },
  { key: 'crm', name: 'Customers', status: 'LIVE', href: '/crm', icon: 'users' },
  { key: 'inventory', name: 'Parts store', status: 'LIVE', href: '/inventory', icon: 'boxes' },
  { key: 'security', name: 'Gate', status: 'LIVE', href: '/security', icon: 'shield' },
  { key: 'analytics', name: 'Business Analytics', status: 'LIVE', href: '/analytics', icon: 'bar-chart' },
  { key: 'notifications', name: 'Notifications', status: 'LIVE', href: '/notifications', icon: 'bell' },
  { key: 'organisation', name: 'Business details', status: 'LIVE', href: '/organisation', icon: 'building' },
  { key: 'structure', name: 'Departments', status: 'LIVE', href: '/structure', icon: 'sitemap' },
  { key: 'users', name: 'Staff', status: 'LIVE', href: '/users', icon: 'user' },
  { key: 'roles', name: 'Roles', status: 'LIVE', href: '/roles', icon: 'shield' },
  { key: 'permissions', name: 'Permissions', status: 'LIVE', href: '/permissions', icon: 'key' },
  { key: 'audit-logs', name: 'Audit Logs', status: 'LIVE', href: '/audit-logs', icon: 'history' },
  { key: 'recycle-bin', name: 'Recycle bin', status: 'LIVE', href: '/recycle-bin', icon: 'trash' },
  { key: 'settings', name: 'Settings', status: 'LIVE', href: '/settings', icon: 'settings' },
];

/** Whether a module is switched on: a DISABLED module stays in code but is off the menu, the dashboard, search, Enyo and the customer portal. */
export function moduleIsOn(key: string): boolean {
  return platformModules.find((m) => m.key === key)?.status !== 'DISABLED';
}
