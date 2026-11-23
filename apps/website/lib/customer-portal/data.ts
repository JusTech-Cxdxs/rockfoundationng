import { cache } from 'react';
import { prisma, type Prisma } from '@ejo/database';
import { serviceCycleFrom } from '@ejo/utils';
import { depositFractionFor, vatSettingFor } from '@ejo/utils';
import { jobCardPhase, jobCardStatus, jobCardStep, JOB_CARD_STEPS, type Phase, type StatusInfo } from './status';
import {
  addWorkingDays, daysBetween, moneyFor, num, vehicleLabel,
  APPROVAL_DEADLINE_WORKING_DAYS, READY_FOR_COLLECTION_GRACE_WORKING_DAYS, type Money,
} from './format';

/**
 * Every read the customer portal makes. Each query is fenced to one
 * customer, the signed-in customer's id from the session (never an id from
 * the URL without that fence), and selects only what a customer may see:
 * no internal notes, technician findings, costs, staff names or anything of
 * another customer.
 *
 * Estimates are shown only once the customer has been notified
 * (customerNotifiedAt), and on a Job Card only lines billed to the customer
 * count; lines the workshop covers itself never reach this view.
 */

const vehicleSelect = { id: true, make: true, model: true, year: true, plateNumber: true } as const;
const paySelect = { id: true, amount: true, method: true, recordedAt: true, receiptNumber: true } as const;
const refundSelect = { id: true, amount: true, method: true, recordedAt: true, referenceNumber: true } as const;

/** receipt: the RCT-number (null on payments recorded before receipts were numbered). */
export type PaymentRow = { id: string; amount: number; method: string; recordedAt: Date; receipt: string | null };
/** The Job Card's invoice, once issued. */
export type InvoiceRow = { id: string; number: string; issuedAt: Date; total: number };
export type RefundRow = { id: string; amount: number; method: string; recordedAt: Date; reference: string };

export type ServiceItem = {
  id: string;
  number: string;
  status: string;
  info: StatusInfo;
  phase: Phase;
  step: number;
  steps: readonly string[];
  vehicle: { id: string; label: string; plate: string | null };
  branchName: string | null;
  href: string;
  createdAt: Date;
  checkedInAt: Date | null;
  workStartedAt: Date | null;
  completedAt: Date | null;
  readyAt: Date | null;
  closedAt: Date | null;
  collectedAt: Date | null;
  cancelledAt: Date | null;
  lastUpdate: Date;
  estimateNotifiedAt: Date | null;
  money: Money;
  payments: PaymentRow[];
  refunds: RefundRow[];
  awaitingApproval: boolean;
  approvalDeadline: Date | null;
  waitingForCollection: boolean;
  collectBy: Date | null;
  waitingDays: number | null;
  inCustody: boolean;
  nextServiceDueDate: Date | null;
  nextServiceDueOdometer: number | null;
  /** When the visit that set the next-service point was done (the latest one wins). */
  nextServiceFrom: Date | null;
  /** A Job Card opened as a routine service (shown to the customer as "Service"). */
  isServiceJobCard: boolean;
  /** What the visit was for (SERVICE, REPAIR, SPRAYING, CAR_WASH …). */
  jobType: string;
  /** The workshop's guarantee on this visit's work, once checked out. */
  guarantee: { until: Date | null; km: number | null } | null;
  /** Opened as a comeback under the workshop's guarantee. */
  comeback: boolean;
  /** Credit notes approved on the invoice: taken off what is owed. */
  creditNotes: { number: string; amount: number; at: Date | null }[];
  invoice: InvoiceRow | null;
  /** The customer's own answer to the estimate (null before they answer). */
  answer: { approvedAt: Date | null; via: string | null; declinedAt: Date | null; declineNote: string | null } | null;
};

function latest(...dates: (Date | null | undefined)[]): Date {
  return new Date(Math.max(...dates.filter((d): d is Date => Boolean(d)).map((d) => d.getTime())));
}
const toPay = (p: { id: string; amount: unknown; method: unknown; recordedAt: Date; receiptNumber?: string | null }): PaymentRow => ({ id: p.id, amount: num(p.amount), method: String(p.method), recordedAt: p.recordedAt, receipt: p.receiptNumber ?? null });
const toRefund = (r: { id: string; amount: unknown; method: unknown; recordedAt: Date; referenceNumber: string }): RefundRow => ({ id: r.id, amount: num(r.amount), method: String(r.method), recordedAt: r.recordedAt, reference: r.referenceNumber });

