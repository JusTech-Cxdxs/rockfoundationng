'use server';
import { cleanForLog } from '@/lib/errors';
import { portalBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';
import { cache } from 'react';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { allows, authorize, canSeeRecord, getPrincipal, orgWhere, reachWhere, seeBranchAnyOf } from '@/lib/authz/server';
import { decide } from '@/lib/authz/catalogue';
import { jobCardInside } from '@/lib/custody';
import { writeAuditLog, getWorkshopBranchId, getWorkshopOrgContext } from '@/lib/workshop-core';
import { sendEmail } from '@/lib/email';
import { renderStaffNoticeEmail } from '@/lib/email-templates/staff-notice';
import { billingOf, jobCardTotals, ESTIMATE_TOTALS_SELECT, JOB_CARD_BILLING_SELECT } from '@/lib/estimate-billing';
import { lagosYear } from '@/lib/utils/format-date';
import { PLATFORM } from '@/lib/brand';

/**
 * The vehicle gate: which vehicles the Workshop has released, which are
 * still in the compound, and recording each one leaving with a numbered gate
 * pass. Every step is audited; every email to staff is logged.
 */

class SecurityError extends Error {}

type Person = { id: string; fullName: string; email: string };

// ── Roles ─────────────────────────────────────────────────────────────

async function slugsOf(userId: string): Promise<{ slugs: string[]; isMaster: boolean }> {
  const rows = await prisma.userRole.findMany({ where: { userId }, select: { role: { select: { slug: true, isSuperAdmin: true } } } });
  return { slugs: rows.map((r: { role: { slug: string } }) => r.role.slug), isMaster: rows.some((r: { role: { isSuperAdmin: boolean } }) => r.role.isSuperAdmin) };
}

export type SecurityRoles = { userId: string; isMaster: boolean; isGate: boolean };

/** The viewer's place at the gate, from the permission catalogue: isGate is
 * security.gate.operate, so the buttons shown and the actions allowed follow
 * one rule. */
async function getSecurityRolesUncached(): Promise<SecurityRoles> {
  const user = await requireUser();
  const [{ isMaster }, principal] = await Promise.all([slugsOf(user.id), getPrincipal()]);
  return { userId: user.id, isMaster, isGate: decide(principal, 'security.gate.operate').allowed };
}

// Cached per request.
const getSecurityRolesCached = cache(getSecurityRolesUncached);
export async function getSecurityRoles(): Promise<SecurityRoles> {
  return getSecurityRolesCached();
}

async function requireGate(): Promise<SecurityRoles> {
  const r = await getSecurityRoles();
  if (!r.isGate) await authorize('security.gate.operate', undefined, 'security.gate', 'Only Security can do this at the gate.');
  return r;
}

/** Gate work acts only on Job Cards of the person's own reach, never on
 * another organisation's record by its id. */
async function jobCardOnMyDesk(id: string, where: string): Promise<void> {
  const rec = await prisma.jobCard.findUnique({ where: { id }, select: { branchId: true } });
  if (!rec) return; // the action's own "not found" message follows
  await seeBranchAnyOf(['security.gate.operate', 'security.view'], rec.branchId, where);
}

/** Gate records are visible within the viewer's reach; out of reach behaves exactly like "not found". */
async function visibleOrNull<T extends { branchId?: string | null }>(rec: T | null, where: string): Promise<T | null> {
  if (!rec) return null;
  return (await canSeeRecord('security.view', { branchId: rec.branchId ?? null }, where)) ? rec : null;
}

// ── Numbering & logged emails ─────────────────────────────────────────

async function nextExitNumber(): Promise<string> {
  const start = `VX-${lagosYear()}-`;
  const latest = await prisma.vehicleGateExit.findFirst({ where: { exitNumber: { startsWith: start } }, orderBy: { exitNumber: 'desc' }, select: { exitNumber: true } });
  const n = latest ? parseInt(latest.exitNumber.slice(start.length), 10) + 1 : 1;
  return `${start}${String(n).padStart(6, '0')}`;
}

/** Sends one email and ALWAYS records it (recipient, subject, success or
 * the error) in the gate email log and the record's audit trail. */
async function sendLogged(entityType: string, entityId: string, recipients: Person[], subject: string, heading: string, lines: string[], path: string, actorId: string | null) {
  const unique = recipients.filter((r, i, a) => r.email && a.findIndex((x) => x.email === r.email) === i);
  if (unique.length === 0) return;
  const org = await getWorkshopOrgContext().catch(() => ({ companyName: PLATFORM.name, branchName: '', departmentName: '' }));
  const portal = portalBaseUrl();
  for (const r of unique) {
    let sent = true;
    let error: string | null = null;
    try {
      await sendEmail(r.email, subject, renderStaffNoticeEmail({ recipientName: r.fullName, heading, lines, actionUrl: `${portal}${path}`, logoUrl: `${portal}/brand/emblem.png`, companyName: org.companyName, branchName: org.branchName }));
    } catch (err) {
      sent = false;
      error = err instanceof Error ? cleanForLog(err.message).slice(0, 300) : 'Unknown error';
    }
    await prisma.securityEmailLog.create({ data: { entityType, entityId, recipient: `${r.fullName} <${r.email}>`, subject, sent, error } });
    await writeAuditLog({ userId: actorId, action: sent ? 'security.email_sent' : 'security.email_failed', entityType, entityId, metadata: { to: r.fullName, subject, ...(error ? { error } : {}) } });
  }
}

/** Tells the people who opened and supervised the job that its vehicle has
 * left. Never lets an email failure undo the exit. */
async function emailVehicleLeft(exitId: string, actorId: string | null): Promise<void> {
  const P = { select: { id: true, fullName: true, email: true } } as const;
  try {
    const x = await prisma.vehicleGateExit.findUnique({ where: { id: exitId }, select: { exitNumber: true, jobCard: { select: { jobNumber: true, createdBy: P, supervisor: P } } } });
    if (!x?.jobCard) return;
    const people = [x.jobCard.createdBy, x.jobCard.supervisor].filter((p): p is Person => Boolean(p?.email));
    await sendLogged('VehicleGateExit', exitId, people, `Vehicle has left the premises: ${x.jobCard.jobNumber}`, 'The vehicle has left through the gate', [`${x.exitNumber}: ${x.jobCard.jobNumber}`, 'Security confirmed the vehicle left with the customer.'], `/security/vehicles/exits/${exitId}`, actorId);
  } catch (err) {
    logFailure('Vehicle exit email failed', exitId, err);
  }
}

// ── Vehicles cleared to leave (from the Workshop) ─────────────────────

const VEHICLE_SELECT = { id: true, make: true, model: true, plateNumber: true, chassisNumber: true } as const;

/** Vehicles the Workshop has released (Job Card checked out) that Security
 * has not yet seen out. */
export async function listVehiclesClearedToLeave() {
  await requireUser();
  const reach = await reachWhere('security.view');
  const since = new Date(Date.now() - 30 * 86400000);
  const jcs = await prisma.jobCard.findMany({
    where: { ...reach, status: 'CHECKED_OUT', checkedOutAt: { gte: since }, gateExit: null },
    orderBy: { checkedOutAt: 'desc' },
    select: { id: true, jobNumber: true, checkedOutAt: true, collectedByName: true, vehicle: { select: VEHICLE_SELECT }, customer: { select: { fullName: true } } },
  });
  return jcs.map((j: (typeof jcs)[number]) => ({ id: j.id, number: j.jobNumber, releasedAt: j.checkedOutAt, collectedBy: j.collectedByName, vehicle: j.vehicle, customer: j.customer.fullName }));
}

/** Security records a released vehicle leaving: a numbered gate pass. */
export async function confirmVehicleExit(jobCardId: string, collectedBy: string, notes: string): Promise<{ id: string; exitNumber: string }> {
  const r = await requireGate();
  await jobCardOnMyDesk(jobCardId, 'confirmVehicleExit');
  const j = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { status: true, vehicleId: true, jobNumber: true, gateExit: { select: { id: true } } } });
  if (!j) throw new SecurityError('Record not found.');
  if (j.status !== 'CHECKED_OUT') throw new SecurityError('This vehicle has not been released by the Workshop. It may not leave.');
  if (j.gateExit) throw new SecurityError('This vehicle has already been recorded leaving.');
  const exitNumber = await nextExitNumber();
  const row = await prisma.vehicleGateExit.create({
    data: { exitNumber, branchId: await getWorkshopBranchId(), vehicleId: j.vehicleId, exitedById: r.userId, driverName: collectedBy.trim() || null, notes: notes.trim() || null, jobCardId },
  });
  const meta = { exitNumber, number: j.jobNumber, collectedBy: collectedBy.trim() || undefined };
  await writeAuditLog({ userId: r.userId, action: 'vehicle.gate_exit', entityType: 'VehicleGateExit', entityId: row.id, metadata: meta });
  await emailVehicleLeft(row.id, r.userId);
  await writeAuditLog({ userId: r.userId, action: 'vehicle.gate_exit', entityType: 'JobCard', entityId: jobCardId, metadata: meta });
  await writeAuditLog({ userId: r.userId, action: 'vehicle.gate_exit', entityType: 'CustomerVehicle', entityId: j.vehicleId, metadata: { exitNumber, number: j.jobNumber } });
  return { id: row.id, exitNumber: row.exitNumber };
}

