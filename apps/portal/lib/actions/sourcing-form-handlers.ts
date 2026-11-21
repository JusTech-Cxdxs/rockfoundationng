'use server';

import { friendlyError } from '@/lib/errors';

/**
 * Thin <form action={...}> wrappers around lib/actions/sourcing.ts — same
 * pattern as store-form-handlers.ts and workshop-form-handlers.ts.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  requestPartRequestSlip,
  approvePartRequestSlipByHod,
  approvePartRequestSlipByStore,
  releasePartRequestSlip,
  rejectPartRequestSlip,
} from './sourcing';

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function requestPartRequestSlipFormAction(formData: FormData) {
  const jobCardId = str(formData, 'jobCardId');
  try {
    await requestPartRequestSlip(jobCardId);
  } catch (err) {
    const message = friendlyError(err, 'Could not raise the parts request.', 'sourcing-form-handlers');
    redirect(`/workshop/job-cards/${jobCardId}/request-parts?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/job-cards/${jobCardId}`);
  revalidatePath('/workshop/parts-requests');
  redirect(`/workshop/job-cards/${jobCardId}?status=parts_requested`);
}

export async function approvePartRequestSlipByHodFormAction(formData: FormData) {
  const slipId = str(formData, 'slipId');
  const jobCardId = str(formData, 'jobCardId');
  try {
    await approvePartRequestSlipByHod(slipId, str(formData, 'notes') || undefined);
  } catch (err) {
    const message = friendlyError(err, 'Could not approve this request.', 'sourcing-form-handlers');
    redirect(`/workshop/parts-requests/${slipId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/parts-requests/${slipId}`);
  revalidatePath('/workshop/parts-requests');
  if (jobCardId) revalidatePath(`/workshop/job-cards/${jobCardId}`);
  redirect(`/workshop/parts-requests/${slipId}?status=hod_approved`);
}

export async function approvePartRequestSlipByStoreFormAction(formData: FormData) {
  const slipId = str(formData, 'slipId');
  const jobCardId = str(formData, 'jobCardId');
  try {
    await approvePartRequestSlipByStore(slipId, str(formData, 'notes') || undefined);
  } catch (err) {
    const message = friendlyError(err, 'Could not approve this request.', 'sourcing-form-handlers');
    redirect(`/workshop/parts-requests/${slipId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/parts-requests/${slipId}`);
  revalidatePath('/workshop/parts-requests');
  if (jobCardId) revalidatePath(`/workshop/job-cards/${jobCardId}`);
  redirect(`/workshop/parts-requests/${slipId}?status=store_approved`);
}

export async function releasePartRequestSlipFormAction(formData: FormData) {
  const slipId = str(formData, 'slipId');
  const jobCardId = str(formData, 'jobCardId');
  try {
    const serializedLineIds = formData.getAll('serializedLineId').map((v) => (typeof v === 'string' ? v : ''));
    const lineSerials: Record<string, string[]> = {};
    for (const lineId of serializedLineIds) {
      lineSerials[lineId] = formData.getAll(`serials_${lineId}`).map((v) => (typeof v === 'string' ? v : ''));
    }
    await releasePartRequestSlip(
      slipId,
      // A typed name (someone not on staff) is used INSTEAD of the staff box.
      str(formData, 'receivedByName') ? { receivedByName: str(formData, 'receivedByName') } : { receivedByUserId: str(formData, 'receivedByUserId') || undefined },
      Object.keys(lineSerials).length > 0 ? lineSerials : undefined,
    );
  } catch (err) {
    const message = friendlyError(err, 'Could not release this request.', 'sourcing-form-handlers');
    redirect(`/workshop/parts-requests/${slipId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/parts-requests/${slipId}`);
  revalidatePath('/workshop/parts-requests');
  revalidatePath('/inventory/parts');
  if (jobCardId) revalidatePath(`/workshop/job-cards/${jobCardId}`);
  redirect(`/workshop/parts-requests/${slipId}?status=released`);
}

export async function rejectPartRequestSlipFormAction(formData: FormData) {
  const slipId = str(formData, 'slipId');
  const jobCardId = str(formData, 'jobCardId');
  try {
    await rejectPartRequestSlip(slipId, str(formData, 'reason'));
  } catch (err) {
    const message = friendlyError(err, 'Could not reject this request.', 'sourcing-form-handlers');
    redirect(`/workshop/parts-requests/${slipId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/parts-requests/${slipId}`);
  revalidatePath('/workshop/parts-requests');
  if (jobCardId) revalidatePath(`/workshop/job-cards/${jobCardId}`);
  redirect(`/workshop/parts-requests/${slipId}?status=rejected`);
}
