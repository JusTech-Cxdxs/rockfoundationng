import { portalConfig } from '@/lib/site-config';
import { websiteBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';
import { randomBytes } from 'node:crypto';
import { prisma } from '@ejo/database';
import { hashPassword } from 'better-auth/crypto';
import { sendEmail } from '@/lib/email';
import { NO_CUSTOMER_EMAIL, hasEmail } from '@/lib/customer-email';
import { redact } from '@/lib/errors';
import { writeAuditLog, getWorkshopBranchId, workshopContactFor } from '@/lib/workshop-core';
import { renderCustomerWelcomeEmail } from '@/lib/email-templates/customer-welcome';
import { customerWhatsAppUrl, welcomeMessage } from '@/lib/whatsapp-messages';
import { whatsAppShareUrlFor } from '@ejo/utils/whatsapp';

/**
 * Server-only (NOT a 'use server' file): customer portal access — the
 * one-time set-password link and the welcome / access email.
 *
 * Contract (shared with the website): the link is redeemed at
 * `${NEXT_PUBLIC_WEBSITE_URL}/customer-portal/reset-password?token=<token>`;
 * the row lives in customer_verifications with identifier
 * `reset-password:<token>` and value = the customer id. Issuing a new link
 * withdraws every earlier one for that customer. No password is ever emailed.
 */

export const CUSTOMER_SET_PASSWORD_HOURS = 72;

export { websiteBaseUrl };

/** A new one-time set-password link for a customer (72 hours by default). */
export async function issueCustomerSetPasswordLink(customerId: string, hours = CUSTOMER_SET_PASSWORD_HOURS): Promise<string> {
  // Only the newest link works.
  await prisma.customerVerification.deleteMany({ where: { value: customerId, identifier: { startsWith: 'reset-password:' } } });
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  // Written with a plain statement on purpose: the data journal records every
  // ORM write with its values, and this row's identifier IS the one-time
  // token — it must never land in the audit trail.
  await prisma.$executeRaw`INSERT INTO customer_verifications (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
    VALUES (${`cv_${randomBytes(12).toString('hex')}`}, ${`reset-password:${token}`}, ${customerId}, ${new Date(now.getTime() + hours * 3600_000)}, ${now}, ${now})`;
  return `${websiteBaseUrl()}/customer-portal/reset-password?token=${encodeURIComponent(token)}`;
}

/** Withdraw every unused set-password link (e.g. when access is switched off). */
export async function withdrawCustomerSetPasswordLinks(customerId: string): Promise<void> {
  await prisma.customerVerification.deleteMany({ where: { value: customerId, identifier: { startsWith: 'reset-password:' } } });
}

/** The credential row the auth library signs in against. Created with a random,
 * unusable password until the customer chooses their own through the link. */
async function ensureCredentialAccount(customerId: string): Promise<void> {
  const existing = await prisma.customerAccount.findFirst({ where: { customerId, providerId: 'credential' }, select: { id: true } });
  if (existing) return;
  await prisma.customerAccount.create({
    data: { customerId, accountId: customerId, providerId: 'credential', password: await hashPassword(randomBytes(32).toString('base64url')) },
  }).catch((err: { code?: string }) => {
    // Created by a parallel request a moment ago — fine.
    if (err?.code !== 'P2002') throw err;
  });
}

/** The branch the staff member works from — its name and how customers reach it. */
async function branchDetails() {
  const branchId = await getWorkshopBranchId().catch(() => null);
  if (!branchId) return null;
  return prisma.branch.findUnique({
    where: { id: branchId },
    select: { name: true, address: true, hotlines: true, email: true, businessUnit: { select: { organisation: { select: { name: true } } } } },
  }).catch(() => null);
}

export type CustomerEmailResult = { sent: boolean; reason?: string };

/**
 * The welcome (just registered) or access (link sent again from the CRM)
 * email, with a fresh set-password link. Never throws: the result says
 * whether the mail server accepted it. Always logged (Settings → Email
 * delivery) and written to the customer's activity.
 */
export async function sendCustomerAccessEmail(customerId: string, kind: 'welcome' | 'access', actorId: string | null): Promise<CustomerEmailResult> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, fullName: true, email: true, isActive: true, organisationId: true } }).catch(() => null);
  if (!customer) return { sent: false, reason: 'This customer no longer exists.' };
  if (!customer.isActive) return { sent: false, reason: 'Their portal access is switched off — switch it on first.' };
  // Portal access needs a real address of the customer's own: none on file means no link is made at all.
  if (!hasEmail(customer.email)) return { sent: false, reason: NO_CUSTOMER_EMAIL };
  const email = customer.email;
  const verb = kind === 'welcome' ? 'welcome' : 'set_password_link';
  let error: string | null = null;
  let subject = kind === 'welcome' ? 'Welcome email' : 'Set-password link';
  try {
    await ensureCredentialAccount(customer.id);
    const setPasswordUrl = await issueCustomerSetPasswordLink(customer.id);
    const branch = await branchDetails();
    const website = websiteBaseUrl();
    const companyName = branch?.businessUnit.organisation.name ?? (await prisma.organisation.findUnique({ where: { id: customer.organisationId }, select: { name: true } }))?.name ?? portalConfig.organisationName;
    const rendered = renderCustomerWelcomeEmail({
      kind,
      customerName: customer.fullName,
      email,
      setPasswordUrl,
      setPasswordHours: CUSTOMER_SET_PASSWORD_HOURS,
      signInUrl: `${website}/customer-portal`,
      logoUrl: `${website}/images/logo/email-logo.png`,
      companyName,
      branchName: branch?.name ?? '',
      branchContact: branch ? { address: branch.address, phones: branch.hotlines, email: branch.email } : undefined,
    });
    subject = rendered.subject;
    await sendEmail(email, rendered.subject, rendered.html, undefined, { observer: false });
  } catch (err) {
    error = redact(err instanceof Error ? err.message : String(err)).slice(0, 300);
    logFailure('Customer access email failed', customer.id, kind, error);
  }
  await prisma.securityEmailLog.create({ data: { entityType: 'Customer', entityId: customer.id, recipient: `${customer.fullName} <${customer.email}>`, subject, sent: !error, error } }).catch(() => undefined);
  await writeAuditLog({
    userId: actorId,
    organisationId: customer.organisationId,
    action: `customer.${verb}_${error ? 'failed' : 'sent'}`,
    entityType: 'Customer',
    entityId: customer.id,
    metadata: { actor: 'staff', to: customer.email, ...(error ? { error: 'The mail server did not accept it' } : {}) },
  });
  return error ? { sent: false, reason: 'The mail server did not accept the email — see Settings → Email delivery for the reason.' } : { sent: true };
}

