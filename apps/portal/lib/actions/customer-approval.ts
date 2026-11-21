'use server';

import { prisma, JobCardStatus } from '@ejo/database';
import { allows, authorizeOnJobCard, refuse } from '@/lib/authz/server';
import { claimed, lockExisting } from '@/lib/integrity';
import { writeAuditLog, getWorkshopOrgContext } from '@/lib/workshop-core';
import { emailColleaguesLater } from '@/lib/workflow-notify';
import { sendEmail } from '@/lib/email';
import { logFailure } from '@/lib/log';
import { websiteBaseUrl } from '@/lib/portal-url';
import { customerLinks } from '@/lib/customer-links-core';
import { billingOf, BILLING_SETTINGS_SELECT, depositDueOn, ESTIMATE_TOTALS_SELECT, jobCardTotals } from '@/lib/estimate-billing';
import { issueApprovalLink, revokeApprovalLinks, startWorkIfReady } from '@/lib/customer-approval';
import { approvalLinkUrl } from '@ejo/utils/approval-link';
import { whatsAppShareUrlFor } from '@ejo/utils/whatsapp';
import { customerWhatsAppUrl, estimateMessage } from '@/lib/whatsapp-messages';
import { issueDocumentLink } from '@/lib/document-links';
import { workshopContactFor } from '@/lib/workshop-core';
import { renderCustomerEstimateApprovalLinkEmail } from '@/lib/email-templates/customer-estimate-approval-link';
import { requireUser, currentUserIsMasterAdmin } from './workshop';

/**
 * The customer's answer to a Job Card estimate, taken by staff: "Customer
 * approved by phone", and "Send approval link" (email it again, and a
 * WhatsApp message the colleague sends from their own phone). The customer
 * answers by themselves on the customer website (the link, or their portal).
 *
 * Who: the front desk (workshop.customer.notify — the people who tell
 * customers about their estimate), this Job Card's own supervisor or
 * opener, and the branch's Managers (final approval of estimates).
 */

class CustomerApprovalError extends Error {}

const naira = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function waitingJobCard(jobCardId: string) {
  return prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      id: true, branchId: true, status: true, jobNumber: true, createdById: true, supervisorId: true, assignedTechnicianId: true,
      branch: { select: { businessUnit: { select: { organisationId: true, organisation: { select: BILLING_SETTINGS_SELECT } } } } },
      customer: { select: { fullName: true, email: true, phone: true, altPhone: true, customerType: true } },
      vehicle: { select: { make: true, model: true, plateNumber: true } },
      estimate: { select: { id: true, status: true, customerNotifiedAt: true, customerApprovedAt: true, ...ESTIMATE_TOTALS_SELECT } },
    },
  });
}
type WaitingJobCard = NonNullable<Awaited<ReturnType<typeof waitingJobCard>>>;

/** The front desk, this Job Card's supervisor or opener, or a Manager of its branch. */
async function requireAnswerTaker(jc: WaitingJobCard, where: string): Promise<{ id: string }> {
  await authorizeOnJobCard('workshop.job_card.view', jc.id, where);
  const user = await requireUser();
  if (user.id === jc.supervisorId || user.id === jc.createdById) return user;
  if (await allows('workshop.customer.notify', { branchId: jc.branchId })) return user;
  if (await allows('workshop.estimate.final_approve', { branchId: jc.branchId })) return user;
  if (await currentUserIsMasterAdmin()) return user;
  return refuse('workshop.customer.notify', where, "Only the front desk, this Job Card's supervisor or a Manager can do this.");
}

/** The estimate is with the customer and they have not approved it yet. */
function assertAwaitingAnswer(jc: WaitingJobCard): asserts jc is WaitingJobCard & { estimate: NonNullable<WaitingJobCard['estimate']> } {
  if (jc.status !== JobCardStatus.AWAITING_CUSTOMER_APPROVAL || jc.estimate?.status !== 'MANAGER_APPROVED' || !jc.estimate.customerNotifiedAt) {
    throw new CustomerApprovalError('This Job Card is not waiting for the customer to approve its estimate.');
  }
  if (jc.estimate.customerApprovedAt) {
    throw new CustomerApprovalError('The customer has already approved this estimate.');
  }
}

/**
 * The customer said yes on the phone: who took the call is recorded, with
 * the person they spoke with. Work starts at once when no deposit applies
 * (or it is already paid); otherwise it waits for the deposit.
 */
