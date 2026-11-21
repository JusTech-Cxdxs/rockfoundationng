/**
 * Writes the workshop demo (./plan.ts) into the demo organisation's
 * Victoria Island Workshop, replacing the demo records already there and
 * nothing else.
 *
 * Every record the load makes is listed in demo_records (model + id), so a
 * reset or a removal deletes exactly those — never a record a person made
 * — in an order the foreign keys allow. Customers and vehicles also carry
 * externalSource "EJO-DEMO". The demo's audit entries are removed with it
 * under the audit trail's recorded maintenance switch, so a reload never
 * doubles a job card's history.
 *
 * Only ever into an organisation marked as a demo (organisations.isDemo):
 * the real D'Phoenix Autocare organisation is refused. Needs the demo
 * people (lib/demo/people-load.ts) in place: the records are theirs. Used by
 * `npm run demo:reset`, the first production build after DEMO_STAFF_PASSWORD
 * is set (scripts/demo-ensure.ts) and the platform team's console; the
 * callers decide who may run it and when. Prints counts, never data.
 */
import { randomUUID } from 'node:crypto';
import { Prisma, prisma } from '@ejo/database';
import { newApprovalToken } from '@ejo/utils/approval-link';
import { DEMO_STAFF } from '../../demo/people';
import { lagosDayKey, lagosYear } from '../../utils/format-date';
import { highestBinnedReference, highestSequence } from '../../recycle-bin/numbers';
import { invoiceLinesFrom } from '../../pdf/document-props';
import { PULSE_MODEL, pulseDayId } from '../../demo/pulse-core';
import { REAL_ORG_SLUG } from '../../demo/organisation';
import { DEMO_DEPOSIT_FRACTION, DEMO_DISCOUNT_APPROVAL_PERCENT, DEMO_SERVICE_INTERVAL, DEMO_SOURCE, DEMO_VAT_RATE, planWorkshopDemo } from './plan';

export type WorkshopDemoLoadResult = { branchName: string; removed: number; made: Record<string, number>; figures: Record<string, number> };

const CHUNK = 400;
const json = (v: unknown) => v as Prisma.InputJsonValue;
const money = (n: number) => new Prisma.Decimal(Math.round(n * 100) / 100);
const id = () => randomUUID();

/**
 * The models a load registers, in the order a removal deletes them (children
 * first).
 */
const REMOVE_ORDER = [
  'SupportReply', 'SupportTicket', 'Broadcast', 'Announcement', 'ImportJob', 'ExportJob',
  'VehicleGateExit', 'ServiceReminderLog',
  'Invoice', 'EstimateApprovalLink', 'Payment', 'Refund', 'CancellationRequest', 'CloseRequest', 'EstimateLineItem', 'Estimate', 'JobCardComplaint',
  'JobCard',
  'CustomerContact', 'CustomerAddress', 'CustomerCompany', 'CustomerVehicle', 'Customer', 'AuditLog',
] as const;
type Model = (typeof REMOVE_ORDER)[number];

