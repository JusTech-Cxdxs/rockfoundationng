import { prisma } from '@ejo/database';
import { whatsAppCloudConfig, sendWhatsAppTemplate, lastFour, cleanParameter, type WhatsAppCloudConfig } from '@ejo/utils/whatsapp-cloud';
import { whatsAppRecipient, greetingName } from '@ejo/utils/whatsapp';
import { templateFor, bodyParameters, type ParamValues, type WhatsAppTemplateKey } from '@ejo/utils/whatsapp-templates';

/**
 * Automatic WhatsApp messages from the customer website (server only),
 * beside its emails: the same catalogue (@ejo/utils/whatsapp-templates) and
 * client (@ejo/utils/whatsapp-cloud) as the staff portal, whose
 * lib/whatsapp/send.ts this mirrors (the two apps never import each other).
 * None of the website's messages carries a PDF.
 *
 * Sent only when WhatsApp is configured (otherwise a silent no-op), the
 * person has a number WhatsApp can take, and has agreed to WhatsApp
 * messages. Never throws; each outcome is recorded in WhatsAppMessage with
 * the number's last four digits only.
 */

type Related = { type: string; id: string };
type CustomerKey = 'support_received';
type StaffKey = 'staff_update';

async function record(o: { organisationId: string; key: string; number: string | null; status: 'SENT' | 'FAILED' | 'SKIPPED'; error?: string | null; providerMessageId?: string | null; related: Related }): Promise<void> {
  await prisma.whatsAppMessage.create({
    data: { organisationId: o.organisationId, templateKey: o.key, toLast4: lastFour(o.number), status: o.status, error: o.error ? cleanParameter(o.error, 300) : null, providerMessageId: o.providerMessageId ?? null, relatedType: o.related.type.slice(0, 60), relatedId: o.related.id.slice(0, 64) },
    select: { id: true },
  }).catch(() => undefined);
}

async function deliver(cfg: WhatsAppCloudConfig, o: { organisationId: string; key: WhatsAppTemplateKey; number: string; values: Record<string, string | undefined>; related: Related }): Promise<boolean> {
  const t = templateFor(o.key);
  if (!t || t.header) return false;
  const outcome = await sendWhatsAppTemplate(cfg, { to: o.number, template: t.name, language: cfg.language, body: bodyParameters(t, o.values) });
  await record({ organisationId: o.organisationId, key: o.key, number: o.number, status: outcome.ok ? 'SENT' : 'FAILED', error: outcome.ok ? null : outcome.message, providerMessageId: outcome.ok ? outcome.messageId : null, related: o.related });
  return outcome.ok;
}

/** A customer's WhatsApp message beside their email; skipped (and recorded) without their agreement or a usable number. */
export async function whatsAppToCustomer<K extends CustomerKey>(m: { customerId: string | null | undefined; key: K; values: ParamValues<K>; related: Related }): Promise<boolean> {
  const cfg = whatsAppCloudConfig();
  if (!cfg || !m.customerId) return false;
  try {
    const c = await prisma.customer.findUnique({ where: { id: m.customerId }, select: { organisationId: true, fullName: true, customerType: true, whatsappPhone: true, phone: true, altPhone: true, whatsappOptIn: true, organisation: { select: { name: true } } } });
    if (!c) return false;
    const to = whatsAppRecipient({ optIn: c.whatsappOptIn, phones: [c.whatsappPhone, c.phone, c.altPhone] });
    if (!to.ok) {
      await record({ organisationId: c.organisationId, key: m.key, number: c.whatsappPhone ?? c.phone ?? c.altPhone, status: 'SKIPPED', error: to.reason === 'NO_CONSENT' ? 'The customer has not agreed to WhatsApp messages.' : 'There is no mobile number WhatsApp can take on file for this customer.', related: m.related });
      return false;
    }
    const values: Record<string, string | undefined> = { name: greetingName(c.fullName, String(c.customerType) === 'ORGANIZATION'), workshop: c.organisation.name, ...(m.values as Record<string, string>) };
    return await deliver(cfg, { organisationId: c.organisationId, key: m.key, number: to.number, values, related: m.related });
  } catch {
    return false;
  }
}

/** Colleagues' WhatsApp notice beside their email: active staff who switched WhatsApp on, with a usable number. */
export async function whatsAppToStaff<K extends StaffKey>(m: { to: readonly ({ id?: string | null; email?: string | null } | null | undefined)[]; key: K; values: ParamValues<K>; related: Related }): Promise<number> {
  const cfg = whatsAppCloudConfig();
  if (!cfg) return 0;
  try {
    const ids = [...new Set(m.to.map((r) => r?.id).filter((x): x is string => Boolean(x)))];
    const emails = [...new Set(m.to.map((r) => r?.email?.trim().toLowerCase()).filter((x): x is string => Boolean(x)))];
    if (!ids.length && !emails.length) return 0;
    const people = await prisma.user.findMany({
      where: { isActive: true, accountType: 'EMPLOYEE', whatsappOptIn: true, organisationId: { not: null }, OR: [...(ids.length ? [{ id: { in: ids } }] : []), ...(emails.length ? [{ email: { in: emails, mode: 'insensitive' as const } }] : [])] },
      select: { fullName: true, phone: true, whatsappOptIn: true, organisationId: true, organisation: { select: { name: true } } },
      take: 50,
    });
    let sent = 0;
    for (const p of people) {
      const to = whatsAppRecipient({ optIn: p.whatsappOptIn, phones: [p.phone] });
      if (!to.ok || !p.organisationId) continue;
      const values: Record<string, string | undefined> = { name: greetingName(p.fullName, false), workshop: p.organisation?.name ?? '', ...(m.values as Record<string, string>) };
      if (await deliver(cfg, { organisationId: p.organisationId, key: m.key, number: to.number, values, related: m.related })) sent += 1;
    }
    return sent;
  } catch {
    return 0;
  }
}
