'use server';

import { revalidatePath } from 'next/cache';
import { prisma, type Prisma } from '@ejo/database';
import { allows, authorize, branchWithinReach, canSeeRecord, myOrganisationId, NOT_AVAILABLE } from '@/lib/authz/server';
import type { PermissionKey } from '@/lib/authz/catalogue';
import { requireUser } from './workshop';
import { getStoreBranchId } from './store';
import { writeAuditLog } from '@/lib/workshop-core';
import { lockRows } from '@/lib/integrity';
import { claimed, isUniqueClashOn, retryOnNumberClash } from '@/lib/integrity-core';
import { highestSequence } from '@/lib/recycle-bin/numbers';
import { lagosYear } from '@/lib/utils/format-date';
import { checkCount, hasDifference, planAdjustments, type CountInput, type CountPart } from '@/lib/inventory/stock-count';
import { takeStock } from '@/lib/inventory/stock-out-server';

/**
 * Stock counts: the Store Keeper (or Front Desk while that role is off)
 * counts the shelf; any difference waits for the Owner (Approvals). On
 * approval a shortfall leaves FIFO and a surplus comes in as a goods receipt
 * marked with the count, without a cost until the Owner enters one. The
 * person who counted never approves their own count. No costs are read or
 * returned here.
 */

class CountError extends Error {}

const VIEW_KEYS: PermissionKey[] = ['store.stock.count', 'store.stock.approve'];
async function viewKey(): Promise<PermissionKey> {
  for (const k of VIEW_KEYS) if (await allows(k)) return k;
  return VIEW_KEYS[0]!;
}
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{20,40}$/.test(v);

async function nextNumber(db: Pick<Prisma.TransactionClient, 'stockCount'>): Promise<string> {
  const prefix = `SC-${lagosYear()}-`;
  const latest = await db.stockCount.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  return `${prefix}${String(highestSequence(prefix, [latest?.number]) + 1).padStart(6, '0')}`;
}

async function nextReceiptNumber(db: Pick<Prisma.TransactionClient, 'goodsReceipt'>): Promise<string> {
  const prefix = `GRN-${lagosYear()}-`;
  const latest = await db.goodsReceipt.findFirst({ where: { referenceNumber: { startsWith: prefix } }, orderBy: { referenceNumber: 'desc' }, select: { referenceNumber: true } });
  return `${prefix}${String(highestSequence(prefix, [latest?.referenceNumber]) + 1).padStart(6, '0')}`;
}

export type CountablePart = { id: string; name: string; partNumber: string | null; category: string | null; unit: string; trackingType: 'QUANTITY' | 'BATCH'; onHand: number; reserved: number };

/** The parts to count (quantity and batch parts; serial-tracked parts are counted by serial number). */
export async function listCountableParts(): Promise<CountablePart[]> {
  await requireUser();
  const branchId = await getStoreBranchId();
  await authorize('store.stock.count', { branchId }, 'listCountableParts');
  const rows = await prisma.part.findMany({
    where: { branchId, isActive: true, trackingType: { in: ['QUANTITY', 'BATCH'] } },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    take: 1000,
    select: { id: true, name: true, partNumber: true, category: true, baseUnitOfMeasure: true, trackingType: true, stock: { select: { quantityOnHand: true, quantityReserved: true } } },
  });
  return rows.map((p) => ({ id: p.id, name: p.name, partNumber: p.partNumber, category: p.category, unit: p.baseUnitOfMeasure, trackingType: p.trackingType as 'QUANTITY' | 'BATCH', onHand: Number(p.stock?.quantityOnHand ?? 0), reserved: Number(p.stock?.quantityReserved ?? 0) }));
}

async function countParts(db: Pick<Prisma.TransactionClient, 'part'>, branchId: string, ids: string[]): Promise<Map<string, CountPart>> {
  const rows = await db.part.findMany({ where: { branchId, id: { in: ids } }, select: { id: true, name: true, trackingType: true, baseUnitOfMeasure: true, stock: { select: { quantityOnHand: true, quantityReserved: true } } } });
  return new Map(rows.map((p) => [p.id, { id: p.id, name: p.name, trackingType: p.trackingType, baseUnitOfMeasure: p.baseUnitOfMeasure, onHand: Number(p.stock?.quantityOnHand ?? 0), reserved: Number(p.stock?.quantityReserved ?? 0) }]));
}

