import { prisma, type Prisma } from '@ejo/database';
import { lockRows } from '@/lib/integrity';

/**
 * Server-only (NOT a 'use server' file). Parts requests belong to a live
 * Job Card:
 *
 *  • once the job is cancelled or finished, nothing more can be approved,
 *    released or reserved for it (assertJobStillOpen);
 *  • when the job is cancelled or closed, every request still in flight is
 *    withdrawn — and stock reserved for it is given back (withdrawOpenSourcing).
 *
 * Lock order, everywhere: Job Card → parts request → stock.
 * Store approval and release take the request before the stock too, so these
 * transactions queue on each other instead of deadlocking.
 */

const FINISHED_JOB_CARD = ['CANCELLED', 'CLOSED', 'CHECKED_OUT'];

export class JobFinishedError extends Error {}

type Db = Prisma.TransactionClient | typeof prisma;

/** Refuses when the parent job is cancelled or finished. */
export async function assertJobStillOpen(db: Db, parent: { jobCardId?: string | null }): Promise<void> {
  if (parent.jobCardId) {
    const j = await db.jobCard.findUnique({ where: { id: parent.jobCardId }, select: { status: true, jobNumber: true } });
    if (!j || FINISHED_JOB_CARD.includes(j.status)) {
      throw new JobFinishedError(`Job Card ${j?.jobNumber ?? ''} is ${j ? j.status.toLowerCase().replace(/_/g, ' ') : 'gone'} — nothing more can be approved, released or paid for it.`.replace('  ', ' '));
    }
  }
}

/**
 * Inside the cancellation / close transaction (after the job itself is
 * locked): withdraw every parts request still in flight.
 * Approved parts requests give their reserved stock back. Returns what was
 * withdrawn, for the audit trail.
 */
export async function withdrawOpenSourcing(
  tx: Prisma.TransactionClient,
  parent: { jobCardId: string },
  actorId: string,
  reason: string,
): Promise<{ slips: string[]; stockReturned: { partId: string; quantity: number }[] }> {
  // Never an unfiltered withdrawal: Prisma would ignore an undefined filter.
  if (!parent.jobCardId) throw new Error('withdrawOpenSourcing needs a Job Card.');
  const where = { jobCardId: parent.jobCardId };
  const open = await tx.partRequestSlip.findMany({
    where: { ...where, status: { in: ['PENDING_HOD_APPROVAL', 'PENDING_STORE_APPROVAL', 'APPROVED'] } },
    select: { id: true, referenceNumber: true },
  });
  const now = new Date();
  const slips: string[] = [];
  const returned = new Map<string, number>();
  if (open.length) {
    // Requests first, then stock (the same order Store approval and release use).
    await lockRows(tx, 'partRequestSlip', open.map((s) => s.id));
    const current = await tx.partRequestSlip.findMany({
      where: { id: { in: open.map((s) => s.id) } },
      select: { id: true, referenceNumber: true, status: true, lines: { select: { partId: true, quantityRequested: true } } },
    });
    const approved = current.filter((s) => s.status === 'APPROVED');
    await lockRows(tx, 'partStockByPart', approved.flatMap((s) => s.lines.map((l) => l.partId)));
    for (const s of current) {
      if (!['PENDING_HOD_APPROVAL', 'PENDING_STORE_APPROVAL', 'APPROVED'].includes(s.status)) continue;
      const done = await tx.partRequestSlip.updateMany({
        where: { id: s.id, status: s.status },
        data: { status: 'REJECTED', rejectedById: actorId, rejectedAt: now, rejectionStage: 'WITHDRAWN', rejectionReason: reason },
      });
      if (done.count === 0) continue;
      slips.push(s.referenceNumber);
      if (s.status === 'APPROVED') {
        for (const l of s.lines) {
          const qty = Number(l.quantityRequested);
          await tx.partStock.updateMany({ where: { partId: l.partId }, data: { quantityReserved: { decrement: qty } } });
          returned.set(l.partId, (returned.get(l.partId) ?? 0) + qty);
        }
      }
    }
    // Never below zero, whatever older data looks like.
    if (returned.size) await tx.partStock.updateMany({ where: { partId: { in: [...returned.keys()] }, quantityReserved: { lt: 0 } }, data: { quantityReserved: 0 } });
  }
  return { slips, stockReturned: [...returned].map(([partId, quantity]) => ({ partId, quantity })) };
}
