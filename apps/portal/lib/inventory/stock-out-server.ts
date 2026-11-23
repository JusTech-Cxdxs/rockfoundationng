import type { Prisma } from '@ejo/database';
import { planQuantityRelease, replayQuantityFifo, type QuantityConsumptionInput } from './quantity-fifo';
import { StaleStateError } from '@/lib/integrity-core';

/**
 * Taking stock out of the store other than on a parts request: a counter
 * sale or a stock count shortfall. Not a server action: the callers check
 * permission and lock the part's stock row (lockRows 'partStockByPart')
 * before calling, inside their transaction. Draws oldest-first and records
 * where every unit came from (PartStockOut), so delivery traces, FIFO costs
 * and the analytics stay exact.
 */

type Tx = Prisma.TransactionClient;
type Link = { kind: 'COUNTER_SALE'; counterSaleLineId: string } | { kind: 'COUNT_SHORTFALL'; stockCountLineId: string };

/**
 * Every draw on a QUANTITY part's deliveries, for the FIFO replay: parts
 * request releases and these stock-outs together, so each delivery's
 * remaining stock is right whichever way the stock left.
 */
export async function quantityDraws(db: Pick<Tx, 'partQuantityConsumption' | 'partStockOut'>, partIds: string[]): Promise<(QuantityConsumptionInput & { partId: string })[]> {
  if (partIds.length === 0) return [];
  const [released, out] = await Promise.all([
    db.partQuantityConsumption.findMany({ where: { partId: { in: partIds } }, select: { id: true, partId: true, consumedAt: true, quantityTaken: true, goodsReceiptLineId: true } }),
    db.partStockOut.findMany({ where: { partId: { in: partIds }, batchId: null, serialId: null }, select: { id: true, partId: true, takenAt: true, quantityTaken: true, goodsReceiptLineId: true } }),
  ]);
  return [
    ...released.map((c) => ({ id: c.id, partId: c.partId, consumedAt: c.consumedAt, quantity: Number(c.quantityTaken), goodsReceiptLineId: c.goodsReceiptLineId })),
    ...out.map((c) => ({ id: c.id, partId: c.partId, consumedAt: c.takenAt, quantity: Number(c.quantityTaken), goodsReceiptLineId: c.goodsReceiptLineId })),
  ];
}

/** Takes `quantity` (base unit) of the part out, FIFO; serial-tracked parts take the named units. */
export async function takeStock(tx: Tx, part: { id: string; name: string; trackingType: string }, quantity: number, link: Link, serialNumbers: string[] = []): Promise<void> {
  const linkData = link.kind === 'COUNTER_SALE' ? { counterSaleLineId: link.counterSaleLineId } : { stockCountLineId: link.stockCountLineId };
  // Compare-and-set on the stock row (already locked by the caller): never below what jobs have reserved.
  const stock = await tx.partStock.findUnique({ where: { partId: part.id }, select: { quantityOnHand: true, quantityReserved: true } });
  if (!stock || Number(stock.quantityOnHand) - Number(stock.quantityReserved) < quantity - 1e-9) {
    throw new StaleStateError(`${part.name}: that much is no longer free in stock — refresh the page and try again.`);
  }
  await tx.partStock.update({ where: { partId: part.id }, data: { quantityOnHand: { decrement: quantity } } });

  if (part.trackingType === 'SERIALIZED') {
    for (const serialNumber of serialNumbers) {
      const unit = await tx.partSerial.findFirst({ where: { partId: part.id, serialNumber, status: 'IN_STOCK' }, select: { id: true, goodsReceiptLineId: true } });
      const taken = unit ? await tx.partSerial.updateMany({ where: { id: unit.id, status: 'IN_STOCK' }, data: { status: 'ISSUED' } }) : { count: 0 };
      if (!unit || taken.count !== 1) throw new StaleStateError(`${part.name}: serial ${serialNumber} is not in stock — check the number, or it was just issued.`);
      await tx.partStockOut.create({ data: { partId: part.id, kind: link.kind, ...linkData, quantityTaken: 1, serialId: unit.id, goodsReceiptLineId: unit.goodsReceiptLineId } });
    }
    return;
  }

  if (part.trackingType === 'BATCH') {
    let left = quantity;
    const batches = await tx.partBatch.findMany({ where: { partId: part.id, remainingQuantity: { gt: 0 } }, orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }], select: { id: true, remainingQuantity: true, goodsReceiptLineId: true } });
    for (const b of batches) {
      if (left <= 1e-9) break;
      const take = Math.min(left, Number(b.remainingQuantity));
      await tx.partBatch.update({ where: { id: b.id }, data: { remainingQuantity: { decrement: take } } });
      await tx.partStockOut.create({ data: { partId: part.id, kind: link.kind, ...linkData, quantityTaken: take, batchId: b.id, goodsReceiptLineId: b.goodsReceiptLineId } });
      left -= take;
    }
    // The stock total is right; batches that do not cover it are an old gap, recorded without a batch.
    if (left > 1e-9) await tx.partStockOut.create({ data: { partId: part.id, kind: link.kind, ...linkData, quantityTaken: left } });
    return;
  }

  // QUANTITY: each delivery is a FIFO layer (lib/inventory/quantity-fifo.ts).
  const [receiptLines, draws] = await Promise.all([
    tx.goodsReceiptLine.findMany({ where: { partId: part.id }, select: { id: true, quantityInBaseUnit: true, goodsReceipt: { select: { receivedAt: true } } } }),
    quantityDraws(tx, [part.id]),
  ]);
  const layers = receiptLines.map((r) => ({ id: r.id, receivedAt: r.goodsReceipt.receivedAt, quantity: Number(r.quantityInBaseUnit) }));
  const current = replayQuantityFifo(layers, draws);
  for (const portion of planQuantityRelease(layers, current.layers, quantity)) {
    await tx.partStockOut.create({ data: { partId: part.id, kind: link.kind, ...linkData, quantityTaken: portion.quantity, goodsReceiptLineId: portion.goodsReceiptLineId } });
  }
}
