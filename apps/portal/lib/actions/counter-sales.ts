'use server';

import { revalidatePath } from 'next/cache';
import { prisma, type Prisma } from '@ejo/database';
import { allows, authorize, branchWithinReach, canSeeRecord, myOrganisationId, orgWhere, NOT_AVAILABLE } from '@/lib/authz/server';
import type { PermissionKey } from '@/lib/authz/catalogue';
import { requireUser } from './workshop';
import { getStoreBranchId } from './store';
import { writeAuditLog } from '@/lib/workshop-core';
import { lockRows } from '@/lib/integrity';
import { isUniqueClashOn, retryOnNumberClash } from '@/lib/integrity-core';
import { highestSequence } from '@/lib/recycle-bin/numbers';
import { lagosYear } from '@/lib/utils/format-date';
import { BILLING_SETTINGS_SELECT } from '@/lib/estimate-billing';
import { checkBuyer, checkSaleLines, isPaymentMethod, saleFigures, type CounterSaleLineInput, type CounterSalePart } from '@/lib/inventory/counter-sale';
import { takeStock } from '@/lib/inventory/stock-out-server';

/**
 * Counter sales: parts sold over the counter without a Job Card (Store
 * Keeper or Front Desk), paid in full. Stock leaves FIFO in the same
 * transaction as the sale, under the part's stock lock, so two sales can
 * never sell the same last unit. Selling prices only: nothing here reads or
 * returns a cost.
 */

class SaleError extends Error {}

/** Who may see counter sales: those who make them, and those who look after the money. */
const VIEW_KEYS: PermissionKey[] = ['store.counter.sell', 'workshop.payment.record'];
async function viewKey(): Promise<PermissionKey> {
  for (const k of VIEW_KEYS) if (await allows(k)) return k;
  return VIEW_KEYS[0]!;
}

const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{20,40}$/.test(v);

async function nextSaleNumber(db: Pick<typeof prisma, 'counterSale'>): Promise<string> {
  const prefix = `CS-${lagosYear()}-`;
  const latest = await db.counterSale.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  return `${prefix}${String(highestSequence(prefix, [latest?.number]) + 1).padStart(6, '0')}`;
}

export type SalePartOption = { id: string; name: string; partNumber: string | null; unit: string; trackingType: 'QUANTITY' | 'BATCH' | 'SERIALIZED'; sellingPrice: number | null; available: number; serials: string[] };

/** Parts the counter can sell: active, with what is free in stock and the selling price (never a cost). */
export async function searchSaleParts(query: string): Promise<SalePartOption[]> {
  await requireUser();
  const branchId = await getStoreBranchId();
  await authorize('store.counter.sell', { branchId }, 'searchSaleParts');
  const q = String(query ?? '').trim().slice(0, 60);
  const parts = await prisma.part.findMany({
    where: { branchId, isActive: true, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { partNumber: { contains: q, mode: 'insensitive' } }, { barcode: { equals: q } }] } : {}) },
    orderBy: { name: 'asc' },
    take: 25,
    select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true, trackingType: true, sellingPrice: true, stock: { select: { quantityOnHand: true, quantityReserved: true } }, serials: { where: { status: 'IN_STOCK' }, orderBy: { receivedAt: 'asc' }, take: 50, select: { serialNumber: true } } },
  });
  return parts.map((p) => ({
    id: p.id, name: p.name, partNumber: p.partNumber, unit: p.baseUnitOfMeasure, trackingType: p.trackingType,
    sellingPrice: p.sellingPrice === null ? null : Number(p.sellingPrice),
    available: Math.max(0, Number(p.stock?.quantityOnHand ?? 0) - Number(p.stock?.quantityReserved ?? 0)),
    serials: p.trackingType === 'SERIALIZED' ? p.serials.map((s) => s.serialNumber) : [],
  }));
}

export type NewCounterSale = {
  idempotencyKey?: string;
  customerId?: string | null;
  buyerName?: string;
  buyerPhone?: string;
  lines: CounterSaleLineInput[];
  paymentMethod: string;
  paymentReference?: string;
  notes?: string;
};

