import { prisma } from '@ejo/database';
import { type OptionalRole } from '@/lib/authz/catalogue';

/**
 * Who does an optional role's work in an organisation: the role itself while
 * it is switched on (Settings → Roles), otherwise Front Desk, which covers
 * its steps (lib/authz/catalogue.ts, OPTIONAL_ROLE_COVER). Used to address
 * notices and emails to the people who will actually act on them.
 */
export async function dutyRoleSlugs(organisationId: string, role: OptionalRole): Promise<string[]> {
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { optionalRoles: true } });
  return org?.optionalRoles.includes(role) ? [role] : ['front-desk'];
}

/** The optional roles an organisation has switched on. */
async function enabledOptional(organisationId: string): Promise<Set<string>> {
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { optionalRoles: true } });
  return new Set(org?.optionalRoles ?? []);
}

/**
 * Who may supervise a Job Card: the Owner always; Workshop Supervisors of the
 * job's department while that role is on, otherwise Front Desk (which covers
 * the supervisor's steps). As a Prisma user filter.
 */
export async function supervisorWhere(organisationId: string, departmentId: string | null) {
  const on = await enabledOptional(organisationId);
  const roleIs = (slugs: string[]) => ({ roles: { some: { role: { slug: { in: slugs } } } } });
  return {
    organisationId,
    isActive: true,
    OR: [
      roleIs(['owner']),
      on.has('workshop-supervisor')
        ? { ...roleIs(['workshop-supervisor']), ...(departmentId ? { departmentId } : {}) }
        : roleIs(['front-desk']),
    ],
  };
}

/**
 * Who may be given the work on a Job Card: technicians while that role is on,
 * the people who supervise (above), and the Owner.
 */
export async function workshopHandSlugs(organisationId: string): Promise<string[]> {
  const on = await enabledOptional(organisationId);
  return ['owner', ...(on.has('technician') ? ['technician'] : []), on.has('workshop-supervisor') ? 'workshop-supervisor' : 'front-desk'];
}
