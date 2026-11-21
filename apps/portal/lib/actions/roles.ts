'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { prisma } from '@ejo/database';
import { writeAuditLog } from '@/lib/workshop-core';
import { authorize, getPrincipal, inMyOrganisation } from '@/lib/authz/server';
import { OPTIONAL_ROLES, PERMISSIONS, ROLE_GRANTS, ROLE_LABELS, isOptionalRole, scopeFor, type OptionalRole, type PermissionKey } from '@/lib/authz/catalogue';
import { permissionShown, roleShown } from '@/lib/edition';

export type RoleForEditor = { id: string; name: string; slug: string; isPlatform: boolean; users: number; defaults: PermissionKey[]; added: PermissionKey[] };

/** Roles of the person's organisation, with default and added permissions,
 * as the module switches show them: while the parts Store or the gate is off,
 * their permissions and the roles that only do that work are left out (the
 * roles stay in the database and their holders keep them). */
export async function listRolesForEditor(): Promise<RoleForEditor[]> {
  await authorize('admin.roles.manage', undefined, 'roles.list');
  const me = await prisma.user.findUnique({ where: { id: (await getPrincipal()).userId }, select: { organisationId: true } });
  const roles = await prisma.role.findMany({
    where: { ...(me?.organisationId ? { organisationId: me.organisationId } : {}), ...((await getPrincipal()).isSuperAdmin ? {} : { isSuperAdmin: false }) },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, isSuperAdmin: true, _count: { select: { users: true } }, permissions: { select: { permission: { select: { key: true } } } } },
  });
  return roles.filter((r: (typeof roles)[number]) => roleShown(r.slug)).map((r: (typeof roles)[number]) => ({
    id: r.id, name: r.name, slug: r.slug, isPlatform: r.isSuperAdmin, users: r._count.users,
    defaults: (Object.keys(ROLE_GRANTS[r.slug] ?? {}) as PermissionKey[]).filter((k) => permissionShown(k)),
    added: r.permissions.map((p: { permission: { key: string } }) => p.permission.key).filter((k: string): k is PermissionKey => k in PERMISSIONS && permissionShown(k)),
  }));
}

async function editableRole(roleId: string) {
  const p = await getPrincipal();
  const [me, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: p.userId }, select: { organisationId: true } }),
    prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true, slug: true, isSuperAdmin: true, organisationId: true } }),
  ]);
  if (!role) throw new Error('That role no longer exists — refresh the page.');
  if (role.isSuperAdmin) throw new Error('The Platform Administrator role belongs to the platform team and already holds everything.');
  if (!p.isSuperAdmin && role.organisationId !== me?.organisationId) throw new Error('You can only change roles in your own organisation.');
  // Nobody widens their own access: a role you hold is changed by someone else.
  if (!p.isSuperAdmin && p.roleSlugs.includes(role.slug)) throw new Error('You cannot change a role you hold yourself. Ask the platform team.');
  return { p, role };
}

/** Add a catalogue permission to a role (database grant). */
export async function grantRolePermission(roleId: string, key: string): Promise<void> {
  await authorize('admin.roles.manage', undefined, 'roles.grant');
  if (!(key in PERMISSIONS)) throw new Error('That permission does not exist.');
  const { p, role } = await editableRole(roleId);
  if (key in (ROLE_GRANTS[role.slug] ?? {})) throw new Error('This role already includes that permission by default.');
  // No one hands out more than they hold: outside the Owner (and the platform team),
  // a permission can only be added to a role by someone who has it themselves, and never to the Owner role.
  if (!p.isSuperAdmin && !p.roleSlugs.includes('owner')) {
    if (role.slug === 'owner') throw new Error('Only the Owner can change the Owner role.');
    if (scopeFor(p, key as PermissionKey) === null) throw new Error('You can only add a permission you hold yourself. Ask the Owner.');
  }
  const perm = await prisma.permission.upsert({ where: { key }, update: {}, create: { key, description: PERMISSIONS[key as PermissionKey].label } });
  await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId, permissionId: perm.id } }, update: {}, create: { roleId, permissionId: perm.id } });
  await writeAuditLog({ userId: p.userId, action: 'role.permission_granted', entityType: 'Role', entityId: roleId, metadata: { role: role.name, permission: PERMISSIONS[key as PermissionKey].label } });
  // Everyone holding the role is emailed their full, current access by the
  // 10-minute job — one email for a batch of changes (lib/access-notices.ts).
  revalidatePath('/roles');
  revalidatePath('/permissions');
}

