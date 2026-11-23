import { prisma } from '@ejo/database';
import { whatsAppCloudConfig, sendWhatsAppTemplate, lastFour, cleanParameter, type WhatsAppCloudConfig } from '@ejo/utils/whatsapp-cloud';
import { whatsAppRecipient, greetingName } from '@ejo/utils/whatsapp';
import { templateFor, bodyParameters, type CustomerTemplateKey, type DocumentTemplateKey, type ParamValues, type StaffTemplateKey, type WhatsAppTemplateKey } from '@ejo/utils/whatsapp-templates';
import { issueDocumentLink } from '@/lib/document-links';
import { documentPdfFileName, type DocumentKind } from '@/lib/document-links-core';
import { logFailure } from '@/lib/log';

/**
 * Automatic WhatsApp messages from the staff portal (server only, never a
 * callable action), next to each email: the matching template from the
 * catalogue (@ejo/utils/whatsapp-templates), through Meta's WhatsApp
 * Business Platform (@ejo/utils/whatsapp-cloud).
 *
 * Sent only when all three hold: WhatsApp is configured (the
 * WHATSAPP_* settings, docs/SETUP.md; otherwise a silent no-op and nothing is recorded),
 * the person has a number WhatsApp can take (a customer's WhatsApp
 * number first, then their phones), and they have agreed to
 * WhatsApp messages (Customer / User whatsappOptIn). Like the email it sits
 * beside, it never throws and never holds up the business action: every
 * outcome is recorded in WhatsAppMessage (Settings → WhatsApp) with the
 * number's last four digits only — never the text, a link or the token.
 *
 * Where the email carries a PDF, the template's DOCUMENT header carries a
 * fresh 30-day document link (/d/<token>) and the document's file name.
 */

export type WhatsAppSent = { status: 'SENT' | 'FAILED' | 'SKIPPED' | 'OFF'; message: string };
const OFF: WhatsAppSent = { status: 'OFF', message: 'WhatsApp sending is not set up.' };

/** Whether automatic WhatsApp sending is set up (server only: reads the environment, shows nothing of it). */
export function whatsAppConfigured(): boolean {
  return whatsAppCloudConfig() !== null;
}

/** The document a DOCUMENT template carries: the record, its number (for the file name), and who the link is made for. */
export type WhatsAppDocument = { kind: DocumentKind; recordId: string; number: string; createdById: string | null };
export type Related = { type: string; id: string };

type CustomerMessage<K extends CustomerTemplateKey> = {
  customerId: string | null | undefined;
  key: K;
  values: ParamValues<K>;
  related: Related;
} & (K extends DocumentTemplateKey ? { document: WhatsAppDocument } : { document?: undefined });

type StaffMessage<K extends StaffTemplateKey> = {
  /** The colleagues, by account or by email (as the staff emails address them). */
  to: readonly ({ id?: string | null; email?: string | null } | null | undefined)[];
  key: K;
  values: ParamValues<K>;
  related: Related;
  /** Never the person who acted. */
  exceptUserId?: string | null;
};

async function record(o: { organisationId: string; key: string; number: string | null; status: 'SENT' | 'FAILED' | 'SKIPPED'; error?: string | null; providerMessageId?: string | null; related: Related }): Promise<void> {
  await prisma.whatsAppMessage.create({
    data: { organisationId: o.organisationId, templateKey: o.key, toLast4: lastFour(o.number), status: o.status, error: o.error ? cleanParameter(o.error, 300) : null, providerMessageId: o.providerMessageId ?? null, relatedType: o.related.type.slice(0, 60), relatedId: o.related.id.slice(0, 64) },
    select: { id: true },
  }).catch((err) => logFailure('Could not record a WhatsApp message', o.key, err));
}

/**
 * Who a document link is made for when no one pressed a button (a scheduled
 * job): the colleague given, otherwise the organisation's first active
 * administrator, as DocumentLink records who each link was made for.
 */
