/**
 * Automatic WhatsApp messages through Meta's WhatsApp Business Platform
 * (the Cloud API), shared by both apps. Server only: it reads the access
 * token from the environment, and the token never leaves the server.
 *
 * A message the business starts must use a template Meta has approved
 * (lib/whatsapp-templates.ts lists them), so this sends TEMPLATE messages
 * only: the template's name and language, its body parameters in order and,
 * where a PDF goes with it, a DOCUMENT header carrying a link to the PDF
 * (the staff portal's /d/<token>) and its file name. A template with a URL
 * button takes the part of the address after the button's base URL.
 *
 * Switched on only when configured (whatsAppCloudConfig): with no access
 * token or phone number ID, nothing is sent and every caller carries on as
 * before, with the click-to-send buttons the only WhatsApp path.
 *
 * Plain fetch, no extra package; the fetch is injectable for the tests.
 * Nothing here logs the token or a whole phone number (lastFour only).
 */

/** The Graph API version used when WHATSAPP_GRAPH_VERSION is not set: the current one when this was written (November 2026). */
export const DEFAULT_GRAPH_VERSION = 'v27.0';
export const DEFAULT_TEMPLATE_LANGUAGE = 'en';
const GRAPH = 'https://graph.facebook.com';

export type WhatsAppCloudConfig = {
  accessToken: string;
  phoneNumberId: string;
  /** For listing the templates and their approval (Settings → WhatsApp); optional for sending. */
  businessAccountId: string | null;
  graphVersion: string;
  language: string;
};

type Env = Record<string, string | undefined>;

/**
 * The configuration from the environment, or null when automatic sending is
 * not set up (no access token or no phone number ID): then everything is a
 * silent no-op.
 */