async function saleParts(db: Pick<Prisma.TransactionClient, 'part'>, branchId: string, partIds: string[]): Promise<Map<string, CounterSalePart>> {
  const rows = await db.part.findMany({
    where: { branchId, id: { in: partIds } },
    select: { id: true, name: true, isActive: true, trackingType: true, baseUnitOfMeasure: true, sellingPrice: true, partNumber: true, stock: { select: { quantityOnHand: true, quantityReserved: true } } },
  });
  return new Map(rows.map((p) => [p.id, {
    id: p.id, name: p.name, isActive: p.isActive, trackingType: p.trackingType, baseUnitOfMeasure: p.baseUnitOfMeasure,
    sellingPrice: p.sellingPrice === null ? null : Number(p.sellingPrice),
    available: Number(p.stock?.quantityOnHand ?? 0) - Number(p.stock?.quantityReserved ?? 0),
  }]));
}

/** Makes the sale: checks it, takes the stock and records the payment in one step. */
export async function createCounterSale(input: NewCounterSale): Promise<{ id: string; number: string }> {
  const user = await requireUser();
  const branchId = await getStoreBranchId();
  await authorize('store.counter.sell', { branchId, homeBranch: true }, 'createCounterSale', 'Only the Store Keeper, Front Desk or the Owner can sell parts over the counter.');
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new SaleError(NOT_AVAILABLE);

  if (input.idempotencyKey) {
    const done = await prisma.counterSale.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, number: true, branchId: true } });
    if (done && done.branchId === branchId) return { id: done.id, number: done.number };
  }
  if (!isPaymentMethod(input.paymentMethod)) throw new SaleError('Choose how the buyer paid.');
  const customer = input.customerId && isId(input.customerId)
    ? await prisma.customer.findFirst({ where: { AND: [await orgWhere(), { id: input.customerId, organisationId }] }, select: { id: true, fullName: true, phone: true } })
    : null;
  if (input.customerId && !customer) throw new SaleError('That customer could not be found. Choose them again.');
  const buyer = checkBuyer({ customerId: customer?.id ?? null, customerName: customer?.fullName, buyerName: input.buyerName, buyerPhone: input.buyerPhone || customer?.phone });
  if (typeof buyer === 'string') throw new SaleError(buyer);
  const lines = (input.lines ?? []).filter((l) => isId(l.partId));
  const partIds = [...new Set(lines.map((l) => l.partId))];
  const first = checkSaleLines(await saleParts(prisma, branchId, partIds), lines);
  if (typeof first === 'string') throw new SaleError(first);
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: BILLING_SETTINGS_SELECT });
  const reference = String(input.paymentReference ?? '').trim().slice(0, 80) || null;
  const notes = String(input.notes ?? '').trim().slice(0, 500) || null;

  try {
    const sale = await retryOnNumberClash('number', () => prisma.$transaction(async (tx) => {
      // The parts' stock rows, locked in a fixed order: two sales of the same part queue.
      await lockRows(tx, 'partStockByPart', partIds);
      const checked = checkSaleLines(await saleParts(tx, branchId, partIds), lines);
      if (typeof checked === 'string') throw new SaleError(checked);
      const figures = saleFigures(checked, org ? { vatEnabled: org.vatEnabled, vatRate: org.vatRate } : null);
      const made = await tx.counterSale.create({
        data: {
          number: await nextSaleNumber(tx), idempotencyKey: input.idempotencyKey || null, organisationId, branchId,
          customerId: buyer.customerId, buyerName: buyer.name, buyerPhone: buyer.phone,
          subtotal: figures.subtotal, vatRate: figures.vatRate, vatAmount: figures.vatAmount, vatNumber: figures.vatRate > 0 ? org?.vatNumber ?? null : null, total: figures.total,
          paymentMethod: input.paymentMethod as 'CASH' | 'BANK_TRANSFER', paymentReference: reference, notes, soldById: user.id,
        },
        select: { id: true, number: true, total: true },
      });
      const partsById = await tx.part.findMany({ where: { id: { in: partIds } }, select: { id: true, name: true, trackingType: true, partNumber: true } });
      for (const l of checked) {
        const part = partsById.find((p) => p.id === l.partId)!;
        const line = await tx.counterSaleLine.create({
          data: { counterSaleId: made.id, partId: l.partId, description: l.description, partNumber: part.partNumber, unitOfMeasure: l.unitOfMeasure, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount, serialNumbers: l.serialNumbers },
          select: { id: true },
        });
        await takeStock(tx, part, l.quantity, { kind: 'COUNTER_SALE', counterSaleLineId: line.id }, l.serialNumbers);
      }
      return made;
    }));
    await writeAuditLog({ userId: user.id, action: 'counter_sale.made', entityType: 'CounterSale', entityId: sale.id, organisationId, metadata: { number: sale.number, total: Number(sale.total), lines: first.length, method: input.paymentMethod, walkIn: !buyer.customerId } });
    revalidatePath('/inventory/counter-sales');
    revalidatePath('/inventory/parts');
    return { id: sale.id, number: sale.number };
  } catch (err) {
    if (input.idempotencyKey && isUniqueClashOn(err, 'idempotencyKey')) {
      const done = await prisma.counterSale.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, number: true, branchId: true } });
      if (done && done.branchId === branchId) return { id: done.id, number: done.number };
    }
    throw err;
  }
}

