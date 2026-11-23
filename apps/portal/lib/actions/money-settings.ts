'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma, Prisma } from '@ejo/database';
import { authorize, myOrganisationId } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { parseOwnerApprovalAbove } from '@/lib/money/rules';
import { parseWarrantyForm, warrantyTerms } from '@/lib/money/warranty';
import { carWashPrices, parseCarWashPriceForm } from '@/lib/workshop/car-wash';

/**
 * Settings → Estimates, car wash and warranty (the Owner): when the Owner
 * gives an estimate its final approval, the car wash price list, and the
 * workshop's guarantee per job type. Each save is audited with before/after.
 */

const back = (q: string) => `/settings/money?${q}`;

async function myOrg(where: string): Promise<{ userId: string; organisationId: string }> {
  await authorize('admin.organisation.manage', undefined, where, 'Only the Owner can change these settings.');
  const user = await requireUser();
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new Error('No organisation');
  return { userId: user.id, organisationId };
}

export type MoneySettings = {
  ownerApprovesEstimates: boolean;
  ownerApprovalAbove: number | null;
  carWashPrices: ReturnType<typeof carWashPrices>;
  warranty: ReturnType<typeof warrantyTerms>;
};

export async function getMoneySettings(): Promise<MoneySettings | null> {
  const { organisationId } = await myOrg('getMoneySettings');
  const o = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { ownerApprovesEstimates: true, ownerApprovalAbove: true, carWashPrices: true, warrantyTerms: true } });
  if (!o) return null;
  return {
    ownerApprovesEstimates: o.ownerApprovesEstimates,
    ownerApprovalAbove: o.ownerApprovalAbove === null ? null : Number(o.ownerApprovalAbove),
    carWashPrices: carWashPrices(o.carWashPrices),
    warranty: warrantyTerms(o.warrantyTerms),
  };
}

/** "The Owner approves every estimate" on/off, and the amount above which the Owner always approves. */
export async function saveEstimateApprovalForm(f: FormData): Promise<void> {
  await authorize('admin.organisation.manage', undefined, 'saveEstimateApproval', 'Only the Owner can change these settings.');
  const { userId, organisationId } = await myOrg('saveEstimateApproval');
  const above = parseOwnerApprovalAbove(f.get('ownerApprovalAbove'));
  if (above === 'invalid') redirect(back('error=' + encodeURIComponent('Enter the amount in naira, or leave it blank.')));
  const on = f.get('ownerApprovesEstimates') === 'on';
  const before = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { ownerApprovesEstimates: true, ownerApprovalAbove: true } });
  await prisma.organisation.update({ where: { id: organisationId }, data: { ownerApprovesEstimates: on, ownerApprovalAbove: above } });
  await writeAuditLog({ userId, action: 'organisation.estimate_approval_updated', entityType: 'Organisation', entityId: organisationId, organisationId, metadata: { from: { on: before?.ownerApprovesEstimates, above: before?.ownerApprovalAbove === null || before?.ownerApprovalAbove === undefined ? null : Number(before.ownerApprovalAbove) }, to: { on, above } } });
  revalidatePath('/settings/money');
  redirect(back('status=approval'));
}

/** The car wash price list. */
export async function saveCarWashPricesForm(f: FormData): Promise<void> {
  await authorize('admin.organisation.manage', undefined, 'saveCarWashPrices', 'Only the Owner can change these settings.');
  const { userId, organisationId } = await myOrg('saveCarWashPrices');
  const prices = parseCarWashPriceForm((k) => f.get(k));
  if (typeof prices === 'string') redirect(back('error=' + encodeURIComponent(prices)));
  const before = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { carWashPrices: true } });
  await prisma.organisation.update({ where: { id: organisationId }, data: { carWashPrices: Object.keys(prices).length ? (prices as Prisma.InputJsonValue) : Prisma.DbNull } });
  await writeAuditLog({ userId, action: 'organisation.car_wash_prices_updated', entityType: 'Organisation', entityId: organisationId, organisationId, metadata: { from: carWashPrices(before?.carWashPrices), to: prices } });
  revalidatePath('/settings/money');
  redirect(back('status=wash'));
}

/** The workshop's guarantee per job type. */
export async function saveWarrantyTermsForm(f: FormData): Promise<void> {
  await authorize('admin.organisation.manage', undefined, 'saveWarrantyTerms', 'Only the Owner can change these settings.');
  const { userId, organisationId } = await myOrg('saveWarrantyTerms');
  const terms = parseWarrantyForm((k) => f.get(k));
  if (typeof terms === 'string') redirect(back('error=' + encodeURIComponent(terms)));
  const before = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { warrantyTerms: true } });
  await prisma.organisation.update({ where: { id: organisationId }, data: { warrantyTerms: terms as Prisma.InputJsonValue } });
  await writeAuditLog({ userId, action: 'organisation.warranty_terms_updated', entityType: 'Organisation', entityId: organisationId, organisationId, metadata: { from: warrantyTerms(before?.warrantyTerms), to: terms } });
  revalidatePath('/settings/money');
  redirect(back('status=warranty'));
}
