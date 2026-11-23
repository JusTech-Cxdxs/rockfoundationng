'use server';

import { prisma, type Prisma } from '@ejo/database';
import { allows, authorize, getPrincipal, orgWhere, reachWhere, NOT_AVAILABLE } from '@/lib/authz/server';
import { requireUser, listEligibleManagersForBranch } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { emailColleaguesLater } from '@/lib/workflow-notify';
import { lockExisting } from '@/lib/integrity';
import { claimed, retryOnNumberClash } from '@/lib/integrity-core';
import { highestSequence } from '@/lib/recycle-bin/numbers';
import { lagosYear } from '@/lib/utils/format-date';
import { checkCreditAmount, creditable, naira, vatInside } from '@/lib/money/rules';

/**
 * Credit notes (Phase 5): money a customer no longer owes on an issued
 * invoice. Front desk or Accounts ask for one with a reason; the Owner
 * approves (numbered CN-YYYY-NNNNNN) or declines it. A pending credit note
 * holds its amount, so two requests can never credit the same money twice;
 * the Job Card row is locked while that is decided. An approved credit note
 * lowers what is owed everywhere a balance is worked out.
 */

export class CreditNoteError extends Error {}

const ID = /^[a-z0-9]{20,40}$/;
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** The invoice, inside the person's organisation, with what is already credited on it. */
async function invoiceForCredit(invoiceId: string) {
  if (!ID.test(invoiceId)) return null;
  return prisma.invoice.findFirst({
    where: { AND: [{ id: invoiceId }, await orgWhere()] },
    select: { id: true, invoiceNumber: true, total: true, vatRate: true, organisationId: true, branchId: true, jobCardId: true, customerId: true, jobCard: { select: { jobNumber: true, status: true } }, creditNotes: { select: { amount: true, status: true } } },
  });
}

/** Asks for a credit note on an invoice. Returns its id (pending until the Owner decides). */
export async function requestCreditNote(invoiceId: string, amountRaw: unknown, reasonRaw: unknown, idempotencyKey?: string): Promise<{ id: string }> {
  const me = await requireUser();
  const inv = await invoiceForCredit(invoiceId);
  if (!inv) throw new CreditNoteError(NOT_AVAILABLE);
  await authorize('money.credit_note.request', { branchId: inv.branchId }, 'requestCreditNote');
  if (inv.jobCard.status === 'CANCELLED') throw new CreditNoteError('This Job Card is cancelled: settle it with a refund, not a credit note.');
  const reason = clean(reasonRaw, 500);
  if (reason.length < 5) throw new CreditNoteError('Say why the customer is being credited (at least a few words).');
  const key = idempotencyKey && /^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey) ? idempotencyKey : null;
  if (key) {
    const done = await prisma.creditNote.findUnique({ where: { idempotencyKey: key }, select: { id: true, invoiceId: true } });
    if (done) {
      if (done.invoiceId === inv.id) return { id: done.id };
      throw new CreditNoteError('This form was already used for a different credit note — refresh the page.');
    }
  }
  const created = await prisma.$transaction(async (tx) => {
    // Decided again under the Job Card's lock: two requests cannot both fit.
    await lockExisting(tx, 'jobCard', [inv.jobCardId], NOT_AVAILABLE);
    const notes = await tx.creditNote.findMany({ where: { invoiceId: inv.id }, select: { amount: true, status: true } });
    const amount = checkCreditAmount(amountRaw, creditable(Number(inv.total), notes));
    if (typeof amount === 'string') throw new CreditNoteError(amount);
    return tx.creditNote.create({
      data: {
        organisationId: inv.organisationId, branchId: inv.branchId, invoiceId: inv.id, jobCardId: inv.jobCardId, customerId: inv.customerId,
        amount, vatAmount: vatInside(amount, Number(inv.vatRate)), reason, requestedById: me.id, idempotencyKey: key,
      },
      select: { id: true, amount: true },
    });
  });
  await writeAuditLog({ userId: me.id, action: 'credit_note.requested', entityType: 'JobCard', entityId: inv.jobCardId, organisationId: inv.organisationId, metadata: { creditNoteId: created.id, invoice: inv.invoiceNumber, amount: Number(created.amount), reason } });
  // The Owner sees it under Approvals; an email too, after the response.
  const owners = (await listEligibleManagersForBranch(inv.branchId).catch(() => ({ supervisors: [] as { id: string }[] }))).supervisors.map((o) => o.id);
  emailColleaguesLater({
    branchId: inv.branchId, userIds: owners, exceptUserId: me.id, path: `/money/credit-notes?show=pending`, where: 'credit_note.requested',
    notice: {
      subject: `Credit note to approve — ${inv.invoiceNumber}`, heading: 'A credit note needs your approval',
      intro: `A credit note of ${naira(Number(created.amount))} was asked for on invoice ${inv.invoiceNumber} (Job Card ${inv.jobCard.jobNumber}).`,
      facts: [['Invoice', inv.invoiceNumber], ['Amount', naira(Number(created.amount))], ['Reason', reason]],
      next: 'Approve it to take the amount off what the customer owes, or decline it with a note.',
      status: { label: 'Waiting for you', tone: 'warning' }, ctaLabel: 'Open credit notes',
    },
  });
  return { id: created.id };
}