export const jobCardItemSelect = {
  id: true, jobNumber: true, status: true, createdAt: true, updatedAt: true,
  workStartedAt: true, completedAt: true, readyForCollectionAt: true, closedAt: true, checkedOutAt: true,
  isService: true, jobType: true, mileageAtCheckIn: true, warrantyUntil: true, warrantyUntilKm: true, comebackOfId: true,
  // The service interval (the vehicle's own, else the organisation's), for a service Job Card's next-service point.
  vehicle: { select: { ...vehicleSelect, serviceIntervalKm: true, serviceIntervalDays: true } },
  // …and the organisation's VAT switch and rate, for the total.
  // …and its deposit switch (the one rule, depositFractionFor), with the customer's type.
  branch: { select: { name: true, businessUnit: { select: { organisation: { select: { primaryServiceIntervalKm: true, primaryServiceIntervalDays: true, vatEnabled: true, vatRate: true, depositRequired: true, depositPercent: true } } } } } },
  customer: { select: { customerType: true } },
  estimate: { select: { customerNotifiedAt: true, discountAmount: true, vatRate: true, customerApprovedAt: true, customerApprovedVia: true, customerDeclinedAt: true, customerDeclineNote: true, lineItems: { where: { billTo: 'CUSTOMER' as const }, select: { amount: true, discountAmount: true } } } },
  invoice: { select: { id: true, invoiceNumber: true, issuedAt: true, total: true } },
  // Credit notes the Owner approved (what was taken off the invoice; never the reason's internal notes).
  creditNotes: { where: { status: 'APPROVED' as const }, select: { number: true, amount: true, decidedAt: true }, orderBy: { decidedAt: 'asc' as const } },
  payments: { select: paySelect, orderBy: { recordedAt: 'asc' as const } },
  refunds: { select: refundSelect, orderBy: { recordedAt: 'asc' as const } },
  cancellationRequests: { where: { status: 'APPROVED' as const }, select: { decidedAt: true }, orderBy: { decidedAt: 'desc' as const }, take: 1 },
} satisfies Prisma.JobCardSelect;

type JobCardRow = Prisma.JobCardGetPayload<{ select: typeof jobCardItemSelect }>;

/**
 * The next-service point a Job Card opened as a service sets: checked out
 * (not a cancelled hand-back). Same maths as the staff portal.
 */
export function serviceJobCardDue(jc: Pick<JobCardRow, 'isService' | 'status' | 'checkedOutAt' | 'mileageAtCheckIn' | 'cancellationRequests' | 'vehicle' | 'branch'>): { date: Date | null; odometer: number | null; from: Date } | null {
  const status = String(jc.status);
  if (!jc.isService || !jc.checkedOutAt || (status !== 'CHECKED_OUT' && status !== 'CLOSED') || jc.cancellationRequests.length > 0) return null;
  const org = jc.branch?.businessUnit.organisation;
  if (!org) return null;
  const cycle = serviceCycleFrom(jc.mileageAtCheckIn, jc.checkedOutAt, { vehicle: jc.vehicle, organisation: org });
  if (cycle.nextServiceDueOdometer === null && cycle.nextServiceDueDate === null) return null;
  return { date: cycle.nextServiceDueDate, odometer: cycle.nextServiceDueOdometer, from: jc.checkedOutAt };
}

