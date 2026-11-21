import 'server-only';
import { after } from 'next/server';
import { prisma, Prisma } from '@ejo/database';
import { billingTotals, depositFractionFor, depositOf, vatSettingFor, workMayStart } from '@ejo/utils';
import { hashApprovalToken, isApprovalToken } from '@ejo/utils/approval-link';
import { sendEmail, websiteBaseUrl } from '@/lib/email';
import { portalBaseUrl } from '@/lib/site-urls';
import { logCustomerError } from '@/lib/error-events';
import { renderEstimateAnswerStaffEmail } from '@/lib/email-templates/estimate-answer';
import { naira } from '@/lib/customer-portal/format';

/**
 * The customer's own answer to a Job Card estimate, from the customer
 * website: by the secure link in our email or WhatsApp message (no sign-in),
 * or signed in to the customer portal. Server only — the actions are in
 * lib/estimate-approval.ts.
 *
 *  - Only an estimate the Manager approved and the customer has been told
 *    about, on a Job Card still Awaiting Customer Approval, can be answered.
 *  - A link is used once: claimed with one atomic update (unused, not
 *    revoked, not expired) inside the same transaction as the answer.
 *  - Approving starts the work when no deposit applies (or it is already
 *    paid): the same rule as the staff portal (@ejo/utils workMayStart),
 *    under the Job Card's row lock, compare-and-set from Awaiting Customer
 *    Approval. Declining leaves the Job Card waiting, with the note, for the
 *    front desk to follow up.
 *  - Staff hear at once: the audit entry feeds their notification bell, and
 *    the Job Card's opener and supervisor are emailed.
 */

export type EstimateAnswer = 'approve' | 'decline';
export type AnswerVia = 'LINK' | 'PORTAL';
export type AnswerOutcome =
  | { ok: true; answer: EstimateAnswer; workStarted: boolean }
  | { ok: false; reason: 'not-found' | 'used' | 'revoked' | 'expired' | 'not-waiting' | 'answered' };

/** Why a link cannot be used, in the customer's words. */
export const LINK_PROBLEM: Record<Exclude<AnswerOutcome, { ok: true }>['reason'], string> = {
  'not-found': 'We could not find this link. It may be incomplete — please use the button in our email, or call the branch.',
  used: 'This link has already been used to answer the estimate. If you want to change your answer, please call the branch.',
  revoked: 'This link no longer works because a newer one was sent to you. Please use the most recent email or message from us.',
  expired: 'This link has expired (links work for 7 days). Please call the branch and we will send you a new one.',
  'not-waiting': 'This estimate is no longer waiting for an answer. If you have questions about it, please call the branch.',
  answered: 'You have already approved this estimate. Thank you.',
};

const JOB_SELECT = {
  id: true, status: true, jobNumber: true, branchId: true, customerId: true, createdById: true, supervisorId: true, workStartedAt: true,
  customer: { select: { fullName: true, customerType: true } },
  vehicle: { select: { make: true, model: true, year: true, plateNumber: true } },
  branch: { select: { name: true, businessUnit: { select: { organisationId: true, organisation: { select: { name: true, vatEnabled: true, vatRate: true, depositRequired: true, depositPercent: true } } } } } },
  payments: { select: { amount: true } },
  refunds: { select: { amount: true } },
  estimate: {
    select: {
      id: true, status: true, customerNotifiedAt: true, customerApprovedAt: true, customerDeclinedAt: true, discountAmount: true, vatRate: true,
      // Only the lines the customer pays for; never internal types, costs or who entered them.
      lineItems: { where: { billTo: 'CUSTOMER' as const }, orderBy: { createdAt: 'asc' as const }, select: { id: true, description: true, quantity: true, unitOfMeasure: true, amount: true, discountAmount: true } },
    },
  },
} satisfies Prisma.JobCardSelect;
type JobRow = Prisma.JobCardGetPayload<{ select: typeof JOB_SELECT }>;

const sum = (rows: { amount: unknown }[]) => rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

/** The figures the customer sees (the one shared calculation) and the deposit that applies, if any. */
export function estimateFigures(jc: JobRow) {
  const org = jc.branch.businessUnit.organisation;
  const lines = jc.estimate?.lineItems ?? [];
  const t = billingTotals({ lines, discountAmount: jc.estimate?.discountAmount, vat: vatSettingFor(jc.estimate, org) });
  const fraction = depositFractionFor(org, String(jc.customer.customerType));
  const deposit = depositOf(t.total, fraction);
  const paid = Math.max(0, Math.round((sum(jc.payments) - sum(jc.refunds)) * 100) / 100);
  return { totals: t, lines, deposit, depositPercent: Math.round(fraction * 100), depositDue: Math.max(0, Math.round((deposit - paid) * 100) / 100), paid };
}

