import { jobCardVisible, guardAnyPage, can, allows } from '@/lib/authz/server';
import { PAYMENT_METHOD_LABEL } from '@/lib/money/rules';
import { JobCardPhotos } from '@/components/JobCardPhotos';
import { listJobCardPhotos } from '@/lib/actions/job-card-photos';
import { listOutsideCosts } from '@/lib/actions/outside-purchases';
import { OutsideCostsCard } from '@/components/OutsideCostsCard';
import { fuelLevelLabel, sprayPanelLabels, washPackageLabel } from '@/lib/workshop/job-types';
import { JobCardRatingCard } from '@/components/JobCardRatingCard';
import { LoadingLink } from '@/components/LoadingLink';
import { depositDueOn, vatIsFixed, discountNeedsManager, discountPercent, isCustomerLine, jobCardTotals, paidInFull } from '@/lib/estimate-billing';
import { creditStanding } from '@/lib/credit';
import { APPROVED_VIA_LABEL } from '@/lib/customer-approval';
import { ApprovalLinkPanel } from '@/components/ApprovalLinkPanel';
import { recordCustomerApprovalByPhoneFormAction } from '@/lib/actions/customer-approval-form-handlers';
import { canIssueInvoices, getJobCardInvoice } from '@/lib/actions/invoices';
import { getInvoiceCreditNotes } from '@/lib/actions/credit-notes';
import { credited } from '@/lib/money/rules';
import { CreditNotesPanel } from '@/components/money/CreditNotesPanel';
import { emailInvoiceFormAction, issueInvoiceFormAction } from '@/lib/actions/invoices-form-handlers';
import { getJobCardBilling } from '@/lib/actions/estimate-billing';
import { JobCardBillingPanel } from '@/components/JobCardBillingPanel';
import { humanizeAction } from '@/lib/humanize-action';
import { JobCardStatusForm } from '@/components/JobCardStatusForm';
import { AuditTrail } from '@/components/AuditTrail';
import { getSelectableJobCardStatuses, isReworkTransition } from '@/lib/job-card-status-rules';
import { carWashNextStatuses } from '@/lib/workshop/car-wash';
import { guaranteeRuns, guaranteeText } from '@/lib/money/warranty';
import { visitDurations } from '@/lib/visit-durations';
import { listRefunds } from '@/lib/actions/refunds';
import { RefundsPanel } from '@/components/RefundsPanel';
import { PrintMenu } from '@/components/print/PrintMenu';
import { notFound } from 'next/navigation';
import { getJobCard, getJobCardAuditTrail, getJobCardEstimate, getJobCardPayments, getCancellationRequests, getCloseRequests, listTechnicianCandidates, listEligibleSupervisorsForJobCard, listEligibleManagersForBranch, listEligibleFinanceOfficersForBranch, currentUserIsMasterAdmin, currentUserId } from '@/lib/actions/workshop';
import { getJobCardSourcingNeeds } from '@/lib/actions/sourcing';
import { listPartCategories, listPartTypes } from '@/lib/actions/store';
import { EstimateLineItemForm } from '@/components/EstimateLineItemForm';
import { EstimateLinesTable, EstimateLineEditLink, EstimateLineRemoveButton, EstimateLineEditor, type EstimateLineView } from '@/components/EstimateLinesTable';
import { requestStoreMatchingFormAction } from '@/lib/actions/store-form-handlers';
import { COMMON_ESTIMATE_LINE_DESCRIPTIONS } from '@/lib/workshop-constants';
import { assignTechnicianFormAction, approveJobCardFormAction, rejectJobCardFormAction, acceptTechnicianAssignmentFormAction, rejectTechnicianAssignmentFormAction, reassignSupervisorFormAction, updateEstimateLineItemFormAction, deleteEstimateLineItemFormAction, notifySupervisorAboutEstimateFormAction, notifyTechnicianAboutEstimateFormAction, submitEstimateForValidationFormAction, approveEstimateFormAction, approveEstimateAsManagerFormAction, setEstimateDiscountFormAction, setEstimateLineDiscountFormAction, returnEstimateForChangesFormAction, notifyCustomerOfApprovedEstimateFormAction, recordPaymentFormAction, requestJobCardCancellationFormAction, approveCancellationRequestFormAction, declineCancellationRequestFormAction, requestJobCardCloseFormAction, approveCloseRequestFormAction, declineCloseRequestFormAction, updateJobCardStatusFormAction } from '@/lib/actions/workshop-form-handlers';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { getImportOrigin } from '@/lib/actions/data-exchange';
import { RecycleBinPanel } from '@/components/RecycleBinPanel';
import { getRecycleBinOffer } from '@/lib/actions/recycle-bin';
import { PaymentAmountField } from '@/components/PaymentAmountField';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';
import { IdempotencyKey } from '@/components/IdempotencyKey';
import { PageTitle, StatusChip } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';
import { moduleIsOn } from '@/lib/modules';
import { getVehicleInspection } from '@/lib/actions/vehicle-inspection';
import { serviceJobCardCycle } from '@/lib/vehicle-service-cycle';
import { JobTypeBadge } from '@/components/JobTypeBadge';
import { WhatsAppLink } from '@/components/WhatsAppLink';
import { WhatsAppSendButton } from '@/components/WhatsAppSendButton';
import { whatsAppConfigured } from '@/lib/whatsapp/send';
import { JOB_CARD_NOTICES, customerCanWhatsApp, customerWhatsAppUrl, jobCardNoticeMessage, readyForCollectionMessage, refundMessage, type JobCardNotice } from '@/lib/whatsapp-messages';
import { workshopContactFor } from '@/lib/workshop-core';
import { websiteBaseUrl } from '@/lib/portal-url';
import { customerLinks } from '@/lib/customer-links-core';

// The Store is switched in Settings: with it off, parts requests are hidden.
const STORE_ON = moduleIsOn('inventory');


const STATUS_LABEL: Record<string, string> = {
  CHECKED_IN: 'Checked In',
  IN_PROGRESS: 'In Progress',
  AWAITING_PARTS: 'Awaiting Parts',
  QUALITY_CHECK: 'Quality Check',
  AWAITING_CUSTOMER_APPROVAL: 'Awaiting Customer Approval',
  COMPLETED: 'Completed',
  READY_FOR_COLLECTION: 'Ready for Collection',
  CLOSED: 'Closed',
  CHECKED_OUT: 'Checked Out',
  CANCELLED: 'Cancelled',
};

// Unlisted actions fall back to humanizeAction(), so a new audit action
// only needs an entry here for a nicer label.
const AUDIT_ACTION_LABEL: Record<string, string> = {
  'job_card.moved_to_recycle_bin': 'Moved to the Recycle bin',
  'job_card.restored_from_recycle_bin': 'Restored from the Recycle bin',
  'vehicle.gate_exit': 'Left through the gate',
  'job_card.line_bill_to_set': 'Who pays changed',
  'job_card.created': 'Job Card created',
  'job_card.approved': 'Job Card approved',
  'job_card.rejected': 'Job Card rejected',
  'job_card.supervisor_reassigned': 'Supervisor reassigned',
  'job_card.status_updated': 'Status updated',
  'assignment.accepted': 'Technician accepted assignment',
  'assignment.rejected': 'Technician rejected assignment',
  'estimate.line_item_added': 'Estimate line added',
  'estimate.line_item_updated': 'Estimate line updated',
  'estimate.line_item_removed': 'Estimate line removed',
  'estimate.submitted': 'Estimate submitted for validation',
  'estimate.approved': 'Estimate approved',
  'estimate.manager_approved': 'Estimate approved by the Owner',
  'estimate.customer_notified': 'Customer notified of approved estimate',
  'estimate.nudge_to_technician': 'Supervisor notified technician about estimate',
  'estimate.nudge_to_supervisor': 'Technician notified supervisor about estimate',
  'payment.recorded': 'Payment recorded',
  'payment.approved': 'Payment approved — work can proceed',
  'estimate.customer_approved': 'The customer approved the estimate',
  'estimate.customer_declined': 'The customer declined the estimate',
  'estimate.approval_link_sent': 'Approval link sent to the customer',
  'credit.closed_over_limit': 'Closed on credit over the credit limit (Owner)',
  'estimate.discount_set': 'Discount given on the estimate',
  'estimate.discount_removed': 'Discount on the estimate removed',
  'estimate.line_discount_set': 'Discount given on a line',
  'estimate.line_discount_removed': 'Discount on a line removed',
  'estimate.discount_approved': 'Discount approved by the Owner',
  'invoice.issued': 'Invoice issued',
  'invoice.emailed': 'Invoice emailed to the customer',
  'whatsapp.prepared': 'Message prepared for WhatsApp (sent from staff phone)',
  'cancellation.requested': 'Cancellation requested',
  'cancellation.approved': 'Cancellation approved',
  'cancellation.declined': 'Cancellation declined',
  'close.requested': 'Close requested',
  'close.declined': 'Close declined',
  'job_card.rework_requested': 'Sent back for rework',
  'job_card.technician_assigned': 'Technician assigned',
  'refund.recorded': 'Refund recorded',
  'refund.completed': 'Refund completed — all money returned',
  'approval.reminder_sent': 'Approval reminder sent',
  'collection.overdue_notice_sent': 'Collection overdue notice sent',
  'collection.ready_reminder_sent': 'Ready-for-collection reminder sent',
  'part_request_slip.requested': 'Parts request raised',
  'part_request_slip.hod_approved': 'Parts request approved (first check)',
  'part_request_slip.store_approved': 'Parts request approved by the Store',
  'part_request_slip.released': 'Parts request released',
  'part_request_slip.rejected': 'Parts request rejected',
  'estimate.store_matching_requested': 'Store matching requested',
  'estimate.store_matching_completed': 'Store matching completed',
  'estimate_line.store_matched': 'Store Part line matched',
};

const PART_REQUEST_STATUS_LABEL: Record<string, string> = {
  PENDING_HOD_APPROVAL: 'Awaiting supervisor approval',
  PENDING_STORE_APPROVAL: 'Awaiting Store approval',
  APPROVED: 'Approved — awaiting release',
  RELEASED: 'Released',
  REJECTED: 'Rejected',
};

const PART_REQUEST_STATUS_BADGE_CLASS: Record<string, string> = {
  PENDING_HOD_APPROVAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  PENDING_STORE_APPROVAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  APPROVED: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  RELEASED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  REJECTED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};

/** Builds a one-line detail ("priced at X", "Reason: …") from the metadata
 * writeAuditLog() stored. Returns null when there is nothing to add. */