export function whatsAppCloudConfig(env: Env = process.env): WhatsAppCloudConfig | null {
  const accessToken = (env.WHATSAPP_ACCESS_TOKEN ?? '').trim();
  const phoneNumberId = (env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim();
  if (!accessToken || !/^\d{5,30}$/.test(phoneNumberId)) return null;
  const waba = (env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '').trim();
  const version = (env.WHATSAPP_GRAPH_VERSION ?? '').trim();
  const language = (env.WHATSAPP_TEMPLATE_LANGUAGE ?? '').trim();
  return {
    accessToken,
    phoneNumberId,
    businessAccountId: /^\d{5,30}$/.test(waba) ? waba : null,
    graphVersion: /^v\d{1,3}\.\d{1,2}$/.test(version) ? version : DEFAULT_GRAPH_VERSION,
    language: /^[a-z]{2,3}(_[A-Z]{2})?$/.test(language) ? language : DEFAULT_TEMPLATE_LANGUAGE,
  };
}

/** The last four digits of a number, for records and logs ("…4567"); never the whole number. */
export function lastFour(number: string | null | undefined): string | null {
  const digits = String(number ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/**
 * One body or button parameter as Meta takes it: no new lines or tabs, no
 * more than three spaces together, never empty (Meta refuses each of those),
 * and at most `max` characters.
 */
export function cleanParameter(value: unknown, max = 500): string {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  const cut = text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…` : text;
  return cut || '-';
}

export type TemplateMessage = {
  /** The recipient in international form without the + (234…), as @ejo/utils/whatsapp whatsAppNumber gives it. */
  to: string;
  /** The template's name in Meta, e.g. rf_invoice. */
  template: string;
  language: string;
  /** The body's {{1}}, {{2}}, … in order. */
  body: readonly string[];
  /** A PDF as the template's DOCUMENT header: a public HTTPS link and the file name the customer sees. */
  document?: { link: string; filename: string } | null;
  /** The variable end of the template's URL button (button 0), when it has one. */
  buttonUrlSuffix?: string | null;
};

/** The request body for one template message (exported for the tests). */
export function templatePayload(m: TemplateMessage): Record<string, unknown> {
  const components: Record<string, unknown>[] = [];
  if (m.document) {
    components.push({ type: 'header', parameters: [{ type: 'document', document: { link: m.document.link, filename: m.document.filename } }] });
  }
  if (m.body.length) {
    components.push({ type: 'body', parameters: m.body.map((text) => ({ type: 'text', text: cleanParameter(text, 900) })) });
  }
  if (m.buttonUrlSuffix) {
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: cleanParameter(m.buttonUrlSuffix, 1500) }] });
  }
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: m.to,
    type: 'template',
    template: { name: m.template, language: { code: m.language }, ...(components.length ? { components } : {}) },
  };
}

/** What became of a message, in plain terms. */
export type WhatsAppFailure = 'NOT_CONFIGURED' | 'BAD_NUMBER' | 'TEMPLATE' | 'RATE_LIMITED' | 'AUTH' | 'OTHER';
export type WhatsAppOutcome = { ok: true; messageId: string | null } | { ok: false; reason: WhatsAppFailure; message: string };

const WORDS: Record<WhatsAppFailure, string> = {
  NOT_CONFIGURED: 'WhatsApp sending is not set up.',
  BAD_NUMBER: 'This number cannot receive WhatsApp messages.',
  TEMPLATE: 'The WhatsApp template is missing, not approved, or does not match (check Settings → WhatsApp).',
  RATE_LIMITED: 'WhatsApp is limiting how many messages we send just now. Try again later.',
  AUTH: 'WhatsApp refused our access token (it may have expired or lack permission).',
  OTHER: 'WhatsApp could not send the message.',
};

/** The plain words for an outcome's reason. */
export function whatsAppFailureText(reason: WhatsAppFailure): string {
  return WORDS[reason];
}

type GraphError = { code?: number; error_subcode?: number; message?: string; type?: string; error_data?: { details?: string } };

/**
 * A Graph API error as a plain outcome (Meta's Cloud API error codes):
 * access (190, 0, 3, 10, 200–299, HTTP 401/403), limits (4, 80007, 130429,
 * 131048, 131056, HTTP 429), the number (131026, 131030, 131021, 131009
 * about the recipient), the template (132000–132069, 2388xxx) — anything
 * else is OTHER, with Meta's code kept for Settings → WhatsApp.
 */
export function mapGraphError(status: number, error: GraphError | null | undefined): { reason: WhatsAppFailure; message: string } {
  const code = Number(error?.code ?? 0);
  const detail = [error?.message, error?.error_data?.details].filter(Boolean).join(' — ').slice(0, 240);
  const withCode = (reason: WhatsAppFailure) => ({ reason, message: `${WORDS[reason]}${code ? ` (Meta error ${code}${detail ? `: ${detail}` : ''})` : status ? ` (HTTP ${status})` : ''}` });
  if (code === 190 || code === 3 || code === 10 || (code >= 200 && code <= 299) || (!code && (status === 401 || status === 403))) return withCode('AUTH');
  if (code === 4 || code === 80007 || code === 130429 || code === 131048 || code === 131056 || (!code && status === 429)) return withCode('RATE_LIMITED');
  if (code === 131026 || code === 131030 || code === 131021 || code === 1013) return withCode('BAD_NUMBER');
  if (code === 131009 && /phone|recipient|\bto\b/i.test(detail)) return withCode('BAD_NUMBER');
  if ((code >= 132000 && code <= 132069) || code === 2388023 || code === 2388072 || (code === 100 && /template/i.test(detail))) return withCode('TEMPLATE');
  return withCode('OTHER');
}

type Fetch = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const TIMEOUT_MS = 12_000;

async function readJson(res: { json(): Promise<unknown> }): Promise<Record<string, unknown> | null> {
  try {
    const body = await res.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Sends one template message. Never throws: every problem comes back as an
 * outcome. No configuration gives NOT_CONFIGURED and makes no request.
 */
export async function sendWhatsAppTemplate(config: WhatsAppCloudConfig | null, message: TemplateMessage, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<WhatsAppOutcome> {
  if (!config) return { ok: false, reason: 'NOT_CONFIGURED', message: WORDS.NOT_CONFIGURED };
  if (!/^[1-9]\d{7,14}$/.test(message.to)) return { ok: false, reason: 'BAD_NUMBER', message: WORDS.BAD_NUMBER };
  if (!/^[a-z0-9_]{1,512}$/.test(message.template)) return { ok: false, reason: 'TEMPLATE', message: WORDS.TEMPLATE };
  try {
    const res = await fetchImpl(`${GRAPH}/${config.graphVersion}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(templatePayload(message)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await readJson(res);
    if (!res.ok) {
      const mapped = mapGraphError(res.status, (body?.error ?? null) as GraphError | null);
      return { ok: false, ...mapped };
    }
    const messages = Array.isArray(body?.messages) ? (body!.messages as { id?: unknown }[]) : [];
    const id = typeof messages[0]?.id === 'string' ? messages[0].id : null;
    return { ok: true, messageId: id };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return { ok: false, reason: 'OTHER', message: timedOut ? 'WhatsApp did not answer in time.' : 'WhatsApp could not be reached.' };
  }
}

export type MetaTemplate = { name: string; language: string; status: string; category: string };

/**
 * The templates on the WhatsApp Business Account, with Meta's status for
 * each (APPROVED, PENDING, REJECTED, PAUSED, DISABLED…), for Settings →
 * WhatsApp. Needs WHATSAPP_BUSINESS_ACCOUNT_ID. Never throws.
 */
export async function listWhatsAppTemplates(config: WhatsAppCloudConfig | null, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<{ ok: true; templates: MetaTemplate[] } | { ok: false; reason: WhatsAppFailure; message: string }> {
  if (!config) return { ok: false, reason: 'NOT_CONFIGURED', message: WORDS.NOT_CONFIGURED };
  if (!config.businessAccountId) return { ok: false, reason: 'NOT_CONFIGURED', message: 'Set WHATSAPP_BUSINESS_ACCOUNT_ID to see each template’s approval here.' };
  const templates: MetaTemplate[] = [];
  let url: string | null = `${GRAPH}/${config.graphVersion}/${config.businessAccountId}/message_templates?fields=name,language,status,category&limit=200`;
  try {
    for (let page = 0; url && page < 10; page += 1) {
      const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${config.accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const body = await readJson(res);
      if (!res.ok) return { ok: false, ...mapGraphError(res.status, (body?.error ?? null) as GraphError | null) };
      for (const t of Array.isArray(body?.data) ? (body!.data as Record<string, unknown>[]) : []) {
        templates.push({ name: String(t.name ?? ''), language: String(t.language ?? ''), status: String(t.status ?? '').toUpperCase(), category: String(t.category ?? '').toUpperCase() });
      }
      const next = (body?.paging as { next?: unknown } | undefined)?.next;
      url = typeof next === 'string' && next.startsWith(`${GRAPH}/`) ? next : null;
    }
    return { ok: true, templates };
  } catch {
    return { ok: false, reason: 'OTHER', message: 'WhatsApp could not be reached.' };
  }
}