// ── Dashboard ─────────────────────────────────────────────────────────

export async function getSecurityDashboard() {
  await requireUser();
  const reach = await reachWhere('security.view');
  const startOfDay = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) + 'T00:00:00+01:00');
  const [vehicles, workshopVehicles, exitsToday, recentExits] = await Promise.all([
    listVehiclesClearedToLeave(),
    // Workshop vehicles physically inside: work not yet released. Same
    // "still inside" as the main dashboard and custody pages (lib/custody.ts):
    // a cancelled job whose vehicle has not been collected is still here.
    prisma.jobCard.count({ where: { ...reach, ...jobCardInside() } }),
    prisma.vehicleGateExit.count({ where: { ...reach, exitedAt: { gte: startOfDay } } }),
    prisma.vehicleGateExit.findMany({
      where: reach,
      orderBy: { exitedAt: 'desc' },
      take: 8,
      select: { id: true, exitNumber: true, exitedAt: true, driverName: true, vehicle: { select: { make: true, model: true, plateNumber: true } }, jobCard: { select: { jobNumber: true } } },
    }),
  ]);
  return {
    vehicles,
    recentExits,
    compound: {
      workshopVehicles,
      awaitingExit: vehicles.length,
      vehiclesInside: workshopVehicles + vehicles.length,
      exitsToday,
    },
  };
}

