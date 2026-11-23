'use server';

import { prisma } from '@ejo/database';
import { allows, authorize, branchWithinReach } from '@/lib/authz/server';
import { STORE_COST_PERMISSIONS } from '@/lib/authz/catalogue';
import { requireUser } from './workshop';
import { getStoreBranchId } from './store';
import { partsReport, reportRange, type Movement } from '@/lib/inventory/parts-report';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
/** A part fitted under warranty, given away or used internally earned nothing (the Business Analytics rule). */
const jobPrice = (li: { unitPrice: unknown; billTo: string | null } | null | undefined) => (li ? (li.billTo && li.billTo !== 'CUSTOMER' ? 0 : num(li.unitPrice)) : null);
const PRICE = { select: { estimateLineItem: { select: { unitPrice: true, billTo: true } } } } as const;

/**
 * The parts store report for the store's branch: parts sold on jobs and over
 * the counter in the period, low stock and slow movers. Costs and profit only
 * for those who see costs; nobody else's report reads a cost.
 */
export async function getPartsReport(period: string) {
  await requireUser();
  await authorize('store.view', undefined, 'getPartsReport');
  const branchId = await branchWithinReach('store.view', await getStoreBranchId());
  const withCosts = (await Promise.all(STORE_COST_PERMISSIONS.map((k) => allows(k, { branchId })))).some(Boolean);
  const now = new Date();
  const range = reportRange(period, now);
  const since = new Date(Math.min(+range.from, +now - 400 * 86400000));
  const cost = withCosts ? { goodsReceiptLine: { select: { unitCost: true } } } : {};
  const [parts, qty, batch, serials, counter, lastCosts] = await Promise.all([
    prisma.part.findMany({ where: { branchId, isActive: true }, select: { id: true, name: true, partNumber: true, category: true, baseUnitOfMeasure: true, reorderPoint: true, stock: { select: { quantityOnHand: true, quantityReserved: true } } } }),
    prisma.partQuantityConsumption.findMany({ where: { part: { branchId }, consumedAt: { gte: since } }, select: { partId: true, consumedAt: true, quantityTaken: true, slipLine: PRICE, ...cost } }),
    prisma.partBatchConsumption.findMany({ where: { batch: { part: { branchId } }, consumedAt: { gte: since } }, select: { consumedAt: true, quantityTaken: true, slipLine: PRICE, batch: { select: { partId: true, ...cost } } } }),
    prisma.partSerial.findMany({ where: { part: { branchId }, issuedToSlipLine: { slip: { releasedAt: { gte: since } } } }, select: { partId: true, ...cost, issuedToSlipLine: { select: { estimateLineItem: { select: { unitPrice: true, billTo: true } }, slip: { select: { releasedAt: true } } } } } }),
    prisma.partStockOut.findMany({ where: { part: { branchId }, kind: 'COUNTER_SALE', takenAt: { gte: since } }, select: { partId: true, takenAt: true, quantityTaken: true, counterSaleLine: { select: { unitPrice: true } }, ...cost } }),
    withCosts ? prisma.goodsReceiptLine.findMany({ where: { part: { branchId }, unitCost: { not: null } }, orderBy: { goodsReceipt: { receivedAt: 'desc' } }, distinct: ['partId'], select: { partId: true, unitCost: true } }) : Promise.resolve([] as { partId: string; unitCost: unknown }[]),
  ]);
  type WithCost = { goodsReceiptLine?: { unitCost: unknown } | null };
  const unitCost = (x: WithCost) => (withCosts ? num(x.goodsReceiptLine?.unitCost) : null);
  const movements: Movement[] = [
    ...qty.map((q) => ({ partId: q.partId, at: q.consumedAt, qty: Number(q.quantityTaken), channel: 'JOB' as const, unitPrice: jobPrice(q.slipLine.estimateLineItem), unitCost: unitCost(q as WithCost) })),
    ...batch.map((b) => ({ partId: b.batch.partId, at: b.consumedAt, qty: Number(b.quantityTaken), channel: 'JOB' as const, unitPrice: jobPrice(b.slipLine.estimateLineItem), unitCost: unitCost(b.batch as WithCost) })),
    ...serials.filter((s) => s.issuedToSlipLine?.slip.releasedAt).map((s) => ({ partId: s.partId, at: s.issuedToSlipLine!.slip.releasedAt as Date, qty: 1, channel: 'JOB' as const, unitPrice: jobPrice(s.issuedToSlipLine!.estimateLineItem), unitCost: unitCost(s as WithCost) })),
    ...counter.map((c) => ({ partId: c.partId, at: c.takenAt, qty: Number(c.quantityTaken), channel: 'COUNTER' as const, unitPrice: num(c.counterSaleLine?.unitPrice), unitCost: unitCost(c as WithCost) })),
  ];
  const lastCost = new Map(lastCosts.map((l) => [l.partId, num(l.unitCost)]));
  const report = partsReport({
    parts: parts.map((p) => ({ id: p.id, name: p.name, partNumber: p.partNumber, category: p.category, unit: p.baseUnitOfMeasure, onHand: Number(p.stock?.quantityOnHand ?? 0), reserved: Number(p.stock?.quantityReserved ?? 0), reorderPoint: num(p.reorderPoint), lastCost: lastCost.get(p.id) ?? null })),
    movements, from: range.from, to: range.to, now, withCosts,
  });
  return { ...report, period: range.key, withCosts };
}
