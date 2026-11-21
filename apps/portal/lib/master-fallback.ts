/**
 * When nobody holds a role yet, the Platform Administrator stands in: they are
 * listed in its pickers, told about its work and emailed its notices — so a
 * new installation (one administrator, roles not yet given out) never sends
 * work or mail to nobody. As soon as someone holds the role, they get it
 * instead. Permission checks already let the Platform Administrator decide
 * every step; this is about being FOUND and TOLD.
 *
 * Fenced by organisation: the organisation's own Platform Administrators, or a
 * platform Platform Administrator who belongs to no organisation.
 */
import { prisma } from '@ejo/database';

export type Person = { id: string; fullName: string; email: string };

/** The active Platform Administrators for an organisation (or the platform's, when it is not known). */
export async function masterAdminsFor(organisationId: string | null | undefined): Promise<Person[]> {
  return prisma.user.findMany({
    where: {
      isActive: true,
      roles: { some: { role: { isSuperAdmin: true } } },
      ...(organisationId ? { OR: [{ organisationId }, { organisationId: null }] } : {}),
    },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true },
  });
}

/** `people` when there are any; otherwise the Platform Administrators. */
export async function orMasterAdmins<T extends { fullName: string; email: string }>(people: T[], organisationId: string | null | undefined): Promise<(T | Person)[]> {
  if (people.length) return people;
  return masterAdminsFor(organisationId);
}
