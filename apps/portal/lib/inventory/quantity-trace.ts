import { prisma } from '@ejo/database';
import { replayQuantityFifo, type QuantityFifoResult } from './quantity-fifo';
import { stockOutPlace } from './stock-out-place';

/**
 * Loads every delivery (goods receipt line) and release for the given
 * QUANTITY-tracked parts and runs the FIFO replay once per part.
 *
 * Not a 'use server' file: it does no authorisation and is only called from
 * loaders that already did. Shared by the Parts Request, Part and Goods
 * Receipt pages so all three show the same trace.
 */

export type QuantityTraceRelease = {
  id: string;
  partId: string;
  consumedAt: Date;
  quantity: number;
  slip: {
    id: string;
    referenceNumber: string;
    sourceNumber: string | null;
    customerName: string | null;
    customerId?: string | null;
  };
  /** Where it went when it was not a parts request (a counter sale or a stock count). */
  href?: string;
};

export type QuantityTraceDelivery = {
  goodsReceiptLineId: string;
  goodsReceiptId: string;
  referenceNumber: string;
  receivedAt: Date;
};

export type QuantityTrace = {
  fifo: QuantityFifoResult;
  releases: QuantityTraceRelease[];
  deliveries: Map<string, QuantityTraceDelivery>;
};

export async function loadQuantityTraces(partIds: string[]): Promise<Map<string, QuantityTrace>> {
  const unique = [...new Set(partIds)];
  const out = new Map<string, QuantityTrace>();
  if (unique.length === 0) return out;

  const [receiptLines, consumptions, stockOuts] = await Promise.all([
    prisma.goodsReceiptLine.findMany({
      where: { partId: { in: unique } },
      select: {
        id: true,
        partId: true,
        quantityInBaseUnit: true,
        goodsReceipt: { select: { id: true, referenceNumber: true, receivedAt: true } },
      },
    }),
    prisma.partQuantityConsumption.findMany({
      where: { partId: { in: unique } },
      select: {
        id: true,
        partId: true,
        consumedAt: true,
        quantityTaken: true,
        goodsReceiptLineId: true,
        slipLine: {
          select: {
            slip: {
              select: {
                id: true,
                referenceNumber: true,
                jobCard: { select: { jobNumber: true, customer: { select: { id: true, fullName: true } } } },
              },
            },
          },
        },
      },
    }),
    // Counter sales and stock count shortfalls draw on the same deliveries.
    prisma.partStockOut.findMany({
      where: { partId: { in: unique }, batchId: null, serialId: null },
      select: { id: true, partId: true, kind: true, takenAt: true, quantityTaken: true, goodsReceiptLineId: true, counterSaleLine: { select: { counterSale: { select: { id: true, number: true, buyerName: true, customerId: true } } } }, stockCountLine: { select: { stockCount: { select: { id: true, number: true } } } } },
    }),
  ]);

  for (const partId of unique) {
    const lines = receiptLines.filter((r: (typeof receiptLines)[number]) => r.partId === partId);
    const cons = consumptions.filter((c: (typeof consumptions)[number]) => c.partId === partId);
    const outs = stockOuts.filter((o: (typeof stockOuts)[number]) => o.partId === partId);
    const fifo = replayQuantityFifo(
      lines.map((r: (typeof lines)[number]) => ({ id: r.id, receivedAt: r.goodsReceipt.receivedAt, quantity: Number(r.quantityInBaseUnit) })),
      [
        ...cons.map((c: (typeof cons)[number]) => ({ id: c.id, consumedAt: c.consumedAt, quantity: Number(c.quantityTaken), goodsReceiptLineId: c.goodsReceiptLineId })),
        ...outs.map((o: (typeof outs)[number]) => ({ id: o.id, consumedAt: o.takenAt, quantity: Number(o.quantityTaken), goodsReceiptLineId: o.goodsReceiptLineId })),
      ],
    );
    const deliveries = new Map<string, QuantityTraceDelivery>();
    for (const r of lines) {
      deliveries.set(r.id, {
        goodsReceiptLineId: r.id,
        goodsReceiptId: r.goodsReceipt.id,
        referenceNumber: r.goodsReceipt.referenceNumber,
        receivedAt: r.goodsReceipt.receivedAt,
      });
    }
    const releases: QuantityTraceRelease[] = cons.map((c: (typeof cons)[number]) => {
      const slip = c.slipLine.slip;
      return {
        id: c.id,
        partId,
        consumedAt: c.consumedAt,
        quantity: Number(c.quantityTaken),
        slip: {
          id: slip.id,
          referenceNumber: slip.referenceNumber,
          sourceNumber: slip.jobCard?.jobNumber ?? null,
          customerName: slip.jobCard?.customer.fullName ?? null,
          customerId: slip.jobCard?.customer.id ?? null,
        },
      };
    });
    for (const o of outs) {
      const place = stockOutPlace(o);
      releases.push({
        id: o.id,
        partId,
        consumedAt: o.takenAt,
        quantity: Number(o.quantityTaken),
        slip: { id: place.id, referenceNumber: place.number, sourceNumber: place.label, customerName: place.customerName, customerId: place.customerId },
        href: place.href,
      });
    }
    out.set(partId, { fifo, releases, deliveries });
  }
  return out;
}

/** The deliveries one set of releases drew from, merged per GRN line —
 * e.g. for one PRS line: "2 from GRN-…01, 3 from GRN-…04". A null
 * delivery means received stock couldn't account for that portion. */
export function sourcesForReleases(
  trace: QuantityTrace | undefined,
  consumptionIds: string[],
): { goodsReceiptLineId: string | null; goodsReceiptId: string | null; referenceNumber: string | null; quantity: number }[] {
  if (!trace) return [];
  const merged = new Map<string, number>();
  for (const id of consumptionIds) {
    for (const a of trace.fifo.allocations.get(id) ?? []) {
      const key = a.goodsReceiptLineId ?? '__none__';
      merged.set(key, Math.round(((merged.get(key) ?? 0) + a.quantity) * 10000) / 10000);
    }
  }
  return [...merged.entries()].map(([key, quantity]) => {
    const delivery = key === '__none__' ? undefined : trace.deliveries.get(key);
    return {
      goodsReceiptLineId: key === '__none__' ? null : key,
      goodsReceiptId: delivery?.goodsReceiptId ?? null,
      referenceNumber: delivery?.referenceNumber ?? null,
      quantity,
    };
  });
}