export function jobCardItem(jc: JobCardRow, now = new Date()): ServiceItem {
  const status = String(jc.status);
  const due = serviceJobCardDue(jc);
  const notifiedAt = jc.estimate?.customerNotifiedAt ?? null;
  const money = moneyFor({ notified: Boolean(notifiedAt), lines: jc.estimate?.lineItems ?? [], discountAmount: jc.estimate?.discountAmount, vat: vatSettingFor(jc.estimate, jc.branch?.businessUnit.organisation), depositFraction: depositFractionFor(jc.branch?.businessUnit.organisation, String(jc.customer.customerType)), payments: jc.payments, refunds: jc.refunds });
  const cancelledAt = status === 'CANCELLED' ? (jc.cancellationRequests[0]?.decidedAt ?? jc.updatedAt) : null;
  const awaitingApproval = status === 'AWAITING_CUSTOMER_APPROVAL' && Boolean(notifiedAt);
  const waitingForCollection = (status === 'READY_FOR_COLLECTION' || status === 'CLOSED') && !jc.checkedOutAt;
  const readyAt = jc.readyForCollectionAt;
  return {
    id: jc.id, number: jc.jobNumber, status, info: jobCardStatus(status), phase: jobCardPhase(status),
    step: jobCardStep(status), steps: JOB_CARD_STEPS,
    vehicle: { id: jc.vehicle.id, label: vehicleLabel(jc.vehicle), plate: jc.vehicle.plateNumber },
    branchName: jc.branch?.name ?? null,
    href: `/customer-portal/dashboard/services/jc/${jc.id}`,
    createdAt: jc.createdAt, checkedInAt: jc.createdAt, workStartedAt: jc.workStartedAt, completedAt: jc.completedAt,
    readyAt, closedAt: jc.closedAt, collectedAt: jc.checkedOutAt, cancelledAt,
    lastUpdate: latest(jc.createdAt, jc.workStartedAt, jc.completedAt, readyAt, jc.closedAt, jc.checkedOutAt, cancelledAt, notifiedAt, ...jc.payments.map((p) => p.recordedAt), ...jc.refunds.map((r) => r.recordedAt)),
    estimateNotifiedAt: notifiedAt,
    money,
    payments: jc.payments.map(toPay),
    refunds: jc.refunds.map(toRefund),
    awaitingApproval,
    approvalDeadline: awaitingApproval && notifiedAt ? addWorkingDays(notifiedAt, APPROVAL_DEADLINE_WORKING_DAYS) : null,
    waitingForCollection,
    collectBy: waitingForCollection && readyAt ? addWorkingDays(readyAt, READY_FOR_COLLECTION_GRACE_WORKING_DAYS) : null,
    waitingDays: waitingForCollection && readyAt ? Math.max(0, daysBetween(readyAt, now)) : null,
    // A cancelled Job Card's vehicle stays with us until it is checked out.
    inCustody: status !== 'CHECKED_OUT' && !jc.checkedOutAt,
    nextServiceDueDate: due?.date ?? null,
    nextServiceDueOdometer: due?.odometer ?? null,
    nextServiceFrom: due?.from ?? null,
    isServiceJobCard: jc.isService,
    jobType: String(jc.jobType),
    guarantee: jc.checkedOutAt && (jc.warrantyUntil || jc.warrantyUntilKm) ? { until: jc.warrantyUntil, km: jc.warrantyUntilKm } : null,
    comeback: Boolean(jc.comebackOfId),
    creditNotes: jc.creditNotes.map((c) => ({ number: c.number ?? '', amount: num(c.amount), at: c.decidedAt })),
    answer: jc.estimate && (jc.estimate.customerApprovedAt || jc.estimate.customerDeclinedAt) ? { approvedAt: jc.estimate.customerApprovedAt, via: jc.estimate.customerApprovedVia, declinedAt: jc.estimate.customerDeclinedAt, declineNote: jc.estimate.customerDeclineNote } : null,
    invoice: jc.invoice ? { id: jc.invoice.id, number: jc.invoice.invoiceNumber, issuedAt: jc.invoice.issuedAt, total: num(jc.invoice.total) } : null,
  };
}

/** All of a customer's Job Cards, newest first. */
export const loadServices = cache(async (customerId: string, take = 100): Promise<ServiceItem[]> => {
  const now = new Date();
  const jobCards = await prisma.jobCard.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take, select: jobCardItemSelect });
  return jobCards.map((jc) => jobCardItem(jc, now));
});

/** What the customer still owes on a job (0 for a cancelled one). */
export function outstanding(i: ServiceItem): number {
  if (i.phase === 'cancelled') return 0;
  const credited = i.creditNotes.reduce((s, c) => s + c.amount, 0);
  return Math.max(0, Math.round(((i.money.balance ?? 0) - credited) * 100) / 100);
}

