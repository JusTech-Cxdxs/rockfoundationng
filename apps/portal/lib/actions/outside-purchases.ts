'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@ejo/database';
import { allows, authorize, seeJobCard, NOT_AVAILABLE } from '@/lib/authz/server';
import { STORE_COST_PERMISSIONS } from '@/lib/authz/catalogue';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';

/**
 * What parts and jobs bought outside for a Job Card cost the workshop. The
 * Owner (whoever sees costs) enters and sees it; nobody else's page or action
 * reads it. Business Analytics takes it as the parts or sublet cost.
 */

const COST_KEY = STORE_COST_PERMISSIONS[0]!;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{20,40}$/.test(v);

export type OutsideCostRow = { lineId: string; type: 'EXTERNAL_PART' | 'EXTERNAL_JOB'; description: string; quantity: number; charged: number | null; cost: number | null; supplierName: string | null };

/** The Job Card's outside lines and what each cost; null for anyone who does not see costs. */
export async function listOutsideCosts(jobCardId: string): Promise<OutsideCostRow[] | null> {
  await requireUser();
  await seeJobCard(jobCardId, 'listOutsideCosts');
  const jc = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { branchId: true } });
  if (!jc || !(await allows(COST_KEY, { branchId: jc.branchId }))) return null;
  const lines = await prisma.estimateLineItem.findMany({
    where: { estimate: { jobCardId }, type: { in: ['EXTERNAL_PART', 'EXTERNAL_JOB'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, type: true, description: true, quantity: true, amount: true, outsidePurchase: { select: { cost: true, supplierName: true } } },
  });
  return lines.map((l) => ({
    lineId: l.id, type: l.type as 'EXTERNAL_PART' | 'EXTERNAL_JOB', description: l.description, quantity: l.quantity,
    charged: l.amount === null ? null : Number(l.amount),
    cost: l.outsidePurchase ? Number(l.outsidePurchase.cost) : null, supplierName: l.outsidePurchase?.supplierName ?? null,
  }));
}

/** Records (or corrects) what one outside line cost. */
export async function setOutsideCost(lineId: string, costRaw: number, supplierRaw: string): Promise<void> {
  const user = await requireUser();
  const line = isId(lineId) ? await prisma.estimateLineItem.findUnique({ where: { id: lineId }, select: { id: true, type: true, description: true, estimate: { select: { jobCardId: true } }, outsidePurchase: { select: { cost: true } } } }) : null;
  if (!line || (line.type !== 'EXTERNAL_PART' && line.type !== 'EXTERNAL_JOB')) throw new Error(NOT_AVAILABLE);
  await seeJobCard(line.estimate.jobCardId, 'setOutsideCost');
  const jc = await prisma.jobCard.findUniqueOrThrow({ where: { id: line.estimate.jobCardId }, select: { branchId: true } });
  await authorize(COST_KEY, { branchId: jc.branchId }, 'setOutsideCost', 'Only the Owner enters what outside parts and jobs cost.');
  const cost = Math.round(Number(costRaw) * 100) / 100;
  if (!Number.isFinite(cost) || cost < 0 || cost > 100_000_000) throw new Error('Enter what it cost in naira (0 or more).');
  const supplierName = String(supplierRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
  await prisma.outsidePurchase.upsert({
    where: { estimateLineItemId: line.id },
    update: { cost, supplierName, recordedById: user.id },
    create: { estimateLineItemId: line.id, jobCardId: line.estimate.jobCardId, cost, supplierName, recordedById: user.id },
  });
  await writeAuditLog({ userId: user.id, action: 'job_card.outside_cost_set', entityType: 'JobCard', entityId: line.estimate.jobCardId, metadata: { line: line.description, from: line.outsidePurchase ? Number(line.outsidePurchase.cost) : null, to: cost, supplierName } });
  revalidatePath(`/workshop/job-cards/${line.estimate.jobCardId}`);
}
