'use server';

import { claimed, lockExisting } from '@/lib/integrity';
import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { allows, authorizeOnJobCard, seeJobCard } from '@/lib/authz/server';
import { BILL_TO_LABEL, billingOf, billingSplit, jobCardTotals, JOB_CARD_BILLING_SELECT, type BillTo } from '@/lib/estimate-billing';

class BillingError extends Error {}

const BILL_TOS: BillTo[] = ['CUSTOMER', 'GOODWILL', 'INTERNAL'];
const CLOSED = ['CHECKED_OUT', 'CANCELLED'];

// Who decides who pays: whoever gives the estimate its final approval.
const WHO_PAYS_KEY = 'workshop.estimate.final_approve' as const;

/** Everything the Job Card's "Who pays" panel needs. */
export async function getJobCardBilling(jobCardId: string) {
  await requireUser();
  await seeJobCard(jobCardId, 'getJobCardBilling');
  const jc = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      id: true, status: true, branchId: true,
      payments: { select: { amount: true } },
      refunds: { select: { amount: true } },
      estimate: {
        select: {
          discountAmount: true,
          vatRate: true,
          lineItems: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, type: true, description: true, amount: true, discountAmount: true, billTo: true, billToNote: true },
          },
        },
      },
      ...JOB_CARD_BILLING_SELECT,
    },
  });
  if (!jc) return null;
  const canDecide = await allows(WHO_PAYS_KEY, { branchId: jc.branchId });
  const lines = jc.estimate?.lineItems ?? [];
  const split = billingSplit(lines);
  // What the customer owes after discounts and VAT: the one shared calculation.
  const settings = billingOf(jc);
  const totals = jobCardTotals(jc.estimate, settings);
  const paid = jc.payments.reduce((s: number, p: { amount: unknown }) => s + Number(p.amount), 0) - jc.refunds.reduce((s: number, r: { amount: unknown }) => s + Number(r.amount), 0);
  return {
    lines: lines.map((l: (typeof lines)[number]) => ({ ...l, amount: l.amount === null ? null : Number(l.amount), discountAmount: l.discountAmount === null ? null : Number(l.discountAmount) })),
    split,
    totals,
    settings: { vatEnabled: settings.vatEnabled, vatRate: Number(settings.vatRate), vatNumber: settings.vatNumber ?? null, discountApprovalPercent: settings.discountApprovalPercent ?? null },
    netPaid: Math.round(paid * 100) / 100,
    overpaid: Math.max(0, Math.round((paid - totals.total) * 100) / 100),
    canEdit: canDecide && !CLOSED.includes(jc.status),
    isClosed: CLOSED.includes(jc.status),
  };
}

/**
 * Decide who pays for one estimate line: the customer, or the business as
 * goodwill or an internal cost (both need a reason). Final approvers only;
 * not once the Job Card is checked out or cancelled. Audited on the Job Card.
 */
export async function setEstimateLineBillTo(lineId: string, billTo: BillTo, note: string): Promise<void> {
  const user = await requireUser();
  if (!BILL_TOS.includes(billTo)) throw new BillingError('Choose who pays for this line.');
  const why = note.trim();
  const line = await prisma.estimateLineItem.findUnique({
    where: { id: lineId },
    select: { id: true, description: true, amount: true, billTo: true, estimate: { select: { jobCard: { select: { id: true, jobNumber: true, status: true } } } } },
  });
  if (!line) throw new BillingError('Estimate line not found.');
  const jc = line.estimate.jobCard;
  if (CLOSED.includes(jc.status)) throw new BillingError('This Job Card is closed — who pays can no longer change.');
  // The Job Card must also be within this person's reach (its branch).
  await authorizeOnJobCard(WHO_PAYS_KEY, jc.id, 'setEstimateLineBillTo');
  if ((billTo === 'GOODWILL' || billTo === 'INTERNAL') && !why) {
    throw new BillingError(`Give the reason this line is ${billTo === 'GOODWILL' ? 'goodwill' : 'an internal cost'}.`);
  }
  if (line.billTo === billTo) throw new BillingError('That is already who pays for this line.');
  // Read before saving, so the audit's "from" is the prior value.
  const previous = BILL_TO_LABEL[(line.billTo ?? 'CUSTOMER') as BillTo] ?? line.billTo;
  // Who pays changes what the customer owes, so it takes the same Job Card
  // lock as recording a payment: the two are decided one after the other.
  await prisma.$transaction(async (tx) => {
    await lockExisting(tx, 'jobCard', [jc.id]);
    claimed(await tx.estimateLineItem.updateMany({ where: { id: lineId, billTo: line.billTo }, data: { billTo, billToNote: why || null } }), 'Who pays for this line was just changed by someone else — refresh the page.');
  });
  await writeAuditLog({
    userId: user.id,
    action: 'job_card.line_bill_to_set',
    entityType: 'JobCard',
    entityId: jc.id,
    metadata: { jobNumber: jc.jobNumber, line: line.description, amount: line.amount === null ? null : Number(line.amount), from: previous, to: BILL_TO_LABEL[billTo], note: why || undefined },
  });
}
