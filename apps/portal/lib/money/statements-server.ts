import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { prisma, type Prisma } from '@ejo/database';
import { AGEING_LABEL, AGEING_ORDER, buildStatement, naira, type StatementInvoice, type AgeingBucket } from '@/lib/money/rules';
import { CreditNotePdf, StatementPdf } from '@/lib/pdf/money-pdf';
import { letterhead } from '@/lib/pdf/document-props';
import { bankDetailsFor } from '@/lib/workshop-core';
import { portalBaseUrl } from '@/lib/portal-url';
import { formatDateOnly as formatDate } from '@/lib/utils/format-date';

/**
 * Statements, ageing and the money PDFs on the server (not server actions:
 * the callers check who may see them). What each invoice's customer owes is
 * its total less payments (net of refunds) and approved credit notes, as
 * everywhere else (lib/money/rules.ts).
 */

const net = (rows: { amount: unknown }[]) => rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

const INVOICE_SELECT = {
  invoiceNumber: true, issuedAt: true, dueDate: true, total: true, customerId: true, branchId: true,
  jobCard: { select: { jobNumber: true, status: true, payments: { select: { amount: true } }, refunds: { select: { amount: true } } } },
  creditNotes: { where: { status: 'APPROVED' }, select: { amount: true } },
} as const;
type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof INVOICE_SELECT }>;

function toStatementInvoice(r: InvoiceRow): StatementInvoice | null {
  if (r.jobCard.status === 'CANCELLED') return null;
  return {
    invoiceNumber: r.invoiceNumber, jobNumber: r.jobCard.jobNumber, issuedAt: r.issuedAt, dueDate: r.dueDate, total: Number(r.total),
    paid: Math.max(0, net(r.jobCard.payments) - net(r.jobCard.refunds)), credited: net(r.creditNotes),
  };
}

/** One customer's statement (inside the organisation given). */
export async function statementFor(customerId: string, organisationId: string, now = new Date()) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organisationId },
    select: { id: true, fullName: true, address: true, customerType: true, customerCompany: { select: { companyName: true, paymentTermsDays: true, creditLimit: true } } },
  });
  if (!customer) return null;
  const rows = await prisma.invoice.findMany({ where: { customerId, organisationId }, orderBy: { issuedAt: 'asc' }, take: 1000, select: INVOICE_SELECT });
  const statement = buildStatement(rows.map(toStatementInvoice).filter((x): x is StatementInvoice => Boolean(x)), now);
  const name = customer.customerType === 'ORGANIZATION' && customer.customerCompany?.companyName ? customer.customerCompany.companyName : customer.fullName;
  return { customer: { id: customer.id, name, address: customer.address, paymentTermsDays: customer.customerCompany?.paymentTermsDays ?? null, creditLimit: customer.customerCompany?.creditLimit ? Number(customer.customerCompany.creditLimit) : null, organisation: customer.customerType === 'ORGANIZATION' }, branchId: rows[0]?.branchId ?? null, ...statement };
}

export type AgeingCustomer = { customerId: string; name: string; organisation: boolean; owed: number; overdue: number; invoices: number; buckets: Record<AgeingBucket, number>; oldestDays: number };

/** Everyone who owes money, with the ageing, the largest first (Money → Statements). `where` fences the invoices. */
export async function ageingReport(where: Prisma.InvoiceWhereInput, now = new Date()): Promise<{ customers: AgeingCustomer[]; totals: Record<AgeingBucket, number>; owed: number; overdue: number }> {
  const rows = await prisma.invoice.findMany({ where, orderBy: { issuedAt: 'asc' }, take: 5000, select: { ...INVOICE_SELECT, customer: { select: { fullName: true, customerType: true, customerCompany: { select: { companyName: true } } } } } });
  const by = new Map<string, { name: string; organisation: boolean; list: StatementInvoice[] }>();
  for (const r of rows) {
    const inv = toStatementInvoice(r);
    if (!inv) continue;
    const name = r.customer.customerType === 'ORGANIZATION' && r.customer.customerCompany?.companyName ? r.customer.customerCompany.companyName : r.customer.fullName;
    const e = by.get(r.customerId) ?? { name, organisation: r.customer.customerType === 'ORGANIZATION', list: [] };
    e.list.push(inv);
    by.set(r.customerId, e);
  }
  const customers: AgeingCustomer[] = [];
  const totals: Record<AgeingBucket, number> = { CURRENT: 0, D31_60: 0, D61_90: 0, D90_PLUS: 0 };
  for (const [customerId, e] of by) {
    const s = buildStatement(e.list, now);
    if (!s.rows.length) continue;
    for (const b of AGEING_ORDER) totals[b] = Math.round((totals[b] + s.totals[b]) * 100) / 100;
    customers.push({ customerId, name: e.name, organisation: e.organisation, owed: s.owed, overdue: s.overdue, invoices: s.rows.length, buckets: s.totals, oldestDays: Math.max(...s.rows.map((r) => r.days)) });
  }
  customers.sort((a, b) => b.owed - a.owed);
  const owed = Math.round(customers.reduce((s, c) => s + c.owed, 0) * 100) / 100;
  const overdue = Math.round(customers.reduce((s, c) => s + c.overdue, 0) * 100) / 100;
  return { customers, totals, owed, overdue };
}

