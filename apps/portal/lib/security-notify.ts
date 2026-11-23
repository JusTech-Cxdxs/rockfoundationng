import { cleanForLog } from '@/lib/errors';
import { dutyRoleSlugs } from '@/lib/duty-roles';
import { orMasterAdmins } from '@/lib/master-fallback';
import { portalBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';
import { prisma } from '@ejo/database';
import { sendEmail } from '@/lib/email';
import { renderStaffNoticeEmail } from '@/lib/email-templates/staff-notice';
import { PLATFORM } from '@/lib/brand';
import { whatsAppToStaff } from '@/lib/whatsapp/send';

/**
 * Tells Security (everyone on the gate)
 * that the Workshop has released a vehicle — so they expect it at the gate.
 * Server-only helper, never a callable action. Every email is logged in the
 * Security email log and the record's audit trail; a failure never blocks
 * the checkout itself.
 */
export async function notifyGateOfRelease(jobCardId: string, actorId: string | null) {
  try {
    const rec = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { jobNumber: true, collectedByName: true, vehicle: { select: { make: true, model: true, plateNumber: true, chassisNumber: true } }, customer: { select: { fullName: true } }, branch: { select: { name: true, businessUnit: { select: { organisationId: true, organisation: { select: { name: true } } } } } } } })
      .then((j) => j && { number: j.jobNumber, collector: j.collectedByName, vehicle: j.vehicle, customer: j.customer.fullName, branch: j.branch });
    if (!rec) return;
    // The gate of THIS record's organisation only.
    // Security while that role is on; otherwise Front Desk, which covers the gate.
    const gateRoles = await dutyRoleSlugs(rec.branch.businessUnit.organisationId, 'security');
    const officers = await prisma.user.findMany({ where: { isActive: true, organisationId: rec.branch.businessUnit.organisationId, roles: { some: { role: { slug: { in: gateRoles } } } } }, select: { fullName: true, email: true } });
    // Nobody at the gate yet: the Platform Administrator is told (lib/master-fallback.ts).
    const gate = await orMasterAdmins(officers, rec.branch.businessUnit.organisationId);
    if (gate.length === 0) return;
    const car = [rec.vehicle.make, rec.vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
    const portal = portalBaseUrl();
    const subject = `Vehicle released — ${rec.vehicle.plateNumber ?? car} may leave (${rec.number})`;
    const lines = [
      `${car}${rec.vehicle.plateNumber ? ` — ${rec.vehicle.plateNumber}` : ''}`,
      ...(rec.vehicle.chassisNumber ? [`VIN: ${rec.vehicle.chassisNumber}`] : []),
      `${rec.number} · ${rec.customer}`,
      ...(rec.collector ? [`Collected by: ${rec.collector}`] : []),
      'Check the plate and VIN against the release page, then confirm the exit at the gate.',
    ];
    const entityType = 'JobCard';
    // The same notice on WhatsApp to the gate colleagues who switched it on.
    await whatsAppToStaff({ to: gate, key: 'staff_update', related: { type: entityType, id: jobCardId }, values: { what: subject, details: lines.join(' · '), link: `${portal}/security/vehicles/release/${jobCardId}` } });
    for (const g of gate) {
      let sent = true;
      let error: string | null = null;
      try {
        await sendEmail(g.email, subject, renderStaffNoticeEmail({
          recipientName: g.fullName,
          heading: 'A vehicle has been released to leave',
          lines,
          actionUrl: `${portal}/security/vehicles/release/${jobCardId}`,
          logoUrl: `${portal}/brand/emblem.png`,
          companyName: rec.branch.businessUnit?.organisation?.name ?? PLATFORM.name,
          branchName: rec.branch.name,
        }));
      } catch (err) {
        sent = false;
        error = err instanceof Error ? cleanForLog(err.message).slice(0, 300) : 'Unknown error';
      }
      await prisma.securityEmailLog.create({ data: { entityType, entityId: jobCardId, recipient: `${g.fullName} <${g.email}>`, subject, sent, error } });
      await prisma.auditLog.create({ data: { userId: actorId, action: sent ? 'security.email_sent' : 'security.email_failed', entityType, entityId: jobCardId, metadata: { to: g.fullName, subject, ...(error ? { error } : {}) } } });
    }
  } catch (err) {
    logFailure('Failed to notify Security of a released vehicle', jobCardId, err);
  }
}
