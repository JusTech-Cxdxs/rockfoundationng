/**
 * The protected pages and the permission(s) any of which opens them (each
 * page's guardPage), and the pages everyone signed in may open. Shared by
 * the role matrix (e2e/role-matrix.spec.ts), the demo role tour
 * (lib/demo/tour.ts, tests/demo-tour.test.ts) and its e2e proof — so a
 * tour can never promise a page the catalogue refuses, or the reverse.
 */
import { STORE_COST_PERMISSIONS, type PermissionKey } from './catalogue';

/** Protected areas and the permission(s) any of which opens them (from each page's guard). */
export const AREAS: { url: string; needs: PermissionKey[] }[] = [
  { url: '/users', needs: ['admin.users.manage'] },
  { url: '/roles', needs: ['admin.roles.manage'] },
  { url: '/permissions', needs: ['admin.roles.manage'] },
  { url: '/settings', needs: ['admin.settings.manage'] },
  { url: '/organisation', needs: ['admin.organisation.manage'] },
  { url: '/structure', needs: ['admin.structure.manage'] },
  { url: '/branches', needs: ['admin.structure.manage'] },
  { url: '/audit-logs', needs: ['audit.view'] },
  { url: '/recycle-bin', needs: ['admin.recycle_bin.manage'] },
  { url: '/data-exchange', needs: ['dataexchange.import.run', 'dataexchange.import.approve'] },
  { url: '/analytics', needs: ['analytics.business.view'] },
  { url: '/workshop', needs: ['workshop.view'] },
  { url: '/workshop/job-cards', needs: ['workshop.view'] },
  { url: '/workshop/customers', needs: ['workshop.view'] },
  { url: '/workshop/custody', needs: ['workshop.view'] },
  { url: '/workshop/appointments', needs: ['workshop.appointment.view'] },
  { url: '/settings/appointments', needs: ['admin.organisation.manage'] },
  { url: '/workshop/refunds', needs: ['workshop.view'] },
  { url: '/workshop/parts-requests', needs: ['workshop.view'] },
  { url: '/inventory', needs: ['store.view'] },
  { url: '/inventory/parts', needs: ['store.view'] },
  // Goods received: the person who records deliveries, and whoever sees costs.
  { url: '/inventory/goods-receipts', needs: ['store.grn.record', ...STORE_COST_PERMISSIONS] },
  { url: '/inventory/pricing', needs: STORE_COST_PERMISSIONS },
  { url: '/inventory/reports', needs: ['store.view'] },
  { url: '/inventory/counter-sales', needs: ['store.counter.sell', 'workshop.payment.record'] },
  { url: '/inventory/stock-counts', needs: ['store.stock.count', 'store.stock.approve'] },
  { url: '/inventory/estimate-matching', needs: ['store.view'] },
  { url: '/inventory/analytics', needs: ['analytics.inventory.view'] },
  { url: '/money/statements', needs: ['money.statement.view'] },
  { url: '/money/credit-notes', needs: ['money.credit_note.request', 'money.credit_note.approve'] },
  { url: '/money/quickbooks', needs: ['money.quickbooks.export'] },
  { url: '/warranty', needs: ['workshop.warranty.report'] },
  { url: '/warranty/claims', needs: ['workshop.warranty.claims', 'workshop.warranty.report'] },
  { url: '/settings/money', needs: ['admin.organisation.manage'] },
  { url: '/settings/quickbooks', needs: ['money.quickbooks.export'] },
  { url: '/security', needs: ['security.view'] },
  { url: '/security/vehicles', needs: ['security.view'] },
  { url: '/notifications/broadcasts/analytics', needs: ['notifications.broadcast.send'] },
];
/** Everyone signed in may open these. */
export const EVERYONE = ['/dashboard', '/approvals', '/profile', '/notifications'];