async function nextCreditNoteNumber(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = `CN-${lagosYear()}-`;
  const latest = await tx.creditNote.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  return `${prefix}${String(highestSequence(prefix, [latest?.number]) + 1).padStart(6, '0')}`;
}

/** The Owner approves (numbered) or declines (with a note) a pending credit note. */
export async function decideCreditNote(id: string, approve: boolean, noteRaw?: unknown): Promise<void> {
  const me = await requireUser();
  if (!ID.test(id)) throw new CreditNoteError(NOT_AVAILABLE);
  const cn = await prisma.creditNote.findFirst({ where: { AND: [{ id }, await orgWhere()] }, select: { id: true, status: true, branchId: true, organisationId: true, jobCardId: true, invoiceId: true, amount: true, requestedById: true, invoice: { select: { invoiceNumber: true, total: true } } } });
  if (!cn) throw new CreditNoteError(NOT_AVAILABLE);
  await authorize('money.credit_note.approve', { branchId: cn.branchId }, 'decideCreditNote');
  if (cn.status !== 'PENDING') throw new CreditNoteError('This credit note was already decided — refresh the page.');
  // Two people: whoever asked does not approve, unless they are the Owner.
  if (cn.requestedById === me.id && !(await getPrincipal()).roleSlugs.includes('owner') && !(await getPrincipal()).isSuperAdmin) {
    throw new CreditNoteError('You asked for this credit note — the Owner approves it.');
  }
  const note = clean(noteRaw, 500);
  if (!approve && note.length < 3) throw new CreditNoteError('Say why the credit note is declined.');
  const number = approve
    ? await retryOnNumberClash('number', () => prisma.$transaction(async (tx) => {
      await lockExisting(tx, 'jobCard', [cn.jobCardId], NOT_AVAILABLE);
      // Still within the invoice once the other approved notes are counted.
      const others = await tx.creditNote.findMany({ where: { invoiceId: cn.invoiceId, status: 'APPROVED' }, select: { amount: true, status: true } });
      if (Number(cn.amount) > creditable(Number(cn.invoice.total), others) + 0.004) throw new CreditNoteError('This credit note is now more than what is left on the invoice — decline it and ask for a smaller one.');
      const n = await nextCreditNoteNumber(tx);
      claimed(await tx.creditNote.updateMany({ where: { id: cn.id, status: 'PENDING' }, data: { status: 'APPROVED', number: n, decidedById: me.id, decidedAt: new Date() } }), 'This credit note was just decided by someone else — refresh the page.');
      return n;
    }))
    : (claimed(await prisma.creditNote.updateMany({ where: { id: cn.id, status: 'PENDING' }, data: { status: 'DECLINED', declineNote: note, decidedById: me.id, decidedAt: new Date() } }), 'This credit note was just decided by someone else — refresh the page.'), null);
  await writeAuditLog({ userId: me.id, action: approve ? 'credit_note.approved' : 'credit_note.declined', entityType: 'JobCard', entityId: cn.jobCardId, organisationId: cn.organisationId, metadata: { creditNoteId: cn.id, number, invoice: cn.invoice.invoiceNumber, amount: Number(cn.amount), ...(note ? { note } : {}) } });
  emailColleaguesLater({
    branchId: cn.branchId, userIds: [cn.requestedById], exceptUserId: me.id, path: `/money/credit-notes`, where: 'credit_note.decided',
    notice: {
      subject: approve ? `Credit note ${number} approved` : `Credit note declined — ${cn.invoice.invoiceNumber}`,
      heading: approve ? 'The Owner approved your credit note' : 'The Owner declined your credit note',
      intro: approve ? `${naira(Number(cn.amount))} on invoice ${cn.invoice.invoiceNumber} is credited as ${number}.` : `The credit note of ${naira(Number(cn.amount))} on invoice ${cn.invoice.invoiceNumber} was declined.`,
      facts: [['Invoice', cn.invoice.invoiceNumber], ['Amount', naira(Number(cn.amount))], ...(note ? [['Note', note] as [string, string]] : [])],
      next: approve ? 'Send the customer the credit note PDF from the Job Card.' : 'Nothing changes on the invoice.',
      status: approve ? { label: 'Approved', tone: 'success' } : { label: 'Declined', tone: 'warning' }, ctaLabel: 'Open credit notes',
    },
  });
}