// ── Queries ───────────────────────────────────────────────────────────

/** Trail and every email for one gate exit (or broadcast). */
export async function getSecurityHistory(entityType: 'VehicleGateExit' | 'Broadcast', entityId: string) {
  const user = await requireUser();
  // The history is only as visible as the record itself (no reading by id).
  let visible = false;
  if (entityType === 'Broadcast') {
    const [b, u] = await Promise.all([prisma.broadcast.findUnique({ where: { id: entityId }, select: { organisationId: true } }), prisma.user.findUnique({ where: { id: user.id }, select: { organisationId: true } })]);
    visible = Boolean(b && b.organisationId === u?.organisationId);
  } else {
    visible = Boolean(await visibleOrNull(await prisma.vehicleGateExit.findUnique({ where: { id: entityId }, select: { branchId: true } }), `${entityType}:${entityId}`));
  }
  const key = visible ? entityId : '__no_access__';
  const [entries, emails] = await Promise.all([
    prisma.auditLog.findMany({ where: { entityType, entityId: key }, orderBy: { createdAt: 'desc' }, select: { id: true, action: true, createdAt: true, metadata: true, userId: true } }),
    prisma.securityEmailLog.findMany({ where: { entityType, entityId: key }, orderBy: { createdAt: 'desc' } }),
  ]);
  const ids = [...new Set(entries.map((e: { userId: string | null }) => e.userId).filter((x: string | null): x is string => Boolean(x)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  return { entries: entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? name.get(e.userId) ?? null : null })), emails };
}