// ------------------------------------------------------------------ Vehicles

export type VehicleCard = {
  id: string; label: string; plate: string | null; chassis: string | null; mileage: number | null; vehicleType: string | null;
  year: number | null; make: string | null; model: string | null; addedAt: Date;
};

export const loadVehicles = cache(async (customerId: string): Promise<VehicleCard[]> => {
  const rows = await prisma.customerVehicle.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, make: true, model: true, year: true, plateNumber: true, chassisNumber: true, mileage: true, vehicleType: true, createdAt: true },
  });
  return rows.map((v) => ({
    id: v.id, label: vehicleLabel(v), plate: v.plateNumber, chassis: v.chassisNumber, mileage: v.mileage,
    vehicleType: v.vehicleType ? String(v.vehicleType) : null, year: v.year, make: v.make, model: v.model, addedAt: v.createdAt,
  }));
});

/** Next service due for a vehicle: the latest service Job Card's own prediction (the later one wins). */
export function nextServiceFor(vehicleId: string, items: ServiceItem[]): { date: Date | null; odometer: number | null; from: ServiceItem } | null {
  const when = (i: ServiceItem) => (i.nextServiceFrom ?? i.createdAt).getTime();
  const done = items
    .filter((i) => i.vehicle.id === vehicleId && (i.nextServiceDueDate || i.nextServiceDueOdometer))
    .reduce<ServiceItem | null>((best, i) => (!best || when(i) > when(best) ? i : best), null);
  return done ? { date: done.nextServiceDueDate, odometer: done.nextServiceDueOdometer, from: done } : null;
}

// ---------------------------------------------------------------- Broadcasts

export type BroadcastItem = { id: string; title: string; message: string; category: string; startsAt: Date };

/** Live customer broadcasts for this customer (contract 4). */
export const loadBroadcasts = cache(async (customerId: string, organisationId: string): Promise<BroadcastItem[]> => {
  const now = new Date();
  const rows = await prisma.broadcast.findMany({
    where: {
      organisationId,
      isActive: true,
      startsAt: { lte: now },
      AND: [
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        { OR: [{ audience: 'CUSTOMERS_ALL' }, { audience: 'CUSTOMERS_SELECTED', audienceIds: { has: customerId } }] },
      ],
    },
    orderBy: { startsAt: 'desc' },
    take: 20,
    select: { id: true, title: true, message: true, category: true, startsAt: true },
  });
  return rows.map((b) => ({ id: b.id, title: b.title, message: b.message, category: String(b.category), startsAt: b.startsAt }));
});

// ------------------------------------------------------------------ Contacts

export type BranchContact = { name: string; address: string | null; hotlines: string[]; email: string | null; bank: { bankName: string | null; accountName: string | null; accountNumber: string | null } | null; organisation: string; orgHotlines: string[]; orgEmail: string | null; orgAddress: string | null };

/**
 * Who to call: the branch of the customer's latest Job Card, with the
 * organisation's own lines as the fallback.
 */
export const loadContact = cache(async (customerId: string, organisationId: string): Promise<BranchContact | null> => {
  const branchSelect = { name: true, address: true, hotlines: true, email: true, bankName: true, bankAccountName: true, bankAccountNumber: true } as const;
  const [pick, org] = await Promise.all([
    prisma.jobCard.findFirst({ where: { customerId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, branch: { select: branchSelect } } }),
    prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true, hotlines: true, email: true, hqAddress: true } }),
  ]);
  if (!pick && !org) return null;
  return {
    name: pick?.branch?.name ?? org?.name ?? 'Our team',
    address: pick?.branch?.address ?? null,
    hotlines: pick?.branch?.hotlines ?? [],
    email: pick?.branch?.email ?? null,
    bank: pick?.branch ? { bankName: pick.branch.bankName, accountName: pick.branch.bankAccountName, accountNumber: pick.branch.bankAccountNumber } : null,
    organisation: org?.name ?? '',
    orgHotlines: org?.hotlines ?? [],
    orgEmail: org?.email ?? null,
    orgAddress: org?.hqAddress ?? null,
  };
});