export type CreditNoteRow = {
  id: string; number: string | null; status: string; amount: number; vatAmount: number; reason: string; requestedAt: Date; decidedAt: Date | null; declineNote: string | null;
  invoiceNumber: string; jobCardId: string; jobNumber: string; customerId: string; customerName: string; requestedBy: string; decidedBy: string | null;
};

const ROW_SELECT = {
  id: true, number: true, status: true, amount: true, vatAmount: true, reason: true, requestedAt: true, decidedAt: true, declineNote: true, jobCardId: true, customerId: true,
  invoice: { select: { invoiceNumber: true } }, jobCard: { select: { jobNumber: true } }, customer: { select: { fullName: true } },
  requestedBy: { select: { fullName: true } }, decidedBy: { select: { fullName: true } },
} as const;

type RowIn = Prisma.CreditNoteGetPayload<{ select: typeof ROW_SELECT }>;
const toRow = (c: RowIn): CreditNoteRow => ({
  id: c.id, number: c.number, status: c.status, amount: Number(c.amount), vatAmount: Number(c.vatAmount), reason: c.reason, requestedAt: c.requestedAt, decidedAt: c.decidedAt, declineNote: c.declineNote,
  invoiceNumber: c.invoice.invoiceNumber, jobCardId: c.jobCardId, jobNumber: c.jobCard.jobNumber, customerId: c.customerId, customerName: c.customer.fullName, requestedBy: c.requestedBy.fullName, decidedBy: c.decidedBy?.fullName ?? null,
});

/** The credit notes list (Money → Credit notes): those in the person's reach, newest first. */
export async function listCreditNotes(show: 'pending' | 'all' = 'all'): Promise<{ rows: CreditNoteRow[]; canApprove: boolean; canRequest: boolean }> {
  await requireUser();
  const [mayApprove, mayRequest] = await Promise.all([allows('money.credit_note.approve'), allows('money.credit_note.request')]);
  if (!mayApprove && !mayRequest) await authorize('money.credit_note.request', undefined, 'listCreditNotes');
  const key = mayApprove ? 'money.credit_note.approve' : 'money.credit_note.request';
  const rows = await prisma.creditNote.findMany({
    where: { AND: [await orgWhere(), (await reachWhere(key, { lens: false })) as Prisma.CreditNoteWhereInput, show === 'pending' ? { status: 'PENDING' } : {}] },
    orderBy: { requestedAt: 'desc' }, take: 300, select: ROW_SELECT,
  });
  return { rows: rows.map(toRow), canApprove: mayApprove, canRequest: mayRequest };
}

/** One invoice's credit notes, for the Job Card page (anyone who may see the Job Card's money). */
export async function getInvoiceCreditNotes(invoiceId: string): Promise<{ rows: CreditNoteRow[]; available: number; canRequest: boolean; canApprove: boolean } | null> {
  await requireUser();
  const inv = await invoiceForCredit(invoiceId);
  if (!inv) return null;
  const [canRequest, canApprove] = await Promise.all([allows('money.credit_note.request', { branchId: inv.branchId }), allows('money.credit_note.approve', { branchId: inv.branchId })]);
  if (!canRequest && !canApprove && !(await allows('workshop.payment.record', { branchId: inv.branchId }))) return null;
  const rows = await prisma.creditNote.findMany({ where: { invoiceId: inv.id }, orderBy: { requestedAt: 'asc' }, select: ROW_SELECT });
  return { rows: rows.map(toRow), available: creditable(Number(inv.total), inv.creditNotes), canRequest, canApprove };
}