const ORG_SELECT = { name: true, legalName: true, hqAddress: true, poBox: true, rcNumber: true, hotlines: true, website: true, email: true } as const;
const BRANCH_SELECT = { name: true, address: true, hotlines: true, email: true, businessUnit: { select: { organisation: { select: ORG_SELECT } } } } as const;

/** The customer's statement as a PDF. */
export async function statementPdfFor(customerId: string, organisationId: string): Promise<{ pdf: Buffer; fileName: string } | null> {
  const s = await statementFor(customerId, organisationId);
  if (!s) return null;
  const branch = s.branchId ? await prisma.branch.findUnique({ where: { id: s.branchId }, select: BRANCH_SELECT }) : await prisma.branch.findFirst({ where: { businessUnit: { organisationId } }, select: BRANCH_SELECT });
  if (!branch) return null;
  const now = new Date();
  const pdf = await renderToBuffer(StatementPdf({
    ...letterhead(branch.businessUnit.organisation, branch, portalBaseUrl()),
    dateLabel: formatDate(now),
    customerName: s.customer.name,
    customerAddress: s.customer.address,
    termsLine: s.customer.paymentTermsDays ? `${s.customer.paymentTermsDays} days from the invoice date` : null,
    rows: s.rows.map((r) => ({ invoiceNumber: r.invoiceNumber, jobNumber: r.jobNumber, issuedOn: formatDate(r.issuedAt), dueOn: r.dueDate ? formatDate(r.dueDate) : 'On collection', total: naira(r.total), paid: naira(r.paid), credited: naira(r.credited), balance: naira(r.balance), age: `${r.days} d` })),
    ageing: AGEING_ORDER.map((b) => ({ label: AGEING_LABEL[b], amount: naira(s.totals[b]) })),
    owed: naira(s.owed), overdue: naira(s.overdue),
    bank: await bankDetailsFor(s.branchId),
  }));
  const safe = s.customer.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'Customer';
  return { pdf, fileName: `Statement-${safe}-${now.toISOString().slice(0, 10)}.pdf` };
}

/** An approved credit note as a PDF (inside the organisation given). */
export async function creditNotePdfFor(id: string, organisationId: string): Promise<{ pdf: Buffer; fileName: string; jobCardId: string } | null> {
  const cn = await prisma.creditNote.findFirst({
    where: { id, organisationId, status: 'APPROVED' },
    select: {
      number: true, amount: true, vatAmount: true, reason: true, decidedAt: true, jobCardId: true, invoiceId: true,
      decidedBy: { select: { fullName: true } },
      invoice: { select: { invoiceNumber: true, total: true, branch: { select: BRANCH_SELECT }, jobCard: { select: { jobNumber: true, payments: { select: { amount: true } }, refunds: { select: { amount: true } }, vehicle: { select: { make: true, model: true, plateNumber: true } } } } } },
      customer: { select: { fullName: true, customerType: true, customerCompany: { select: { companyName: true } } } },
    },
  });
  if (!cn?.number) return null;
  const upTo = await prisma.creditNote.findMany({ where: { invoiceId: cn.invoiceId, status: 'APPROVED', decidedAt: { lte: cn.decidedAt ?? new Date() } }, select: { amount: true } });
  const jc = cn.invoice.jobCard;
  const creditedToDate = net(upTo);
  const paid = Math.max(0, net(jc.payments) - net(jc.refunds));
  const name = cn.customer.customerType === 'ORGANIZATION' && cn.customer.customerCompany?.companyName ? cn.customer.customerCompany.companyName : cn.customer.fullName;
  const pdf = await renderToBuffer(CreditNotePdf({
    ...letterhead(cn.invoice.branch.businessUnit.organisation, cn.invoice.branch, portalBaseUrl()),
    number: cn.number, dateLabel: formatDate(cn.decidedAt ?? new Date()), customerName: name, invoiceNumber: cn.invoice.invoiceNumber, jobNumber: jc.jobNumber,
    vehicle: [[jc.vehicle.make, jc.vehicle.model].filter(Boolean).join(' '), jc.vehicle.plateNumber].filter(Boolean).join(' · ') || 'Vehicle',
    reason: cn.reason, amount: naira(Number(cn.amount)), vatLine: Number(cn.vatAmount) > 0 ? naira(Number(cn.vatAmount)) : null,
    invoiceTotal: naira(Number(cn.invoice.total)), creditedToDate: naira(creditedToDate),
    balanceAfter: naira(Math.max(0, Number(cn.invoice.total) - paid - creditedToDate)),
    approvedByName: cn.decidedBy?.fullName ?? 'The Owner',
  }));
  return { pdf, fileName: `Credit-Note-${cn.number}.pdf`, jobCardId: cn.jobCardId };
}