/** Records a count. The system figure is read under the stock lock, at the moment the count is sent. */
export async function createStockCount(input: { idempotencyKey?: string; note?: string; lines: CountInput[] }): Promise<{ id: string; number: string; needsApproval: boolean }> {
  const user = await requireUser();
  const branchId = await getStoreBranchId();
  await authorize('store.stock.count', { branchId, homeBranch: true }, 'createStockCount', 'Only the Store Keeper, Front Desk or the Owner can count the stock.');
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new CountError(NOT_AVAILABLE);
  if (input.idempotencyKey) {
    const done = await prisma.stockCount.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, number: true, status: true, branchId: true } });
    if (done && done.branchId === branchId) return { id: done.id, number: done.number, needsApproval: done.status === 'PENDING_APPROVAL' };
  }
  const lines = (input.lines ?? []).filter((l) => isId(l.partId));
  const ids = [...new Set(lines.map((l) => l.partId))];
  const first = checkCount(await countParts(prisma, branchId, ids), lines);
  if (typeof first === 'string') throw new CountError(first);
  const note = String(input.note ?? '').trim().slice(0, 500) || null;
  try {
    const made = await retryOnNumberClash('number', () => prisma.$transaction(async (tx) => {
      await lockRows(tx, 'partStockByPart', first.map((l) => l.partId));
      const counted = checkCount(await countParts(tx, branchId, ids), lines);
      if (typeof counted === 'string') throw new CountError(counted);
      const needsApproval = hasDifference(counted);
      const sc = await tx.stockCount.create({
        data: {
          number: await nextNumber(tx), idempotencyKey: input.idempotencyKey || null, organisationId, branchId, note, countedById: user.id,
          status: needsApproval ? 'PENDING_APPROVAL' : 'NO_DIFFERENCE',
          lines: { create: counted.map((l) => ({ partId: l.partId, systemQuantity: l.systemQuantity, countedQuantity: l.countedQuantity, difference: l.difference, reason: l.reason })) },
        },
        select: { id: true, number: true },
      });
      return { ...sc, needsApproval, differences: counted.filter((l) => l.difference !== 0).length, parts: counted.length };
    }));
    await writeAuditLog({ userId: user.id, action: 'stock_count.recorded', entityType: 'StockCount', entityId: made.id, organisationId, metadata: { number: made.number, parts: made.parts, differences: made.differences } });
    revalidatePath('/inventory/stock-counts');
    return { id: made.id, number: made.number, needsApproval: made.needsApproval };
  } catch (err) {
    if (input.idempotencyKey && isUniqueClashOn(err, 'idempotencyKey')) {
      const done = await prisma.stockCount.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, number: true, status: true, branchId: true } });
      if (done && done.branchId === branchId) return { id: done.id, number: done.number, needsApproval: done.status === 'PENDING_APPROVAL' };
    }
    throw err;
  }
}

/** The Owner's decision. Approving moves the stock by each difference; rejecting moves nothing. */
export async function decideStockCount(id: string, decision: 'APPROVE' | 'REJECT', noteRaw: string): Promise<void> {
  const user = await requireUser();
  const organisationId = await myOrganisationId();
  const sc = isId(id) ? await prisma.stockCount.findFirst({ where: { id, ...(organisationId ? { organisationId } : {}) }, select: { id: true, number: true, branchId: true, organisationId: true, status: true, countedById: true } }) : null;
  if (!sc) throw new CountError(NOT_AVAILABLE);
  await authorize('store.stock.approve', { branchId: sc.branchId }, 'decideStockCount', 'Only the Owner approves stock count differences.');
  if (sc.status !== 'PENDING_APPROVAL') throw new CountError('This count was already decided. Refresh the page.');
  if (sc.countedById === user.id) throw new CountError('You counted this stock, so someone else must approve it.');
  const note = String(noteRaw ?? '').trim().slice(0, 500);
  if (decision === 'REJECT' && note.length < 3) throw new CountError('Say why the count is rejected, so it can be done again properly.');
  if (decision === 'REJECT') {
    claimed(await prisma.stockCount.updateMany({ where: { id: sc.id, status: 'PENDING_APPROVAL' }, data: { status: 'REJECTED', decidedById: user.id, decidedAt: new Date(), decisionNote: note } }), 'This count was just decided by someone else. Refresh the page.');
    await writeAuditLog({ userId: user.id, action: 'stock_count.rejected', entityType: 'StockCount', entityId: sc.id, organisationId: sc.organisationId, metadata: { number: sc.number, note } });
    revalidatePath(`/inventory/stock-counts/${sc.id}`);
    return;
  }
  const moved = await retryOnNumberClash('referenceNumber', () => prisma.$transaction(async (tx) => {
    claimed(await tx.stockCount.updateMany({ where: { id: sc.id, status: 'PENDING_APPROVAL' }, data: { status: 'APPROVED', decidedById: user.id, decidedAt: new Date(), decisionNote: note || null } }), 'This count was just decided by someone else. Refresh the page.');
    const lines = await tx.stockCountLine.findMany({ where: { stockCountId: sc.id }, select: { id: true, partId: true, difference: true, part: { select: { id: true, name: true, trackingType: true, baseUnitOfMeasure: true } } } });
    const changing = lines.filter((l) => Number(l.difference) !== 0);
    await lockRows(tx, 'partStockByPart', changing.map((l) => l.partId));
    const now = new Map((await tx.partStock.findMany({ where: { partId: { in: changing.map((l) => l.partId) } }, select: { partId: true, quantityOnHand: true, quantityReserved: true } })).map((s) => [s.partId, s]));
    const plan = planAdjustments(
      changing.map((l) => ({ partId: l.partId, difference: Number(l.difference) })),
      new Map(changing.map((l) => [l.partId, { name: l.part.name, onHand: Number(now.get(l.partId)?.quantityOnHand ?? 0), reserved: Number(now.get(l.partId)?.quantityReserved ?? 0) }])),
    );
    if (typeof plan === 'string') throw new CountError(plan);
    const surplus = changing.filter((l) => Number(l.difference) > 0);
    for (const l of changing.filter((x) => Number(x.difference) < 0)) {
      await takeStock(tx, l.part, -Number(l.difference), { kind: 'COUNT_SHORTFALL', stockCountLineId: l.id });
    }
    let receipt: string | null = null;
    if (surplus.length > 0) {
      // Stock found on the shelf enters as a delivery from the count: a FIFO layer like any other, its cost for the Owner to enter.
      const grn = await tx.goodsReceipt.create({
        data: { branchId: sc.branchId, referenceNumber: await nextReceiptNumber(tx), supplierName: `Stock count ${sc.number}`, receivedById: user.id, notes: `Found on the shelf at stock count ${sc.number}.`, stockCountId: sc.id },
        select: { id: true, referenceNumber: true },
      });
      receipt = grn.referenceNumber;
      for (const l of surplus) {
        const qty = Number(l.difference);
        const grnLine = await tx.goodsReceiptLine.create({ data: { goodsReceiptId: grn.id, partId: l.partId, quantityReceivedInUnit: qty, unitUsed: l.part.baseUnitOfMeasure, quantityInBaseUnit: qty, batchNumber: l.part.trackingType === 'BATCH' ? `COUNT-${sc.number}` : null }, select: { id: true } });
        if (l.part.trackingType === 'BATCH') {
          await tx.partBatch.create({ data: { partId: l.partId, batchNumber: `COUNT-${sc.number}`, receivedQuantity: qty, remainingQuantity: qty, goodsReceiptLineId: grnLine.id } });
        }
        await tx.partStock.upsert({ where: { partId: l.partId }, update: { quantityOnHand: { increment: qty } }, create: { partId: l.partId, quantityOnHand: qty, quantityReserved: 0 } });
      }
    }
    return { parts: changing.length, receipt };
  }));
  await writeAuditLog({ userId: user.id, action: 'stock_count.approved', entityType: 'StockCount', entityId: sc.id, organisationId: sc.organisationId, metadata: { number: sc.number, partsAdjusted: moved.parts, surplusReceipt: moved.receipt, note: note || undefined } });
  revalidatePath(`/inventory/stock-counts/${sc.id}`);
  revalidatePath('/inventory/parts');
}