export type CustomerWhatsAppResult = { url: string } | { url: null; reason: string };

/**
 * The welcome (just registered) or the set-password link, for WhatsApp: the
 * same fresh one-time link the email carries (issueCustomerSetPasswordLink),
 * in a message the colleague sends from their own phone. Only the newest
 * link works, so this one replaces the link in any earlier email — the
 * message and the screen both say so. Nothing is made when the customer has
 * no phone WhatsApp can take (the emailed link keeps working). Audited
 * without the link. Never throws for a missing phone or email: the result
 * says why.
 */
export async function prepareCustomerAccessWhatsApp(customerId: string, kind: 'welcome' | 'access', actorId: string): Promise<CustomerWhatsAppResult> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, fullName: true, email: true, phone: true, altPhone: true, customerType: true, isActive: true, organisationId: true } }).catch(() => null);
  if (!customer) return { url: null, reason: 'This customer no longer exists.' };
  if (!customer.isActive) return { url: null, reason: 'Their portal access is switched off — switch it on first.' };
  // Portal sign-in is by email: none on file means there is no account to open.
  if (!hasEmail(customer.email)) return { url: null, reason: NO_CUSTOMER_EMAIL };
  if (!whatsAppShareUrlFor([customer.phone, customer.altPhone], 'x')) return { url: null, reason: 'There is no mobile number WhatsApp can take on file for this customer.' };
  await ensureCredentialAccount(customer.id);
  const setPasswordUrl = await issueCustomerSetPasswordLink(customer.id);
  // The workshop's name and first number, as on every WhatsApp message.
  const workshop = await workshopContactFor(await getWorkshopBranchId().catch(() => null));
  const url = customerWhatsAppUrl(customer, welcomeMessage({
    kind,
    customerName: customer.fullName,
    organisation: String(customer.customerType) === 'ORGANIZATION',
    email: customer.email,
    signInUrl: `${websiteBaseUrl()}/customer-portal`,
    setPasswordUrl,
    hours: CUSTOMER_SET_PASSWORD_HOURS,
    workshop,
  }));
  // Never the link itself in the audit trail.
  await writeAuditLog({
    userId: actorId,
    organisationId: customer.organisationId,
    action: 'whatsapp.prepared',
    entityType: 'Customer',
    entityId: customer.id,
    metadata: { actor: 'staff', kind: kind === 'welcome' ? 'WELCOME' : 'SET_PASSWORD_LINK', replacesEarlierLink: true },
  });
  return url ? { url } : { url: null, reason: 'There is no mobile number WhatsApp can take on file for this customer.' };
}