/** Remove an added permission from a role (defaults cannot be removed here). */
export async function revokeRolePermission(roleId: string, key: string): Promise<void> {
  await authorize('admin.roles.manage', undefined, 'roles.revoke');
  const { p, role } = await editableRole(roleId);
  const perm = await prisma.permission.findUnique({ where: { key }, select: { id: true } });
  const removed = perm ? (await prisma.rolePermission.deleteMany({ where: { roleId, permissionId: perm.id } })).count : 0;
  // Nothing was added, so nothing changed: no audit entry, no access-changed email.
  if (removed === 0) return;
  await writeAuditLog({ userId: p.userId, action: 'role.permission_revoked', entityType: 'Role', entityId: roleId, metadata: { role: role.name, permission: PERMISSIONS[key as PermissionKey]?.label ?? key } });
  revalidatePath('/roles');
  revalidatePath('/permissions');
}

export type RoleHolder = { id: string; fullName: string; branch: string | null; isActive: boolean };

/** Who holds a role (this organisation only), for the role's own page. At most 200. */
export async function listRoleHolders(roleId: string): Promise<RoleHolder[]> {
  await authorize('admin.roles.manage', undefined, 'roles.holders');
  const p = await getPrincipal();
  // The role itself must be this organisation's (out of reach behaves like none).
  const role = await prisma.role.findUnique({ where: { id: String(roleId ?? '') }, select: { id: true, organisationId: true, isSuperAdmin: true } });
  if (!role || (!p.isSuperAdmin && (role.isSuperAdmin || !(await inMyOrganisation(role.organisationId))))) return [];
  const me = await prisma.user.findUnique({ where: { id: p.userId }, select: { organisationId: true } });
  const rows = await prisma.userRole.findMany({
    where: { roleId: role.id, user: me?.organisationId ? { organisationId: me.organisationId } : {} },
    orderBy: { user: { fullName: 'asc' } },
    take: 200,
    select: { user: { select: { id: true, fullName: true, isActive: true, branch: { select: { name: true } } } } },
  });
  return rows.map((r: (typeof rows)[number]) => ({ id: r.user.id, fullName: r.user.fullName, isActive: r.user.isActive, branch: r.user.branch?.name ?? null }));
}

export type OptionalRoleState = { slug: OptionalRole; label: string; on: boolean; holders: number };

/** The five optional roles and whether each is switched on in this organisation (Settings → Roles). */
export async function listOptionalRoles(): Promise<OptionalRoleState[]> {
  await authorize('admin.roles.manage', undefined, 'roles.optional.list');
  const p = await getPrincipal();
  if (!p.organisationId) return [];
  const [org, counts] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: p.organisationId }, select: { optionalRoles: true } }),
    prisma.role.findMany({ where: { organisationId: p.organisationId, slug: { in: [...OPTIONAL_ROLES] } }, select: { slug: true, _count: { select: { users: true } } } }),
  ]);
  const on = new Set(org?.optionalRoles ?? []);
  return OPTIONAL_ROLES.map((slug) => ({ slug, label: ROLE_LABELS[slug] ?? slug, on: on.has(slug), holders: counts.find((c: { slug: string }) => c.slug === slug)?._count.users ?? 0 }));
}

/**
 * Switches an optional role on or off for the organisation. While it is off,
 * its holders get nothing from it and Front Desk covers its steps
 * (lib/authz/catalogue.ts, effectiveRoles). Takes effect within a minute.
 */
export async function setOptionalRole(slug: string, on: boolean): Promise<{ label: string; on: boolean }> {
  await authorize('admin.roles.manage', undefined, 'roles.optional.set');
  if (!isOptionalRole(slug)) throw new Error('That role is always on, or does not exist.');
  const p = await getPrincipal();
  if (!p.organisationId) throw new Error('Your account is not placed in an organisation yet.');
  const label = ROLE_LABELS[slug] ?? slug;
  const changed = await prisma.$transaction(async (tx) => {
    const org = await tx.organisation.findUnique({ where: { id: p.organisationId! }, select: { optionalRoles: true } });
    const current = new Set(org?.optionalRoles ?? []);
    if (current.has(slug) === on) return false;
    if (on) current.add(slug); else current.delete(slug);
    await tx.organisation.update({ where: { id: p.organisationId! }, data: { optionalRoles: OPTIONAL_ROLES.filter((r) => current.has(r)) } });
    return true;
  });
  if (changed) {
    await writeAuditLog({ userId: p.userId, action: on ? 'role.optional_switched_on' : 'role.optional_switched_off', entityType: 'Organisation', entityId: p.organisationId, metadata: { role: label, summary: `Optional role switched ${on ? 'on' : 'off'}: ${label}` } });
    revalidateTag('org-roles');
    revalidatePath('/roles');
  }
  return { label, on };
}