export async function recordCustomerApprovalByPhone(jobCardId: string, spokeWith: string, note?: string): Promise<{ workStarted: boolean }> {
  // Recorded as the person who took the call — never by an assistant.
  await authorizeOnJobCard('workshop.job_card.view', jobCardId, 'recordCustomerApprovalByPhone');
  const jc = await waitingJobCard(jobCardId);
  if (!jc) throw new CustomerApprovalError('Job Card not found.');
  const user = await requireAnswerTaker(jc, 'recordCustomerApprovalByPhone');
  assertAwaitingAnswer(jc);
  const who = spokeWith.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (who.length < 2) throw new CustomerApprovalError('Enter who you spoke with (their name, and how they are related to the customer if it was not the customer).');
  const extra = note?.replace(/\r\n?/g, '\n').trim().slice(0, 500) || null;
  const estimateId = jc.estimate.id;

  const workStarted = await prisma.$transaction(async (tx) => {
    // Under the Job Card's lock, like a payment: the deposit and the answer are decided together.
    await lockExisting(tx, 'jobCard', [jobCardId], 'This Job Card no longer exists — refresh the page.');
    claimed(await tx.estimate.updateMany({
      where: { id: estimateId, status: 'MANAGER_APPROVED', customerApprovedAt: null },
      data: {
        customerApprovedAt: new Date(), customerApprovedVia: 'PHONE', customerApprovedByStaffId: user.id,
        customerApprovalNote: [`Spoke with ${who}.`, extra].filter(Boolean).join(' '),
        customerDeclinedAt: null, customerDeclineNote: null,
      },
    }), 'The customer has just approved this estimate another way — refresh the page.');
    await revokeApprovalLinks(tx, estimateId);
    return startWorkIfReady(tx, jobCardId);
  });

  await writeAuditLog({ userId: user.id, action: 'estimate.customer_approved', entityType: 'JobCard', entityId: jobCardId, metadata: { via: 'PHONE', spokeWith: who, note: extra ?? undefined, workStarted } });
  if (workStarted) await writeAuditLog({ userId: user.id, action: 'job_card.status_updated', entityType: 'JobCard', entityId: jobCardId, metadata: { from: 'AWAITING_CUSTOMER_APPROVAL', to: 'IN_PROGRESS', reason: 'The customer approved by phone' } });
  emailColleaguesLater({
    branchId: jc.branchId,
    userIds: [jc.createdById, jc.supervisorId, jc.assignedTechnicianId],
    exceptUserId: user.id,
    path: `/workshop/job-cards/${jobCardId}`,
    where: 'estimate.customer_approved',
    notice: {
      subject: `Customer approved the estimate — Job Card ${jc.jobNumber}`,
      heading: 'The customer approved the estimate',
      intro: `${jc.customer.fullName} approved the estimate on Job Card ${jc.jobNumber} by phone.`,
      facts: [['Job Card', jc.jobNumber], ['Spoke with', who]],
      next: workStarted ? 'The Job Card is In Progress: the work can start.' : 'The work starts once the deposit is recorded under Payments.',
      status: { label: 'Approved', tone: 'success' },
      ctaLabel: 'Open the Job Card',
    },
  });
  return { workStarted };
}

export type ApprovalLinkSent = { emailed: boolean; whatsAppUrl: string | null; expiresAt: Date };

/**
 * A fresh approval link for the customer (any older unused one stops
 * working): emailed when they have an email address, and returned as a
 * WhatsApp message for the colleague to send from their own phone. The link
 * is never stored or recorded in the audit trail.
 */