/** Waiting for the customer: the Manager approved it, they were told, the Job Card waits on them. */
export function awaitingAnswer(jc: Pick<JobRow, 'status' | 'estimate'>): boolean {
  return String(jc.status) === 'AWAITING_CUSTOMER_APPROVAL' && jc.estimate?.status === 'MANAGER_APPROVED' && Boolean(jc.estimate.customerNotifiedAt);
}

export type LinkView =
  | { state: 'open' | 'answered'; organisationName: string; branchName: string; jobNumber: string; vehicle: string; plate: string | null; figures: ReturnType<typeof estimateFigures> }
  | { state: Exclude<Exclude<AnswerOutcome, { ok: true }>['reason'], 'answered'>; answered?: { answer: 'approved' | 'declined'; at: Date } };

/**
 * What the link page shows (GET): reads only, never changes anything (so an
 * email scanner following the link answers nothing). Nothing about the
 * customer beyond this one estimate.
 */
export async function viewApprovalLink(token: string, now = new Date()): Promise<LinkView> {
  if (!isApprovalToken(token)) return { state: 'not-found' };
  const link = await prisma.estimateApprovalLink.findUnique({ where: { tokenHash: hashApprovalToken(token) }, select: { usedAt: true, revokedAt: true, expiresAt: true, estimate: { select: { jobCardId: true, customerApprovedAt: true, customerDeclinedAt: true } } } });
  if (!link) return { state: 'not-found' };
  // A used link says what was answered, so the customer is never left wondering.
  if (link.usedAt) {
    const e = link.estimate;
    const answered = e.customerApprovedAt ? { answer: 'approved' as const, at: e.customerApprovedAt } : e.customerDeclinedAt ? { answer: 'declined' as const, at: e.customerDeclinedAt } : undefined;
    return { state: 'used', answered };
  }
  if (link.revokedAt) return { state: 'revoked' };
  if (link.expiresAt.getTime() <= now.getTime()) return { state: 'expired' };
  const jc = await prisma.jobCard.findUnique({ where: { id: link.estimate.jobCardId }, select: JOB_SELECT });
  if (!jc || !awaitingAnswer(jc)) return { state: 'not-waiting' };
  return {
    state: jc.estimate?.customerApprovedAt ? 'answered' : 'open',
    organisationName: jc.branch.businessUnit.organisation.name,
    branchName: jc.branch.name,
    jobNumber: jc.jobNumber,
    vehicle: [jc.vehicle.year, jc.vehicle.make, jc.vehicle.model].filter(Boolean).join(' ') || 'Your vehicle',
    plate: jc.vehicle.plateNumber,
    figures: estimateFigures(jc),
  };
}

class Refused extends Error {
  constructor(readonly reason: Exclude<AnswerOutcome, { ok: true }>['reason']) { super(reason); }
}

/**
 * Records the customer's answer. By LINK: `token` (claimed once, atomically).
 * In the PORTAL: `jobCardId` of the signed-in customer's own Job Card
 * (`customerId` from the session, never from the browser).
 */
