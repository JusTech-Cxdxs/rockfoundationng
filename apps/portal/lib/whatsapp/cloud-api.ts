/**
 * Automatic WhatsApp through Meta's WhatsApp Business Platform (Cloud API).
 *
 * Off by default. It needs the workshop's verified WhatsApp Business account
 * and three values in the hosting settings (never in code or chat):
 * WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN (a permanent system-user
 * token) and WHATSAPP_APP_SECRET (to check that delivery receipts really come
 * from Meta). Even with them set, nothing is sent until the Owner switches
 * "Send WhatsApp automatically" on in Settings → WhatsApp.
 *
 * Meta only lets a business start a conversation with an approved message
 * template, so each customer message has the name of its approved template
 * (Settings → WhatsApp) and sends its values as the template's parameters.
 * Until then, staff use "Send on WhatsApp", which opens WhatsApp with the
 * message written and needs no account at all.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const DEFAULT_GRAPH_VERSION = 'v26.0';

export type CloudApiConfig = { phoneNumberId: string; accessToken: string; graphVersion: string; appSecret: string | null };

/** The connection's settings from the environment, or null when it is not set up. */
export function cloudApiConfig(env: Record<string, string | undefined> = process.env): CloudApiConfig | null {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!phoneNumberId || !accessToken) return null;
  const v = env.WHATSAPP_GRAPH_VERSION?.trim();
  return { phoneNumberId, accessToken, graphVersion: v && /^v\d+\.\d+$/.test(v) ? v : DEFAULT_GRAPH_VERSION, appSecret: env.WHATSAPP_APP_SECRET?.trim() || null };
}

/** A Nigerian number in the international form Meta expects: 0803… → 234803…; anything unusable → null. */
export function toWhatsAppId(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 11) d = `234${d.slice(1)}`;
  return /^\d{10,15}$/.test(d) ? d : null;
}

export type TemplateMessage = {
  to: string;
  template: string;
  language: string;
  /** The template body's {{1}}, {{2}}… in order. */
  bodyParams: string[];
  /** A PDF sent as the template's document header (the estimate, invoice or receipt). */
  document?: { link: string; filename: string } | null;
};

/** The request body for POST /{phone-number-id}/messages. */
export function templateBody(m: TemplateMessage): Record<string, unknown> {
  const components: Record<string, unknown>[] = [];
  if (m.document) components.push({ type: 'header', parameters: [{ type: 'document', document: { link: m.document.link, filename: m.document.filename } }] });
  // Meta refuses parameters with line breaks, tabs or more than four spaces in a row.
  if (m.bodyParams.length) components.push({ type: 'body', parameters: m.bodyParams.map((t) => ({ type: 'text', text: t.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim() || '-' })) });
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: m.to, type: 'template', template: { name: m.template, language: { code: m.language }, components } };
}

export type SendResult = { ok: true; messageId: string } | { ok: false; error: string; retryable: boolean };

/** Sends one template message. Never throws: the caller logs what happened either way. */
export async function sendTemplate(config: CloudApiConfig, m: TemplateMessage, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const url = `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(config.phoneNumberId)}/messages`;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(templateBody(m)),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } };
    const id = json.messages?.[0]?.id;
    if (res.ok && id) return { ok: true, messageId: id };
    const message = json.error?.message ?? `WhatsApp answered ${res.status}`;
    // Rate limits and Meta's own outages are worth another try; a wrong number or template is not.
    return { ok: false, error: message, retryable: res.status === 429 || res.status >= 500 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'WhatsApp could not be reached', retryable: true };
  }
}

/** Is this webhook call really from Meta? (X-Hub-Signature-256 is an HMAC of the raw body with the app secret.) */
export function verifyWebhookSignature(rawBody: string, header: string | null, appSecret: string | null): boolean {
  if (!appSecret || !header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest();
  const given = Buffer.from(header.slice(7), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type DeliveryUpdate = { messageId: string; status: 'sent' | 'delivered' | 'read' | 'failed'; at: Date; error: string | null };

/** The delivery receipts in one webhook call (statuses on messages we sent). */
export function deliveryUpdates(payload: unknown): DeliveryUpdate[] {
  const out: DeliveryUpdate[] = [];
  const entries = (payload as { entry?: { changes?: { value?: { statuses?: { id?: string; status?: string; timestamp?: string; errors?: { title?: string; message?: string }[] }[] } }[] }[] })?.entry ?? [];
  for (const e of entries) for (const c of e.changes ?? []) for (const s of c.value?.statuses ?? []) {
    if (!s.id || !s.status || !['sent', 'delivered', 'read', 'failed'].includes(s.status)) continue;
    const ts = Number(s.timestamp);
    out.push({ messageId: s.id, status: s.status as DeliveryUpdate['status'], at: Number.isFinite(ts) ? new Date(ts * 1000) : new Date(), error: s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null });
  }
  return out;
}
