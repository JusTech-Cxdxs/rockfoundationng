'use server';

import { whatsAppNumber } from '@ejo/utils/whatsapp';
import { whatsAppCloudConfig, sendWhatsAppTemplate, lastFour } from '@ejo/utils/whatsapp-cloud';
import { templateFor, bodyParameters, type WhatsAppTemplateDef } from '@ejo/utils/whatsapp-templates';
import { prisma } from '@ejo/database';
import { authorize, myOrganisationId } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { friendlyError } from '@/lib/errors';
import { requireUser } from './workshop';

/**
 * "Send a test template" (Settings → WhatsApp): one approved template, with
 * its sample values, to a number an administrator types. For checking the
 * set-up (the token, the phone number ID, a template's approval) before
 * real customers are messaged. admin.settings.manage only; audited with the template and the number's last four
 * digits; recorded in the WhatsApp log like any message. A template with a
 * PDF is not offered: its test needs a real document.
 */
export type WhatsAppTestState = { ok: boolean; message: string | null; at?: number };

export async function sendWhatsAppTest(_prev: WhatsAppTestState, f: FormData): Promise<WhatsAppTestState> {
  try {
    await authorize('admin.settings.manage', undefined, 'sendWhatsAppTest', 'Only administrators can send a test WhatsApp message.');
    const me = await requireUser();
    const cfg = whatsAppCloudConfig();
    if (!cfg) return { ok: false, message: 'Automatic WhatsApp sending is not set up (see docs/SETUP.md, WhatsApp).' };
    const number = whatsAppNumber(String(f.get('number') ?? ''));
    if (!number) return { ok: false, message: 'Enter a mobile number WhatsApp can take, e.g. 0803 123 4567 or +234 803 123 4567.' };
    const t: WhatsAppTemplateDef | null = templateFor(String(f.get('template') ?? 'staff_update'));
    if (!t || t.header) return { ok: false, message: 'Choose a template without a PDF for the test.' };
    const organisationId = await myOrganisationId();
    const outcome = await sendWhatsAppTemplate(cfg, { to: number, template: t.name, language: cfg.language, body: bodyParameters(t, Object.fromEntries(t.params.map((p) => [p.key, p.example]))) });
    if (organisationId) {
      await prisma.whatsAppMessage.create({ data: { organisationId, templateKey: t.key, toLast4: lastFour(number), status: outcome.ok ? 'SENT' : 'FAILED', error: outcome.ok ? null : outcome.message.slice(0, 300), providerMessageId: outcome.ok ? outcome.messageId : null, relatedType: 'Test', relatedId: me.id } }).catch(() => undefined);
    }
    await writeAuditLog({ userId: me.id, organisationId, action: outcome.ok ? 'whatsapp.test_sent' : 'whatsapp.test_failed', entityType: 'Settings', entityId: 'whatsapp', metadata: { template: t.name, toLast4: lastFour(number), ...(outcome.ok ? {} : { reason: outcome.reason }) } });
    return outcome.ok
      ? { ok: true, message: `Sent ${t.name} to the number ending ${lastFour(number)}. It should arrive within a minute.`, at: Date.now() }
      : { ok: false, message: outcome.message, at: Date.now() };
  } catch (err) {
    return { ok: false, message: friendlyError(err, 'Could not send the test message.', 'whatsapp-settings') };
  }
}