function formatAuditDetail(entry: { action: string; metadata: unknown }): string | null {
  const meta = entry.metadata as Record<string, unknown> | null;
  if (!meta) return null;
  switch (entry.action) {
    case 'vehicle.gate_exit':
      return [typeof meta.exitNumber === 'string' ? meta.exitNumber : null, typeof (meta.collectedBy ?? meta.driver) === 'string' ? `collected by ${String(meta.collectedBy ?? meta.driver)}` : null].filter(Boolean).join(' · ') || null;
    case 'job_card.line_bill_to_set':
      return `${typeof meta.line === 'string' ? meta.line : 'Line'}${typeof meta.amount === 'number' ? ` (${formatNaira(meta.amount)})` : ''}: ${String(meta.from ?? 'Customer')} → ${String(meta.to ?? '')}${typeof meta.note === 'string' ? ` — ${meta.note}` : ''}`;
    case 'estimate.discount_set':
    case 'estimate.line_discount_set':
      return [typeof meta.description === 'string' ? `"${meta.description}"` : null, typeof meta.to === 'number' ? formatNaira(meta.to) : null, typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : null].filter(Boolean).join(' — ') || null;
    case 'estimate.discount_approved':
      return typeof meta.amount === 'number' ? `${formatNaira(meta.amount)}${typeof meta.percentOfSubtotal === 'number' ? ` (${meta.percentOfSubtotal}%)` : ''}` : null;
    case 'invoice.issued':
    case 'invoice.emailed':
      return typeof meta.invoiceNumber === 'string' ? meta.invoiceNumber : null;
    case 'estimate.line_item_added':
    case 'estimate.line_item_updated': {
      const parts: string[] = [];
      if (typeof meta.type === 'string') parts.push(ESTIMATE_TYPE_LABEL[meta.type] ?? meta.type);
      if (typeof meta.description === 'string') parts.push(`"${meta.description}"`);
      if (typeof meta.quantity === 'number') parts.push(`qty ${meta.quantity}`);
      if (typeof meta.unitPrice === 'number') parts.push(`priced at ${formatNaira(meta.unitPrice)}`);
      else parts.push('no price set');
      return parts.join(' — ');
    }
    case 'estimate.line_item_removed':
      return typeof meta.description === 'string' ? `"${meta.description}"` : null;
    case 'estimate_line.store_matched': {
      const parts: string[] = [];
      if (typeof meta.partName === 'string') parts.push(`matched to "${meta.partName}"`);
      if (typeof meta.unitPrice === 'number') parts.push(`priced at ${formatNaira(meta.unitPrice)}`);
      return parts.length > 0 ? parts.join(' — ') : null;
    }
    case 'job_card.status_updated': {
      const from = typeof meta.from === 'string' ? (STATUS_LABEL[meta.from] ?? meta.from) : null;
      const to = typeof meta.to === 'string' ? (STATUS_LABEL[meta.to] ?? meta.to) : null;
      if (!from || !to) return null;
      // Automatic moves (parts outstanding / all parts received) say so.
      return meta.automatic ? `${from} → ${to} (automatic${typeof meta.reason === 'string' ? ` — ${meta.reason}` : ''})` : `${from} → ${to}`;
    }
    case 'job_card.rework_requested':
      return typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : null;
    case 'job_card.rejected':
    case 'job_card.supervisor_reassigned':
    case 'assignment.rejected':
    case 'cancellation.requested':
      return typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : null;
    case 'cancellation.approved': {
      const parts: string[] = [];
      if (typeof meta.reason === 'string') parts.push(`Reason: ${meta.reason}`);
      if (typeof meta.notes === 'string' && meta.notes) parts.push(`Note: ${meta.notes}`);
      return parts.join(' — ') || null;
    }
    case 'payment.recorded': {
      const parts: string[] = [];
      if (typeof meta.amount === 'number') parts.push(formatNaira(meta.amount));
      if (typeof meta.method === 'string') parts.push(PAYMENT_METHOD_LABEL[meta.method] ?? 'Bank transfer');
      if (typeof meta.notes === 'string' && meta.notes) parts.push(meta.notes);
      return parts.join(' — ') || null;
    }
    case 'payment.approved':
      return typeof meta.totalPaid === 'number' ? `Total confirmed: ${formatNaira(meta.totalPaid)}` : null;
    case 'collection.overdue_notice_sent': {
      const parts: string[] = [];
      if (typeof meta.daysElapsed === 'number') parts.push(`${pluralize(meta.daysElapsed, 'working day')} since cancellation`);
      if (typeof meta.notes === 'string' && meta.notes) parts.push(`Note: ${meta.notes}`);
      return parts.join(' — ') || null;
    }
    case 'part_request_slip.requested': {
      const parts: string[] = [];
      if (typeof meta.referenceNumber === 'string') parts.push(meta.referenceNumber);
      if (typeof meta.lineCount === 'number') parts.push(pluralize(meta.lineCount, 'line'));
      return parts.join(' — ') || null;
    }
    case 'part_request_slip.hod_approved':
    case 'part_request_slip.store_approved':
      return typeof meta.referenceNumber === 'string' ? meta.referenceNumber : null;
    case 'part_request_slip.released': {
      const parts: string[] = [];
      if (typeof meta.referenceNumber === 'string') parts.push(meta.referenceNumber);
      const collectedByName = typeof meta.receivedByName === 'string' ? meta.receivedByName : null;
      if (collectedByName) parts.push(`Collected by ${collectedByName}`);
      return parts.join(' — ') || null;
    }
    case 'part_request_slip.rejected': {
      const parts: string[] = [];
      if (typeof meta.referenceNumber === 'string') parts.push(meta.referenceNumber);
      if (typeof meta.stage === 'string') parts.push(`at ${meta.stage}`);
      if (typeof meta.reason === 'string') parts.push(`Reason: ${meta.reason}`);
      return parts.join(' — ') || null;
    }
    default:
      return typeof meta.notes === 'string' && meta.notes ? `Notes: ${meta.notes}` : null;
  }
}

const ESTIMATE_TYPE_LABEL: Record<string, string> = {
  STORE_PART: 'Store Part',
  EXTERNAL_PART: 'External Part',
  EXTERNAL_JOB: 'External Job',
  INTERNAL_JOB: 'Internal Job',
  LABOUR: 'Labour',
  SUNDRY: 'Sundry',
};
// The subtotal legend, in order; no Store Part row when the Store is off.
const ESTIMATE_TYPES = (['STORE_PART', 'EXTERNAL_PART', 'EXTERNAL_JOB', 'INTERNAL_JOB', 'LABOUR', 'SUNDRY'] as const).filter((t) => t !== 'STORE_PART' || STORE_ON);

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Awaiting Payment',
  PARTIAL: 'Partial Payment',
  DEPOSIT_MET: 'Deposit Met — Balance Pending',
  PAID_IN_FULL: 'Payment Completed',
  REFUND_DUE: 'Cancelled — Refund Due',
  REFUNDED: 'Cancelled — Refunded',
};

const PAYMENT_STATUS_COLOR: Record<string, string> = {
  AWAITING_PAYMENT: 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]',
  PARTIAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  DEPOSIT_MET: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  PAID_IN_FULL: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  REFUND_DUE: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  REFUNDED: 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]',
};

const ESTIMATE_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Awaiting supervisor validation',
  APPROVED: 'Waiting for the Owner',
  MANAGER_APPROVED: 'Approved',
};