/** Searchable staff options (pickers across the portal). */
export async function searchStaffOptions(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await requireUser();
  const q = query.trim();
  const rows = await prisma.user.findMany({
    where: { isActive: true, ...(await orgWhere()), ...((await viewerIsPlatform()) ? {} : { NOT: { roles: { some: { role: { isSuperAdmin: true } } } } }), ...(q ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { employeeId: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) },
    orderBy: { fullName: 'asc' },
    take: 25,
    select: { id: true, fullName: true, employeeId: true, department: { select: { name: true } }, employeeProfile: { select: { jobTitle: true } } },
  });
  return rows.map((u: (typeof rows)[number]) => ({ value: u.id, label: u.fullName, sublabel: [u.employeeId, u.employeeProfile?.jobTitle, u.department?.name].filter(Boolean).join(' · ') || undefined }));
}
export async function loadStaffOptions() {
  return searchStaffOptions('');
}

/** One vehicle gate exit, for its page and printed gate pass. */
export async function getVehicleGateExit(id: string) {
  await requireUser();
  return visibleOrNull(await prisma.vehicleGateExit.findUnique({
    where: { id },
    include: {
      branch: true,
      exitedBy: { select: { fullName: true } },
      vehicle: { select: { make: true, model: true, plateNumber: true, chassisNumber: true } },
      jobCard: { select: { jobNumber: true, checkedOutAt: true, collectedByName: true, customer: { select: { fullName: true } } } },
    },
  }), `VehicleGateExit:${id}`);
}

export type InsideVehicle = { stage: 'WORKSHOP' | 'CLEARED'; id: string; number: string; plate: string | null; description: string; who: string; since: Date | null; href: string };

/** Every vehicle inside the compound now: workshop vehicles still being
 * worked on, and released vehicles not yet out. */
export async function listVehiclesInside(): Promise<InsideVehicle[]> {
  await requireUser();
  const reach = await reachWhere('security.view');
  const [jcs, cleared] = await Promise.all([
    prisma.jobCard.findMany({ where: { ...reach, ...jobCardInside() }, select: { id: true, jobNumber: true, createdAt: true, vehicle: { select: { make: true, model: true, plateNumber: true } }, customer: { select: { fullName: true } } } }),
    listVehiclesClearedToLeave(),
  ]);
  // The gate sees which job a vehicle is on, but opens the job only if allowed.
  const jobs = await allows('workshop.job_card.view');
  const car = (v: { make: string | null; model: string | null }) => [v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
  return [
    ...jcs.map((j: (typeof jcs)[number]) => ({ stage: 'WORKSHOP' as const, id: j.id, number: j.jobNumber, plate: j.vehicle.plateNumber, description: car(j.vehicle), who: j.customer.fullName, since: j.createdAt, href: jobs ? `/workshop/job-cards/${j.id}` : '' })),
    ...cleared.map((c) => ({ stage: 'CLEARED' as const, id: c.id, number: c.number, plate: c.vehicle.plateNumber, description: car(c.vehicle), who: c.customer, since: c.releasedAt, href: `/security/vehicles/release/${c.id}` })),
  ].sort((a, b) => (b.since?.getTime() ?? 0) - (a.since?.getTime() ?? 0));
}

/** Payments minus refunds. */
function netPaid(payments: { amount: unknown }[], refunds: { amount: unknown }[]): number {
  const sum = (xs: { amount: unknown }[]) => xs.reduce((n, x) => n + Number(x.amount), 0);
  return Math.round((sum(payments) - sum(refunds)) * 100) / 100;
}

/** One released vehicle, for its release (confirm exit) page. */
export async function getClearedVehicle(id: string) {
  await requireUser();
  const reach = await reachWhere('security.view', { lens: false });
  const j = await prisma.jobCard.findFirst({
    where: { id, ...reach },
    select: { id: true, jobNumber: true, status: true, checkedOutAt: true, collectedByName: true, gateExit: { select: { id: true, exitNumber: true } }, vehicle: { select: { ...VEHICLE_SELECT, mileage: true } }, customer: { select: { fullName: true, phone: true } }, payments: { select: { amount: true } }, refunds: { select: { amount: true } }, estimate: { select: ESTIMATE_TOTALS_SELECT }, ...JOB_CARD_BILLING_SELECT },
  });
  if (!j) return null;
  // Net of refunds: a fully refunded job shows ₦0 paid, not the original payment.
  return { id: j.id, number: j.jobNumber, released: j.status === 'CHECKED_OUT', releasedAt: j.checkedOutAt, collectedBy: j.collectedByName, exit: j.gateExit, vehicle: j.vehicle, customer: j.customer, total: jobCardTotals(j.estimate, billingOf(j)).total, paid: netPaid(j.payments, j.refunds) };
}

/** Vehicle exit history, newest first, searchable. */
export async function listVehicleExits(q?: string) {
  await requireUser();
  const reach = await reachWhere('security.view');
  const t = q?.trim();
  return prisma.vehicleGateExit.findMany({
    where: { ...reach, ...(t ? { OR: [{ exitNumber: { contains: t, mode: 'insensitive' } }, { driverName: { contains: t, mode: 'insensitive' } }, { vehicle: { plateNumber: { contains: t, mode: 'insensitive' } } }, { jobCard: { jobNumber: { contains: t, mode: 'insensitive' } } }] } : {}) },
    orderBy: { exitedAt: 'desc' },
    take: 300,
    select: {
      id: true, exitNumber: true, exitedAt: true, driverName: true, notes: true,
      exitedBy: { select: { fullName: true } },
      vehicle: { select: { id: true, make: true, model: true, plateNumber: true } },
      jobCard: { select: { id: true, jobNumber: true, customer: { select: { id: true, fullName: true } } } },
    },
  });
}

export type SecurityRecord = { type: 'VEHICLE_EXIT'; id: string; number: string; title: string; detail: string; status: string; at: Date; href: string };

/** The gate register (for exports): every vehicle exit, newest first,
 * searchable by any number, name or plate. */
export async function searchSecurityRecords(q?: string): Promise<SecurityRecord[]> {
  const exits = await listVehicleExits(q);
  return exits.map((x: (typeof exits)[number]) => ({
    type: 'VEHICLE_EXIT' as const,
    id: x.id,
    number: x.exitNumber,
    title: `${[x.vehicle.make, x.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}${x.vehicle.plateNumber ? `, ${x.vehicle.plateNumber}` : ''}`,
    detail: `${x.jobCard?.jobNumber ?? ''} · ${x.jobCard?.customer.fullName ?? ''}`,
    status: 'LEFT',
    at: x.exitedAt,
    href: `/security/vehicles/exits/${x.id}`,
  }));
}

/** An exit's whole story: its own trail, plus, from its Job Card, the
 * release email(s) to Security and the gate-exit entries. */
export async function getVehicleExitHistory(exitId: string) {
  await requireUser();
  const x = await visibleOrNull(await prisma.vehicleGateExit.findUnique({ where: { id: exitId }, select: { jobCardId: true, branchId: true } }), `VehicleGateExit:${exitId}`);
  if (!x) return { entries: [], emails: [] };
  const recId = x.jobCardId ?? '__none__';
  const [entries, emails] = await Promise.all([
    prisma.auditLog.findMany({
      where: { OR: [{ entityType: 'VehicleGateExit', entityId: exitId }, { entityType: 'JobCard', entityId: recId, action: { in: ['vehicle.gate_exit', 'security.email_sent', 'security.email_failed'] } }] },
      orderBy: { createdAt: 'desc' },
      select: { id: true, action: true, createdAt: true, metadata: true, userId: true, entityType: true },
    }),
    prisma.securityEmailLog.findMany({ where: { OR: [{ entityType: 'VehicleGateExit', entityId: exitId }, { entityType: 'JobCard', entityId: recId }] }, orderBy: { createdAt: 'desc' } }),
  ]);
  // The same gate exit is written on the exit AND the Job Card: show it once.
  const seen = new Set<string>();
  const unique = entries.filter((e: (typeof entries)[number]) => {
    if (e.action !== 'vehicle.gate_exit') return true;
    const key = `${(e.metadata as { exitNumber?: string } | null)?.exitNumber ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const ids = [...new Set(unique.map((e: { userId: string | null }) => e.userId).filter((v: string | null): v is string => Boolean(v)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  return { entries: unique.map((e: (typeof unique)[number]) => ({ ...e, userName: e.userId ? name.get(e.userId) ?? null : null })), emails };
}

/** Is the person looking at this part of the platform team? (The platform team is invisible to organisations.) */
async function viewerIsPlatform(): Promise<boolean> {
  const user = await requireUser();
  return Boolean(await prisma.userRole.findFirst({ where: { userId: user.id, role: { isSuperAdmin: true } }, select: { id: true } }));
}