export type CounterSaleRow = { id: string; number: string; buyerName: string; customerId: string | null; total: number; paymentMethod: string; soldAt: Date; soldBy: string; lines: number };

/** The branch's counter sales, newest first, with an optional search by number, buyer or part. */
export async function listCounterSales(search?: string): Promise<CounterSaleRow[]> {
  await requireUser();
  const key = await viewKey();
  const branchId = await branchWithinReach(key, await getStoreBranchId());
  const q = String(search ?? '').trim().slice(0, 60);
  const rows = await prisma.counterSale.findMany({
    where: { branchId, ...(q ? { OR: [{ number: { contains: q, mode: 'insensitive' } }, { buyerName: { contains: q, mode: 'insensitive' } }, { buyerPhone: { contains: q } }, { lines: { some: { description: { contains: q, mode: 'insensitive' } } } }] } : {}) },
    orderBy: { soldAt: 'desc' },
    take: 200,
    select: { id: true, number: true, buyerName: true, customerId: true, total: true, paymentMethod: true, soldAt: true, soldBy: { select: { fullName: true } }, _count: { select: { lines: true } } },
  });
  return rows.map((r) => ({ id: r.id, number: r.number, buyerName: r.buyerName, customerId: r.customerId, total: Number(r.total), paymentMethod: r.paymentMethod, soldAt: r.soldAt, soldBy: r.soldBy.fullName, lines: r._count.lines }));
}

/** One counter sale, as the receipt shows it. Null when it is not this person's to see. */
export async function getCounterSale(id: string) {
  await requireUser();
  if (!isId(id)) return null;
  const organisationId = await myOrganisationId();
  const sale = await prisma.counterSale.findFirst({
    where: { id, ...(organisationId ? { organisationId } : {}) },
    select: {
      id: true, number: true, branchId: true, customerId: true, buyerName: true, buyerPhone: true, subtotal: true, vatRate: true, vatAmount: true, vatNumber: true, total: true,
      paymentMethod: true, paymentReference: true, notes: true, soldAt: true, soldBy: { select: { fullName: true } },
      lines: { orderBy: { id: 'asc' }, select: { id: true, partId: true, description: true, partNumber: true, unitOfMeasure: true, quantity: true, unitPrice: true, amount: true, serialNumbers: true } },
    },
  });
  if (!sale) return null;
  if (!(await canSeeRecord(await viewKey(), { branchId: sale.branchId }, `CounterSale:${id}`))) return null;
  return {
    ...sale,
    subtotal: Number(sale.subtotal), vatRate: Number(sale.vatRate), vatAmount: Number(sale.vatAmount), total: Number(sale.total),
    lines: sale.lines.map((l) => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), amount: Number(l.amount) })),
  };
}
