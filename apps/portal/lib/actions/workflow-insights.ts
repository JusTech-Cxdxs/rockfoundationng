'use server';

import { authorize, myOrganisationId, reachWhere } from '@/lib/authz/server';
import { decisionLog } from '@/lib/insights/decisions';
import { stepPictures, type StepPicture } from '@/lib/insights/decisions-core';
import { moduleIsOn } from '@/lib/modules';

/**
 * How work flows — every approval step of every workflow over a period:
 * volume, how often things are sent back and why, how long they wait, which
 * roles decide, and where Enyo could help (suggest first; a person always
 * decides). Needs analytics.business.view; the person's branch reach and
 * organisation.
 */
export type WorkflowInsights = { days: number; steps: StepPicture[]; total: number };

export async function getWorkflowInsights(input: { days?: number } = {}): Promise<WorkflowInsights> {
  await authorize('analytics.business.view', undefined, 'getWorkflowInsights');
  const organisationId = await myOrganisationId();
  const days = [30, 90, 180, 365].includes(Number(input.days)) ? Number(input.days) : 90;
  if (!organisationId) return { days, steps: [], total: 0 };
  const reach = await reachWhere('analytics.business.view');
  const branchIds = reach.branchId === undefined ? null : typeof reach.branchId === 'string' ? [reach.branchId] : reach.branchId.in;
  // Parts-request steps only while the Store is on (lib/modules.ts).
  const off = (step: string) => step.startsWith('prs_') && !moduleIsOn('inventory');
  const rows = (await decisionLog({ organisationId, since: new Date(Date.now() - days * 86_400_000), branchIds })).filter((r) => !off(r.step));
  return { days, steps: stepPictures(rows), total: rows.length };
}