async function linkCreator(organisationId: string, preferred: string | null): Promise<string | null> {
  if (preferred) return preferred;
  const admin = await prisma.user.findFirst({
    where: { organisationId, isActive: true, accountType: 'EMPLOYEE', roles: { some: { role: { isSuperAdmin: true } } } },
    orderBy: { createdAt: 'asc' }, select: { id: true },
  }).catch(() => null);
  return admin?.id ?? null;
}

/** One template to one number: the PDF link made first (when there is one), then the send, then the record. */
async function deliver(cfg: WhatsAppCloudConfig, o: { organisationId: string; key: WhatsAppTemplateKey; number: string; values: Record<string, string | undefined>; document?: WhatsAppDocument; related: Related }): Promise<WhatsAppSent> {
  const t = templateFor(o.key);
  if (!t) return { status: 'FAILED', message: 'Unknown WhatsApp template.' };
  let document: { link: string; filename: string } | null = null;
  if (t.header === 'DOCUMENT') {
    if (!o.document) return { status: 'FAILED', message: 'The PDF for this message is missing.' };
    const by = await linkCreator(o.organisationId, o.document.createdById);
    if (!by) {
      await record({ organisationId: o.organisationId, key: o.key, number: o.number, status: 'FAILED', error: 'No colleague to make the document link for.', related: o.related });
      return { status: 'FAILED', message: 'The PDF link could not be made.' };
    }
    const link = await issueDocumentLink({ organisationId: o.organisationId, kind: o.document.kind, recordId: o.document.recordId, createdById: by });
    document = { link: link.url, filename: documentPdfFileName(o.document.kind, o.document.number) };
  }
  const outcome = await sendWhatsAppTemplate(cfg, { to: o.number, template: t.name, language: cfg.language, body: bodyParameters(t, o.values), document });
  if (outcome.ok) {
    await record({ organisationId: o.organisationId, key: o.key, number: o.number, status: 'SENT', providerMessageId: outcome.messageId, related: o.related });
    return { status: 'SENT', message: 'Sent on WhatsApp.' };
  }
  await record({ organisationId: o.organisationId, key: o.key, number: o.number, status: 'FAILED', error: outcome.message, related: o.related });
  // The last four digits only, never the whole number or the token.
  logFailure('WhatsApp message not sent', o.key, `…${lastFour(o.number) ?? ''}`, outcome.reason);
  return { status: 'FAILED', message: outcome.message };
}

const SKIP_WORDS = { NO_CONSENT: 'The customer has not agreed to WhatsApp messages.', NO_NUMBER: 'There is no mobile number WhatsApp can take on file for this customer.' } as const;

/**
 * The customer's WhatsApp message beside their email. A customer who has
 * not agreed, or has no usable number, is recorded as skipped (and gets the
 * email as before). Never throws.
 */
export async function whatsAppToCustomer<K extends CustomerTemplateKey>(m: CustomerMessage<K>): Promise<WhatsAppSent> {
  const cfg = whatsAppCloudConfig();
  if (!cfg || !m.customerId) return OFF;
  try {
    const c = await prisma.customer.findUnique({
      where: { id: m.customerId },
      select: { organisationId: true, fullName: true, customerType: true, whatsappPhone: true, phone: true, altPhone: true, whatsappOptIn: true, isActive: true, organisation: { select: { name: true } } },
    });
    if (!c) return { status: 'SKIPPED', message: 'Customer not found.' };
    const to = whatsAppRecipient({ optIn: c.whatsappOptIn, phones: [c.whatsappPhone, c.phone, c.altPhone] });
    if (!to.ok) {
      await record({ organisationId: c.organisationId, key: m.key, number: c.whatsappPhone ?? c.phone ?? c.altPhone, status: 'SKIPPED', error: SKIP_WORDS[to.reason], related: m.related });
      return { status: 'SKIPPED', message: SKIP_WORDS[to.reason] };
    }
    const values: Record<string, string | undefined> = { name: greetingName(c.fullName, String(c.customerType) === 'ORGANIZATION'), workshop: c.organisation.name, ...(m.values as Record<string, string>) };
    return await deliver(cfg, { organisationId: c.organisationId, key: m.key, number: to.number, values, document: m.document, related: m.related });
  } catch (err) {
    logFailure('WhatsApp message to a customer failed', m.key, m.related.type, m.related.id, err);
    return { status: 'FAILED', message: 'WhatsApp could not send the message.' };
  }
}

