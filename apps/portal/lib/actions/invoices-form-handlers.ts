'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { emailInvoice, issueInvoice } from './invoices';

/** <form action={...}> wrappers around lib/actions/invoices.ts. */

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function issueInvoiceFormAction(formData: FormData) {
  const jobCardId = str(formData, 'jobCardId');
  try {
    await issueInvoice(jobCardId);
  } catch (err) {
    const message = friendlyError(err, 'Could not issue the invoice.', 'invoices-form-handlers');
    redirect(`/workshop/job-cards/${jobCardId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/job-cards/${jobCardId}`);
  redirect(`/workshop/job-cards/${jobCardId}?status=invoice-issued`);
}

export async function emailInvoiceFormAction(formData: FormData) {
  const jobCardId = str(formData, 'jobCardId');
  try {
    await emailInvoice(str(formData, 'invoiceId'));
  } catch (err) {
    const message = friendlyError(err, 'Could not email the invoice.', 'invoices-form-handlers');
    redirect(`/workshop/job-cards/${jobCardId}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/workshop/job-cards/${jobCardId}?status=invoice-emailed`);
}
