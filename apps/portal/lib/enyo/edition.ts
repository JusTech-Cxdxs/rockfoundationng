/**
 * Enyo and the module switches (pure: no database, no session; safe
 * in server code, client code and tests).
 *
 * Each staff tool belongs to a module of lib/modules.ts. A tool whose module
 * is switched off (status DISABLED) is never offered to the model and never
 * picked by keyword routing. The parts and stock tools belong to the Parts
 * store (inventory); everything else belongs to the platform and is always on.
 */
import { moduleIsOn } from '../modules';

/** The module a tool reads (tools not listed belong to the platform and are always on). */
export const TOOL_MODULE: Readonly<Record<string, string>> = {
  // The Parts store: parts, stock and pricing alerts.
  part_lookup: 'inventory', stock_alerts: 'inventory', inventory_overview: 'inventory',
};

/** Whether a tool is offered (its module is switched on). */
export function toolOn(name: string, isOn: (key: string) => boolean = moduleIsOn): boolean {
  const m = TOOL_MODULE[name];
  return !m || isOn(m);
}

/**
 * The wording of shared tools that also name the Store, used while the
 * Store is switched off (the tool files carry the wording with it on).
 */
export const STORE_OFF_DESCRIPTIONS: Readonly<Record<string, string>> = {
  search_records: 'Find any record by reference number (JC-, RF-, INV-, RCT-, VX-, BC-, SUP-), plate, VIN, customer name or phone. Returns grouped hits with links, only what this person may open.',
  my_pending: 'What this person asked for that is still WAITING ON SOMEONE ELSE: Job Cards waiting for the supervisor, estimates waiting for the supervisor or the Owner, close and cancel requests, help requests — each with who has it (name and role), since when, and a link. Use it with daily_brief for "brief me", and for "what am I waiting on", "has my estimate been approved".',
};

/** The model-facing description of a tool: the Store-off wording while the Store is switched off. */
export function editionDescription(name: string, description: string, isOn: (key: string) => boolean = moduleIsOn): string {
  return (!isOn('inventory') && STORE_OFF_DESCRIPTIONS[name]) || description;
}

/** How record numbers look, for the staff prompt (only the records of modules switched on). */
export function referenceHint(isOn: (key: string) => boolean = moduleIsOn): string {
  const refs = [...(isOn('inventory') ? ['PRS-', 'GRN-'] : []), 'RF-', 'INV-', 'RCT-', 'VX-', 'BC-', 'SUP-'];
  return `Reference numbers look like JC-2026-000412 (Job Card), ${refs.join(', ')}.`;
}

/**
 * What is not part of this organisation, for the staff prompt: so Enyo never
 * sends anyone to a page that is switched off.
 */
export function offAreasHint(isOn: (key: string) => boolean = moduleIsOn): string {
  if (isOn('inventory')) return '';
  return 'The Parts store is switched off in this portal (no stock levels, goods receipts or parts requests). Never offer or link to those; if asked, say plainly that they are switched off.';
}
