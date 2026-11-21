import type { PlatformModuleDescriptor } from '@ejo/types';

/**
 * Module registry: the in-code mirror of the PlatformModule /
 * OrganisationModule tables. The sidebar and route guards read it, so
 * activating a module means changing its status here; no routing or sidebar
 * code changes.
 *
 * The modules below are live in version 1. Planned modules (HR, Payroll,
 * Finance, Procurement, Suppliers, Warehouse, Manufacturing, Sales,
 * Documents, Reports, …) are on the Roadmap (lib/roadmap.ts), shown in the
 * "Coming next" menu section with a page describing each.
 */
export const platformModules: PlatformModuleDescriptor[] = [
  { key: 'dashboard', name: 'Dashboard', status: 'LIVE', href: '/dashboard', icon: 'layout-dashboard' },
  { key: 'organisation', name: 'Organisation', status: 'LIVE', href: '/organisation', icon: 'building' },
  { key: 'structure', name: 'Structure', status: 'LIVE', href: '/structure', icon: 'sitemap' },
  { key: 'branches', name: 'Branches', status: 'LIVE', href: '/branches', icon: 'network' },
  { key: 'users', name: 'Users', status: 'LIVE', href: '/users', icon: 'user' },
  { key: 'roles', name: 'Roles', status: 'LIVE', href: '/roles', icon: 'shield' },
  { key: 'permissions', name: 'Permissions', status: 'LIVE', href: '/permissions', icon: 'key' },
  { key: 'workshop', name: 'Workshop', status: 'LIVE', href: '/workshop', icon: 'wrench' },
  { key: 'crm', name: 'Customers', status: 'LIVE', href: '/crm', icon: 'users' },
  // Not part of the D'Phoenix Autocare edition (kept in code, off the menu,
  // the dashboard, search, Enyo and the customer portal). Switching one back on is this one line.
  { key: 'inventory', name: 'Inventory', status: 'DISABLED', href: '/inventory', icon: 'boxes' },
  { key: 'warranty', name: 'Warranty', status: 'DISABLED', href: '/warranty', icon: 'shield' },
  { key: 'plant', name: 'Assembly plant', status: 'DISABLED', href: '/plant', icon: 'factory' },
  { key: 'security', name: 'Security', status: 'LIVE', href: '/security', icon: 'shield' },
  { key: 'scheduling', name: 'Scheduling', status: 'LIVE', href: '/schedule', icon: 'calendar' },
  { key: 'analytics', name: 'Business Analytics', status: 'LIVE', href: '/analytics', icon: 'bar-chart' },
  { key: 'notifications', name: 'Notifications', status: 'LIVE', href: '/notifications', icon: 'bell' },
  { key: 'audit-logs', name: 'Audit Logs', status: 'LIVE', href: '/audit-logs', icon: 'history' },
  { key: 'recycle-bin', name: 'Recycle bin', status: 'LIVE', href: '/recycle-bin', icon: 'trash' },
  { key: 'settings', name: 'Settings', status: 'LIVE', href: '/settings', icon: 'settings' },
];

/** Whether a module is switched on in this edition: a DISABLED module stays in code but is off the menu, the dashboard, search, Enyo and the customer portal. */
export function moduleIsOn(key: string): boolean {
  return platformModules.find((m) => m.key === key)?.status !== 'DISABLED';
}

/**
 * Parts of the platform that are not menu modules, switched per edition.
 * D'Phoenix Autocare: no SAP link (Zoho and spreadsheets come in through Data
 * Exchange), no outside-purchase approvals (parts bought outside are priced on
 * the estimate), no roadmap, news, speak-up or data-request pages.
 */
export const EDITION_FEATURES = {
  sap: false,
  externalProcurement: false,
  roadmap: false,
  news: false,
  speakUp: false,
  dataRequests: false,
  // A separate Vehicle Service flow for new work: services are opened as a
  // Job Card with Service ticked; old Vehicle Services stay readable.
  separateVehicleService: false,
} as const;
export type EditionFeature = keyof typeof EDITION_FEATURES;

export function featureOn(feature: EditionFeature): boolean {
  return EDITION_FEATURES[feature];
}

/**
 * The system a record was brought in from, in words: "SAP" for a record from
 * SAP while this edition links with SAP, otherwise "the old system" (Zoho, a
 * spreadsheet or whatever was used before EJO).
 */
export function oldSystemName(externalSource?: string | null, sap: boolean = featureOn('sap')): string {
  return sap && !String(externalSource ?? 'SAP').toUpperCase().startsWith('LEGACY') ? 'SAP' : 'the old system';
}
