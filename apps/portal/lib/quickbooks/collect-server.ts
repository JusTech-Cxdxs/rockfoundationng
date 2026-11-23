/**
 * Reads what a QuickBooks export carries (server only, not a server action:
 * lib/actions/quickbooks.ts guards it). Everything is fenced to the person's
 * organisation and to the branches the export permission reaches; the costs
 * of stock (item cost, stock count adjustments) only for people who may see
 * costs. Records an earlier export carried are left out unless asked for.
 */
import { prisma, type Prisma } from '@ejo/database';
import type { QbCreditNote, QbCustomer, QbInvoice, QbItem, QbPayment, QbRefund, QbSalesReceipt, QbStockMovement } from './iif';
import type { QuickBooksSettings } from './settings';
import {
  creditNoteFor, customerFor, invoiceFor, itemsFor, lagosRange, paymentFor, qbCustomerNames, refundFor, salesReceiptFor, stockMovementFor, totalsOf, partItemName,
  type ExportKind,
} from './assemble';
import { documentAddsUp } from './iif';

export type Collected = {
  customers: QbCustomer[];
  items: QbItem[];
  invoices: QbInvoice[];
  counterSales: QbSalesReceipt[];
  payments: QbPayment[];
  creditNotes: QbCreditNote[];
  refunds: QbRefund[];
  stockMovements: QbStockMovement[];
  /** The EJO ids each kind carries (recorded with the export). */
  ids: Record<ExportKind, string[]>;
  /** How many of each kind an earlier export already carried (left out unless included). */
  alreadyExported: Partial<Record<ExportKind, number>>;
  /** Records that cannot go into the file, and why (e.g. figures that do not add up, a cost not entered). */
  problems: string[];
  counts: Record<ExportKind, number>;
  totals: Record<string, number>;
};

type Scope = { organisationId: string; branchWhere: { branchId?: string | { in: string[] } }; seesCosts: boolean };

async function exportedIds(organisationId: string, kind: ExportKind, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await prisma.quickBooksExportRecord.findMany({ where: { organisationId, kind, recordId: { in: ids } }, select: { recordId: true } });
  return new Set(rows.map((r) => r.recordId));
}