// Prisma returns Decimal objects. Number() is safe here because amounts
// are rounded to 2dp when written (see addEstimateLineItem).
function formatNaira(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return `₦${Number(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** One plain line: what is happening at this stage. */
const STAGE_HINT: Record<string, string> = {
  CHECKED_IN: 'Vehicle received — the estimate is being prepared.',
  AWAITING_CUSTOMER_APPROVAL: 'Estimate sent — waiting on the customer’s approval (and their deposit, when one applies).',
  IN_PROGRESS: 'Work is under way.',
  AWAITING_PARTS: 'Work paused — waiting on parts.',
  QUALITY_CHECK: 'Work done — being checked (inspection and road test) before sign-off.',
  COMPLETED: 'Signed off — preparing the vehicle for the customer.',
  READY_FOR_COLLECTION: 'The customer has been told to collect.',
  CLOSED: 'Closed by the Owner — waiting for the vehicle to be collected.',
  CHECKED_OUT: 'Vehicle collected — this Job Card is complete.',
  CANCELLED: 'Cancelled — the vehicle just needs handing back.',
};

/** Button wording for each forward step. */
const NEXT_STEP_LABEL: Record<string, string> = {
  'IN_PROGRESS>AWAITING_PARTS': 'Pause — waiting on parts',
  'IN_PROGRESS>QUALITY_CHECK': 'Work done — send to quality check',
  'AWAITING_PARTS>IN_PROGRESS': 'Parts arrived — resume work',
  'QUALITY_CHECK>COMPLETED': 'Passed quality check — mark Completed',
  'COMPLETED>READY_FOR_COLLECTION': 'Mark Ready for Collection',
  // A quick car wash (lib/workshop/car-wash.ts).
  'IN_PROGRESS>COMPLETED': 'Wash done — mark Completed',
};

/** Who takes the next step, for viewers who can't. */
const WAITING_ON: Record<string, string> = {
  IN_PROGRESS: "this Job Card's supervisor or technician",
  AWAITING_PARTS: "this Job Card's supervisor or technician",
  QUALITY_CHECK: "this Job Card's supervisor or the Owner",
  COMPLETED: "this Job Card's supervisor or the Owner",
  CLOSED: "this Job Card's supervisor, technician or the Owner",
};

export default async function JobCardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; error?: string; editLineId?: string; editStatus?: string }>;
}) {
  await guardAnyPage(['workshop.view'], '/workshop');
  const { id } = await params;
  const { status, error, editLineId, editStatus } = await searchParams;
  // Round 1: everything that needs only the id, in parallel (each database
  // round trip crosses regions). An id the viewer can't see is a 404.
  if (!(await jobCardVisible(id, 'page'))) notFound();
  const photoData = await listJobCardPhotos(id).catch(() => ({ photos: [], canAdd: false }));
  // What outside parts and jobs cost: the Owner only (null for everyone else).
  const outsideCosts = await listOutsideCosts(id).catch(() => null);
  const [jobCard, technicians, isMasterAdmin, viewerId, auditTrail, eligibleSupervisors, estimate, payments, cancellationRequests, closeRequests, sourcingFound, refunds, billing, binOffer, inspection] = await Promise.all([
    getJobCard(id),
    listTechnicianCandidates(),
    currentUserIsMasterAdmin(),
    currentUserId(),
    getJobCardAuditTrail(id),
    listEligibleSupervisorsForJobCard(id),
    getJobCardEstimate(id),
    getJobCardPayments(id),
    getCancellationRequests(id),
    getCloseRequests(id),
    getJobCardSourcingNeeds(id),
    listRefunds({ jobCardId: id }),
    getJobCardBilling(id),
    getRecycleBinOffer('JobCard', id),
    getVehicleInspection(id),
  ]);
  const invoice = await getJobCardInvoice(id).catch(() => null);
  // Credit notes on the invoice (Phase 5): approved ones lower what is owed.
  const creditNotes = invoice ? await getInvoiceCreditNotes(invoice.id).catch(() => null) : null;
  const creditedTotal = credited((creditNotes?.rows ?? []).map((r) => ({ amount: r.amount, status: r.status })));
  if (!jobCard) notFound();
  // Parts requests (PRS) need the Store: switched off, nothing to raise, list or link to.
  const sourcingNeeds = {
    ...sourcingFound,
    needsStoreParts: STORE_ON && sourcingFound.needsStoreParts,
    existingPartRequestSlips: STORE_ON ? sourcingFound.existingPartRequestSlips : [],
  };
  const origin = jobCard.importJobId ? await getImportOrigin(jobCard.importJobId).catch(() => null) : null;
  // A Job Card opened as a service, once checked out: the next-service point it set.
  const nextService = jobCard.isService && jobCard.checkedOutAt ? await serviceJobCardCycle(id).catch(() => null) : null;
  // Customer names link to their Customers (CRM) page for those who may open it.
  const canSeeCustomers = await allows('crm.view');
  // Round 2: what needs the branch or the estimate.
  const [eligibleManagers, eligibleFinance, partCategories, partTypes, mayInvoice] = await Promise.all([
    listEligibleManagersForBranch(jobCard.branchId),
    listEligibleFinanceOfficersForBranch(jobCard.branchId),
    STORE_ON ? listPartCategories(jobCard.branchId) : Promise.resolve([]),
    STORE_ON ? listPartTypes(jobCard.branchId) : Promise.resolve([]),
    canIssueInvoices(jobCard.branchId),
  ]);
  const partCategoriesWithTypes = partCategories.map((category: (typeof partCategories)[number]) => ({
    id: category.id,
    name: category.name,
    types: partTypes.filter((t: (typeof partTypes)[number]) => t.categoryId === category.id).map((t: (typeof partTypes)[number]) => ({ id: t.id, name: t.name, typicalUnit: t.typicalUnit })),
  }));
  const isApprover = isMasterAdmin || jobCard.supervisor?.id === viewerId;
  const isAssignedTechnician = isMasterAdmin || jobCard.assignedTechnician?.id === viewerId;
  const isCreator = isMasterAdmin || jobCard.createdBy.id === viewerId;
  const isEstimateContributor = isMasterAdmin || jobCard.supervisor?.id === viewerId || jobCard.assignedTechnician?.id === viewerId;
  const isEligibleManager = isMasterAdmin || eligibleManagers.supervisors.some((m: { id: string }) => m.id === viewerId);
  const isEligibleFinance = isMasterAdmin || eligibleFinance.supervisors.some((m: { id: string }) => m.id === viewerId);
  const canRequestCancellation = isCreator || isApprover;
  const canRequestClose = isCreator || isApprover;
  const pendingCancellationRequest = cancellationRequests.find((r: (typeof cancellationRequests)[number]) => r.status === 'PENDING');
  const approvedCancellation = cancellationRequests.find((r: (typeof cancellationRequests)[number]) => r.status === 'APPROVED') ?? null;
  const refundedTotal = refunds.reduce((sum: number, r: (typeof refunds)[number]) => sum + Number(r.amount), 0);
  const pendingCloseRequest = closeRequests.find((r: (typeof closeRequests)[number]) => r.status === 'PENDING');
  const paymentsTotal = payments.reduce((sum: number, p: (typeof payments)[number]) => sum + Number(p.amount ?? 0), 0);
  const estimateLineItems = estimate?.lineItems ?? [];
  // A matched Store Part line follows the part's current selling price
  // while the estimate is Draft. Used for every line, subtotal and total
  // so they always agree.
  function getLiveLineAmount(item: (typeof estimateLineItems)[number]): number {
    if (item.type === 'STORE_PART' && item.matchedPart && estimate?.status === 'DRAFT' && item.matchedPart.sellingPrice !== null) {
      return Math.round(item.quantity * Number(item.matchedPart.sellingPrice) * 100) / 100;
    }
    return item.amount !== null ? Number(item.amount) : 0;
  }
  // With the Store off nothing waits on Store matching (the server agrees).
  const hasUnmatchedStoreParts = STORE_ON && estimateLineItems.some((li: (typeof estimateLineItems)[number]) => li.type === 'STORE_PART' && !li.matchedPartId);
  // What the customer pays — covered lines (warranty / goodwill / internal)
  // excluded, after discounts, with VAT when charged: the one shared
  // calculation (@ejo/utils/billing), as in every document and payment check.
  const billingSettings = billing?.settings ?? null;
  const estimateTotal = jobCardTotals(estimate, billingSettings).total;
  // The deposit before work starts: the one rule (none when switched off, never for an organisation).
  const deposit = depositDueOn(estimateTotal, jobCard.branch.businessUnit.organisation, jobCard.customer.customerType);
  const minimumDeposit = deposit.amount;
  const depositPct = Math.round(deposit.fraction * 100);
  // The same figures on the lines as shown (a draft Store Part line follows its part's price).
  const liveTotals = jobCardTotals(estimate ? { discountAmount: estimate.discountAmount, vatRate: estimate.vatRate, lineItems: estimateLineItems.map((li: (typeof estimateLineItems)[number]) => ({ amount: getLiveLineAmount(li), billTo: li.billTo, discountAmount: li.discountAmount })) } : null, billingSettings);
  const discountForManager = Boolean(estimate && !estimate.discountApprovedAt && discountNeedsManager(liveTotals, billingSettings?.discountApprovalPercent ?? null));
  const canDiscount = Boolean(estimate && isEstimateContributor && (estimate.status === 'DRAFT' || estimate.status === 'SUBMITTED') && estimateLineItems.length > 0);
  const invoiceable = ['COMPLETED', 'READY_FOR_COLLECTION', 'CHECKED_OUT', 'CLOSED'].includes(jobCard.status) && estimate?.status === 'MANAGER_APPROVED';
  // A cancelled job that took money shows refund progress, not payment progress.
  const paymentStatus: 'AWAITING_PAYMENT' | 'PARTIAL' | 'DEPOSIT_MET' | 'PAID_IN_FULL' | 'REFUND_DUE' | 'REFUNDED' =
    jobCard.status === 'CANCELLED' && paymentsTotal > 0
      ? refundedTotal >= paymentsTotal - 0.004
        ? 'REFUNDED'
        : 'REFUND_DUE'
      : paymentsTotal <= 0
      ? 'AWAITING_PAYMENT'
      : estimateTotal > 0 && paidInFull(paymentsTotal + creditedTotal, estimateTotal)
        ? 'PAID_IN_FULL'
        : estimateTotal > 0 && minimumDeposit > 0 && paidInFull(paymentsTotal, minimumDeposit)
          ? 'DEPOSIT_MET'
          : 'PARTIAL';
  // Cancelled is terminal; the only step left is handing the vehicle back.
  const isCancelled = jobCard.status === 'CANCELLED';
  // Checked out is the end of a Job Card: nothing is actionable except
  // printing and (Platform Administrator only) deletion.
  const isCheckedOut = jobCard.status === 'CHECKED_OUT';
  // Check-out is only offered once payments cover the total (the same rule
  // the server enforces). A Job Card with nothing owed counts as paid.
  // CLOSED is never offered here; it goes through the close request flow.
  const isPaidInFull = paidInFull(paymentsTotal + creditedTotal, estimateTotal);
  const outstanding = Math.max(0, Math.round((estimateTotal - paymentsTotal - creditedTotal) * 100) / 100);
  // An organisation on credit leaves with a balance once invoiced, within its
  // credit limit; a Job Card the Owner has closed has had that decision.
  const credit = !isPaidInFull && !isCancelled && jobCard.customer.customerType === 'ORGANIZATION' ? await creditStanding(id, outstanding) : null;
  const mayLeaveOnCredit = Boolean(credit?.onCredit && (jobCard.status === 'CLOSED' || credit.withinLimit));
  // "Send on WhatsApp" next to the emails: the message is written here, the colleague sends it from their own phone.
  const workshopContact = await workshopContactFor(jobCard.branchId);
  const asOrganisation = jobCard.customer.customerType === 'ORGANIZATION';
  const waVehicle = { make: jobCard.vehicle.make, model: jobCard.vehicle.model, plateNumber: jobCard.vehicle.plateNumber };
  const readyWhatsApp = jobCard.status === 'READY_FOR_COLLECTION'
    ? customerWhatsAppUrl(jobCard.customer, readyForCollectionMessage({ customerName: jobCard.customer.fullName, organisation: asOrganisation, vehicle: waVehicle, jobNumber: jobCard.jobNumber, balance: outstanding, onCredit: Boolean(credit?.onCredit), workshop: workshopContact }))
    : null;
  // The estimate, the invoice and each receipt go with their PDF (a secure
  // link): the button asks the server to prepare the message, as the email
  // (lib/actions/whatsapp makeWhatsAppMessage). No usable phone, no button.
  const canWhatsApp = customerCanWhatsApp(jobCard.customer);
  // The status notice the customer was emailed for where the Job Card is now (checked in … closed), as WhatsApp.
  const noticeKind = (JOB_CARD_NOTICES as readonly string[]).includes(jobCard.status) ? (jobCard.status as JobCardNotice) : null;
  const noticeWhatsApp = noticeKind
    ? customerWhatsAppUrl(jobCard.customer, jobCardNoticeMessage({ notice: noticeKind, customerName: jobCard.customer.fullName, organisation: asOrganisation, vehicle: waVehicle, jobNumber: jobCard.jobNumber, collectedByName: jobCard.collectedByName ?? null, portalUrl: customerLinks(websiteBaseUrl()).jobCard(jobCard.id), workshop: workshopContact }))
    : null;
  const NOTICE_LABEL: Record<JobCardNotice, string> = { CHECKED_IN: 'Checked in', IN_PROGRESS: 'Work started', QUALITY_CHECK: 'Quality check', COMPLETED: 'Completed', CHECKED_OUT: 'Collected', CANCELLED: 'Cancelled', CLOSED: 'Closed' };
  // A refund, as its receipt email (there is no refund PDF): Accounts, who records refunds.
  const refundWhatsApp = (r: { referenceNumber: string; amount: unknown; method: string; recordedAt: Date }) => {
    const refundedBy = refunds.filter((x: (typeof refunds)[number]) => new Date(x.recordedAt).getTime() <= new Date(r.recordedAt).getTime()).reduce((sum: number, x: (typeof refunds)[number]) => sum + Number(x.amount ?? 0), 0);
    const owedBack = jobCard.status === 'CANCELLED' || approvedCancellation ? paymentsTotal : Math.max(0, paymentsTotal - estimateTotal);
    return customerWhatsAppUrl(jobCard.customer, refundMessage({ customerName: jobCard.customer.fullName, organisation: asOrganisation, referenceNumber: r.referenceNumber, recordLabel: 'Job Card', recordNumber: jobCard.jobNumber, amount: Number(r.amount ?? 0), method: r.method, refundedAt: new Date(r.recordedAt), remaining: Math.max(0, Math.round((owedBack - refundedBy) * 100) / 100), workshop: workshopContact }));
  };
  // The customer's own answer to the estimate (approved by link, portal, phone or at the counter; or declined).
  const awaitingAnswer = jobCard.status === 'AWAITING_CUSTOMER_APPROVAL' && estimate?.status === 'MANAGER_APPROVED' && Boolean(estimate.customerNotifiedAt) && !estimate.customerApprovedAt;
  const mayTakeAnswer = isMasterAdmin || isCreator || isApprover || isEligibleManager || (await can('workshop.customer.notify', { branchId: jobCard.branchId })).allowed;
  // Next steps for this viewer's role. Platform Administrator sees the normal steps;
  // the override dropdown is separate. Handing a cancelled vehicle back is
  // a front-desk step (the server checks the same).
  // A quick car wash (lib/workshop/car-wash.ts): from the wash to completed, then checked out once paid.
  const quickWash = jobCard.jobType === 'CAR_WASH' && estimate?.customerApprovedVia === 'COUNTER';
  const canFrontDesk = isCancelled || quickWash ? (await can('workshop.job_card.create', { branchId: jobCard.branchId })).allowed : false;
  const washSteps = quickWash && (canFrontDesk || isApprover || isAssignedTechnician || isEligibleManager) ? carWashNextStatuses(jobCard.status) : [];
  const withWash = (xs: string[]) => [...new Set([...washSteps, ...xs])];
  const nextSteps = isCancelled
    ? (canFrontDesk ? ['CHECKED_OUT'] : [])
    : withWash(getSelectableJobCardStatuses(jobCard.status, {
        isMasterAdmin: false,
        isSupervisor: isApprover,
        isAssignedTechnician,
        isEligibleManager,
      }) as string[]);
  const selectableStatuses = isCancelled
    ? (canFrontDesk ? (['CHECKED_OUT'] as const) : ([] as const))
    : (withWash(getSelectableJobCardStatuses(jobCard.status, {
        isMasterAdmin,
        isSupervisor: isApprover,
        isAssignedTechnician,
        isEligibleManager,
      }) as string[]) as typeof jobCard.status[]).filter((s) => s !== 'CHECKED_OUT' || isPaidInFull || mayLeaveOnCredit);

  return (
    <div className="p-8">
      <LoadingLink href="/workshop/job-cards" className="text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← All Job Cards
      </LoadingLink>

      {error ? (
        <div className="mt-4">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}

      {status === 'estimate_returned' ? (
        <div className="mb-6 mt-4 max-w-xl">
          <FormFeedbackBanner kind="success" message="Sent back to the supervisor. The estimate can be edited again and needs the supervisor's approval before it returns to you." />
        </div>
      ) : null}
      {status === 'customer_approved' || status === 'customer_approved_started' ? (
        <div className="mb-6 mt-4 max-w-xl">
          <FormFeedbackBanner kind="success" message={status === 'customer_approved_started' ? 'The customer’s approval is recorded and the Job Card is In Progress — the work can start.' : 'The customer’s approval is recorded. The work starts once the deposit is recorded under Payments.'} />
        </div>
      ) : null}
      {status === 'bill_to_set' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Who pays for that line is updated. The customer's total, deposit and balance have been recalculated." />
        </div>
      ) : null}
      {status === 'discount-saved' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Discount saved. The customer's total, deposit and balance have been recalculated." />
        </div>
      ) : null}
      {status === 'invoice-issued' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Invoice issued — the customer has been emailed a copy if they have an email address." />
        </div>
      ) : null}
      {status === 'invoice-emailed' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Invoice emailed to the customer." />
        </div>
      ) : null}
      {status === 'refund_recorded' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Refund recorded — the customer has been emailed their receipt." />
        </div>
      ) : null}
      {status === 'outside_cost_saved' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Outside cost saved." />
        </div>
      ) : null}
      {status === 'job_card_created' ? (
        <div className="mt-4">
          <FormFeedbackBanner kind="success" message="Job Card successfully created." />
        </div>
      ) : null}

      {jobCard.externalId ? (
        <div className="mt-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-info)]/40 bg-[var(--ejo-info)]/10 px-4 py-3 text-sm text-[var(--ejo-text)]" role="note" data-testid="job-card-origin">
          <span className="font-semibold">Brought in from the old system as job card {jobCard.externalId}.</span>{' '}
          Opened there on {formatDateOnly(jobCard.createdAt)}{origin ? <>, brought into EJO by import {origin.mayOpen ? <LoadingLink href={`/data-exchange/imports/${jobCard.importJobId}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{origin.number}</LoadingLink> : origin.number}{origin.loadedAt ? ` on ${formatDateOnly(origin.loadedAt)}` : ''}</> : null}.
          {jobCard.approvalStatus === 'APPROVED' && jobCard.approvalNotes?.includes('before EJO') ? ' The estimate was approved before EJO; EJO’s approval was not asked again.' : ''}
          {payments.some((p) => p.notes?.startsWith('Paid before EJO')) ? ' Payments marked “Paid before EJO” were taken in the old system and confirmed by Accounts.' : ''}
        </div>
      ) : null}
      <div className="ejo-hero relative mt-3 mb-6 flex flex-wrap items-center gap-3 overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] p-4 sm:p-5">
        <div className="ejo-orb pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[var(--ejo-primary)]/15 blur-3xl" aria-hidden="true" />
        <PageTitle icon="clipboard" className="relative mr-1">{jobCard.jobNumber}</PageTitle>
        <JobTypeBadge jobType={jobCard.jobType} className="relative text-xs" />
        <StatusChip status={jobCard.status} label={STATUS_LABEL[jobCard.status]} />
        <StatusChip tone={jobCard.approvalStatus === 'APPROVED' ? 'success' : jobCard.approvalStatus === 'REJECTED' ? 'error' : 'warning'} className="max-w-full whitespace-normal">
          {jobCard.approvalStatus === 'APPROVED'
            ? `Approved by ${jobCard.approvedBy?.fullName ?? 'supervisor'}`
            : jobCard.approvalStatus === 'REJECTED'
              ? `Rejected — ${jobCard.rejectionReason}`
              : 'Awaiting Supervisor Approval'}
        </StatusChip>
        {payments.length > 0 || jobCard.status === 'AWAITING_CUSTOMER_APPROVAL' ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYMENT_STATUS_COLOR[paymentStatus]}`}>
            {PAYMENT_STATUS_LABEL[paymentStatus]}
          </span>
        ) : null}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(() => {
          // Working days (Mon–Fri), from check-in to check-out rather than
          // closedAt: a closed vehicle can still be in the yard. Uses the
          // same rule as the prints (lib/visit-durations).
          const durations = visitDurations({
            checkedInAt: jobCard.createdAt,
            workStartedAt: jobCard.workStartedAt,
            completedAt: jobCard.completedAt,
            cancelledAt: approvedCancellation?.decidedAt ?? null,
            checkedOutAt: jobCard.checkedOutAt,
          });
          const isCheckedOut = durations.custody.final;
          const daysInWorkshop = durations.custody.days;
          const badges = [
            <span key="in-workshop" className="rounded-full bg-[var(--ejo-info)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-info)]">
              {isCheckedOut
                ? `Total time in custody: ${pluralize(daysInWorkshop, 'working day')}`
                : `${pluralize(daysInWorkshop, 'working day')} in workshop since check-in`}
            </span>,
          ];
          // "In Service" ends at completedAt, not Ready for Collection, so
          // the technician's turnaround excludes the sign-off wait.
          if (durations.inService) {
            const inServiceDuration = durations.inService.days;
            badges.push(
              durations.inService.final ? (
                <span key="in-service-duration" className="rounded-full bg-[var(--ejo-text-muted)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-text-muted)]">
                  {durations.inService.endedBy === 'CANCELLED' ? 'In Service before cancellation' : 'In Service duration'}: {pluralize(inServiceDuration, 'working day')}
                </span>
              ) : (
                <span key="in-service-ongoing" className="rounded-full bg-[var(--ejo-warning)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-warning)]">
                  In Service: {pluralize(inServiceDuration, 'working day')} so far
                </span>
              ),
            );
          }
          return badges;
        })()}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {nextService ? (
            <div data-testid="job-card-next-service" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-info)]/30 bg-[var(--ejo-info)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Next service due</h2>
              <p className="mt-2 text-sm text-[var(--ejo-text)]">
                {nextService.nextServiceDueOdometer ? `${nextService.nextServiceDueOdometer.toLocaleString('en-NG')} km` : null}
                {nextService.nextServiceDueOdometer && nextService.nextServiceDueDate ? ' or ' : null}
                {nextService.nextServiceDueDate ? formatDateOnly(nextService.nextServiceDueDate) : null}
                {' — whichever comes first.'}
              </p>
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                Based on this service{nextService.primaryServiceMileage != null ? ` at ${nextService.primaryServiceMileage.toLocaleString('en-NG')} km` : ''}, checked out on {formatDateOnly(nextService.primaryServiceDate)}. The Service Tracker follows it from here.
              </p>
            </div>
          ) : null}
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Customer & vehicle</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Customer</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  <CustomerLink id={jobCard.customerId} name={jobCard.customer.fullName} canView={canSeeCustomers} />
                  {jobCard.customer.customerType === 'ORGANIZATION' ? (
                    <span className="ml-2 rounded-full bg-[var(--ejo-info)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-info)]">
                      Organization
                    </span>
                  ) : (
                    <span className="ml-2 rounded-full bg-[var(--ejo-text-muted)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-text-muted)]">
                      Individual
                    </span>
                  )}
                </dd>
              </div>
              {jobCard.customer.address ? (
                <div>
                  <dt className="text-[var(--ejo-text-muted)]">Address</dt>
                  <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{jobCard.customer.address}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Contact</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.customer.phone || jobCard.customer.email}
                  {readyWhatsApp ? (
                    <div className="mt-1">
                      <WhatsAppLink href={readyWhatsApp} label="Ready for collection: send on WhatsApp" testId="ready-for-collection-whatsapp" />
                    </div>
                  ) : null}
                  {noticeKind && noticeWhatsApp ? (
                    <div className="mt-1">
                      <WhatsAppLink href={noticeWhatsApp} label={`${NOTICE_LABEL[noticeKind]}: send on WhatsApp`} testId="job-card-notice-whatsapp" />
                    </div>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Vehicle</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  <LoadingLink href={`/workshop/vehicles/${jobCard.vehicle.id}/edit`} className="hover:underline">
                    {[jobCard.vehicle.year, jobCard.vehicle.make, jobCard.vehicle.model, jobCard.vehicle.engineType].filter(Boolean).join(' ') || '—'}
                  </LoadingLink>
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Plate</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.vehicle.plateNumber || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Chassis / VIN</dt>
                <dd className="mt-0.5 font-mono text-xs font-medium text-[var(--ejo-text)]">
                  {jobCard.vehicle.chassisNumber || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Mileage at check-in</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.mileageAtCheckIn != null ? `${jobCard.mileageAtCheckIn.toLocaleString('en-NG')} km` : '—'}
                </dd>
              </div>
              {fuelLevelLabel(jobCard.fuelLevel) ? (
                <div>
                  <dt className="text-[var(--ejo-text-muted)]">Fuel at check-in</dt>
                  <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{fuelLevelLabel(jobCard.fuelLevel)}</dd>
                </div>
              ) : null}
              {jobCard.itemsInVehicle ? (
                <div className="sm:col-span-2">
                  <dt className="text-[var(--ejo-text-muted)]">Items left in the vehicle</dt>
                  <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{jobCard.itemsInVehicle}</dd>
                </div>
              ) : null}
              {jobCard.jobType === 'SPRAYING' ? (
                <div className="sm:col-span-2" data-testid="job-card-spraying">
                  <dt className="text-[var(--ejo-text-muted)]">Spraying</dt>
                  <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                    {jobCard.sprayColour ?? '—'}{jobCard.sprayColourCode ? ` (paint code ${jobCard.sprayColourCode})` : ''}: {sprayPanelLabels(jobCard.sprayPanels).join(', ') || '—'}
                  </dd>
                </div>
              ) : null}
              {jobCard.jobType === 'CAR_WASH' ? (
                <div>
                  <dt className="text-[var(--ejo-text-muted)]">Car wash</dt>
                  <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{washPackageLabel(jobCard.washPackage) ?? '—'}</dd>
                </div>
              ) : null}
              {jobCard.comebackOf ? (
                <div className="sm:col-span-2" data-testid="job-card-comeback">
                  <dt className="text-[var(--ejo-text-muted)]">Under warranty (comeback)</dt>
                  <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">Putting right the work on <LoadingLink href={`/workshop/job-cards/${jobCard.comebackOf.id}`} className="text-[var(--ejo-primary)] hover:underline">{jobCard.comebackOf.jobNumber}</LoadingLink>. Its lines are under warranty unless the Owner decides otherwise.</dd>
                </div>
              ) : null}
              {guaranteeText(jobCard) ? (
                <div className="sm:col-span-2" data-testid="job-card-guarantee">
                  <dt className="text-[var(--ejo-text-muted)]">Workshop guarantee</dt>
                  <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{guaranteeRuns(jobCard, new Date()) ? 'Runs' : 'Ended'} {guaranteeText(jobCard)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Workshop department</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.department?.name ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Supervisor</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.supervisor?.fullName ?? 'Unassigned'}
                  {jobCard.supervisor ? (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        jobCard.approvalStatus === 'APPROVED'
                          ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                          : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                      }`}
                    >
                      {jobCard.approvalStatus === 'APPROVED' ? 'Approved' : 'Awaiting approval'}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Assigned technician</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.assignedTechnician?.fullName ?? 'Unassigned'}
                  {jobCard.technicianAcceptanceStatus ? (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        jobCard.technicianAcceptanceStatus === 'ACCEPTED'
                          ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                          : jobCard.technicianAcceptanceStatus === 'REJECTED'
                            ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]'
                            : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                      }`}
                    >
                      {jobCard.technicianAcceptanceStatus === 'ACCEPTED'
                        ? 'Accepted'
                        : jobCard.technicianAcceptanceStatus === 'REJECTED'
                          ? `Rejected — ${jobCard.technicianRejectionReason}`
                          : 'Awaiting response'}
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            {(() => {
              const realComplaints = jobCard.complaints;
              return (
                <>
                  <h2 className="text-sm font-semibold text-[var(--ejo-text)]">
                    {realComplaints.length > 0 ? pluralize(realComplaints.length, 'Complaint') : 'Complaints'}
                  </h2>
                  {realComplaints.length > 0 ? (
                    <ol className="mt-2 space-y-1.5">
                      {realComplaints.map((c: (typeof jobCard.complaints)[number]) => (
                        <li key={c.id} className="flex gap-2 text-sm text-[var(--ejo-text)]">
                          <span className="shrink-0 font-medium text-[var(--ejo-text-muted)]">{c.sequenceNumber}.</span>
                          <span>{c.description}</span>
                        </li>
                      ))}
                    </ol>
                  ) : jobCard.complaints.length === 0 ? (
                    // Job Cards created before per-item complaints only have the old `complaint` field.
                    <p className="mt-2 text-sm text-[var(--ejo-text)]">{jobCard.complaint}</p>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No complaints recorded.</p>
                  )}
                </>
              );
            })()}
            {jobCard.diagnosis ? (
              <>
                <h2 className="mt-4 text-sm font-semibold text-[var(--ejo-text)]">Diagnosis</h2>
                <p className="mt-2 text-sm text-[var(--ejo-text)]">{jobCard.diagnosis}</p>
              </>
            ) : null}
          </div>

          <JobCardPhotos jobCardId={jobCard.id} photos={photoData.photos} canAdd={photoData.canAdd} myUserId={viewerId} />

          {outsideCosts ? <OutsideCostsCard jobCardId={jobCard.id} rows={outsideCosts} /> : null}

          {/* The check-in inspection: one per Job Card, started, skipped or completed on its own page. */}
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6" data-testid="job-card-inspection">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Vehicle inspection</h2>
              <StatusChip tone={!inspection ? 'neutral' : inspection.status === 'COMPLETED' ? 'success' : inspection.status === 'SKIPPED' ? 'neutral' : 'info'}>
                {!inspection ? 'Not started' : inspection.status === 'COMPLETED' ? 'Completed' : inspection.status === 'SKIPPED' ? 'Skipped' : 'In progress'}
              </StatusChip>
            </div>
            {inspection && inspection.status !== 'SKIPPED' ? (() => {
              const count = (sev: string) => inspection.items.filter((i: { severity: string | null }) => i.severity === sev).length;
              const reviewed = inspection.items.filter((i: { severity: string | null }) => i.severity).length;
              return (
                <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                  {reviewed} of {inspection.items.length} items checked · {count('CRITICAL')} critical · {count('SERVICE_REQUIRED')} service required · {count('ATTENTION')} attention · {count('GOOD')} good
                </p>
              );
            })() : inspection?.status === 'SKIPPED' ? (
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Skipped{inspection.skipReason ? `: ${inspection.skipReason}` : '.'}</p>
            ) : (
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Check the vehicle at check-in and record what you find, or skip it with a reason.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <LoadingLink href={`/workshop/job-cards/${jobCard.id}/inspection`} className="inline-flex min-h-10 items-center rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 font-medium text-white hover:opacity-90">
                {!inspection ? 'Start or skip the inspection' : 'Open the inspection'}
              </LoadingLink>
              {inspection && inspection.status !== 'SKIPPED' ? (
                <a href={`/print/vehicle-inspections/${jobCard.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">
                  Print the report
                </a>
              ) : null}
              {inspection?.status === 'COMPLETED' ? (
                <a href={`/api/job-cards/${jobCard.id}/inspection-pdf`} className="inline-flex min-h-10 items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" data-testid="inspection-pdf">
                  Download the report (PDF)
                </a>
              ) : null}
            </div>
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Estimate</h2>
              {estimate ? (
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      estimate.status === 'MANAGER_APPROVED'
                        ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                        : estimate.status === 'SUBMITTED' || estimate.status === 'APPROVED'
                          ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                          : 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]'
                    }`}
                  >
                    {estimate.status === 'APPROVED' && isEligibleManager && estimate.approvedById !== viewerId && estimate.createdById !== viewerId ? 'Waiting for you (Owner)' : ESTIMATE_STATUS_LABEL[estimate.status]}
                  </span>
                  {estimate.status === 'MANAGER_APPROVED' ? (
                    <PrintMenu
                      orgHref={`/print/job-cards/${jobCard.id}/estimate`}
                      clientHref={`/print/job-cards/${jobCard.id}/estimate?variant=client`}
                      clientLabel="Customer Copy"
                      size="compact"
                      align="right"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            {jobCard.approvalStatus !== 'APPROVED' ? (
              <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">
                This Job Card must be approved by its supervisor before an estimate can be started.
              </p>
            ) : !estimate || estimate.lineItems.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">No estimate lines yet.</p>
            ) : (
              <>
                <EstimateLinesTable
                  withActions={isEstimateContributor}
                  lines={estimate.lineItems.map((item: (typeof estimate.lineItems)[number]): EstimateLineView => {
                    const canModifyThis =
                      estimate.status !== 'MANAGER_APPROVED' && isEstimateContributor && (viewerId === item.enteredById || isApprover);
                    const isEditingThis = editLineId === item.id && canModifyThis;
                    // The matched part's unit, or the Part Type's typical
                    // unit until the Store matches it.
                    const storePartPreviewUnit =
                      item.type === 'STORE_PART'
                        ? (item.unitOfMeasure ?? partTypes.find((t: (typeof partTypes)[number]) => t.id === item.partTypeId)?.typicalUnit ?? null)
                        : null;
                    // "1 Set", "2 Sets".
                    const rawUnit = item.type === 'STORE_PART' ? storePartPreviewUnit : item.unitOfMeasure;
                    const displayUnit = rawUnit ? pluralizeWord(item.quantity, rawUnit) : '—';
                    // While Draft, a matched Store Part line shows the
                    // part's current selling price. After Draft, the
                    // stored figures are shown as recorded.
                    const liveUnitPrice =
                      item.type === 'STORE_PART' && item.matchedPart && estimate?.status === 'DRAFT' && item.matchedPart.sellingPrice !== null
                        ? Number(item.matchedPart.sellingPrice)
                        : item.unitPrice !== null
                          ? Number(item.unitPrice)
                          : null;
                    const liveAmount = liveUnitPrice !== null ? getLiveLineAmount(item) : null;
                    return {
                      id: item.id,
                      typeLabel: ESTIMATE_TYPE_LABEL[item.type] ?? item.type,
                      description: item.description,
                      notes: (
                        <>
                          {item.type === 'STORE_PART' ? (
                            item.matchedPart ? (
                              <div className="mt-0.5 text-[11px] text-[var(--ejo-success)]">Matched: {item.matchedPart.name}</div>
                            ) : (
                              <div className="mt-0.5 text-[11px] font-medium text-[var(--ejo-warning-text)]">Awaiting Store match</div>
                            )
                          ) : null}
                          {item.discountAmount !== null && Number(item.discountAmount) > 0 && isCustomerLine(item) ? (
                            <div className="mt-0.5 text-[11px] font-medium text-[var(--ejo-success)]">Discount −{formatNaira(item.discountAmount)}</div>
                          ) : null}
                        </>
                      ),
                      quantity: item.quantity,
                      unit: displayUnit,
                      unitPrice: formatNaira(liveUnitPrice),
                      liveTag: item.type === 'STORE_PART' && Boolean(item.matchedPart) && estimate?.status === 'DRAFT',
                      amount: formatNaira(liveAmount),
                      enteredBy: item.enteredBy.fullName,
                      actions: canModifyThis ? (
                        <>
                          <EstimateLineEditLink href={`/workshop/job-cards/${jobCard.id}?editLineId=${item.id}`} />
                          <form action={deleteEstimateLineItemFormAction} className="inline-flex items-center">
                            <FormPendingOverlay />
                            <input type="hidden" name="jobCardId" value={jobCard.id} />
                            <input type="hidden" name="lineItemId" value={item.id} />
                            <EstimateLineRemoveButton />
                          </form>
                        </>
                      ) : null,
                      editor: isEditingThis ? (
                        <EstimateLineEditor
                          action={updateEstimateLineItemFormAction}
                          hidden={
                            <>
                              <input type="hidden" name="jobCardId" value={jobCard.id} />
                              <input type="hidden" name="lineItemId" value={item.id} />
                            </>
                          }
                          typeLabel={ESTIMATE_TYPE_LABEL[item.type] ?? item.type}
                          description={item.description}
                          quantity={item.quantity}
                          unitOfMeasure={item.unitOfMeasure}
                          storePartUnit={storePartPreviewUnit}
                          isStorePart={item.type === 'STORE_PART'}
                          unitPrice={item.unitPrice != null ? Number(item.unitPrice) : null}
                          datalistId="internal-job-suggestions"
                          cancelHref={`/workshop/job-cards/${jobCard.id}`}
                        />
                      ) : undefined,
                    };
                  })}
                />
                <div className="mt-3 space-y-1 border-t border-[var(--ejo-border)] pt-3 text-sm">
                  {ESTIMATE_TYPES.map((type) => {
                    const subtotal = estimate.lineItems
                      .filter((item: (typeof estimate.lineItems)[number]) => item.type === type)
                      .reduce((sum: number, item: (typeof estimate.lineItems)[number]) => sum + getLiveLineAmount(item), 0);
                    if (subtotal === 0) return null;
                    return (
                      <div key={type} className="flex justify-between text-[var(--ejo-text-muted)]">
                        <span>{ESTIMATE_TYPE_LABEL[type]} subtotal</span>
                        <span>{formatNaira(subtotal)}</span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between text-base font-semibold text-[var(--ejo-text)]">
                    <span>Total Estimate</span>
                    <span>
                      {formatNaira(
                        estimate.lineItems.reduce(
                          (sum: number, item: (typeof estimate.lineItems)[number]) => sum + getLiveLineAmount(item),
                          0,
                        ),
                      )}
                    </span>
                  </div>
                  {estimate.lineItems.some((item: (typeof estimate.lineItems)[number]) => !isCustomerLine(item)) ? (
                    <>
                      <div className="flex justify-between text-sm text-[var(--ejo-success)]">
                        <span>Covered — under warranty, goodwill or internal (not charged)</span>
                        <span>
                          −{formatNaira(
                            estimate.lineItems
                              .filter((item: (typeof estimate.lineItems)[number]) => !isCustomerLine(item))
                              .reduce((sum: number, item: (typeof estimate.lineItems)[number]) => sum + getLiveLineAmount(item), 0),
                          )}
                        </span>
                      </div>
                    </>
                  ) : null}
                  {liveTotals.lineDiscounts > 0 ? (
                    <div className="flex justify-between text-sm text-[var(--ejo-success)]">
                      <span>Line discounts</span>
                      <span>−{formatNaira(liveTotals.lineDiscounts)}</span>
                    </div>
                  ) : null}
                  {liveTotals.discountAmount > 0 ? (
                    <div className="flex justify-between text-sm text-[var(--ejo-success)]">
                      <span>
                        Discount ({discountPercent(liveTotals)}%){estimate.discountReason ? ` — ${estimate.discountReason}` : ''}
                        {estimate.discountApprovedAt ? ' · approved by the Owner' : discountForManager ? ' · needs the Owner' : ''}
                      </span>
                      <span>−{formatNaira(liveTotals.discountAmount)}</span>
                    </div>
                  ) : null}
                  {liveTotals.vatRate > 0 ? (
                    <div className="flex justify-between text-sm text-[var(--ejo-text-muted)]">
                      <span>{vatIsFixed(estimate) ? `VAT at ${liveTotals.vatRate}% (fixed when the Owner approved)` : `VAT (${liveTotals.vatRate}%)`}</span>
                      <span>{formatNaira(liveTotals.vatAmount)}</span>
                    </div>
                  ) : null}
                  {liveTotals.lineDiscounts > 0 || liveTotals.discountAmount > 0 || liveTotals.vatRate > 0 || estimate.lineItems.some((item: (typeof estimate.lineItems)[number]) => !isCustomerLine(item)) ? (
                    <div className="flex justify-between text-base font-bold text-[var(--ejo-text)]" data-testid="customer-pays">
                      <span>Customer pays</span>
                      <span>{formatNaira(liveTotals.total)}</span>
                    </div>
                  ) : null}
                </div>
                {canDiscount ? (
                  <details className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
                    <summary className="cursor-pointer text-xs font-medium text-[var(--ejo-text)]">Give a discount</summary>
                    <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                      Only on what the customer pays, never more than the amount discounted.{' '}
                      {billingSettings?.discountApprovalPercent != null
                        ? `A discount on the whole estimate above ${billingSettings.discountApprovalPercent}% of the subtotal needs the Owner's approval.`
                        : 'A discount on the whole estimate needs the Owner\'s approval.'}
                    </p>
                    <form action={setEstimateDiscountFormAction} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr_auto]">
                      <FormPendingOverlay />
                      <input type="hidden" name="jobCardId" value={jobCard.id} />
                      <input name="discountAmount" type="number" min="0" step="0.01" defaultValue={estimate.discountAmount !== null ? Number(estimate.discountAmount).toFixed(2) : ''} placeholder="₦0.00" aria-label="Discount on the whole estimate (₦)" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]" />
                      <input name="discountReason" maxLength={300} defaultValue={estimate.discountReason ?? ''} placeholder="Reason, e.g. Loyal fleet customer" aria-label="Reason for the discount" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]" />
                      <SubmitButton label="Save estimate discount" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                    </form>
                    <form action={setEstimateLineDiscountFormAction} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem_1fr_auto]">
                      <FormPendingOverlay />
                      <input type="hidden" name="jobCardId" value={jobCard.id} />
                      <select name="lineItemId" required aria-label="Line to discount" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]">
                        {estimate.lineItems.filter((item: (typeof estimate.lineItems)[number]) => isCustomerLine(item) && item.amount !== null).map((item: (typeof estimate.lineItems)[number]) => (
                          <option key={item.id} value={item.id}>{item.description} ({formatNaira(item.amount)})</option>
                        ))}
                      </select>
                      <input name="discountAmount" type="number" min="0" step="0.01" placeholder="₦0.00" aria-label="Discount on this line (₦)" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]" />
                      <input name="discountReason" maxLength={300} placeholder="Reason" aria-label="Reason for the line discount" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]" />
                      <SubmitButton label="Save line discount" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                    </form>
                    <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Enter 0 to remove a discount.</p>
                  </details>
                ) : null}
              </>
            )}


            {jobCard.approvalStatus === 'APPROVED' && isEstimateContributor && (!estimate || estimate.status === 'DRAFT') ? (
              <EstimateLineItemForm
                key={estimate?.lineItems.length ?? 0}
                jobCardId={jobCard.id}
                categories={partCategoriesWithTypes}
                descriptionSuggestions={COMMON_ESTIMATE_LINE_DESCRIPTIONS}
                hasSundry={Boolean(estimate?.lineItems.some((li: (typeof estimateLineItems)[number]) => li.type === 'SUNDRY'))}
                isTechnicianOnly={isAssignedTechnician && !isApprover}
              />
            ) : null}

            {estimate?.status === 'DRAFT' && isAssignedTechnician ? (
              <form action={notifySupervisorAboutEstimateFormAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <div className="flex-1 min-w-[180px]">
                  <label htmlFor="jc-note-supervisor" className="mb-1 block text-[11px] text-[var(--ejo-text-muted)]">Notify supervisor (optional note)</label>
                  <input id="jc-note-supervisor"
                    name="note"
                    placeholder="e.g. Compressor priced, ready to check"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                  />
                  <RefineTextButton targetId="jc-note-supervisor" />
                </div>
                <SubmitButton
                  label="Notify supervisor"
                  pendingLabel="Sending…"
                  className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                />
              </form>
            ) : null}

            {estimate?.status === 'DRAFT' && isApprover ? (
              <form action={notifyTechnicianAboutEstimateFormAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <div className="flex-1 min-w-[180px]">
                  <label htmlFor="jc-note-technician" className="mb-1 block text-[11px] text-[var(--ejo-text-muted)]">Notify technician (optional note)</label>
                  <input id="jc-note-technician"
                    name="note"
                    placeholder="e.g. Please add the AC compressor price"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                  />
                  <RefineTextButton targetId="jc-note-technician" />
                </div>
                <SubmitButton
                  label="Notify technician"
                  pendingLabel="Sending…"
                  className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                />
              </form>
            ) : null}

            {estimate?.status === 'DRAFT' && isEstimateContributor && estimate.lineItems.length > 0 && hasUnmatchedStoreParts ? (
              <form action={requestStoreMatchingFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">
                  {estimate.matchingRequestedAt
                    ? 'Store matching requested. You can submit once the Store has matched every Store Part line.'
                    : 'Store Part lines are priced when the Store matches them. Request Store matching to continue.'}
                </p>
                <SubmitButton
                  label={estimate.matchingRequestedAt ? 'Request Store Matching Again' : 'Request Store Matching'}
                  pendingLabel="Sending…"
                  className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-warning)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            ) : null}

            {estimate?.status === 'DRAFT' && isEstimateContributor && estimate.lineItems.length > 0 && !hasUnmatchedStoreParts ? (
              <form action={submitEstimateForValidationFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">
                  Every line needs a price. The supervisor validates the estimate next.
                </p>
                <SubmitButton
                  label="Submit for validation"
                  pendingLabel="Submitting…"
                  className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            ) : null}

            {estimate?.status === 'SUBMITTED' && isApprover ? (
              <form action={approveEstimateFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <SubmitButton
                  label="Approve estimate"
                  pendingLabel="Approving…"
                  className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            ) : null}

            {estimate?.status === 'APPROVED' && isEligibleManager ? (
              <form action={approveEstimateAsManagerFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">
                  Approved by the supervisor. When you approve, {jobCard.createdBy.fullName} (who opened this Job
                  Card) is asked to review it and tell the customer.
                </p>
                {discountForManager ? (
                  <div className="mb-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-3 text-xs text-[var(--ejo-text)]" data-testid="discount-needs-manager">
                    <p className="font-medium">
                      This estimate carries a discount of {formatNaira(liveTotals.discountAmount)} ({discountPercent(liveTotals)}% of the customer&apos;s subtotal){estimate.discountReason ? ` — ${estimate.discountReason}` : ''}.
                      {billingSettings?.discountApprovalPercent != null ? ` Discounts above ${billingSettings.discountApprovalPercent}% need your approval.` : ' Every discount needs your approval.'}
                    </p>
                    <label className="mt-2 flex items-center gap-2">
                      <input type="checkbox" name="approveDiscount" required />
                      Approve the discount with the estimate
                    </label>
                  </div>
                ) : null}
                <SubmitButton
                  label="Approve as Owner"
                  pendingLabel="Approving…"
                  className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            ) : null}
            {estimate?.status === 'APPROVED' && isEligibleManager ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">Needs changes? Send it back to the supervisor…</summary>
                <form action={returnEstimateForChangesFormAction} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="jobCardId" value={jobCard.id} />
                  <input name="reason" required minLength={3} maxLength={500} placeholder="What needs to change" className="min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)]" />
                  <SubmitButton label="Send back" pendingLabel="Sending…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/50 px-3 py-1.5 text-sm font-medium text-[var(--ejo-warning)]" />
                </form>
              </details>
            ) : null}

            {estimate?.status === 'MANAGER_APPROVED' && !estimate.customerNotifiedAt && isCreator ? (
              <form action={notifyCustomerOfApprovedEstimateFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">
                  Fully approved. Check the estimate, then send it to the customer.
                </p>
                <SubmitButton
                  label="Notify customer"
                  pendingLabel="Notifying…"
                  className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            ) : null}
            {estimate?.status === 'MANAGER_APPROVED' && estimate.customerNotifiedAt ? (
              <p className="mt-4 border-t border-[var(--ejo-border)] pt-4 text-xs text-[var(--ejo-text-muted)]">
                Customer notified on {formatDateTime(estimate.customerNotifiedAt)}.
              </p>
            ) : null}
            {estimate?.status === 'MANAGER_APPROVED' && estimate.customerNotifiedAt ? (
              <div className="mt-3 space-y-3" data-testid="customer-approval">
                {estimate.customerApprovedAt ? (
                  <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/10 px-3 py-2 text-xs text-[var(--ejo-text)]">
                    <span className="font-medium">Approved by the customer</span> — {APPROVED_VIA_LABEL[estimate.customerApprovedVia ?? ''] ?? 'recorded'}
                    {estimate.customerApprovedVia === 'PHONE' && estimate.customerApprovedByStaff ? ` (taken by ${estimate.customerApprovedByStaff.fullName})` : ''} on {formatDateTime(estimate.customerApprovedAt)}.
                    {estimate.customerApprovalNote ? ` ${estimate.customerApprovalNote}` : ''}
                    {jobCard.status === 'AWAITING_CUSTOMER_APPROVAL' && minimumDeposit > 0 ? ` The work starts once the deposit (${formatNaira(minimumDeposit)}) is recorded.` : ''}
                  </p>
                ) : estimate.customerDeclinedAt ? (
                  <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 px-3 py-2 text-xs text-[var(--ejo-text)]" data-testid="customer-declined">
                    <p><span className="font-medium">Declined</span> on {formatDateTime(estimate.customerDeclinedAt)}{estimate.customerDeclineNote ? `: ${estimate.customerDeclineNote}` : '.'}</p>
                    <p className="mt-1 text-[var(--ejo-text-muted)]">Next: call the customer. If they change their mind, record their approval by phone below or send a new approval link. To stop the job, request a cancellation.</p>
                  </div>
                ) : awaitingAnswer ? (
                  <p className="text-xs text-[var(--ejo-text-muted)]">Waiting for the customer to approve — by the link in their email, in the customer portal, or by phone.</p>
                ) : null}
                {awaitingAnswer && mayTakeAnswer && !isCancelled ? (
                  <>
                    <ApprovalLinkPanel jobCardId={jobCard.id} />
                    {canWhatsApp ? (
                      <div className="space-y-1">
                        <WhatsAppSendButton prepare={{ document: { kind: 'ESTIMATE', id: jobCard.id } }} label="Send estimate on WhatsApp" testId="estimate-whatsapp" sendNow={whatsAppConfigured()} />
                        <p className="text-[11px] text-[var(--ejo-text-muted)]">The estimate PDF and a fresh approval link, ready to send from your phone. The new approval link replaces the one we emailed.</p>
                      </div>
                    ) : null}
                    <details className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2">
                      <summary className="cursor-pointer text-xs font-medium text-[var(--ejo-text)]">Customer approved by phone</summary>
                      <form action={recordCustomerApprovalByPhoneFormAction} className="mt-2 space-y-2">
                        <FormPendingOverlay />
                        <input type="hidden" name="jobCardId" value={jobCard.id} />
                        <label htmlFor="jc-spoke-with" className="block text-xs font-medium text-[var(--ejo-text-muted)]">Who did you speak with?</label>
                        <input id="jc-spoke-with" name="spokeWith" required minLength={2} maxLength={120} defaultValue={jobCard.customer.fullName} className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-2 py-2 text-xs text-[var(--ejo-text)]" />
                        <input name="note" maxLength={500} placeholder="Note (optional), e.g. the time of the call" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-2 py-2 text-xs text-[var(--ejo-text)]" />
                        <p className="text-[11px] text-[var(--ejo-text-muted)]">Recorded with your name. {minimumDeposit > 0 ? `The work starts once the deposit (${formatNaira(minimumDeposit)}) is paid.` : 'No deposit applies, so the Job Card moves to In Progress at once.'}</p>
                        <SubmitButton label="Record approval by phone" pendingLabel="Recording…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90" />
                      </form>
                    </details>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          {billing ? <JobCardBillingPanel jobCardId={jobCard.id} billing={billing} /> : null}

          {invoice || (invoiceable && mayInvoice) ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6" data-testid="invoice-panel">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Invoice</h2>
                {invoice ? <span className="font-mono text-sm font-semibold text-[var(--ejo-text)]" data-testid="invoice-number">{invoice.invoiceNumber}</span> : null}
              </div>
              {invoice ? (
                <>
                  <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                    Issued {formatDateTime(invoice.issuedAt)} · {formatNaira(invoice.total)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <a href={`/print/invoices/${invoice.id}`} target="_blank" rel="noopener" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">
                      Print invoice
                    </a>
                    {mayInvoice && jobCard.customer.email ? (
                      <form action={emailInvoiceFormAction}>
                        <FormPendingOverlay />
                        <input type="hidden" name="jobCardId" value={jobCard.id} />
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <SubmitButton label="Email invoice" pendingLabel="Sending…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                      </form>
                    ) : null}
                    {mayInvoice && canWhatsApp ? <WhatsAppSendButton prepare={{ document: { kind: 'INVOICE', id: invoice.id } }} testId="invoice-whatsapp" sendNow={whatsAppConfigured()} /> : null}
                  </div>
                </>
              ) : (
                <form action={issueInvoiceFormAction} className="mt-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="jobCardId" value={jobCard.id} />
                  <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">The work is finished but no invoice has been issued yet. Issuing one fixes its figures as they are now and emails the customer a copy.</p>
                  <SubmitButton label="Issue invoice" pendingLabel="Issuing…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
                </form>
              )}
            </div>
          ) : null}

          {invoice && creditNotes ? <CreditNotesPanel jobCardId={jobCard.id} invoiceId={invoice.id} data={creditNotes} /> : null}

          {refunds.length > 0 || ((jobCard.status === 'CANCELLED' || pendingCancellationRequest) && paymentsTotal > 0) || (billing?.overpaid ?? 0) > 0 ? (
            <RefundsPanel
              target={{ jobCardId: jobCard.id }}
              paid={paymentsTotal}
              refunds={refunds}
              isCancelled={jobCard.status === 'CANCELLED' || Boolean(approvedCancellation)}
              canRecord={isEligibleFinance}
              defaultPaidTo={jobCard.customer.fullName}
              defaultReason={approvedCancellation?.reason ?? pendingCancellationRequest?.reason ?? ((billing?.overpaid ?? 0) > 0 ? 'Overpayment — lines now covered by warranty, goodwill or internally' : null)}
              customerOwes={jobCard.status === 'CANCELLED' || approvedCancellation ? 0 : estimateTotal}
              whatsAppFor={isEligibleFinance ? refundWhatsApp : undefined}
            />
          ) : null}

          {/* Also once the customer has approved the estimate with nothing paid yet (no deposit asked, or a quick car wash). */}
          {payments.length > 0 || jobCard.status === 'AWAITING_CUSTOMER_APPROVAL' || (credit?.onCredit && Boolean(invoice)) || (Boolean(estimate?.customerApprovedAt) && estimateTotal > 0 && !isCancelled) ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Payments</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYMENT_STATUS_COLOR[paymentStatus]}`}>
                  {PAYMENT_STATUS_LABEL[paymentStatus]}
                </span>
              </div>
              {payments.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">No payments recorded yet.</p>
              ) : (
                <div className="mt-3 space-y-2 text-sm">
                  {payments.map((p: (typeof payments)[number]) => (
                    <div key={p.id} className="flex items-center justify-between border-b border-[var(--ejo-border)] pb-2 last:border-0">
                      <div>
                        <p className="text-[var(--ejo-text)]">
                          {formatNaira(p.amount)} — {PAYMENT_METHOD_LABEL[p.method] ?? 'Bank transfer'}{p.posReference ? ` · ref ${p.posReference}` : ''}
                        </p>
                        <p className="text-xs text-[var(--ejo-text-muted)]">
                          Receipt {p.receiptNumber ?? '—'} · {p.recordedBy.fullName} · {formatDateTime(p.recordedAt)}
                          {p.notes ? ` · ${p.notes}` : ''}
                        </p>
                      </div>
                      {p.receiptNumber ? (
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          <a href={`/print/receipts/${p.id}`} target="_blank" rel="noopener" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">
                            Print receipt
                          </a>
                          {isEligibleFinance && canWhatsApp ? <WhatsAppSendButton prepare={{ document: { kind: 'RECEIPT', id: p.id } }} label="Receipt on WhatsApp" testId="receipt-whatsapp" sendNow={whatsAppConfigured()} /> : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <div className="flex justify-between pt-1 text-sm font-semibold text-[var(--ejo-text)]">
                    <span>Total recorded</span>
                    <span>{formatNaira(paymentsTotal)}</span>
                  </div>
                  {estimateTotal > 0 && !isPaidInFull ? (
                    <div className="flex justify-between text-sm text-[var(--ejo-warning)]">
                      <span>Balance remaining</span>
                      <span>{formatNaira(outstanding)}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {estimateTotal > 0 && isPaidInFull ? (
                <p className="mt-4 border-t border-[var(--ejo-border)] pt-4 text-xs font-medium text-[var(--ejo-success)]">
                  Paid in full — nothing further to record.
                </p>
              ) : (['AWAITING_CUSTOMER_APPROVAL', 'IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION'].includes(jobCard.status) || (['CLOSED', 'CHECKED_OUT'].includes(jobCard.status) && Boolean(invoice))) && isEligibleFinance ? (
                <>
                  <p className="mt-4 border-t border-[var(--ejo-border)] pt-4 text-xs text-[var(--ejo-text-muted)]">
                    {jobCard.status !== 'AWAITING_CUSTOMER_APPROVAL'
                      ? 'Record payments towards the balance as they come in.'
                      : minimumDeposit > 0
                        ? `Paying the ${depositPct}% deposit (${formatNaira(minimumDeposit)}) counts as the customer’s approval, and the Job Card moves to In Progress.`
                        : 'No deposit applies. A payment here counts as the customer’s approval, and the Job Card moves to In Progress.'}
                    {' '}Pick a suggested amount or choose &quot;Other&quot; to enter a different one.
                  </p>
                  <form key={payments.length} action={recordPaymentFormAction} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <IdempotencyKey />
                    <input type="hidden" name="jobCardId" value={jobCard.id} />
                    <FormPendingOverlay />
                    <PaymentAmountField
                      options={
                        paymentsTotal > 0 || creditedTotal > 0
                          ? [{ key: 'REMAINING', label: `Remaining balance (${formatNaira(outstanding)})`, value: outstanding.toFixed(2) }]
                          : [
                              ...(minimumDeposit > 0 ? [{ key: 'DEPOSIT', label: `${depositPct}% deposit (${formatNaira(minimumDeposit)})`, value: minimumDeposit.toFixed(2) }] : []),
                              { key: 'FULL', label: `Full payment (${formatNaira(estimateTotal)})`, value: estimateTotal.toFixed(2) },
                            ]
                      }
                    />
                    <select aria-label="Payment method"
                      name="method"
                      required
                      defaultValue="BANK_TRANSFER"
                      className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                    >
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CASH">Cash</option>
                      <option value="POS">POS (card)</option>
                    </select>
                    <input
                      name="posReference"
                      placeholder="POS reference (RRN), for card payments"
                      aria-label="POS transaction reference"
                      maxLength={40}
                      className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                    />
                    <input
                      name="notes"
                      placeholder="Reference / notes (optional)"
                      className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                    />
                    <SubmitButton
                      label="Record payment"
                      pendingLabel="Recording…"
                      className="col-span-full min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                    />
                  </form>
                </>
              ) : null}
            </div>
          ) : null}

          {sourcingNeeds.isEligibleToSource && sourcingNeeds.needsStoreParts ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Sourcing</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Based on this Job Card&apos;s estimate. Parts bought outside are priced on the estimate and need no request.
              </p>

              {sourcingNeeds.needsStoreParts ? (
                <div className="mt-4 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-info)]/5 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-[var(--ejo-info)]">
                          <path d="M3 6.5L10 3l7 3.5-7 3.5-7-3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                          <path d="M3 6.5V14l7 3.5 7-3.5V6.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                          <path d="M10 10v7.5" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                        <h3 className="text-xs font-semibold text-[var(--ejo-text)]">Store Parts</h3>
                      </div>
                      {sourcingNeeds.hasRequestablePartLines ? (
                        <LoadingLink
                          href={`/workshop/job-cards/${id}/request-parts`}
                          className="inline-flex items-center gap-1 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          + Request Store Parts
                        </LoadingLink>
                      ) : sourcingNeeds.existingPartRequestSlips.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ejo-success)]/15 px-2.5 py-1 text-xs font-medium text-[var(--ejo-success)]">
                          All requested
                        </span>
                      ) : null}
                    </div>
                    {sourcingNeeds.existingPartRequestSlips.length === 0 ? (
                      <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No requests raised yet.</p>
                    ) : (
                      <div className="mt-3 space-y-1.5">
                        {sourcingNeeds.existingPartRequestSlips.map((slip: (typeof sourcingNeeds.existingPartRequestSlips)[number]) => (
                          <LoadingLink
                            key={slip.id}
                            href={`/workshop/parts-requests/${slip.id}`}
                            className="flex items-center justify-between rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs hover:opacity-80"
                          >
                            <span className="font-medium text-[var(--ejo-text)]">{slip.referenceNumber}</span>
                            <span className={`rounded-full px-2 py-0.5 font-medium ${PART_REQUEST_STATUS_BADGE_CLASS[slip.status] ?? 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]'}`}>
                              {PART_REQUEST_STATUS_LABEL[slip.status] ?? slip.status}
                            </span>
                          </LoadingLink>
                        ))}
                      </div>
                    )}
                  </div>
              ) : null}
            </div>
          ) : null}

          {cancellationRequests.length > 0 ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Cancellation history</h2>
              <div className="mt-3 space-y-3 text-sm">
                {cancellationRequests.map((r: (typeof cancellationRequests)[number]) => (
                  <div key={r.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-3">
                    <div className="flex items-center justify-between">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          r.status === 'APPROVED'
                            ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]'
                            : r.status === 'DECLINED'
                              ? 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]'
                              : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                        }`}
                      >
                        {r.status === 'APPROVED' ? 'Approved' : r.status === 'DECLINED' ? 'Declined' : 'Awaiting Owner Decision'}
                      </span>
                      <span className="text-xs text-[var(--ejo-text-muted)]">{formatDateTime(r.requestedAt)}</span>
                    </div>
                    <p className="mt-1 text-[var(--ejo-text)]">{r.reason}</p>
                    <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Requested by {r.requestedBy.fullName}</p>
                    {r.decidedBy ? (
                      <p className="text-xs text-[var(--ejo-text-muted)]">
                        {r.status === 'APPROVED' ? 'Approved' : 'Declined'} by {r.decidedBy.fullName}
                        {r.decisionNotes ? ` — ${r.decisionNotes}` : ''}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 text-xs text-[var(--ejo-text-muted)]">
            Opened by {jobCard.createdBy.fullName} on {formatDateTime(jobCard.createdAt)}
            {jobCard.closedAt ? ` — closed ${formatDateTime(jobCard.closedAt)}` : null}
          </div>
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:pb-6">
          {isCreator && !jobCard.supervisor && !isCheckedOut ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Reassign supervisor</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {jobCard.approvalStatus === 'REJECTED'
                  ? `This Job Card was rejected${jobCard.rejectionReason ? ` — ${jobCard.rejectionReason}` : ''}. Route it to another eligible supervisor in the same department.`
                  : 'No supervisor is currently assigned. Choose one to route this Job Card to.'}
              </p>
              {eligibleSupervisors.supervisors.length === 0 ? (
                <p className="mt-3 text-xs text-[var(--ejo-error)]">
                  No eligible supervisor is currently active.
                </p>
              ) : (
                <form action={reassignSupervisorFormAction} className="mt-3 space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="jobCardId" value={jobCard.id} />
                  <select aria-label="Supervisor"
                    name="supervisorId"
                    required
                    defaultValue=""
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                  >
                    <option value="" disabled>Select a supervisor…</option>
                    {eligibleSupervisors.supervisors.map((s) => (
                      <option key={s.id} value={s.id}>{s.fullName}</option>
                    ))}
                  </select>
                  <SubmitButton
                    label="Reassign"
                    pendingLabel="Reassigning…"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                  />
                </form>
              )}
              {eligibleSupervisors.usingFallback ? (
                <p className="mt-1 text-[11px] text-[var(--ejo-warning)]">
                  No supervisor is set up for this department yet, so an administrator is listed instead.
                </p>
              ) : null}
            </div>
          ) : null}

          {isApprover && jobCard.approvalStatus === 'PENDING' && !isCheckedOut ? (
            <div id="review-approval" className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Review this Job Card</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Approve to let the work go ahead, or reject it back to {jobCard.createdBy.fullName} with a reason
                (availability or workload are fine reasons).
              </p>
              <form action={approveJobCardFormAction} className="mt-4 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <textarea id="jc-approve-notes"
                  name="notes"
                  rows={2}
                  placeholder="Optional notes"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <RefineTextButton targetId="jc-approve-notes" />
                <SubmitButton
                  label="Approve"
                  pendingLabel="Approving…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
              <form action={rejectJobCardFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <input
                  name="reason"
                  required
                  placeholder="Reason for rejection (required)"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <textarea id="jc-reject-notes"
                  name="notes"
                  rows={2}
                  placeholder="Optional additional notes"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <RefineTextButton targetId="jc-reject-notes" />
                <SubmitButton
                  label="Reject"
                  pendingLabel="Rejecting…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}

          <div id="status-panel" className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Status</h2>
              <StatusChip status={jobCard.status} label={STATUS_LABEL[jobCard.status]} />
            </div>
            <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">{STAGE_HINT[jobCard.status]}</p>

            {/* Automatic stages — nothing to click; say what moves them on. */}
            {jobCard.status === 'CHECKED_IN' ? (
              <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text)]">
                Next: write the estimate → the supervisor checks it (the Owner approves it too when needed) → send it to the customer. The status then moves on by itself.
              </p>
            ) : null}
            {jobCard.status === 'AWAITING_CUSTOMER_APPROVAL' ? (
              <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text)]">
                {minimumDeposit > 0
                  ? `Moves to In Progress by itself once the customer approves and the ${depositPct}% deposit (${formatNaira(minimumDeposit)}) is recorded under Payments.`
                  : 'Moves to In Progress by itself as soon as the customer approves — by link, in the portal, by phone, or by paying at the counter.'}
              </p>
            ) : null}
            {jobCard.status === 'READY_FOR_COLLECTION' && !pendingCloseRequest ? (
              <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text)]">
                {isPaidInFull
                  ? 'Next: request the close below — the Owner approves it, then the vehicle can be checked out.'
                  : credit?.onCredit
                    ? `On credit: ${formatNaira(outstanding)} goes on the invoice${credit.paymentTermsDays ? ` (due in ${credit.paymentTermsDays} days)` : ''}. Request the close below.${credit.withinLimit ? '' : ' It takes the organisation over its credit limit, so only the Owner can close it.'}`
                    : `Next: collect the balance (${formatNaira(outstanding)}), then request the close.`}
              </p>
            ) : null}
            {jobCard.status === 'READY_FOR_COLLECTION' && pendingCloseRequest ? (
              <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-info)]/40 bg-[var(--ejo-info)]/10 px-3 py-2 text-xs text-[var(--ejo-text)]">
                Close requested — waiting on the Owner&apos;s approval.
              </p>
            ) : null}

            {/* Forward steps for this viewer — one click each. */}
            {!isCheckedOut ? (
              <div className="mt-3 space-y-2">
                {nextSteps
                  .filter((to) => to !== 'CHECKED_OUT' && !isReworkTransition(jobCard.status, to))
                  .map((to) => (
                    <form key={to} action={updateJobCardStatusFormAction}>
                      <FormPendingOverlay />
                      <input type="hidden" name="jobCardId" value={jobCard.id} />
                      <input type="hidden" name="status" value={to} />
                      <SubmitButton
                        label={NEXT_STEP_LABEL[`${jobCard.status}>${to}`] ?? `Move to ${STATUS_LABEL[to]}`}
                        pendingLabel="Saving…"
                        className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                      />
                    </form>
                  ))}

                {nextSteps.includes('CHECKED_OUT') ? (
                  isCancelled && paymentsTotal - refundedTotal > 0.004 ? (
                    <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 px-3 py-2 text-xs text-[var(--ejo-text)]">
                      {formatNaira(paymentsTotal - refundedTotal)} must be refunded (see Refunds) before the vehicle can be handed back.
                    </p>
                  ) : !isCancelled && !isPaidInFull && !mayLeaveOnCredit ? (
                    <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 px-3 py-2 text-xs text-[var(--ejo-text)]">
                      {credit?.onCredit
                        ? `${formatNaira(outstanding)} outstanding takes the organisation to ${formatNaira(credit.owedIncludingThis)} unpaid, over its credit limit of ${formatNaira(credit.limit ?? 0)}. Record a payment first, or the Owner can close it over the limit.`
                        : `Payment must be completed in full before check-out — ${formatNaira(outstanding)} outstanding.`}
                    </p>
                  ) : (
                    <form action={updateJobCardStatusFormAction} className="space-y-2">
                      <FormPendingOverlay />
                      <input type="hidden" name="jobCardId" value={jobCard.id} />
                      <input type="hidden" name="status" value="CHECKED_OUT" />
                      <label htmlFor="workshop-job-cards-collectedByName" className="block text-xs font-medium text-[var(--ejo-text-muted)]">
                        {isCancelled ? 'Hand the vehicle back — collected by (full name)' : 'Collected by (full name)'}
                      </label>
                      <input id="workshop-job-cards-collectedByName"
                        name="collectedByName"
                        required
                        defaultValue={jobCard.customer.fullName}
                        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                      />
                      {!isCancelled && !isPaidInFull && mayLeaveOnCredit ? (
                        <p className="text-[11px] text-[var(--ejo-text-muted)]">On credit: {formatNaira(outstanding)} stays on the invoice{credit?.paymentTermsDays ? `, due ${credit.paymentTermsDays} days from its date` : ''}.</p>
                      ) : null}
                      <SubmitButton
                        label={isCancelled ? 'Hand vehicle back' : 'Check out vehicle'}
                        pendingLabel="Checking out…"
                        className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                      />
                    </form>
                  )
                ) : null}

                {nextSteps.some((to) => isReworkTransition(jobCard.status, to)) ? (
                  <details className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-[var(--ejo-text)]">
                      {jobCard.status === 'QUALITY_CHECK' ? 'Failed quality check? Send back for rework' : 'Failed road test? Send back for rework'}
                    </summary>
                    <form action={updateJobCardStatusFormAction} className="mt-2 space-y-2">
                      <FormPendingOverlay />
                      <input type="hidden" name="jobCardId" value={jobCard.id} />
                      <input type="hidden" name="status" value="IN_PROGRESS" />
                      <textarea id="jc-rework-reason"
                        name="reworkReason"
                        required
                        rows={2}
                        placeholder="What still needs fixing?"
                        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                      />
                      <RefineTextButton targetId="jc-rework-reason" />
                      <p className="text-[11px] text-[var(--ejo-text-muted)]">
                        Back to In Progress, logged as &quot;Sent back for rework&quot; with this reason.
                        {jobCard.status !== 'QUALITY_CHECK' ? ' The earlier completion is cleared so the final finish is what gets recorded.' : ''}
                      </p>
                      <SubmitButton
                        label="Send back for rework"
                        pendingLabel="Sending back…"
                        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-warning)]/10"
                      />
                    </form>
                  </details>
                ) : null}

                {nextSteps.length === 0 && !['CHECKED_IN', 'AWAITING_CUSTOMER_APPROVAL', 'READY_FOR_COLLECTION'].includes(jobCard.status) ? (
                  <p className="text-xs text-[var(--ejo-text-muted)]">
                    The next step here is taken by {WAITING_ON[jobCard.status] ?? 'the assigned team'}.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-xs text-[var(--ejo-text)]">
                Checked out{jobCard.checkedOutAt ? ` on ${formatDateTime(jobCard.checkedOutAt)}` : ''}
                {jobCard.collectedByName ? ` — collected by ${jobCard.collectedByName}` : ''}. This Job Card is complete.
              </p>
            )}

            {isMasterAdmin && !isCheckedOut ? (
              editStatus === 'true' ? (
                <div className="mt-4 border-t border-[var(--ejo-border)] pt-3">
                  <p className="text-[11px] font-medium text-[var(--ejo-warning)]">Platform Administrator override — bypasses the normal rules; use only to correct mistakes.</p>
                  <JobCardStatusForm jobCardId={jobCard.id} currentStatus={jobCard.status} selectableStatuses={selectableStatuses} statusLabels={STATUS_LABEL} />
                </div>
              ) : (
                <LoadingLink
                  href={`/workshop/job-cards/${jobCard.id}?editStatus=true#status-panel`}
                  className="mt-4 inline-block text-[11px] text-[var(--ejo-text-muted)] hover:text-[var(--ejo-primary)] hover:underline"
                >
                  Override status (Platform Administrator)
                </LoadingLink>
              )
            ) : null}
          </div>

          {!isCancelled && !isCheckedOut && (isMasterAdmin || jobCard.supervisorId === viewerId) ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Assign technician</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Currently: {jobCard.assignedTechnician?.fullName ?? 'Unassigned'}
              </p>
              <form action={assignTechnicianFormAction} className="mt-4 space-y-3">
                <FormPendingOverlay />
              <input type="hidden" name="jobCardId" value={jobCard.id} />
              <select aria-label="Technician"
                name="technicianId"
                defaultValue={jobCard.assignedTechnician?.id ?? ''}
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              >
                <option value="">— Unassigned —</option>
                {technicians.map((t: (typeof technicians)[number]) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                    {t.roles.length > 0 ? ` (${t.roles.map((r: (typeof t.roles)[number]) => r.role.name).join(', ')})` : ''}
                  </option>
                ))}
              </select>
              <SubmitButton
                label="Assign"
                pendingLabel="Assigning…"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
              />
            </form>
          </div>
          ) : null}

          {!isCancelled && !isCheckedOut && isAssignedTechnician && jobCard.technicianAcceptanceStatus === 'PENDING' ? (
            <div id="technician-response" className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Respond to this assignment</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                You&apos;ve been assigned to this Job Card. Accept to start, or reject with a reason if you can&apos;t
                take it on.
              </p>
              <form action={acceptTechnicianAssignmentFormAction} className="mt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <SubmitButton
                  label="Accept"
                  pendingLabel="Accepting…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
              <form action={rejectTechnicianAssignmentFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <input
                  name="reason"
                  required
                  placeholder="Reason for rejecting (required)"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Reject"
                  pendingLabel="Rejecting…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}

          {pendingCancellationRequest && isEligibleManager && !isCheckedOut ? (
            <div id="cancellation-request" className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-error)]">Cancellation requested</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {pendingCancellationRequest.requestedBy.fullName}: {pendingCancellationRequest.reason}
              </p>
              {paymentsTotal > 0 ? (
                <p className="mt-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 px-3 py-2 text-xs text-[var(--ejo-text)]">
                  The customer has paid {formatNaira(paymentsTotal)}. Approving this cancellation also authorises a full refund of that amount — Accounts then pays it and records it under Refunds.
                </p>
              ) : null}
              <div className="mt-3 space-y-2">
                <form action={approveCancellationRequestFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="jobCardId" value={jobCard.id} />
                  <input type="hidden" name="requestId" value={pendingCancellationRequest.id} />
                  <input
                    name="decisionNotes"
                    placeholder="Note (optional)"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                  />
                  <SubmitButton
                    label="Approve cancellation"
                    pendingLabel="Approving…"
                    className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  />
                </form>
                <form action={declineCancellationRequestFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="jobCardId" value={jobCard.id} />
                  <input type="hidden" name="requestId" value={pendingCancellationRequest.id} />
                  <input
                    name="decisionNotes"
                    placeholder="Note (optional)"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                  />
                  <SubmitButton
                    label="Decline"
                    pendingLabel="Declining…"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                  />
                </form>
              </div>
            </div>
          ) : !pendingCancellationRequest && canRequestCancellation && jobCard.status !== 'CANCELLED' && jobCard.status !== 'CLOSED' && !isCheckedOut ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-error)]">Request cancellation</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Use this when the customer asks to cancel. The Owner must approve it.
              </p>
              <form action={requestJobCardCancellationFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <textarea id="jc-cancel-reason"
                  name="reason"
                  required
                  rows={2}
                  placeholder="Reason — e.g. customer called to cancel, could not afford repair"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                />
                <RefineTextButton targetId="jc-cancel-reason" />
                <SubmitButton
                  label="Request cancellation"
                  pendingLabel="Requesting…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}

          {pendingCloseRequest && isEligibleManager && !isCheckedOut ? (
            <div id="close-request" className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-primary)]/30 bg-[var(--ejo-primary)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-primary)]">Close requested</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {pendingCloseRequest.requestedBy.fullName} has requested this Job Card be closed.
              </p>
              <div className="mt-3 space-y-2">
                <form action={approveCloseRequestFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="jobCardId" value={jobCard.id} />
                  <input type="hidden" name="requestId" value={pendingCloseRequest.id} />
                  {credit?.onCredit ? (
                    <div className={`rounded-[var(--ejo-radius-md)] border px-3 py-2 text-xs text-[var(--ejo-text)] ${credit.withinLimit ? 'border-[var(--ejo-info)]/40 bg-[var(--ejo-info)]/10' : 'border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10'}`} data-testid="close-on-credit">
                      <p>On credit: {formatNaira(outstanding)} stays on the invoice. {credit.companyName ?? 'The organisation'} would owe {formatNaira(credit.owedIncludingThis)}{credit.limit !== null ? ` against a credit limit of ${formatNaira(credit.limit)}` : ''}.</p>
                      {!credit.withinLimit ? (
                        <label className="mt-2 flex items-center gap-2 font-medium">
                          <input type="checkbox" name="overCreditLimit" required />
                          Close over the credit limit
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                  <input
                    name="decisionNotes"
                    placeholder="Note (optional)"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                  />
                  <SubmitButton
                    label="Approve close"
                    pendingLabel="Approving…"
                    className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  />
                </form>
                <form action={declineCloseRequestFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="jobCardId" value={jobCard.id} />
                  <input type="hidden" name="requestId" value={pendingCloseRequest.id} />
                  <input
                    name="decisionNotes"
                    placeholder="Note (optional)"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                  />
                  <SubmitButton
                    label="Decline"
                    pendingLabel="Declining…"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                  />
                </form>
              </div>
            </div>
          ) : !pendingCloseRequest && canRequestClose && jobCard.status === 'READY_FOR_COLLECTION' ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-primary)]/30 bg-[var(--ejo-primary)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-primary)]">Request close</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                The Owner must approve before this Job Card is closed.
              </p>
              <form action={requestJobCardCloseFormAction} className="mt-3">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <SubmitButton
                  label="Request close"
                  pendingLabel="Requesting…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            </div>
          ) : null}

          {jobCard.status === 'CHECKED_OUT' ? <JobCardRatingCard jobCardId={jobCard.id} /> : null}

          {jobCard.status === 'CHECKED_OUT' ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 print:hidden">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Vehicle Collection Receipt</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                The vehicle has been checked out. The final record is ready to print.
              </p>
              <div className="mt-3">
                <PrintMenu orgHref={`/print/job-cards/${jobCard.id}`} clientHref={`/print/job-cards/${jobCard.id}?variant=client`} clientLabel="Customer Copy" />
              </div>
            </div>
          ) : null}

          {sourcingNeeds.existingPartRequestSlips.length > 0 ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 print:hidden">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Attached records</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Parts requests raised against this Job Card.
              </p>
              {sourcingNeeds.existingPartRequestSlips.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {sourcingNeeds.existingPartRequestSlips.map((slip: (typeof sourcingNeeds.existingPartRequestSlips)[number]) => (
                    <LoadingLink
                      key={slip.id}
                      href={`/workshop/parts-requests/${slip.id}`}
                      className="flex items-center justify-between rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs hover:opacity-80"
                    >
                      <span className="font-medium text-[var(--ejo-text)]">{slip.referenceNumber}</span>
                      <span className={`rounded-full px-2 py-0.5 font-medium ${PART_REQUEST_STATUS_BADGE_CLASS[slip.status] ?? 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]'}`}>
                        {PART_REQUEST_STATUS_LABEL[slip.status] ?? slip.status}
                      </span>
                    </LoadingLink>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <RecycleBinPanel offer={binOffer} entity="JobCard" id={jobCard.id} />
        </div>
      </div>


      <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
        {auditTrail.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No recorded activity yet.</p>
        ) : (
          <AuditTrail
            entries={auditTrail.map((entry) => ({
              id: entry.id,
              actionLabel: AUDIT_ACTION_LABEL[entry.action] ?? humanizeAction(entry.action),
              userName: entry.user?.fullName ?? null,
              detail: formatAuditDetail(entry),
              dateLabel: formatDateTime(entry.createdAt),
            }))}
          />
        )}
      </div>
    </div>
  );
}
