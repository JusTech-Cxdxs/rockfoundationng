'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { authorize, getPrincipal } from '@/lib/authz/server';

// Not exported: a 'use server' file may only export async functions and
// types (exporting a class breaks the build). Callers catch it as Error.
class OrganisationActionError extends Error {}

/** The signed-in person's OWN organisation (its name and contacts head every
 * page and document). The platform team, who belong to none, see the first. */
export async function getOrganisation() {
  const user = await requireUser();
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { organisationId: true } });
  if (me?.organisationId) {
    const own = await prisma.organisation.findUnique({ where: { id: me.organisationId } });
    if (own) return own;
  }
  return prisma.organisation.findFirst({ orderBy: { createdAt: 'asc' } });
}

export type UpdateOrganisationInput = {
  name: string;
  legalName?: string;
  website?: string;
  email?: string;
  hotlines?: string[];
  hqAddress?: string;
  poBox?: string;
  rcNumber?: string;
};

/** Edits the organisation's printed identity, shown on every receipt.
 * Organisation-wide, not per branch. */
export async function updateOrganisation(organisationId: string, input: UpdateOrganisationInput): Promise<void> {
  const user = await requireUser();
  // The organisation's own administrators (admin.organisation.manage), and
  // only for their own organisation.
  await authorize('admin.organisation.manage', undefined, 'organisation.update', 'You do not have permission to edit organisation details.');
  const [me, principal] = await Promise.all([prisma.user.findUnique({ where: { id: user.id }, select: { organisationId: true } }), getPrincipal()]);
  if (!principal.isSuperAdmin && me?.organisationId !== organisationId) {
    throw new OrganisationActionError('Organisation not found.');
  }
  const trimmedName = input.name?.trim();
  if (!trimmedName) {
    throw new OrganisationActionError('Organisation name is required.');
  }
  // Hotlines in the order entered, empty rows dropped.
  const hotlines = (input.hotlines ?? []).map((h) => h.trim()).filter(Boolean);
  await prisma.organisation.update({
    where: { id: organisationId },
    data: {
      name: trimmedName,
      legalName: input.legalName?.trim() || null,
      website: input.website?.trim() || null,
      email: input.email?.trim() || null,
      hotlines,
      hqAddress: input.hqAddress?.trim() || null,
      poBox: input.poBox?.trim() || null,
      rcNumber: input.rcNumber?.trim() || null,
    },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'organisation.updated',
    entityType: 'Organisation',
    entityId: organisationId,
    metadata: { name: trimmedName },
  });
}

export type UpdateBillingSettingsInput = {
  vatEnabled: boolean;
  /** Percent, e.g. 7.5. */
  vatRate: number;
  vatNumber?: string;
  /** Whole percent; null = every discount needs the Owner. */
  discountApprovalPercent: number | null;
  /** A deposit before work starts, for individual customers only (never organisations). Off by default. */
  depositRequired?: boolean;
  /** Whole percent, 1–100; used only while depositRequired is on. */
  depositPercent?: number;
};

/** Billing & tax: VAT on or off, its rate, the TIN printed on invoices,
 * when a discount needs the Owner, and the deposit before work starts
 * (individual customers only). Same people as the organisation's
 * details, for their own organisation only; every change is audited. */
export async function updateBillingSettings(organisationId: string, input: UpdateBillingSettingsInput): Promise<void> {
  const user = await requireUser();
  await authorize('admin.organisation.manage', undefined, 'organisation.billing', 'You do not have permission to change billing and tax settings.');
  const [me, principal] = await Promise.all([prisma.user.findUnique({ where: { id: user.id }, select: { organisationId: true } }), getPrincipal()]);
  if (!principal.isSuperAdmin && me?.organisationId !== organisationId) {
    throw new OrganisationActionError('Organisation not found.');
  }
  const vatRate = Math.round(Number(input.vatRate) * 100) / 100;
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
    throw new OrganisationActionError('Enter a VAT rate between 0 and 100.');
  }
  const threshold = input.discountApprovalPercent;
  if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0 || threshold > 100)) {
    throw new OrganisationActionError('Enter the discount limit as a whole percentage between 0 and 100, or leave it blank.');
  }
  const vatNumber = input.vatNumber?.trim() || null;
  if (input.vatEnabled && !vatNumber) {
    throw new OrganisationActionError('Enter the Tax ID (TIN) to print on invoices before switching VAT on.');
  }
  const before = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { vatEnabled: true, vatRate: true, vatNumber: true, discountApprovalPercent: true, depositRequired: true, depositPercent: true } });
  if (!before) throw new OrganisationActionError('Organisation not found.');
  const depositRequired = input.depositRequired ?? before.depositRequired;
  const depositPercent = input.depositPercent ?? before.depositPercent;
  if (!Number.isInteger(depositPercent) || depositPercent < 1 || depositPercent > 100) {
    throw new OrganisationActionError('Enter the deposit as a whole percentage between 1 and 100.');
  }
  await prisma.organisation.update({
    where: { id: organisationId },
    data: { vatEnabled: input.vatEnabled, vatRate, vatNumber, discountApprovalPercent: threshold, depositRequired, depositPercent },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'organisation.billing_updated',
    entityType: 'Organisation',
    entityId: organisationId,
    metadata: {
      from: { vatEnabled: before.vatEnabled, vatRate: Number(before.vatRate), vatNumber: before.vatNumber, discountApprovalPercent: before.discountApprovalPercent, depositRequired: before.depositRequired, depositPercent: before.depositPercent },
      to: { vatEnabled: input.vatEnabled, vatRate, vatNumber, discountApprovalPercent: threshold, depositRequired, depositPercent },
    },
  });
}
