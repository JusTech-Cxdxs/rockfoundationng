/**
 * Enyo in this edition of the platform (pure: no database, no session; safe
 * in server code, client code and tests).
 *
 * Each staff tool belongs to a module of lib/modules.ts. A tool whose module
 * is switched off (status DISABLED) is never offered to the model and never
 * picked by keyword routing. In the D'Phoenix Autocare edition the Store
 * (inventory), Warranty and the assembly plant are off, so the parts, stock
 * and warranty tools stay in code but out of Enyo's reach; the workshop,
 * customers, security, scheduling and analytics tools stay on.
 */
import { featureOn, moduleIsOn, type EditionFeature } from '../modules';

/** The module a tool reads (tools not listed belong to the platform and are always on). */
export const TOOL_MODULE: Readonly<Record<string, string>> = {
  // The Store: parts, stock, pricing alerts and reorder suggestions.
  part_lookup: 'inventory', stock_alerts: 'inventory', inventory_overview: 'inventory', parts_to_reorder: 'inventory',
  // Warranty: warranties ending and open claims.
  warranty_watch: 'warranty',
};

/** Tools that belong to a switched-off feature rather than a module (none in this edition). */
export const TOOL_FEATURE: Readonly<Record<string, EditionFeature>> = {};

/** Whether a tool is offered in this edition. */
export function toolOn(name: string, isOn: (key: string) => boolean = moduleIsOn, has: (f: EditionFeature) => boolean = featureOn): boolean {
  const m = TOOL_MODULE[name];
  const f = TOOL_FEATURE[name];
  return (!m || isOn(m)) && (!f || has(f));
}

/**
 * This edition's wording of shared tools that also name the Store, Warranty
 * or outside purchases (the tool files carry the full platform's wording,
 * used while those are on).
 */
export const EDITION_DESCRIPTIONS: Readonly<Record<string, string>> = {
  search_records: 'Find any record by reference number (JC-, SV-, RF-, VIS-, EP-, VX-, RT-, INC-, DLV-, CTR-, APT-, BC-), plate, VIN, customer name or phone. Returns grouped hits with links, only what this person may open.',
  my_pending: 'What this person asked for that is still WAITING ON SOMEONE ELSE: Job Cards and Vehicle Services waiting for the supervisor, estimates waiting for the supervisor or the Manager, exit passes, close and cancel requests, road tests, help requests — each with who has it (name and role), since when, and a link. Use it with daily_brief for "brief me", and for "what am I waiting on", "has my estimate been approved", "where is my exit pass".',
  likely_estimate_lines: 'For a Job Card or Vehicle Service (by its number) that the person can see: the estimate lines similar finished jobs usually needed — each with how many similar jobs had it, a confidence, the usual quantity, the parts similar jobs needed (priced on the estimate), and what similar jobs charged for labour — plus the similar jobs behind it. These are suggestions only: nothing is added to the estimate. To use one, the supervisor or technician presses Add on the "Likely lines from similar jobs" card or adds it with the normal form.',
  branch_briefing: 'A complete briefing for leadership on the whole organisation or one branch: every branch side by side this month (jobs opened and finished, money collected, vehicles in the workshop and ready, decisions waiting and the oldest, customer requests, turnaround, health and why), the money (sales, gross profit and margin, takings, what the sales are made of: labour, parts, outside work, sundry), the workshop now (Job Cards and Vehicle Services in, ready, waiting for parts or the customer), decisions waiting by queue, the team (who needs attention, who is strong), and what to look at first. Use it for "brief me", "how is <branch> doing", "give me the overview". Needs Business analytics.',
};

/** The model-facing description of a tool in this edition: this edition's wording while the Store or Warranty is off. */
export function editionDescription(name: string, description: string, isOn: (key: string) => boolean = moduleIsOn): string {
  const full = isOn('inventory') && isOn('warranty') && featureOn('externalProcurement');
  return (!full && EDITION_DESCRIPTIONS[name]) || description;
}

/** How record numbers look, for the staff prompt (only the records this edition keeps). */
export function referenceHint(isOn: (key: string) => boolean = moduleIsOn, outsidePurchases = featureOn('externalProcurement')): string {
  const refs = [
    'SV-… (Vehicle Service)',
    ...(isOn('inventory') ? ['PRS-', 'GRN-'] : []),
    ...(outsidePurchases ? ['EPR-'] : []),
    'RF-',
    ...(isOn('warranty') ? ['WR-', 'WC-'] : []),
    'VIS-', 'EP-', 'VX-', 'RT-', 'INC-', 'DLV-', 'CTR-', 'APT-', 'BC-',
  ];
  return `Reference numbers look like JC-2026-000412 (Job Card), ${refs.join(', ')}.`;
}

/**
 * What is not part of this organisation, for the staff prompt: so Enyo never
 * sends anyone to a Store, Warranty, plant or SAP page that is switched off.
 */
export function offAreasHint(isOn: (key: string) => boolean = moduleIsOn, has: (f: 'sap' | 'news') => boolean = featureOn): string {
  const off = [
    isOn('inventory') ? null : 'a parts Store or inventory (no stock levels, goods receipts or parts requests from a Store)',
    isOn('warranty') ? null : 'a Warranty desk (no warranty registrations or warranty claims)',
    isOn('plant') ? null : 'an assembly plant',
    has('sap') ? null : 'an SAP link (records come in through Data Exchange)',
    has('news') ? null : 'a News & media desk',
  ].filter(Boolean) as string[];
  if (!off.length) return '';
  return `This organisation does not use ${off.length === 1 ? off[0] : `${off.slice(0, -1).join('; ')}; or ${off.at(-1)}`}. Never offer or link to those; if asked, say plainly that they are not part of this portal.`;
}
