import 'server-only';
import { prisma, JobCardStatus, type Prisma } from '@ejo/database';
import { APPROVAL_LINK_MS, newApprovalToken } from '@ejo/utils/approval-link';
import { claimed } from '@/lib/integrity';
import { billingOf, depositDueOn, ESTIMATE_TOTALS_SELECT, JOB_CARD_BILLING_SELECT, jobCardTotals, workMayStart } from '@/lib/estimate-billing';

/**
 * The customer's answer to a Job Card estimate, on the server (not a server
 * action: the guarded actions are in lib/actions/customer-approval.ts and
 * recordPayment). The customer approves by the secure link, in the customer
 * portal, by phone (a colleague takes it down) or by paying the deposit at
 * the counter. Work starts once they have approved and any deposit that
 * applies is paid (the one rule, @ejo/utils/billing workMayStart).
 */

type Tx = Prisma.TransactionClient;

/** How the customer approved, in words for the Job Card page. */
export const APPROVED_VIA_LABEL: Record<string, string> = {
  LINK: 'by link',
  PORTAL: 'in the portal',
  PHONE: 'by phone',
  DEPOSIT: 'by paying at the counter',
  IMPORT: 'before EJO',
};

/**
 * Moves the Job Card from Awaiting Customer Approval to In Progress when the
 * customer has approved and any deposit that applies is paid. Call it inside
 * a transaction that holds the Job Card's lock (recordPayment, the answer by
 * phone). Compare-and-set, so it moves at most once. True when it moved.
 */
export async function startWorkIfReady(tx: Tx, jobCardId: string): Promise<boolean> {
  const jc = await tx.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      status: true,
      workStartedAt: true,
      customer: { select: { customerType: true } },
      estimate: { select: { ...ESTIMATE_TOTALS_SELECT, customerApprovedAt: true } },
      ...JOB_CARD_BILLING_SELECT,
      payments: { select: { amount: true } },
    },
  });
  if (!jc || jc.status !== JobCardStatus.AWAITING_CUSTOMER_APPROVAL) return false;
  const total = jobCardTotals(jc.estimate, billingOf(jc)).total;
  const deposit = depositDueOn(total, billingOf(jc), String(jc.customer.customerType)).amount;
  const paid = jc.payments.reduce((s: number, p: { amount: unknown }) => s + Number(p.amount ?? 0), 0);
  if (!workMayStart({ approved: Boolean(jc.estimate?.customerApprovedAt), deposit, paid })) return false;
  claimed(await tx.jobCard.updateMany({
    where: { id: jobCardId, status: JobCardStatus.AWAITING_CUSTOMER_APPROVAL },
    // Set once: this starts the "In Service" clock.
    data: { status: JobCardStatus.IN_PROGRESS, workStartedAt: jc.workStartedAt ?? new Date() },
  }));
  return true;
}

/**
 * A new approval link for the estimate: the token goes only into the message
 * to the customer (never stored, logged or audited); its SHA-256 is kept. Any
 * older link not yet used stops working.
 */
export async function issueApprovalLink(estimateId: string, createdById: string): Promise<{ token: string; expiresAt: Date }> {
  const { token, tokenHash } = newApprovalToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + APPROVAL_LINK_MS);
  await prisma.$transaction([
    prisma.estimateApprovalLink.updateMany({ where: { estimateId, usedAt: null, revokedAt: null }, data: { revokedAt: now } }),
    prisma.estimateApprovalLink.create({ data: { estimateId, tokenHash, expiresAt, createdById } }),
  ]);
  return { token, expiresAt };
}

/** Every unused link for the estimate stops working (it has been answered another way). */
export async function revokeApprovalLinks(tx: Tx, estimateId: string): Promise<void> {
  await tx.estimateApprovalLink.updateMany({ where: { estimateId, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** The customer's answer is cleared (the estimate goes back for changes). */
export const CLEARED_CUSTOMER_ANSWER = {
  customerApprovedAt: null,
  customerApprovedVia: null,
  customerApprovedByStaffId: null,
  customerApprovalNote: null,
  customerDeclinedAt: null,
  customerDeclineNote: null,
} as const;

/** The organisation's deposit switch for a branch's records (Vehicle Services carry no billing select of their own). */
export async function depositSettingsOfBranch(branchId: string): Promise<{ depositRequired: boolean; depositPercent: number } | null> {
  const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { businessUnit: { select: { organisation: { select: { depositRequired: true, depositPercent: true } } } } } });
  return b?.businessUnit.organisation ?? null;
}
