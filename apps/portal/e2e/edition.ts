/**
 * What this edition of the platform switches on — read by the seed, the specs
 * and playwright.config.ts.
 *
 * The D'Phoenix Autocare edition is the vehicle workshop: apps/portal/lib/modules.ts
 * keeps the Store (inventory), Warranty and the assembly plant in code with
 * status DISABLED (off the menu, the dashboard, search, Enyo and the customer
 * portal), and featureOn() switches external procurement, the roadmap,
 * news & media, Speak Up and data requests off. The seed creates no store,
 * warranty or plant roles, so the specs (and the e2e seed's people and
 * fixtures) for them only run when the matching flag is set — E2E_INVENTORY=1,
 * E2E_WARRANTY=1 and so on — against an edition that has them.
 */
export const INVENTORY_ENABLED = process.env.E2E_INVENTORY === '1';
export const INVENTORY_OFF = "The Store (inventory, parts, goods receipts, parts requests) is off in the D'Phoenix edition";

export const WARRANTY_ENABLED = process.env.E2E_WARRANTY === '1';
export const WARRANTY_OFF = "Warranty (policies, registrations, claims) is off in the D'Phoenix edition";

export const PLANT_ENABLED = process.env.E2E_PLANT === '1';
export const PLANT_OFF = "The assembly plant (kits, the line, PDI) is off in the D'Phoenix edition";

/** Buying a part outside the Store (featureOn('externalProcurement')). */
export const EXTERNAL_PROCUREMENT_ENABLED = process.env.E2E_EXTERNAL_PROCUREMENT === '1';
export const EXTERNAL_PROCUREMENT_OFF = "External procurement (EPR) is off in the D'Phoenix edition";

export const NEWS_ENABLED = process.env.E2E_NEWS === '1';
export const NEWS_OFF = "News & media is off in the D'Phoenix edition";

export const DATA_REQUESTS_ENABLED = process.env.E2E_DATA_REQUESTS === '1';
export const DATA_REQUESTS_OFF = "Customers' data requests are off in the D'Phoenix edition";

export const ROADMAP_ENABLED = process.env.E2E_ROADMAP === '1';
export const ROADMAP_OFF = "The roadmap is off in the D'Phoenix edition";

export const SPEAK_UP_ENABLED = process.env.E2E_SPEAK_UP === '1';
export const SPEAK_UP_OFF = "Speak Up is off in the D'Phoenix edition";

/**
 * A separate Vehicle Service flow for new work (featureOn('separateVehicleService')).
 * Off in the D'Phoenix edition: a service is a Job Card with "Service" chosen;
 * old Vehicle Services stay readable by link and search.
 */
export const SEPARATE_VEHICLE_SERVICE = process.env.E2E_SEPARATE_VEHICLE_SERVICE === '1';
export const SEPARATE_VEHICLE_SERVICE_OFF = "New Vehicle Services are off in the D'Phoenix edition (a service is opened as a Job Card with Service chosen)";

/**
 * The demo people and records (lib/demo, docs/DPHOENIX_DEMO.md) live in their
 * own organisation, dphoenix-demo, made only when the platform owner asks
 * (DEMO_STAFF_PASSWORD, `npm run demo:reset`). The demo specs need it loaded
 * first, so they only run with E2E_DEMO=1.
 */
export const DEMO_ENABLED = process.env.E2E_DEMO === '1';
export const DEMO_OFF = 'The demo organisation (dphoenix-demo) is loaded only on request: run npm run demo:reset and set E2E_DEMO=1';

/** The staff portal's addresses that belong to an area switched off above: not found in this edition (their layouts say so), never "Access denied". */
export const OFF_URL_PREFIXES: string[] = [
  ...(INVENTORY_ENABLED ? [] : ['/inventory', '/workshop/parts-requests']),
  ...(EXTERNAL_PROCUREMENT_ENABLED ? [] : ['/workshop/external-procurement']),
  ...(WARRANTY_ENABLED ? [] : ['/warranty']),
  ...(PLANT_ENABLED ? [] : ['/plant']),
  ...(NEWS_ENABLED ? [] : ['/news']),
  ...(DATA_REQUESTS_ENABLED ? [] : ['/data-requests']),
  ...(ROADMAP_ENABLED ? [] : ['/roadmap']),
  ...(SPEAK_UP_ENABLED ? [] : ['/support/speak-up']),
  ...(SEPARATE_VEHICLE_SERVICE ? [] : ['/workshop/vehicle-service/book']),
];
/** Whether an address is in this edition (not under OFF_URL_PREFIXES). */
export const inEdition = (url: string): boolean => !OFF_URL_PREFIXES.some((p) => url === p || url.startsWith(`${p}/`) || url.startsWith(`${p}?`));
