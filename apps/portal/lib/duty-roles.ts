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