export async function collectExport(scope: Scope, range: { fromDay: string; toDay: string }, kinds: ExportKind[], includeExported: boolean, settings: QuickBooksSettings): Promise<Collected> {
  const { organisationId, branchWhere, seesCosts } = scope;
  const when = lagosRange(range.fromDay, range.toDay);
  const want = new Set(kinds);
  const problems: string[] = [];
  const alreadyExported: Partial<Record<ExportKind, number>> = {};
  const jobInReach: Prisma.JobCardWhereInput = { ...(branchWhere as Prisma.JobCardWhereInput), customer: { organisationId } };

  /** Leaves out what an earlier export carried, counting it. */
  async function fresh<T extends { id: string }>(kind: ExportKind, rows: T[]): Promise<T[]> {
    if (includeExported) return rows;
    const done = await exportedIds(organisationId, kind, rows.map((r) => r.id));
    if (done.size) alreadyExported[kind] = done.size;
    return rows.filter((r) => !done.has(r.id));
  }

  const customerSelect = { id: true, fullName: true, createdAt: true } as const;

  // ── Sales ────────────────────────────────────────────────────────────
  const invoiceRows = want.has('invoices') ? await fresh('invoices', await prisma.invoice.findMany({
    where: { organisationId, ...(branchWhere as Prisma.InvoiceWhereInput), issuedAt: when },
    orderBy: { issuedAt: 'asc' },
    select: {
      id: true, invoiceNumber: true, issuedAt: true, dueDate: true, lines: true, discountAmount: true, vatRate: true, vatAmount: true, total: true,
      customer: { select: customerSelect },
      jobCard: { select: { jobNumber: true, jobType: true, vehicle: { select: { plateNumber: true } }, estimate: { select: { lineItems: { orderBy: { createdAt: 'asc' }, select: { type: true, matchedPart: { select: { partNumber: true } } } } } } } },
    },
  })) : [];

  const saleRows = want.has('counterSales') ? await fresh('counterSales', await prisma.counterSale.findMany({
    where: { organisationId, ...(branchWhere as Prisma.CounterSaleWhereInput), soldAt: when },
    orderBy: { soldAt: 'asc' },
    select: { id: true, number: true, soldAt: true, buyerName: true, paymentMethod: true, paymentReference: true, vatRate: true, vatAmount: true, total: true, customer: { select: customerSelect }, lines: { select: { description: true, partNumber: true, quantity: true, unitPrice: true, amount: true } } },
  })) : [];

  // ── Money in and out ─────────────────────────────────────────────────
  const paymentRows = want.has('payments') ? await fresh('payments', await prisma.payment.findMany({
    where: { recordedAt: when, jobCard: jobInReach },
    orderBy: { recordedAt: 'asc' },
    select: { id: true, receiptNumber: true, recordedAt: true, amount: true, method: true, posReference: true, notes: true, jobCard: { select: { jobNumber: true, customer: { select: customerSelect }, invoice: { select: { invoiceNumber: true } } } } },
  })) : [];

  const noteRows = want.has('creditNotes') ? await fresh('creditNotes', await prisma.creditNote.findMany({
    where: { organisationId, ...(branchWhere as Prisma.CreditNoteWhereInput), status: 'APPROVED', decidedAt: when },
    orderBy: { decidedAt: 'asc' },
    select: { id: true, number: true, decidedAt: true, requestedAt: true, reason: true, amount: true, vatAmount: true, customer: { select: customerSelect }, invoice: { select: { invoiceNumber: true } } },
  })) : [];

  const refundRows = want.has('refunds') ? await fresh('refunds', await prisma.refund.findMany({
    where: { recordedAt: when, jobCard: jobInReach },
    orderBy: { recordedAt: 'asc' },
    select: { id: true, referenceNumber: true, recordedAt: true, amount: true, method: true, reason: true, paidToName: true, jobCard: { select: { customer: { select: customerSelect } } } },
  })) : [];

  // ── Stock count differences (at cost: only for people who see costs) ──
  const stockRows = want.has('stockMovements') && seesCosts ? await fresh('stockMovements', await prisma.stockCountLine.findMany({
    where: { stockCount: { organisationId, ...(branchWhere as Prisma.StockCountWhereInput), status: 'APPROVED', decidedAt: when }, NOT: { difference: 0 } },
    orderBy: { stockCount: { decidedAt: 'asc' } },
    select: {
      id: true, difference: true, reason: true, partId: true,
      part: { select: { partNumber: true, name: true } },
      stockCount: { select: { id: true, number: true, decidedAt: true, receipts: { select: { lines: { select: { partId: true, totalCost: true } } } } } },
      stockOuts: { select: { quantityTaken: true, goodsReceiptLine: { select: { unitCost: true } } } },
    },
  })) : [];
  if (want.has('stockMovements') && !seesCosts) problems.push('Stock count adjustments are valued at cost, so only the Owner can export them.');

  // ── Customer names, unique as QuickBooks needs ───────────────────────
  const touched = new Map<string, { id: string; fullName: string; createdAt: Date }>();
  for (const r of invoiceRows) touched.set(r.customer.id, r.customer);
  for (const r of saleRows) if (r.customer) touched.set(r.customer.id, r.customer);
  for (const r of paymentRows) if (r.jobCard) touched.set(r.jobCard.customer.id, r.jobCard.customer);
  for (const r of noteRows) touched.set(r.customer.id, r.customer);
  for (const r of refundRows) if (r.jobCard) touched.set(r.jobCard.customer.id, r.jobCard.customer);

  const listCustomers = want.has('customers') ? await prisma.customer.findMany({
    where: { organisationId, OR: [{ id: { in: [...touched.keys()] } }, { createdAt: when }, { updatedAt: when }] },
    orderBy: { createdAt: 'asc' },
    select: { id: true, fullName: true, createdAt: true, customerType: true, email: true, phone: true, altPhone: true, address: true, externalId: true, customerCompany: { select: { companyName: true, paymentTermsDays: true, creditLimit: true } } },
  }) : [];
  for (const c of listCustomers) touched.set(c.id, c);
  const namesakes = touched.size ? await prisma.customer.findMany({
    where: { organisationId, fullName: { in: [...new Set([...touched.values()].map((c) => c.fullName))], mode: 'insensitive' } },
    select: customerSelect,
  }) : [];
  const names = qbCustomerNames([...new Map([...namesakes, ...touched.values()].map((c) => [c.id, c])).values()]);
  const nameOf = (c: { id: string; fullName: string }) => names.get(c.id) ?? c.fullName;

  // ── Documents ─────────────────────────────────────────────────────────
  const invoices: QbInvoice[] = []; const invoiceIds: string[] = [];
  for (const r of invoiceRows) {
    const doc = invoiceFor({
      invoiceNumber: r.invoiceNumber, issuedAt: r.issuedAt, dueDate: r.dueDate, customerName: nameOf(r.customer), jobNumber: r.jobCard.jobNumber, plate: r.jobCard.vehicle.plateNumber, jobType: r.jobCard.jobType,
      lines: r.lines, discountAmount: r.discountAmount, vatRate: r.vatRate, vatAmount: r.vatAmount, total: r.total,
      partNumbers: r.jobCard.estimate?.lineItems.map((li) => (li.type === 'STORE_PART' ? li.matchedPart?.partNumber ?? null : null)),
    }, settings);
    if (!documentAddsUp(doc)) { problems.push(`Invoice ${r.invoiceNumber}: its lines, discount and VAT do not add up to its total, so it was left out. Check it on its Job Card.`); continue; }
    invoices.push(doc); invoiceIds.push(r.id);
  }
  const counterSales: QbSalesReceipt[] = []; const saleIds: string[] = [];
  for (const r of saleRows) {
    const doc = salesReceiptFor({ number: r.number, soldAt: r.soldAt, customerName: r.customer ? nameOf(r.customer) : null, buyerName: r.buyerName, paymentMethod: r.paymentMethod, paymentReference: r.paymentReference, vatRate: r.vatRate, vatAmount: r.vatAmount, total: r.total, lines: r.lines }, settings);
    if (!documentAddsUp(doc)) { problems.push(`Counter sale ${r.number}: its lines and VAT do not add up to its total, so it was left out.`); continue; }
    counterSales.push(doc); saleIds.push(r.id);
  }
  const payments = paymentRows.filter((r) => r.jobCard).map((r) => paymentFor({ id: r.id, receiptNumber: r.receiptNumber, recordedAt: r.recordedAt, amount: r.amount, method: r.method, posReference: r.posReference, notes: r.notes, customerName: nameOf(r.jobCard!.customer), invoiceNumber: r.jobCard!.invoice?.invoiceNumber ?? null, jobNumber: r.jobCard!.jobNumber }));
  const creditNotes = noteRows.map((r) => creditNoteFor({ number: r.number, id: r.id, decidedAt: r.decidedAt, requestedAt: r.requestedAt, customerName: nameOf(r.customer), invoiceNumber: r.invoice.invoiceNumber, reason: r.reason, amount: r.amount, vatAmount: r.vatAmount }));
  const refunds = refundRows.filter((r) => r.jobCard).map((r) => refundFor({ referenceNumber: r.referenceNumber, recordedAt: r.recordedAt, amount: r.amount, method: r.method, reason: r.reason, paidToName: r.paidToName, customerName: nameOf(r.jobCard!.customer) }));

  const stockMovements: QbStockMovement[] = []; const stockIds: string[] = [];
  for (const l of stockRows) {
    const diff = Number(l.difference);
    let value: number | null;
    if (diff < 0) value = l.stockOuts.reduce((s, o) => s + Number(o.quantityTaken) * Number(o.goodsReceiptLine?.unitCost ?? 0), 0);
    else {
      const costs = l.stockCount.receipts.flatMap((g) => g.lines).filter((gl) => gl.partId === l.partId);
      value = costs.length && costs.every((c) => c.totalCost !== null) ? costs.reduce((s, c) => s + Number(c.totalCost), 0) : null;
    }
    if (value === null) { problems.push(`Stock count ${l.stockCount.number} (${l.part.name}): the cost of the surplus is not entered yet, so it was left out. Enter it on the goods receipt.`); continue; }
    stockMovements.push(stockMovementFor({ countNumber: l.stockCount.number, decidedAt: l.stockCount.decidedAt!, item: l.part.partNumber ? partItemName(l.part.partNumber, settings) : l.part.name.slice(0, 31), difference: diff, value, reason: l.reason }));
    stockIds.push(l.id);
  }

  // ── Lists ─────────────────────────────────────────────────────────────
  const customerRows = want.has('customers') ? await fresh('customers', listCustomers) : [];
  const customers = customerRows.map((c) => customerFor({ ...c, companyName: c.customerCompany?.companyName ?? null, paymentTermsDays: c.customerCompany?.paymentTermsDays ?? null, creditLimit: c.customerCompany?.creditLimit ?? null }, nameOf(c)));
  let items: QbItem[] = []; let itemIds: string[] = [];
  if (want.has('items')) {
    const soldParts = new Set(saleRows.flatMap((r) => r.lines.map((l) => l.partNumber).filter((x): x is string => Boolean(x))));
    const partRows = await fresh('items', await prisma.part.findMany({
      where: { ...(branchWhere as Prisma.PartWhereInput), branch: { businessUnit: { organisationId } }, isActive: true, OR: [{ createdAt: when }, { updatedAt: when }, ...(soldParts.size ? [{ partNumber: { in: [...soldParts] } }] : [])] },
      orderBy: { name: 'asc' },
      select: { id: true, partNumber: true, name: true, sellingPrice: true, reorderPoint: true, ...(seesCosts ? { goodsReceiptLines: { orderBy: { goodsReceipt: { receivedAt: 'desc' } }, take: 1, select: { unitCost: true } } } : {}) },
    }));
    items = itemsFor(partRows.map((p) => {
      const last = (p as unknown as { goodsReceiptLines?: { unitCost: unknown }[] }).goodsReceiptLines?.[0];
      return { partNumber: p.partNumber, name: p.name, sellingPrice: p.sellingPrice, reorderPoint: p.reorderPoint, cost: seesCosts && last?.unitCost != null ? Number(last.unitCost) : null };
    }), settings);
    itemIds = partRows.map((p) => p.id);
  }

  const docs = { invoices, counterSales, payments, creditNotes, refunds, stockMovements };
  return {
    customers, items, ...docs, problems, alreadyExported,
    ids: {
      customers: customerRows.map((c) => c.id), items: itemIds, invoices: invoiceIds, counterSales: saleIds,
      payments: paymentRows.filter((r) => r.jobCard).map((r) => r.id), creditNotes: noteRows.map((r) => r.id), refunds: refundRows.filter((r) => r.jobCard).map((r) => r.id), stockMovements: stockIds,
    },
    counts: { customers: customers.length, items: items.length, invoices: invoices.length, counterSales: counterSales.length, payments: payments.length, creditNotes: creditNotes.length, refunds: refunds.length, stockMovements: stockMovements.length },
    totals: totalsOf(docs),
  };
}