/**
 * The colleagues' WhatsApp notice beside their email: each active staff
 * account that has switched WhatsApp on (their profile) and has a number
 * WhatsApp can take. Others are passed over quietly: the email reaches
 * them. A few at a time; never throws.
 */
export async function whatsAppToStaff<K extends StaffTemplateKey>(m: StaffMessage<K>): Promise<number> {
  const cfg = whatsAppCloudConfig();
  if (!cfg) return 0;
  try {
    const ids = [...new Set(m.to.map((r) => r?.id).filter((x): x is string => Boolean(x)))];
    const emails = [...new Set(m.to.map((r) => r?.email?.trim().toLowerCase()).filter((x): x is string => Boolean(x)))];
    if (!ids.length && !emails.length) return 0;
    const people = await prisma.user.findMany({
      where: { isActive: true, accountType: 'EMPLOYEE', whatsappOptIn: true, organisationId: { not: null }, OR: [...(ids.length ? [{ id: { in: ids } }] : []), ...(emails.length ? [{ email: { in: emails, mode: 'insensitive' as const } }] : [])] },
      select: { id: true, fullName: true, phone: true, whatsappOptIn: true, organisationId: true, organisation: { select: { name: true } } },
      take: 500,
    });
    let sent = 0;
    const queue = people.filter((p) => p.id !== m.exceptUserId);
    for (let i = 0; i < queue.length; i += 5) {
      const results = await Promise.all(queue.slice(i, i + 5).map(async (p) => {
        const to = whatsAppRecipient({ optIn: p.whatsappOptIn, phones: [p.phone] });
        if (!to.ok || !p.organisationId) return false;
        const values: Record<string, string | undefined> = { name: greetingName(p.fullName, false), workshop: p.organisation?.name ?? '', ...(m.values as Record<string, string>) };
        const r = await deliver(cfg, { organisationId: p.organisationId, key: m.key, number: to.number, values, related: m.related });
        return r.status === 'SENT';
      }));
      sent += results.filter(Boolean).length;
    }
    return sent;
  } catch (err) {
    logFailure('WhatsApp notice to colleagues failed', m.key, m.related.type, m.related.id, err);
    return 0;
  }
}

/** Whether a customer could be sent an automatic WhatsApp message now (for "Send now on WhatsApp"): null when they can, otherwise why not. */
export async function customerWhatsAppRefusal(customerId: string): Promise<string | null> {
  if (!whatsAppConfigured()) return 'Automatic WhatsApp sending is not set up. Use “Open WhatsApp” instead.';
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { whatsappPhone: true, phone: true, altPhone: true, whatsappOptIn: true } });
  if (!c) return 'Customer not found.';
  const to = whatsAppRecipient({ optIn: c.whatsappOptIn, phones: [c.whatsappPhone, c.phone, c.altPhone] });
  return to.ok ? null : to.reason === 'NO_CONSENT' ? 'The customer has not agreed to WhatsApp messages (change it on their page). You can still use “Open WhatsApp” from your own phone.' : SKIP_WORDS.NO_NUMBER;
}

/** Old WhatsApp records go after 90 days (data inventory: WhatsAppMessage), with the other clean-ups in the daily job. */
export async function purgeOldWhatsAppMessages(days = 90): Promise<number> {
  const res = await prisma.whatsAppMessage.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } } });
  return res.count;
}