/** Removes the workshop demo: every record the last load (and the daily pulse) registered, children first. */
export async function removeWorkshopDemo(organisationId: string): Promise<number> {
  const rows = await prisma.demoRecord.findMany({ where: { organisationId }, select: { model: true, recordId: true } });
  if (!rows.length) return 0;
  const byModel = new Map<string, string[]>();
  for (const r of rows) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r.recordId]);
  let removed = 0;
  for (const model of REMOVE_ORDER) {
    const ids = byModel.get(model);
    if (!ids?.length) continue;
    if (model === 'AuditLog') {
      // The trail is append-only; the demo's own entries go under the recorded maintenance switch, in one transaction.
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL ejo.audit_maintenance = 'on'`;
        for (let i = 0; i < ids.length; i += CHUNK) await tx.auditLog.deleteMany({ where: { id: { in: ids.slice(i, i + CHUNK) } } });
      });
      removed += ids.length;
      continue;
    }
    const delegate = (prisma as unknown as Record<string, { deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<{ count: number }> }>)[model.charAt(0).toLowerCase() + model.slice(1)]!;
    for (let i = 0; i < ids.length; i += CHUNK) removed += (await delegate.deleteMany({ where: { id: { in: ids.slice(i, i + CHUNK) } } })).count;
  }
  await prisma.demoRecord.deleteMany({ where: { organisationId } });
  return removed;
}

type NumberPrefix = 'JC' | 'RF' | 'INV' | 'RCT' | 'VX' | 'BC' | 'SUP' | 'IMP' | 'EXP';
/** The next free PREFIX-YEAR-NNNNNN numbers, continuing from what the database holds (and the Recycle bin, for job cards). */
export class Numbers {
  private next = new Map<string, number>();
  constructor(private readonly reader: (prefix: string) => Promise<number>) {}
  async take(prefix: NumberPrefix, at: Date): Promise<string> {
    const start = `${prefix}-${lagosYear(at)}-`;
    if (!this.next.has(start)) this.next.set(start, (await this.reader(start)) + 1);
    const n = this.next.get(start)!;
    this.next.set(start, n + 1);
    return `${start}${String(n).padStart(6, '0')}`;
  }
}
const NUMBER_FIELDS: Record<NumberPrefix, [string, string]> = {
  JC: ['jobCard', 'jobNumber'], RF: ['refund', 'referenceNumber'], INV: ['invoice', 'invoiceNumber'], RCT: ['payment', 'receiptNumber'],
  VX: ['vehicleGateExit', 'exitNumber'], BC: ['broadcast', 'broadcastNumber'], SUP: ['supportTicket', 'number'], IMP: ['importJob', 'number'], EXP: ['exportJob', 'number'],
};
export async function highestInUse(start: string): Promise<number> {
  const prefix = start.slice(0, start.indexOf('-')) as NumberPrefix;
  const [model, field] = NUMBER_FIELDS[prefix]!;
  const delegate = (prisma as unknown as Record<string, { findFirst: (args: unknown) => Promise<Record<string, string | null> | null> }>)[model]!;
  const row = await delegate.findFirst({ where: { [field]: { startsWith: start } }, orderBy: { [field]: 'desc' }, select: { [field]: true } });
  const refs = [row?.[field] ?? null];
  if (prefix === 'JC') refs.push(await highestBinnedReference('JobCard', start));
  return highestSequence(start, refs);
}

/** The demo organisation's workshop: the Victoria Island Workshop (lib/demo/organisation.ts), or its first workshop branch. */
export async function demoWorkshopBranch(organisationId: string) {
  const branches = await prisma.branch.findMany({ where: { businessUnit: { organisationId } }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, code: true, type: true, departments: { select: { id: true, slug: true } } } });
  return branches.find((b) => b.code === 'DPD') ?? branches.find((b) => b.type === 'WORKSHOP') ?? null;
}

/**
 * Loads the plan into the demo organisation's workshop, after removing the
 * previous workshop demo. `anchor` is "now" for the story.
 */
export async function loadWorkshopDemo(organisationId: string, anchor: Date = new Date()): Promise<WorkshopDemoLoadResult> {
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true, name: true, slug: true, isDemo: true, vatNumber: true } });
  if (!org) throw new Error('No such organisation.');
  if (org.slug === REAL_ORG_SLUG) throw new Error(`${org.name} is the real organisation; the demo lives in its own organisation.`);
  if (!org.isDemo) throw new Error(`${org.name} is not marked as a demo organisation; the workshop demo is only loaded into a demo.`);
  const branch = await demoWorkshopBranch(organisationId);
  if (!branch) throw new Error('This organisation has no workshop branch yet.');
  const dept = (slug: string) => branch.departments.find((d) => d.slug === slug)?.id ?? null;
  const people = new Map((await prisma.user.findMany({ where: { organisationId, email: { in: DEMO_STAFF.map((s) => s.email) } }, select: { id: true, email: true } })).map((u) => [u.email, u.id]));
  if (people.size < DEMO_STAFF.length) throw new Error(`The demo people are not all in place (${people.size} of ${DEMO_STAFF.length}): run the demo people step first (npm run demo:people).`);
  const by = (email: string) => { const u = people.get(email); if (!u) throw new Error(`No demo person ${email}`); return u; };
  const role = (slug: string) => by(DEMO_STAFF.find((s) => s.role === slug)!.email);

  const removed = await removeWorkshopDemo(organisationId);
  // The settings the story is priced with (a demo organisation only): VAT, the deposit, the discount limit and the service interval.
  await prisma.organisation.update({
    where: { id: organisationId },
    data: { vatEnabled: true, vatRate: DEMO_VAT_RATE, vatNumber: org.vatNumber ?? 'TIN 00000000-0001 (demo)', depositRequired: true, depositPercent: Math.round(DEMO_DEPOSIT_FRACTION * 100), discountApprovalPercent: DEMO_DISCOUNT_APPROVAL_PERCENT, primaryServiceIntervalKm: DEMO_SERVICE_INTERVAL.km, primaryServiceIntervalDays: DEMO_SERVICE_INTERVAL.days },
  });
  const vatNumber = org.vatNumber ?? 'TIN 00000000-0001 (demo)';

  const plan = planWorkshopDemo(anchor);
  const made: Record<string, number> = {};
  const registry: { model: Model; recordId: string }[] = [];
  const reg = (model: Model, recordId: string) => { registry.push({ model, recordId }); made[model] = (made[model] ?? 0) + 1; return recordId; };
  const numbers = new Numbers(highestInUse);
  const inChunks = async <T,>(rows: T[], write: (slice: T[]) => Promise<unknown>) => { for (let i = 0; i < rows.length; i += CHUNK) await write(rows.slice(i, i + CHUNK)); };
  const frontdesk = role('receptionist');
  const manager = role('workshop-manager');
  const finance = role('finance-officer');
  const gate = role('security-officer');
  const admin = role('administrator');
  const base = { organisationId };
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];
  const audit = (userId: string | null, action: string, entityType: string, entityId: string, at: Date, metadata?: Record<string, unknown>) => auditRows.push({ id: reg('AuditLog', id()), organisationId, userId, action, entityType, entityId, metadata: metadata ? json(metadata) : undefined, createdAt: at });

  // ── Customers and vehicles ─────────────────────────────────────────────
  const customerIds = new Map<string, string>();
  const existingDemoCustomers = await prisma.customer.findMany({ where: { organisationId, externalSource: DEMO_SOURCE }, select: { id: true, externalId: true, customerCompany: { select: { id: true } } } });
  for (const c of plan.customers) {
    const credit = c.credit ? { creditLimit: money(c.credit.limit), paymentTermsDays: c.credit.days, creditApprovedById: by(c.credit.byKey), creditApprovedAt: c.credit.approvedAt } : {};
    const existing = existingDemoCustomers.find((x) => x.externalId === c.key);
    if (existing) {
      // A customer-portal sign-in (lib/demo/people-load.ts): its record stays; its story's details are brought in line.
      customerIds.set(c.key, existing.id);
      await prisma.customer.update({ where: { id: existing.id }, data: { phone: c.phone, address: c.address, tags: c.tags, customerSince: c.since } });
      if (c.company) {
        if (existing.customerCompany) await prisma.customerCompany.update({ where: { id: existing.customerCompany.id }, data: { companyName: c.company, ...credit } });
        else await prisma.customerCompany.create({ data: { id: reg('CustomerCompany', id()), customerId: existing.id, companyName: c.company, ...credit } });
      }
      continue;
    }
    const cid = reg('Customer', id()); customerIds.set(c.key, cid);
    await prisma.customer.create({ data: { id: cid, ...base, customerType: c.type, fullName: c.name, phone: c.phone, address: c.address, email: c.email, emailVerified: Boolean(c.email), tags: c.tags, customerSince: c.since, externalSource: DEMO_SOURCE, externalId: c.key, createdById: frontdesk, createdAt: c.createdAt, ...(c.company ? { customerCompany: { create: { id: reg('CustomerCompany', id()), companyName: c.company, ...credit } } } : {}) } });
  }
  await prisma.customerContact.createMany({ data: plan.customers.flatMap((c) => c.contacts.map((k) => ({ id: reg('CustomerContact', id()), customerId: customerIds.get(c.key)!, name: k.name, role: k.role, phone: k.phone, email: k.email, createdAt: c.createdAt }))) });
  const vehicleIds = new Map<string, string>();
  const takenPlates = new Set((await prisma.customerVehicle.findMany({ where: { OR: [{ plateNumber: { in: plan.vehicles.map((v) => v.plate) } }, { chassisNumber: { in: plan.vehicles.map((v) => v.vin) } }] }, select: { plateNumber: true, chassisNumber: true } })).flatMap((v) => [v.plateNumber, v.chassisNumber]));
  await inChunks(plan.vehicles, (rows) => prisma.customerVehicle.createMany({ data: rows.map((v) => { const vid = reg('CustomerVehicle', id()); vehicleIds.set(v.key, vid); return { id: vid, customerId: customerIds.get(v.customerKey)!, make: v.make, model: v.model, vehicleType: v.type, year: v.year, plateNumber: takenPlates.has(v.plate) ? `${v.plate}${vid.slice(0, 2).toUpperCase()}` : v.plate, chassisNumber: takenPlates.has(v.vin) ? null : v.vin, engineNumber: v.engineNumber, engineType: v.engineType, mileage: v.mileage, externalSource: DEMO_SOURCE, externalId: v.key, createdById: frontdesk, createdAt: v.createdAt }; }) }));

  // ── Numbers in date order: invoices and receipts ───────────────────────
  const invoiceNumbers = new Map<string, string>();
  for (const j of plan.jobCards.filter((x) => x.invoice).sort((a, b) => a.invoice!.issuedAt.getTime() - b.invoice!.issuedAt.getTime())) invoiceNumbers.set(j.key, await numbers.take('INV', j.invoice!.issuedAt));
  const receiptNumbers = new Map<string, string>();
  for (const p of plan.jobCards.flatMap((j) => j.payments).sort((a, b) => a.at.getTime() - b.at.getTime())) receiptNumbers.set(p.key, await numbers.take('RCT', p.at));

  // ── Job cards ──────────────────────────────────────────────────────────
  const gateExits: { at: Date; vehicleKey: string; driverName: string; jobCardId: string }[] = [];
  for (const jc of plan.jobCards) {
    const jid = reg('JobCard', id());
    const jobNumber = await numbers.take('JC', jc.openedAt);
    const tech = by(jc.technicianKey); const sup = by(jc.supervisorKey);
    const customerId = customerIds.get(jc.customerKey)!;
    await prisma.jobCard.create({ data: {
      id: jid, jobNumber, branchId: branch.id, customerId, vehicleId: vehicleIds.get(jc.vehicleKey)!, departmentId: dept(jc.dept), complaint: jc.complaints[0]!, diagnosis: jc.diagnosis, mileageAtCheckIn: jc.mileage, isService: jc.service,
      assignedTechnicianId: tech, technicianAcceptanceStatus: jc.technicianAcceptance, technicianRespondedAt: jc.technicianRespondedAt, supervisorId: sup, createdById: frontdesk, status: jc.status, notes: jc.notes,
      approvalStatus: jc.approvalStatus, approvedById: jc.approvedAt ? sup : null, approvedAt: jc.approvedAt, workStartedAt: jc.workStartedAt, completedAt: jc.completedAt, readyForCollectionAt: jc.readyForCollectionAt, closedAt: jc.closedAt, checkedOutAt: jc.checkedOutAt, collectedByName: jc.collectedByName, createdAt: jc.openedAt,
    } });
    await prisma.jobCardComplaint.createMany({ data: jc.complaints.map((c, i) => ({ id: reg('JobCardComplaint', id()), jobCardId: jid, sequenceNumber: i + 1, description: c, createdAt: jc.openedAt })) });
    const est = jc.estimate;
    if (est) {
      const eid = reg('Estimate', id());
      const a = est.approval;
      await prisma.estimate.create({ data: {
        id: eid, jobCardId: jid, status: est.status, submittedAt: est.submittedAt, approvedAt: est.approvedAt, approvedById: est.approvedAt ? sup : null, managerApprovedAt: est.managerApprovedAt, managerApprovedById: est.managerApprovedAt ? manager : null,
        customerNotifiedAt: est.customerNotifiedAt, customerNotifiedById: est.customerNotifiedAt ? frontdesk : null, createdById: tech, createdAt: est.createdAt,
        discountAmount: est.discountAmount > 0 ? money(est.discountAmount) : null, discountReason: est.discountAmount > 0 ? est.discountReason : null, discountApprovedById: est.discountApprovedAt ? manager : null, discountApprovedAt: est.discountApprovedAt,
        vatRate: est.vatRate === null ? null : new Prisma.Decimal(est.vatRate),
        customerApprovedAt: a?.at ?? null, customerApprovedVia: a?.via ?? null, customerApprovedByStaffId: a?.byStaffKey ? by(a.byStaffKey) : null, customerApprovalNote: a?.note ?? null,
        customerDeclinedAt: est.declined?.at ?? null, customerDeclineNote: est.declined?.note ?? null,
      } });
      await prisma.estimateLineItem.createMany({ data: est.lines.map((l) => ({ id: reg('EstimateLineItem', id()), estimateId: eid, type: l.type, description: l.description, quantity: l.quantity, unitPrice: money(l.unitPrice), amount: money(l.amount), discountAmount: l.discount > 0 ? money(l.discount) : null, unitOfMeasure: l.uom, billTo: 'CUSTOMER' as const, enteredById: tech, createdAt: est.createdAt })) });
      if (est.link) {
        // Only the hash of a token nobody holds: the demo's links show as sent, used or replaced; a new one is sent from the Job Card.
        await prisma.estimateApprovalLink.create({ data: { id: reg('EstimateApprovalLink', id()), estimateId: eid, tokenHash: newApprovalToken().tokenHash, expiresAt: est.link.expiresAt, usedAt: est.link.usedAt, revokedAt: est.link.revokedAt, createdById: frontdesk, createdAt: est.link.createdAt } });
      }
      if (jc.invoice) {
        const t = est.totals;
        const lines = invoiceLinesFrom(est.lines.map((l) => ({ type: l.type, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount, unitOfMeasure: l.uom, billTo: 'CUSTOMER', discountAmount: l.discount })));
        const invoiceNumber = invoiceNumbers.get(jc.key)!;
        const iid = reg('Invoice', id());
        await prisma.invoice.create({ data: {
          id: iid, invoiceNumber, ...base, branchId: branch.id, jobCardId: jid, customerId, subtotal: money(t.subtotal), lineDiscounts: money(t.lineDiscounts), discountAmount: money(t.discountAmount), discountReason: t.discountAmount > 0 ? est.discountReason : null,
          vatRate: new Prisma.Decimal(t.vatRate), vatAmount: money(t.vatAmount), vatNumber: t.vatRate > 0 ? vatNumber : null, total: money(t.total), amountPaidAtIssue: money(jc.invoice.amountPaidAtIssue), lines: json(lines),
          issuedAt: jc.invoice.issuedAt, dueDate: jc.invoice.dueDate, issuedById: by(jc.invoice.byKey), createdAt: jc.invoice.issuedAt,
        } });
        audit(by(jc.invoice.byKey), 'invoice.issued', 'JobCard', jid, jc.invoice.issuedAt, { invoiceNumber, invoiceId: iid });
      }
    }
    if (jc.payments.length) await prisma.payment.createMany({ data: jc.payments.map((p) => ({ id: reg('Payment', id()), jobCardId: jid, amount: money(p.amount), method: p.method, notes: p.note, recordedById: by(p.byKey), recordedAt: p.at, createdAt: p.at, idempotencyKey: `demo:${organisationId}:${p.key}`, receiptNumber: receiptNumbers.get(p.key)! })) });
    if (jc.cancellation) await prisma.cancellationRequest.create({ data: { id: reg('CancellationRequest', id()), jobCardId: jid, reason: jc.cancellation.reason, requestedById: frontdesk, requestedAt: jc.cancellation.requestedAt, status: jc.cancellation.status, decidedById: jc.cancellation.decidedAt ? manager : null, decidedAt: jc.cancellation.decidedAt, decisionNotes: jc.cancellation.decidedAt ? 'Approved; the deposit is refunded where one was paid.' : null, createdAt: jc.cancellation.requestedAt } });
    if (jc.refund) await prisma.refund.create({ data: { id: reg('Refund', id()), referenceNumber: await numbers.take('RF', jc.refund.at), jobCardId: jid, amount: money(jc.refund.amount), method: jc.refund.method, paidToName: jc.refund.paidToName, reason: jc.refund.reason, recordedById: finance, recordedAt: jc.refund.at, createdAt: jc.refund.at, idempotencyKey: `demo:${organisationId}:${jc.key}:refund` } });
    if (jc.close) await prisma.closeRequest.create({ data: { id: reg('CloseRequest', id()), jobCardId: jid, requestedById: frontdesk, requestedAt: jc.close.requestedAt, status: jc.close.status, decidedById: jc.close.decidedAt ? manager : null, decidedAt: jc.close.decidedAt, createdAt: jc.close.requestedAt } });
    if (jc.gateExit) gateExits.push({ at: jc.gateExit.at, vehicleKey: jc.vehicleKey, driverName: jc.gateExit.driverName, jobCardId: jid });
    for (const a of jc.audit) {
      if (a.action === 'invoice.issued') continue; // written above, with its number
      audit(a.byKey ? by(a.byKey) : null, a.action, 'JobCard', jid, a.at, a.metadata?.jobNumber === '{number}' ? { ...a.metadata, jobNumber } : a.metadata);
    }
  }
  for (const g of gateExits.sort((a, b) => a.at.getTime() - b.at.getTime())) await prisma.vehicleGateExit.create({ data: { id: reg('VehicleGateExit', id()), exitNumber: await numbers.take('VX', g.at), branchId: branch.id, jobCardId: g.jobCardId, vehicleId: vehicleIds.get(g.vehicleKey)!, exitedAt: g.at, exitedById: gate, driverName: g.driverName, createdAt: g.at } });

  // ── The Service Tracker's reminders (sent by email or WhatsApp from the tracker) ──
  for (const rm of plan.reminders) {
    const vid = vehicleIds.get(rm.vehicleKey)!;
    await prisma.serviceReminderLog.create({ data: { id: reg('ServiceReminderLog', id()), vehicleId: vid, reminderNumber: rm.reminderNumber, sentAt: rm.sentAt, estimatedDueOdometer: rm.dueOdometer, estimatedDueDate: rm.dueDate, recordedOdometerAtSend: rm.odometerAtSend, trigger: rm.trigger } });
    audit(by(rm.byKey), 'vehicle.service_reminder_sent', 'CustomerVehicle', vid, rm.sentAt, { reminderNumber: rm.reminderNumber, trigger: rm.trigger });
  }

  // ── Broadcasts, support, Data Exchange ─────────────────────────────────
  for (const b of [...plan.broadcasts].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) await prisma.broadcast.create({ data: { id: reg('Broadcast', id()), broadcastNumber: await numbers.take('BC', b.createdAt), ...base, category: b.category as 'NEWS', title: b.title, message: b.message, audience: b.audience as 'ALL', audienceIds: b.audience === 'BRANCH' ? [branch.id] : [], startsAt: b.startsAt, endsAt: b.endsAt, sendEmail: false, createdById: by(b.byKey), createdAt: b.createdAt } });
  await prisma.announcement.create({ data: { id: reg('Announcement', id()), ...base, message: plan.announcement.message, expiresAt: plan.announcement.expiresAt, createdById: by(plan.announcement.byKey), createdAt: plan.announcement.createdAt } });
  let queue = await prisma.supportQueue.findFirst({ where: { organisationId, isDefault: true }, select: { id: true } });
  if (!queue) queue = await prisma.supportQueue.findFirst({ where: { organisationId }, select: { id: true } });
  for (const t of [...plan.tickets].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) {
    const tid = reg('SupportTicket', id());
    await prisma.supportTicket.create({ data: { id: tid, ...base, branchId: branch.id, number: await numbers.take('SUP', t.createdAt), channel: t.channel, customerId: t.customerKey ? customerIds.get(t.customerKey) ?? null : null, contactName: t.contactName, contactPhone: t.contactPhone, contactEmail: t.contactEmail, subject: t.subject, summary: t.summary, status: t.status, assignedToId: t.assignedToKey ? by(t.assignedToKey) : null, priority: t.priority, tags: t.tags, queueId: queue?.id ?? null, firstResponseAt: t.firstResponseAt, resolvedAt: t.resolvedAt, closedAt: t.closedAt, dueFirstResponseAt: t.dueFirstResponseAt, dueResolutionAt: t.dueResolutionAt, csatScore: t.csat, senderKind: t.channel === 'STAFF' ? 'staff' : t.customerKey ? 'customer' : 'public', requesterUserId: t.requesterKey ? by(t.requesterKey) : null, lastCustomerAt: t.replies.filter((x) => x.kind === 'CUSTOMER').at(-1)?.at ?? t.createdAt, lastAgentAt: t.replies.filter((x) => x.kind !== 'CUSTOMER').at(-1)?.at ?? null, createdAt: t.createdAt } });
    if (t.replies.length) await prisma.supportReply.createMany({ data: t.replies.map((rp) => ({ id: reg('SupportReply', id()), ticketId: tid, authorUserId: rp.authorKey ? by(rp.authorKey) : null, fromCustomer: rp.kind === 'CUSTOMER', body: rp.body, createdAt: rp.at, visibility: rp.kind === 'NOTE' ? 'INTERNAL' : 'PUBLIC', kind: rp.kind, aiDrafted: rp.kind === 'AI' })) });
  }
  for (const im of [...plan.imports].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) await prisma.importJob.create({ data: { id: reg('ImportJob', id()), number: await numbers.take('IMP', im.createdAt), ...base, branchId: branch.id, entity: im.entity, fileName: im.fileName, fileSha256: `demo-${im.key}`.padEnd(64, '0'), fileRows: im.rows, headers: json([]), status: 'COMPLETED', goodRows: im.rows - im.rejected, warningRows: im.warnings, rejectedRows: im.rejected, createdRows: im.created, skippedRows: im.rows - im.rejected - im.created, totals: im.totals ? json(im.totals) : undefined, signedOffById: im.signedOffByKey ? by(im.signedOffByKey) : null, signedOffAt: im.signedOffByKey ? new Date(im.createdAt.getTime() + 3 * 3_600_000) : null, createdById: by(im.createdByKey), submittedAt: new Date(im.createdAt.getTime() + 1_800_000), approvedById: by(im.approvedByKey), approvedAt: new Date(im.createdAt.getTime() + 2 * 3_600_000), startedAt: new Date(im.createdAt.getTime() + 2.1 * 3_600_000), completedAt: new Date(im.createdAt.getTime() + 2.4 * 3_600_000), rowsReleasedAt: new Date(im.createdAt.getTime() + 31 * 86_400_000) < anchor ? new Date(im.createdAt.getTime() + 31 * 86_400_000) : null, createdAt: im.createdAt } });
  for (const ex of [...plan.exports].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) await prisma.exportJob.create({ data: { id: reg('ExportJob', id()), ...base, number: await numbers.take('EXP', ex.createdAt), kind: ex.kind, format: ex.format, params: json({ branchId: branch.id }), summary: ex.summary, rowCount: ex.rows, bytes: ex.rows * 180, createdById: by(ex.createdByKey), createdAt: ex.createdAt, expiresAt: new Date(ex.createdAt.getTime() + 86_400_000) } });

  // ── The trail and the registry ─────────────────────────────────────────
  auditRows.push({ id: reg('AuditLog', id()), organisationId, userId: admin, action: 'demo.workshop_loaded', entityType: 'Branch', entityId: branch.id, metadata: json({ removed, figures: plan.figures }), createdAt: anchor });
  await inChunks(auditRows.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime()), (rows) => prisma.auditLog.createMany({ data: rows }));
  await inChunks(registry, (rows) => prisma.demoRecord.createMany({ data: rows.map((x) => ({ organisationId, model: x.model, recordId: x.recordId })) }));
  // Today is in the story already: the daily pulse (lib/demo/pulse.ts) adds nothing more today.
  await prisma.demoRecord.createMany({ skipDuplicates: true, data: [{ organisationId, model: PULSE_MODEL, recordId: pulseDayId(organisationId, lagosDayKey(anchor)) }] });
  return { branchName: branch.name, removed, made, figures: plan.figures };
}
