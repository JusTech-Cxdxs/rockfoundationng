'use server';

import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { grantRolePermission, revokeRolePermission, setOptionalRole } from './roles';

/** Back to the role's own page (a role id is a cuid; anything else goes to the list). */
function back(formData: FormData, error: string): string {
  const id = String(formData.get('roleId') ?? '');
  const base = /^[a-z0-9]{8,40}$/i.test(id) ? `/roles/${id}` : '/roles';
  return `${base}${error ? `?edit=perms&error=${encodeURIComponent(error)}#perms` : '?status=saved#perms'}`;
}

export async function grantRolePermissionFormAction(formData: FormData): Promise<void> {
  let error = '';
  try { await grantRolePermission(String(formData.get('roleId') ?? ''), String(formData.get('key') ?? '')); } catch (err) { error = friendlyError(err, 'Could not add the permission.', 'roles-form-handlers'); }
  redirect(back(formData, error));
}

export async function revokeRolePermissionFormAction(formData: FormData): Promise<void> {
  let error = '';
  try { await revokeRolePermission(String(formData.get('roleId') ?? ''), String(formData.get('key') ?? '')); } catch (err) { error = friendlyError(err, 'Could not remove the permission.', 'roles-form-handlers'); }
  redirect(back(formData, error));
}

/** Settings → Roles: switch one optional role on or off, then back to the list with the outcome. */
export async function setOptionalRoleFormAction(formData: FormData): Promise<void> {
  let target = '/roles';
  try {
    const r = await setOptionalRole(String(formData.get('slug') ?? ''), String(formData.get('on') ?? '') === 'true');
    target = `/roles?status=${encodeURIComponent(`${r.label} is now ${r.on ? 'on' : 'off'}.`)}#roles-in-use`;
  } catch (err) {
    target = `/roles?error=${encodeURIComponent(friendlyError(err, 'Could not change that role.', 'roles-form-handlers'))}#roles-in-use`;
  }
  redirect(target);
}