export async function sendEstimateApprovalLink(jobCardId: string): Promise<ApprovalLinkSent> {
  await authorizeOnJobCard('workshop.job_card.view', jobCardId, 'sendEstimateApprovalLink');
  const jc = await waitingJobCard(jobCardId);
  if (!jc) throw new CustomerApprovalError('Job Card not found.');
  const user = await requireAnswerTaker(jc, 'sendEstimateApprovalLink');
  assertAwaitingAnswer(jc);
  const total = jobCardTotals(jc.estimate, billingOf(jc)).total;
  const deposit = depositDueOn(total, billingOf(jc), String(jc.customer.customerType));
  const { token, expiresAt } = await issueApprovalLink(jc.estimate.id, user.id);
  const websiteUrl = websiteBaseUrl();
  const url = approvalLinkUrl(websiteUrl, token);
  const vehicle = [jc.vehicle.make, jc.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
  const expiresOn = expiresAt.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Lagos' });
  const orgContext = await getWorkshopOrgContext();

  let emailed = false;
  if (jc.customer.email) {
    try {
      await sendEmail(
        jc.customer.email,
        `Approve your estimate online — Job Card ${jc.jobNumber}`,
        renderCustomerEstimateApprovalLinkEmail({
          customerName: jc.customer.fullName,
          jobNumber: jc.jobNumber,
          vehicleDescription: vehicle,
          plateNumber: jc.vehicle.plateNumber,
          totalAmount: naira(total),
          minimumDepositAmount: deposit.amount > 0 ? naira(deposit.amount) : null,
          depositPercent: Math.round(deposit.fraction * 100),
          approvalUrl: url,
          expiresOn,
          dashboardUrl: customerLinks(websiteUrl).jobCard(jobCardId),
          logoUrl: `${websiteUrl}/images/logo/email-logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
        }),
      );
      emailed = true;
    } catch (err) {
      logFailure('Failed to email the estimate approval link', jobCardId, err);
    }
  }
  // The same approval link as the email, with the estimate's PDF (a document link).
  const whatsAppUrl = await estimateWhatsApp(jc, user.id, { url, expiresAt, total, deposit: deposit.amount });
  // Never the link itself in the audit trail.
  await writeAuditLog({ userId: user.id, action: 'estimate.approval_link_sent', entityType: 'JobCard', entityId: jobCardId, metadata: { emailed, whatsApp: Boolean(whatsAppUrl), expiresAt: expiresAt.toISOString() } });
  return { emailed, whatsAppUrl, expiresAt };
}

/**
 * The estimate's WhatsApp message (lib/whatsapp-messages estimateMessage):
 * the approval link, and the estimate PDF as a secure document link (30
 * days) — as the email carries the PDF. Null, and no document link made,
 * when the customer has no phone WhatsApp can take.
 */
async function estimateWhatsApp(jc: WaitingJobCard, userId: string, a: { url: string; expiresAt: Date; total: number; deposit: number }): Promise<string | null> {
  if (!whatsAppShareUrlFor([jc.customer.phone, jc.customer.altPhone], 'x')) return null;
  const pdf = await issueDocumentLink({ organisationId: jc.branch.businessUnit.organisationId, kind: 'ESTIMATE', recordId: jc.id, createdById: userId });
  return customerWhatsAppUrl(jc.customer, estimateMessage({
    customerName: jc.customer.fullName,
    organisation: String(jc.customer.customerType) === 'ORGANIZATION',
    vehicle: jc.vehicle,
    jobNumber: jc.jobNumber,
    total: a.total,
    deposit: a.deposit,
    approvalUrl: a.url,
    approvalExpiresOn: a.expiresAt,
    pdfUrl: pdf.url,
    portalUrl: customerLinks(websiteBaseUrl()).jobCard(jc.id),
    workshop: await workshopContactFor(jc.branchId),
  }));
}

/**
 * "Send on WhatsApp" beside "Send approval link", for the same people: the
 * estimate with its PDF and a fresh approval link, for the colleague to send
 * from their own phone (nothing is emailed or sent by the server). The new
 * approval link replaces the one in any earlier email or message. Audited
 * without either link.
 */
export async function prepareEstimateWhatsApp(jobCardId: string): Promise<{ whatsAppUrl: string; expiresAt: Date }> {
  await authorizeOnJobCard('workshop.job_card.view', jobCardId, 'prepareEstimateWhatsApp');
  const jc = await waitingJobCard(jobCardId);
  if (!jc) throw new CustomerApprovalError('Job Card not found.');
  const user = await requireAnswerTaker(jc, 'prepareEstimateWhatsApp');
  assertAwaitingAnswer(jc);
  // Checked before any link is made, so the emailed link keeps working.
  if (!whatsAppShareUrlFor([jc.customer.phone, jc.customer.altPhone], 'x')) throw new CustomerApprovalError('There is no mobile number WhatsApp can take on file for this customer.');
  const total = jobCardTotals(jc.estimate, billingOf(jc)).total;
  const deposit = depositDueOn(total, billingOf(jc), String(jc.customer.customerType));
  const { token, expiresAt } = await issueApprovalLink(jc.estimate.id, user.id);
  const whatsAppUrl = await estimateWhatsApp(jc, user.id, { url: approvalLinkUrl(websiteBaseUrl(), token), expiresAt, total, deposit: deposit.amount });
  if (!whatsAppUrl) throw new CustomerApprovalError('There is no mobile number WhatsApp can take on file for this customer.');
  await writeAuditLog({ userId: user.id, action: 'whatsapp.prepared', entityType: 'JobCard', entityId: jobCardId, metadata: { kind: 'ESTIMATE', jobNumber: jc.jobNumber, approvalLinkReplaced: true, expiresAt: expiresAt.toISOString() } });
  return { whatsAppUrl, expiresAt };
}