export type StockCountRow = { id: string; number: string; status: string; countedAt: Date; countedBy: string; parts: number; differences: number };

export async function listStockCounts(): Promise<StockCountRow[]> {
  await requireUser();
  const branchId = await branchWithinReach(await viewKey(), await getStoreBranchId());
  const rows = await prisma.stockCount.findMany({
    where: { branchId },
    orderBy: { countedAt: 'desc' },
    take: 200,
    select: { id: true, number: true, status: true, countedAt: true, countedBy: { select: { fullName: true } }, lines: { select: { difference: true } } },
  });
  return rows.map((r) => ({ id: r.id, number: r.number, status: r.status, countedAt: r.countedAt, countedBy: r.countedBy.fullName, parts: r.lines.length, differences: r.lines.filter((l) => Number(l.difference) !== 0).length }));
}

/** One count with its lines; whether this person may decide it (the Owner, never the counter). */
export async function getStockCount(id: string) {
  const user = await requireUser();
  if (!isId(id)) return null;
  const organisationId = await myOrganisationId();
  const sc = await prisma.stockCount.findFirst({
    where: { id, ...(organisationId ? { organisationId } : {}) },
    select: {
      id: true, number: true, branchId: true, status: true, note: true, countedAt: true, countedById: true, decidedAt: true, decisionNote: true,
      countedBy: { select: { fullName: true } }, decidedBy: { select: { fullName: true } },
      receipts: { select: { id: true, referenceNumber: true } },
      lines: { orderBy: { part: { name: 'asc' } }, select: { id: true, partId: true, systemQuantity: true, countedQuantity: true, difference: true, reason: true, part: { select: { name: true, partNumber: true, baseUnitOfMeasure: true } } } },
    },
  });
  if (!sc) return null;
  if (!(await canSeeRecord(await viewKey(), { branchId: sc.branchId }, `StockCount:${id}`))) return null;
  const mayDecide = sc.status === 'PENDING_APPROVAL' && sc.countedById !== user.id && (await allows('store.stock.approve', { branchId: sc.branchId }));
  return {
    ...sc, mayDecide,
    lines: sc.lines.map((l) => ({ ...l, systemQuantity: Number(l.systemQuantity), countedQuantity: Number(l.countedQuantity), difference: Number(l.difference) })),
  };
}