export async function recordEstimateAnswer(o: { via: AnswerVia; answer: EstimateAnswer; note: string | null; token?: string; jobCardId?: string; customerId?: string; ipAddress?: string | null }): Promise<AnswerOutcome> {
  const now = new Date();
  try {
    const done = await prisma.$transaction(async (tx) => {
      let jobCardId: string;
      if (o.via === 'LINK') {
        if (!isApprovalToken(o.token)) throw new Refused('not-found');
        const tokenHash = hashApprovalToken(o.token);
        // Single use: only an unused, unrevoked, unexpired link is claimed — one answer, ever.
        const claim = await tx.estimateApprovalLink.updateMany({ where: { tokenHash, usedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
        if (claim.count !== 1) {
          const l = await tx.estimateApprovalLink.findUnique({ where: { tokenHash }, select: { usedAt: true, revokedAt: true } });
          throw new Refused(!l ? 'not-found' : l.usedAt ? 'used' : l.revokedAt ? 'revoked' : 'expired');
        }
        const link = await tx.estimateApprovalLink.findUnique({ where: { tokenHash }, select: { estimate: { select: { jobCardId: true } } } });
        jobCardId = link!.estimate.jobCardId;
      } else {
        if (!o.jobCardId || !o.customerId) throw new Refused('not-found');
        jobCardId = o.jobCardId;
      }
      // The Job Card's row lock, as the staff portal takes for a payment: the answer and any payment are decided one at a time.
      await tx.$queryRaw`SELECT "id" FROM "job_cards" WHERE "id" = ${jobCardId} FOR UPDATE`;
      const jc = await tx.jobCard.findUnique({ where: { id: jobCardId }, select: JOB_SELECT });
      // In the portal, only the signed-in customer's own Job Card; anything else reads as "not found".
      if (!jc || (o.via === 'PORTAL' && jc.customerId !== o.customerId)) throw new Refused('not-found');
      if (!awaitingAnswer(jc)) throw new Refused('not-waiting');
      if (jc.estimate!.customerApprovedAt) throw new Refused('answered');
      const estimateId = jc.estimate!.id;
      if (o.answer === 'approve') {
        const set = await tx.estimate.updateMany({
          where: { id: estimateId, status: 'MANAGER_APPROVED', customerApprovedAt: null },
          data: { customerApprovedAt: now, customerApprovedVia: o.via, customerApprovedByStaffId: null, customerApprovalNote: o.note, customerDeclinedAt: null, customerDeclineNote: null },
        });
        if (set.count !== 1) throw new Refused('answered');
      } else {
        await tx.estimate.updateMany({ where: { id: estimateId, customerApprovedAt: null }, data: { customerDeclinedAt: now, customerDeclineNote: o.note } });
      }
      // Answered: any other unused link stops working.
      await tx.estimateApprovalLink.updateMany({ where: { estimateId, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
      const f = estimateFigures(jc);
      let workStarted = false;
      if (o.answer === 'approve' && workMayStart({ approved: true, deposit: f.deposit, paid: Math.max(0, sum(jc.payments)) })) {
        const moved = await tx.jobCard.updateMany({ where: { id: jobCardId, status: 'AWAITING_CUSTOMER_APPROVAL' }, data: { status: 'IN_PROGRESS', workStartedAt: jc.workStartedAt ?? now } });
        workStarted = moved.count === 1;
      }
      // The business event (no note text, never the link): drives the staff portal's bell and the Job Card's history.
      await tx.auditLog.create({
        data: {
          organisationId: jc.branch.businessUnit.organisationId, userId: null,
          action: o.answer === 'approve' ? 'estimate.customer_approved' : 'estimate.customer_declined',
          entityType: 'JobCard', entityId: jobCardId,
          metadata: { actor: 'customer', via: o.via, workStarted, noted: Boolean(o.note) },
          ipAddress: o.ipAddress ?? null,
        },
      });
      return { jc, workStarted, figures: f };
    });
    tellStaff(done.jc, o, done.workStarted, done.figures.depositDue);
    return { ok: true, answer: o.answer, workStarted: done.workStarted };
  } catch (err) {
    if (err instanceof Refused) return { ok: false, reason: err.reason };
    throw err;
  }
}

/** The Job Card's opener and supervisor are emailed, after the response (a slow mail server never delays the customer). */
function tellStaff(jc: JobRow, o: { via: AnswerVia; answer: EstimateAnswer; note: string | null }, workStarted: boolean, depositDue: number): void {
  const run = async () => {
    try {
      const people = await prisma.user.findMany({
        where: { id: { in: [jc.createdById, jc.supervisorId].filter((x): x is string => Boolean(x)) }, organisationId: jc.branch.businessUnit.organisationId, isActive: true },
        select: { fullName: true, email: true },
      });
      for (const p of people) {
        const m = renderEstimateAnswerStaffEmail({
          companyName: jc.branch.businessUnit.organisation.name, logoUrl: `${websiteBaseUrl()}/brand/emblem.png`,
          recipientName: p.fullName, jobNumber: jc.jobNumber, customerName: jc.customer.fullName, branchName: jc.branch.name,
          answer: o.answer === 'approve' ? 'approved' : 'declined', via: o.via, note: o.note, workStarted,
          depositWaiting: depositDue > 0 ? naira(depositDue) : null, url: `${portalBaseUrl()}/workshop/job-cards/${jc.id}`,
        });
        await sendEmail(p.email, m.subject, m.html);
      }
    } catch (err) {
      await logCustomerError('estimate.answer.email', err);
    }
  };
  try { after(run); } catch { void run(); }
}
