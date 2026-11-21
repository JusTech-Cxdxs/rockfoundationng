'use server';

import { seeVehicle } from '@/lib/authz/server';
import { prisma } from '@ejo/database';
import { requireUser } from './workshop';

/** Every part ever released to one vehicle on a Job Card, with its Parts
 * Request and serials. */
export async function listPartsFittedToVehicle(vehicleId: string) {
  await requireUser();
  await seeVehicle(vehicleId, 'listPartsFittedToVehicle');
  return prisma.partRequestSlipLine.findMany({
    where: {
      quantityReleased: { gt: 0 },
      slip: { status: 'RELEASED', jobCard: { vehicleId } },
    },
    orderBy: { slip: { releasedAt: 'desc' } },
    take: 200,
    select: {
      id: true,
      quantityReleased: true,
      part: { select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true } },
      issuedSerials: { select: { serialNumber: true } },
      slip: {
        select: {
          id: true, referenceNumber: true, releasedAt: true,
          jobCard: { select: { id: true, jobNumber: true, customer: { select: { fullName: true } } } },
        },
      },
    },
  });
}

/** Value of work on this vehicle NOT charged to the customer — Job Card
 * lines covered under warranty, as goodwill or internally (cancelled jobs excluded). */
export async function getVehicleCoveredValue(vehicleId: string): Promise<number> {
  await requireUser();
  await seeVehicle(vehicleId, 'getVehicleCoveredValue');
  const lines = await prisma.estimateLineItem.findMany({
    where: { billTo: { not: 'CUSTOMER' }, estimate: { jobCard: { vehicleId, status: { not: 'CANCELLED' } } } },
    select: { amount: true },
  });
  return Math.round(lines.reduce((s: number, l: { amount: unknown }) => s + Number(l.amount ?? 0), 0) * 100) / 100;
}

/**
 * This vehicle's history from the old system, read-only: its invoices and
 * jobs (linked when imported, or found by its chassis number). Staff only.
 */
export async function getVehicleHistoryBeforeEjo(vehicleId: string): Promise<{
  invoices: { id: string; number: string; date: string; amount: number; documentType: string | null; description: string | null; customerName: string | null; fiscalYear: number | null }[];
  /** Job cards and services from the old system: read-only, staff only. */
  jobs: { id: string; kind: string; number: string; openedAt: string; completedAt: string | null; mileage: number | null; description: string | null; workDone: string | null; technician: string | null; total: number | null; invoiceNumber: string | null; status: string; customerName: string | null }[];
}> {
  await requireUser();
  await seeVehicle(vehicleId, 'getVehicleHistoryBeforeEjo');
  const v = await prisma.customerVehicle.findUnique({ where: { id: vehicleId }, select: { chassisNumber: true, customer: { select: { organisationId: true } } } });
  if (!v) return { invoices: [], jobs: [] };
  const organisationId = v.customer.organisationId;
  const vinKey = v.chassisNumber ? v.chassisNumber.toUpperCase().replace(/[\s-]/g, '') : null;
  const [invoices, jobs] = await Promise.all([
    prisma.historicalInvoice.findMany({
      where: { organisationId, voidedAt: null, OR: [{ vehicleId }, ...(vinKey ? [{ vinKey }] : [])] },
      orderBy: { invoiceDate: 'desc' }, take: 300,
      select: { id: true, invoiceNumber: true, invoiceDate: true, amount: true, documentType: true, description: true, customerId: true, fiscalYear: true },
    }),
    prisma.historicalJob.findMany({
      where: { organisationId, voidedAt: null, OR: [{ vehicleId }, ...(vinKey ? [{ vinKey }] : [])] },
      orderBy: [{ openedAt: 'desc' }], take: 300,
      select: { id: true, kind: true, jobNumber: true, openedAt: true, completedAt: true, mileage: true, description: true, workDone: true, technician: true, totalAmount: true, invoiceNumber: true, status: true, customerId: true },
    }),
  ]);
  const names = new Map((await prisma.customer.findMany({ where: { organisationId, id: { in: [...new Set([...invoices.map((i) => i.customerId), ...jobs.map((j) => j.customerId)])] } }, select: { id: true, fullName: true } })).map((c) => [c.id, c.fullName]));
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return {
    invoices: invoices.map((i) => ({ id: i.id, number: i.invoiceNumber, date: ymd(i.invoiceDate), amount: Number(i.amount), documentType: i.documentType, description: i.description, customerName: names.get(i.customerId) ?? null, fiscalYear: i.fiscalYear })),
    jobs: jobs.map((j) => ({ id: j.id, kind: j.kind, number: j.jobNumber, openedAt: ymd(j.openedAt), completedAt: j.completedAt ? ymd(j.completedAt) : null, mileage: j.mileage, description: j.description, workDone: j.workDone, technician: j.technician, total: j.totalAmount === null ? null : Number(j.totalAmount), invoiceNumber: j.invoiceNumber, status: j.status, customerName: names.get(j.customerId) ?? null })),
  };
}
