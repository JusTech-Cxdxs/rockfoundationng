/**
 * Fixtures for the security / concurrency tests — runs AFTER e2e/seed.ts on
 * the throw-away CI database (never a real one). Creates records of the FIRST
 * organisation in known states (so tests can (a) try to read them as another
 * organisation and (b) fire concurrent workflow actions at them), and writes
 * their ids to sec-fixtures.json.
 *
 * Also gives the second organisation's administrator role the same
 * permission grants as the first organisation's, so cross-organisation
 * tests use a FULLY privileged admin of another tenant (the strongest case).
 */
import { writeFileSync } from 'node:fs';
import { PrismaClient, Prisma } from '@prisma/client';
import { MASTER, ORGANISATION_SLUG, OTHER_ORG_ADMIN } from '../people';

const prisma = new PrismaClient();
const D = (n: number) => new Prisma.Decimal(n);

async function main() {
  const org = await prisma.organisation.findUniqueOrThrow({ where: { slug: ORGANISATION_SLUG } });
  const other = await prisma.organisation.findUniqueOrThrow({ where: { slug: 'other-org-e2e' } });
  const branch = await prisma.branch.findFirstOrThrow({ where: { businessUnit: { organisationId: org.id } }, orderBy: { createdAt: 'asc' } });
  const u = async (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });
  const front = await u('frontdesk@e2e.test');
  const sup = await u('supervisor@e2e.test');
  const tech = await u('tech@e2e.test');
  const mgr = await u('owner@e2e.test');
  const fin = await u('accounts@e2e.test');
  // The Store's records are made by the Store Keeper.
  const store = (await prisma.user.findUnique({ where: { email: 'store@e2e.test' } })) ?? mgr;
  const admin = await u('owner@e2e.test');
  const master = await u(MASTER.email);
  const otherAdmin = await u(OTHER_ORG_ADMIN.email);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { email: 'customer@e2e.test' } });
  const dept = await prisma.department.findUnique({ where: { branchId_slug: { branchId: branch.id, slug: 'mechanical' } } });

  // Other organisation's admin: same grants as ours (role slug 'owner').
  const ourAdminRole = await prisma.role.findUniqueOrThrow({ where: { organisationId_slug: { organisationId: org.id, slug: 'owner' } }, include: { permissions: true } });
  const theirAdminRole = await prisma.role.findUniqueOrThrow({ where: { organisationId_slug: { organisationId: other.id, slug: 'owner' } } });
  for (const rp of ourAdminRole.permissions) {
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: theirAdminRole.id, permissionId: rp.permissionId } }, update: {}, create: { roleId: theirAdminRole.id, permissionId: rp.permissionId } });
  }

  const vehicle = (plate: string) => prisma.customerVehicle.upsert({
    where: { plateNumber: plate }, update: {},
    create: { customerId: customer.id, make: 'Toyota', model: 'Camry', year: 2021, vehicleType: 'PASSENGER', plateNumber: plate, mileage: 10000, createdById: front.id },
  });
  const sameVehicle = await vehicle('SEC-SAME-01');
  const manyVehicles = await Promise.all(Array.from({ length: 15 }, (_, i) => vehicle(`SEC-NUM-${String(i + 1).padStart(2, '0')}`)));

  let n = 900000;
  const jobNumber = () => `JC-SEC-${String((n += 1))}`;
  const jobCard = async (plate: string, status: 'AWAITING_CUSTOMER_APPROVAL' | 'CANCELLED' | 'IN_PROGRESS' | 'CHECKED_OUT', total: number) => {
    const v = await vehicle(plate);
    const jc = await prisma.jobCard.create({
      data: {
        jobNumber: jobNumber(), branchId: branch.id, customerId: customer.id, vehicleId: v.id, departmentId: dept?.id ?? null,
        createdById: front.id, supervisorId: sup.id, assignedTechnicianId: tech.id, technicianAcceptanceStatus: 'ACCEPTED',
        status, approvalStatus: 'APPROVED', approvedById: sup.id, approvedAt: new Date(), complaint: 'Security test fixture',
        workStartedAt: status === 'IN_PROGRESS' ? new Date() : null,
      },
    });
    await prisma.estimate.create({
      data: {
        jobCardId: jc.id, status: 'MANAGER_APPROVED', createdById: tech.id, approvedById: sup.id, approvedAt: new Date(), managerApprovedById: mgr.id, managerApprovedAt: new Date(), customerNotifiedAt: new Date(), customerNotifiedById: fin.id,
        lineItems: { create: [{ type: 'LABOUR', description: 'Labour (fixture)', quantity: 1, unitPrice: D(total), amount: D(total), enteredById: tech.id, billTo: 'CUSTOMER' }] },
      },
    });
    return jc;
  };

  // Payments: 100,000 owed, awaiting the customer (deposit 70%).
  const jcPay = await jobCard('SEC-PAY-01', 'AWAITING_CUSTOMER_APPROVAL', 100000);
  const jcPay2 = await jobCard('SEC-PAY-02', 'AWAITING_CUSTOMER_APPROVAL', 100000);
  // Refunds: cancelled, 50,000 paid.
  const jcRefund = await jobCard('SEC-REF-01', 'CANCELLED', 100000);
  await prisma.payment.create({ data: { jobCardId: jcRefund.id, amount: D(50000), method: 'CASH', recordedById: fin.id, notes: 'fixture' } });
  // Print views exist only for finished records — one checked-out card, one collected service.
  const jcOut = await jobCard('SEC-OUT-01', 'CHECKED_OUT', 50000);
  await prisma.jobCard.update({ where: { id: jcOut.id }, data: { checkedOutAt: new Date(), collectedByName: 'Ada Customer', closedAt: new Date(), completedAt: new Date() } });
  // Stock: an open job with parts requests waiting for the Store.
  const jcSlips = await jobCard('SEC-SLIP-01', 'IN_PROGRESS', 100000);

  const part = async (name: string, partNumber: string, onHand: number, reserved = 0) => {
    const p = await prisma.part.upsert({
      where: { branchId_partNumber: { branchId: branch.id, partNumber } }, update: {},
      create: { branchId: branch.id, name, partNumber, baseUnitOfMeasure: 'piece', trackingType: 'QUANTITY', sellingPrice: D(5000), createdById: store.id },
    });
    await prisma.partStock.upsert({ where: { partId: p.id }, update: { quantityOnHand: D(onHand), quantityReserved: D(reserved) }, create: { partId: p.id, quantityOnHand: D(onHand), quantityReserved: D(reserved) } });
    return p;
  };
  const pApprove = await part('Brake pad (sec test)', 'SEC-P-APPROVE', 10);
  const pRelease = await part('Oil filter (sec test)', 'SEC-P-RELEASE', 5, 2);
  const pReceive = await part('Air filter (sec test)', 'SEC-P-RECEIVE', 0);

  let s = 0;
  const slip = (status: 'PENDING_STORE_APPROVAL' | 'APPROVED', partId: string, qty: number) => prisma.partRequestSlip.create({
    data: {
      referenceNumber: `PRS-SEC-${String((s += 1)).padStart(4, '0')}`, jobCardId: jcSlips.id, branchId: branch.id, requestedById: tech.id, status,
      hodApprovedById: sup.id, hodApprovedAt: new Date(), ...(status === 'APPROVED' ? { storeApprovedById: store.id, storeApprovedAt: new Date() } : {}),
      lines: { create: [{ partId, quantityRequested: D(qty) }] },
    },
  });
  const pendingSlips = [];
  for (let i = 0; i < 10; i += 1) pendingSlips.push(await slip('PENDING_STORE_APPROVAL', pApprove.id, 3));
  const approvedSlip = await slip('APPROVED', pRelease.id, 2);

  // Records to probe from the other organisation.
  const gr = await prisma.goodsReceipt.create({
    data: { branchId: branch.id, referenceNumber: 'GRN-SEC-000001', supplierName: 'Fixture Supplier Ltd', receivedById: store.id, lines: { create: [{ partId: pReceive.id, quantityReceivedInUnit: D(0), unitUsed: 'piece', quantityInBaseUnit: D(0) }] } },
  }).catch(async () => prisma.goodsReceipt.findUniqueOrThrow({ where: { referenceNumber: 'GRN-SEC-000001' } }));
  const refund = await prisma.refund.create({ data: { referenceNumber: 'RF-SEC-000001', jobCardId: jcRefund.id, amount: D(1), method: 'CASH', paidToName: 'Ada Customer', reason: 'fixture', recordedById: fin.id } });
  const broadcast = await prisma.broadcast.create({ data: { broadcastNumber: 'BC-SEC-000001', organisationId: org.id, category: 'NEWS', title: 'Secret fixture broadcast', message: 'Only org one may read this', startsAt: new Date(), createdById: admin.id } });

  // Phase 4–8 records, to probe from the other organisation: a counter sale, a stock count, an invoice with a credit note,
  // a supplier claim, a QuickBooks export and a booking. Markers: "Ada Customer", "Fixture Supplier Ltd", the SEC numbers.
  const counterSale = await prisma.counterSale.upsert({ where: { number: 'CS-SEC-000001' }, update: {}, create: {
    number: 'CS-SEC-000001', organisationId: org.id, branchId: branch.id, customerId: customer.id, buyerName: 'Ada Customer', buyerPhone: '0800 000 0001',
    subtotal: D(5000), vatRate: D(7.5), vatAmount: D(375), total: D(5375), paymentMethod: 'CASH', soldById: store.id,
    lines: { create: [{ partId: pApprove.id, description: 'Brake pad (sec test)', partNumber: 'SEC-P-APPROVE', unitOfMeasure: 'piece', quantity: D(1), unitPrice: D(5000), amount: D(5000) }] },
  } });
  const stockCount = await prisma.stockCount.upsert({ where: { number: 'SC-SEC-000001' }, update: {}, create: {
    number: 'SC-SEC-000001', organisationId: org.id, branchId: branch.id, status: 'PENDING_APPROVAL', note: 'Secret fixture count', countedById: store.id,
    lines: { create: [{ partId: pRelease.id, systemQuantity: D(5), countedQuantity: D(4), difference: D(-1), reason: 'Damaged' }] },
  } });
  const invoice = await prisma.invoice.upsert({ where: { invoiceNumber: 'INV-SEC-000001' }, update: {}, create: {
    invoiceNumber: 'INV-SEC-000001', organisationId: org.id, branchId: branch.id, jobCardId: jcOut.id, customerId: customer.id, subtotal: D(50000), lineDiscounts: D(0), discountAmount: D(0),
    vatRate: D(7.5), vatAmount: D(3750), total: D(53750), amountPaidAtIssue: D(0), lines: [{ type: 'LABOUR', description: 'Labour (fixture)', quantity: 1, unitPrice: 50000, amount: 50000 }], issuedById: sup.id,
  } });
  const creditNote = (await prisma.creditNote.findFirst({ where: { invoiceId: invoice.id } })) ?? await prisma.creditNote.create({ data: {
    number: 'CN-SEC-000001', organisationId: org.id, branchId: branch.id, invoiceId: invoice.id, jobCardId: jcOut.id, customerId: customer.id, status: 'APPROVED',
    amount: D(1075), vatAmount: D(75), reason: 'Secret fixture credit', requestedById: fin.id, decidedById: mgr.id, decidedAt: new Date(),
  } });
  const supplierClaim = await prisma.supplierClaim.upsert({ where: { number: 'CLM-SEC-000001' }, update: {}, create: {
    number: 'CLM-SEC-000001', organisationId: org.id, branchId: branch.id, supplierName: 'Fixture Supplier Ltd', partName: 'Brake pad (sec test)', amountClaimed: D(5000), fault: 'Secret fixture fault', createdById: fin.id,
  } });
  const qbExport = await prisma.quickBooksExport.upsert({ where: { number: 'QBX-SEC-000001' }, update: {}, create: {
    organisationId: org.id, number: 'QBX-SEC-000001', fromDay: '2026-01-01', toDay: '2026-01-31', format: 'iif', kinds: ['customers'], counts: { customers: 1 }, totals: {}, files: [{ name: 'customers.iif', kind: 'customers', text: '!CUST\tNAME\nCUST\tAda Customer\n' }], createdById: fin.id,
  } });
  const appointment = await prisma.appointment.upsert({ where: { number: 'APT-SEC-000001' }, update: {}, create: {
    number: 'APT-SEC-000001', organisationId: org.id, branchId: branch.id, customerId: customer.id, vehicleId: sameVehicle.id, jobType: 'SERVICE', day: '2026-12-01', slot: '08:00',
    name: 'Ada Customer', phone: '0800 000 0001', vehicleText: '2021 Toyota Camry', status: 'CONFIRMED', source: 'STAFF', createdById: front.id,
  } });

  const out = {
    orgId: org.id, otherOrgId: other.id, branchId: branch.id, customerId: customer.id, vehicleId: sameVehicle.id,
    users: { front: front.id, sup: sup.id, tech: tech.id, mgr: mgr.id, fin: fin.id, store: store.id, admin: admin.id, master: master.id, otherAdmin: otherAdmin.id },
    roles: { admin: ourAdminRole.id, tech: (await prisma.role.findUniqueOrThrow({ where: { organisationId_slug: { organisationId: org.id, slug: 'technician' } } })).id },
    sameVehicleId: sameVehicle.id, manyVehicleIds: manyVehicles.map((v) => v.id),
    jcPay: jcPay.id, jcPay2: jcPay2.id, jcRefund: jcRefund.id, jcSlips: jcSlips.id, jcOut: jcOut.id,
    parts: { approve: pApprove.id, release: pRelease.id, receive: pReceive.id },
    pendingSlips: pendingSlips.map((x) => x.id), approvedSlip: approvedSlip.id,
    goodsReceipt: gr.id,
    refund: refund.id, broadcast: broadcast.id,
    counterSale: counterSale.id, stockCount: stockCount.id, invoice: invoice.id, creditNote: creditNote.id, supplierClaim: supplierClaim.id, qbExport: qbExport.id, appointment: appointment.id,
    markers: { jobNumber: jcPay.jobNumber, plate: 'SEC-PAY-01', customer: 'Ada Customer', broadcast: 'Secret fixture broadcast', supplier: 'Fixture Supplier Ltd' },
  };
  writeFileSync(process.env.SEC_FIXTURES ?? 'sec-fixtures.json', JSON.stringify(out, null, 1));
  // eslint-disable-next-line no-console
  console.log(`security fixtures: ${Object.keys(out).length} keys written`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
