'use server';

/**
 * One vehicle, by its VIN or chassis number — the page search finds: the
 * vehicle and its owner, every Job Card and gate exit, and the jobs brought
 * in from the old system.
 *
 * Signed in, inside the person's organisation, and each part only for those
 * who may see it: Job Cards within their reach, gate records for Security or
 * the Workshop, the customer's name for those with Customers. A VIN never
 * seen here is "not found" — never a hint about another organisation's vehicles.
 */
import { prisma } from '@ejo/database';
import { allows, authorize, orgWhere, reachWhere } from '@/lib/authz/server';
import { requireUser } from '@/lib/actions/workshop';
import { isChassisLike, normaliseVin, vinCheckDigitOk } from '@/lib/vin';

/** Who may open a vehicle's page: anyone whose work touches vehicles. */
const VIEWERS = ['workshop.view', 'security.view', 'crm.view'] as const;

const words = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export type VehiclePassport = {
  vin: string;
  /** The VIN's own check digit (null: not a 17-character VIN). */
  checkDigitOk: boolean | null;
  description: string | null;
  vehicle: { id: string; plate: string | null; make: string | null; model: string | null; year: number | null; engineNumber: string | null; mileage: number | null; customer: { id: string; name: string } | null; registeredAt: Date } | null;
  after: {
    jobCards: { id: string; number: string; status: string; at: Date; branch: string; summary: string | null }[] | null;
    gateExits: { id: string; number: string; at: Date; branch: string }[] | null;
    /** Jobs brought in from the old system, read-only: by the vehicle's id or its VIN. */
    beforeEjo: { id: string; number: string; kind: string; status: string; at: Date; completedAt: Date | null; mileage: number | null; summary: string | null; total: number | null }[] | null;
  };
  /** Links the viewer may follow. */
  may: { editVehicle: boolean; customers: boolean };
};

/** The vehicle with this VIN (or chassis number), for this person — null when there is nothing for it. */
export async function getVehiclePassport(raw: string): Promise<VehiclePassport | null> {
  await requireUser();
  let allowedAny = false;
  for (const k of VIEWERS) if (await allows(k)) { allowedAny = true; break; }
  if (!allowedAny) await authorize('workshop.view', undefined, 'getVehiclePassport', 'Vehicle pages are for the people who work on vehicles.');
  const vin = normaliseVin(raw);
  if (!isChassisLike(vin)) return null;
  const fence = await orgWhere();
  const vehicle = await prisma.customerVehicle.findFirst({
    where: { chassisNumber: { equals: vin, mode: 'insensitive' }, customer: fence },
    select: { id: true, plateNumber: true, make: true, model: true, year: true, engineNumber: true, mileage: true, createdAt: true, customer: { select: { id: true, fullName: true } } },
  });
  const [canJobs, canSecurity, canCustomers, canEdit] = await Promise.all([
    allows('workshop.job_card.view'), allows('security.view'), allows('crm.view'), allows('workshop.view'),
  ]);
  const vid = vehicle?.id ?? '__none__';
  const [jobCards, beforeEjo, gateExits] = await Promise.all([
    canJobs ? prisma.jobCard.findMany({ where: { ...(await reachWhere('workshop.job_card.view')), vehicleId: vid }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, jobNumber: true, status: true, createdAt: true, complaint: true, branch: { select: { name: true } } } }) : null,
    canJobs ? prisma.historicalJob.findMany({ where: { ...fence, voidedAt: null, OR: [{ vehicleId: vid }, { vinKey: vin }] }, orderBy: { openedAt: 'desc' }, take: 200, select: { id: true, jobNumber: true, kind: true, status: true, openedAt: true, completedAt: true, mileage: true, description: true, workDone: true, totalAmount: true } }) : null,
    canSecurity || canJobs ? prisma.vehicleGateExit.findMany({ where: { ...(await reachWhere(canSecurity ? 'security.view' : 'workshop.job_card.view')), vehicleId: vid }, orderBy: { exitedAt: 'desc' }, take: 200, select: { id: true, exitNumber: true, exitedAt: true, branch: { select: { name: true } } } }) : null,
  ]);
  if (!vehicle && !(beforeEjo?.length)) return null;

  return {
    vin,
    checkDigitOk: vinCheckDigitOk(vin),
    description: vehicle ? [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ') : null,
    vehicle: vehicle ? { id: vehicle.id, plate: vehicle.plateNumber, make: vehicle.make, model: vehicle.model, year: vehicle.year, engineNumber: vehicle.engineNumber, mileage: vehicle.mileage, customer: canCustomers && vehicle.customer ? { id: vehicle.customer.id, name: vehicle.customer.fullName } : null, registeredAt: vehicle.createdAt } : null,
    after: {
      jobCards: jobCards?.map((j) => ({ id: j.id, number: j.jobNumber, status: words(j.status), at: j.createdAt, branch: j.branch.name, summary: j.complaint })) ?? null,
      gateExits: gateExits?.map((x) => ({ id: x.id, number: x.exitNumber, at: x.exitedAt, branch: x.branch.name })) ?? null,
      beforeEjo: beforeEjo?.map((j) => ({ id: j.id, number: j.jobNumber, kind: j.kind === 'SERVICE' ? 'Job card · service' : 'Job card', status: j.status === 'CANCELLED' ? 'Cancelled' : 'Closed', at: j.openedAt, completedAt: j.completedAt, mileage: j.mileage, summary: j.description ?? j.workDone, total: j.totalAmount === null ? null : Number(j.totalAmount) })) ?? null,
    },
    may: { editVehicle: Boolean(vehicle) && canEdit, customers: canCustomers },
  };
}