// ----------------------------------------------------------------- Estimates

/**
 * The estimate lines a customer may see — the SAME select the Job Card page
 * uses (and Enyo's my_estimate tool): only the lines billed to the customer,
 * and nothing until the customer has been notified (customerEstimateLines
 * returns null before that).
 */
const estimateLineFields = { id: true, type: true, description: true, quantity: true, unitPrice: true, amount: true, unitOfMeasure: true } as const;
// A line may carry a discount.
export const jobCardEstimateSelect = {
  customerNotifiedAt: true,
  discountAmount: true,
  vatRate: true,
  // The customer's own answer (approved or declined), never who took it.
  customerApprovedAt: true,
  customerApprovedVia: true,
  customerDeclinedAt: true,
  customerDeclineNote: true,
  lineItems: { where: { billTo: 'CUSTOMER' as const }, orderBy: { createdAt: 'asc' as const }, select: { ...estimateLineFields, discountAmount: true } },
} satisfies Prisma.EstimateSelect;

export type CustomerEstimateLine = { id: string; type: string; description: string; quantity: number; unitPrice: number | null; amount: number | null; unit: string | null; discount: number };

type RawLine = { id: string; type: unknown; description: string; quantity: unknown; unitPrice: unknown; amount: unknown; unitOfMeasure: string | null; discountAmount?: unknown };

export function customerEstimateLines(est: { customerNotifiedAt: Date | null; lineItems: RawLine[] } | null | undefined): CustomerEstimateLine[] | null {
  if (!est?.customerNotifiedAt) return null;
  return est.lineItems.map((l) => ({
    id: l.id, type: String(l.type), description: l.description, quantity: num(l.quantity),
    unitPrice: l.unitPrice === null || l.unitPrice === undefined ? null : num(l.unitPrice),
    amount: l.amount === null || l.amount === undefined ? null : num(l.amount),
    unit: l.unitOfMeasure,
    discount: Math.min(num(l.discountAmount), num(l.amount)),
  }));
}

/** One of the customer's own jobs with its customer-visible estimate (null lines = not sent yet), found by its number. */
export async function loadOwnEstimate(customerId: string, item: { id: string }): Promise<CustomerEstimateLine[] | null> {
  const jc = await prisma.jobCard.findFirst({ where: { id: item.id, customerId }, select: { estimate: { select: jobCardEstimateSelect } } });
  return customerEstimateLines(jc?.estimate);
}

// ------------------------------------------------------------------- Support

export type SupportTicketView = {
  id: string; number: string; subject: string; status: string; createdAt: Date; updatedAt: Date;
  /** A colleague has it (never their name). */
  withTeam: boolean;
  replies: { id: string; fromCustomer: boolean; body: string; createdAt: Date; kind: string }[];
};

/**
 * The customer's own support requests (hand-overs from the assistant) with
 * every reply, newest first. Staff replies carry no staff names here — they
 * read as "Customer care". Enyo's internal summary is never shown.
 */
export const loadSupportTickets = cache(async (customerId: string, organisationId: string, email?: string | null): Promise<SupportTicketView[]> => {
  // Their own requests, and requests left on the website (not signed in) with their account's own email address.
  const e = (email ?? '').trim();
  const rows = await prisma.supportTicket.findMany({
    where: { organisationId, OR: [{ customerId }, ...(e ? [{ customerId: null, channel: 'WEBSITE' as const, contactEmail: { equals: e, mode: 'insensitive' as const } }] : [])] },
    orderBy: { updatedAt: 'desc' },
    take: 30,
    select: {
      id: true, number: true, subject: true, status: true, createdAt: true, updatedAt: true, assignedToId: true,
      // Only what the customer may see: never a colleague's internal note or Enyo's draft.
      replies: { where: { visibility: 'PUBLIC', kind: { in: ['CUSTOMER', 'AGENT', 'AI'] } }, orderBy: { createdAt: 'asc' }, take: 100, select: { id: true, fromCustomer: true, body: true, createdAt: true, kind: true } },
    },
  });
  return rows.map(({ assignedToId, ...t }) => ({ ...t, status: String(t.status), withTeam: Boolean(assignedToId) }));
});
