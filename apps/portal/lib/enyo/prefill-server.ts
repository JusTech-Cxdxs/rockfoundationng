/**
 * Checks an Enyo pre-fill against the person's rights and organisation before
 * the Open Job Card form shows it (server-only; never a 'use server' file).
 * A customer outside the organisation, or a vehicle that is not theirs, is
 * simply left out — the form is never filled with something the person could
 * not have picked themselves.
 */
import { prisma } from '@ejo/database';
import { allows, orgWhere } from '@/lib/authz/server';
import type { JobCardPrefill } from './prefill';

export type CheckedJobCardPrefill = {
  customer: { id: string; label: string } | null;
  vehicleId: string | null;
  complaints: string[];
  mileage: number | null;
  /** Opened from a booking: what the visit is for, and the booking itself (linked to the Job Card once opened). */
  jobType?: string;
  appointment?: { id: string; number: string; name: string; phone: string; vehicle: string | null; registered: boolean };
};

export async function checkJobCardPrefill(p: JobCardPrefill | null): Promise<CheckedJobCardPrefill | null> {
  if (!p) return null;
  if (!(await allows('workshop.job_card.create'))) return null;
  const customer = p.customerId
    ? await prisma.customer.findFirst({ where: { id: p.customerId, ...(await orgWhere()) }, select: { id: true, fullName: true } })
    : null;
  const vehicle = customer && p.vehicleId ? await prisma.customerVehicle.findFirst({ where: { id: p.vehicleId, customerId: customer.id }, select: { id: true } }) : null;
  return {
    customer: customer ? { id: customer.id, label: customer.fullName } : null,
    vehicleId: vehicle?.id ?? null,
    complaints: p.complaints,
    mileage: p.mileage ?? null,
  };
}

/**
 * "Open a service Job Card" from a vehicle (/workshop/job-cards?service=1&vehicle=<id>):
 * the vehicle and its owner, checked the same way (inside the person's
 * organisation, for people who may open Job Cards). Only fills the form.
 */
export async function checkServiceVehiclePrefill(vehicleId: string | undefined): Promise<CheckedJobCardPrefill | null> {
  if (!vehicleId || !/^[a-z0-9]{20,40}$/.test(vehicleId)) return null;
  if (!(await allows('workshop.job_card.create'))) return null;
  const vehicle = await prisma.customerVehicle.findFirst({
    where: { id: vehicleId, customer: await orgWhere() },
    select: { id: true, customer: { select: { id: true, fullName: true } } },
  });
  if (!vehicle) return null;
  return { customer: { id: vehicle.customer.id, label: vehicle.customer.fullName }, vehicleId: vehicle.id, complaints: ['Routine service'], mileage: null };
}

/**
 * "Vehicle arrived: open the Job Card" from a booking (/workshop/job-cards?appointment=<id>):
 * the booking's customer, vehicle, kind of visit and note, inside the person's
 * organisation, for people who may open Job Cards. A booking by someone not
 * yet registered fills only the kind of visit and the note; the form shows
 * their name and phone so front desk can register them first.
 */
export async function checkAppointmentPrefill(appointmentId: string | undefined): Promise<CheckedJobCardPrefill | null> {
  if (!appointmentId || !/^[a-z0-9]{20,40}$/.test(appointmentId)) return null;
  if (!(await allows('workshop.job_card.create'))) return null;
  const org = await orgWhere();
  const a = await prisma.appointment.findFirst({
    where: { id: appointmentId, ...org, status: { in: ['REQUESTED', 'CONFIRMED'] }, jobCardId: null },
    select: { id: true, number: true, name: true, phone: true, jobType: true, note: true, vehicleText: true, plateNumber: true, customerId: true, vehicleId: true },
  });
  if (!a) return null;
  const customer = a.customerId ? await prisma.customer.findFirst({ where: { id: a.customerId, ...org }, select: { id: true, fullName: true } }) : null;
  const vehicle = customer && a.vehicleId ? await prisma.customerVehicle.findFirst({ where: { id: a.vehicleId, customerId: customer.id }, select: { id: true } }) : null;
  return {
    customer: customer ? { id: customer.id, label: customer.fullName } : null,
    vehicleId: vehicle?.id ?? null,
    complaints: a.note ? [a.note] : [],
    mileage: null,
    jobType: a.jobType,
    appointment: { id: a.id, number: a.number, name: a.name, phone: a.phone, vehicle: [a.vehicleText, a.plateNumber].filter(Boolean).join(' ') || null, registered: Boolean(customer) },
  };
}
