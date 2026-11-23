import 'server-only';
import { prisma } from '@ejo/database';
import { creditLimitOf, isOnCredit, isOverdue, withinCreditLimit } from '@/lib/credit-core';

/**
 * Credit terms on the server (not a server action: the guarded action is
 * setCustomerCreditTerms in lib/actions/crm.ts). What an organisation owes
 * on its invoices, and whether a Job Card may leave with a balance.
 */

const net = (rows: { amount: unknown }[]) => rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export type OwedInvoice = { id: string; invoiceNumber: string; jobCardId: string; jobNumber: string; issuedAt: Date; dueDate: Date | null; total: number; paid: number; credited: number; balance: number; overdue: boolean };

/** The customer's invoices with a balance, oldest first: what they owe now, and how much of it is overdue. */
export async function owedOnInvoices(customerId: string, now = new Date()): Promise<{ owed: number; overdue: number; invoices: OwedInvoice[] }> {
  const rows = await prisma.invoice.findMany({
    where: { customerId },
    orderBy: { issuedAt: 'asc' },
    take: 500,
    select: { id: true, invoiceNumber: true, issuedAt: true, dueDate: true, total: true, jobCardId: true, jobCard: { select: { jobNumber: true, status: true, payments: { select: { amount: true } }, refunds: { select: { amount: true } } } }, creditNotes: { where: { status: 'APPROVED' }, select: { amount: true } } },
  });
  const invoices: OwedInvoice[] = [];
  for (const r of rows) {
    if (r.jobCard.status === 'CANCELLED') continue;
    const paid = r2(Math.max(0, net(r.jobCard.payments) - net(r.jobCard.refunds)));
    // Approved credit notes are money the customer no longer owes.
    const credited = r2(net(r.creditNotes));
    const balance = r2(Math.max(0, Number(r.total) - paid - credited));
    if (balance <= 0) continue;
    invoices.push({ id: r.id, invoiceNumber: r.invoiceNumber, jobCardId: r.jobCardId, jobNumber: r.jobCard.jobNumber, issuedAt: r.issuedAt, dueDate: r.dueDate, total: Number(r.total), paid, credited, balance, overdue: isOverdue({ dueDate: r.dueDate, balance }, now) });
  }
  return { owed: r2(invoices.reduce((s, i) => s + i.balance, 0)), overdue: r2(invoices.filter((i) => i.overdue).reduce((s, i) => s + i.balance, 0)), invoices };
}

export type CreditStanding = {
  onCredit: boolean;
  companyName: string | null;
  paymentTermsDays: number | null;
  limit: number | null;
  /** The organisation's unpaid invoices, this Job Card's balance included. */
  owedIncludingThis: number;
  withinLimit: boolean;
};

/**
 * Whether this Job Card's customer is an organisation on credit, and where
 * its unpaid invoices would stand with this Job Card's balance (`balance`)
 * counted once (whether or not its invoice is issued yet).
 */
export async function creditStanding(jobCardId: string, balance: number): Promise<CreditStanding> {
  const jc = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { customerId: true, customer: { select: { customerType: true, customerCompany: { select: { companyName: true, creditLimit: true, paymentTermsDays: true, creditApprovedAt: true } } } } },
  });
  const company = jc?.customer.customerCompany ?? null;
  const onCredit = Boolean(jc) && isOnCredit(String(jc!.customer.customerType), company);
  const limit = creditLimitOf(company);
  if (!jc || !onCredit) return { onCredit: false, companyName: company?.companyName ?? null, paymentTermsDays: company?.paymentTermsDays ?? null, limit, owedIncludingThis: r2(balance), withinLimit: true };
  const { invoices } = await owedOnInvoices(jc.customerId);
  const others = invoices.filter((i) => i.jobCardId !== jobCardId).reduce((s, i) => s + i.balance, 0);
  const owedIncludingThis = r2(others + Math.max(0, balance));
  return { onCredit, companyName: company?.companyName ?? null, paymentTermsDays: company?.paymentTermsDays ?? null, limit, owedIncludingThis, withinLimit: withinCreditLimit(owedIncludingThis, limit) };
}
