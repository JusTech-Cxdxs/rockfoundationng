/**
 * What every model client shares: the failure kinds and their messages, the
 * waits between retries, and which models said "too many" recently.
 */

export type LlmErrorKind = 'timeout' | 'rate_limited' | 'unavailable' | 'rejected' | 'auth' | 'not_found' | 'bad_response' | 'aborted';

/** What went wrong, in a form the app can turn into a calm message. Never carries the key or the prompt. */
export class LlmError extends Error {
  constructor(
    public readonly kind: LlmErrorKind,
    message: string,
    public readonly status?: number,
    /** The model server's own explanation (keys redacted, at most 240 characters) — for administrators and logs only. */
    public readonly detail?: string,
    /** The model server's error code, e.g. "invalid_api_key", "model_not_found", "tool_use_failed". */
    public readonly code?: string,
    /** Which kind of provider answered ("anthropic"), so the administrator's message names the right settings. */
    public readonly provider?: 'anthropic',
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/** Anything that looks like a key or a bearer token, hidden. */
export function redactSecrets(text: string): string {
  return text
    .replace(/\b(gsk|sk|sk-proj|sk-or|xai|pk|rk|key|AIza)[-_][A-Za-z0-9_\-]{8,}/g, '[key hidden]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [hidden]')
    .replace(/\b[A-Za-z0-9_\-]{40,}\b/g, '[hidden]');
}

/** The kind of failure for an HTTP status from the model server. */
export function kindForStatus(status: number): LlmErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  return 'rejected';
}

/** The model server's error body → a short, key-free explanation and code. */
export function readErrorBody(text: string): { detail?: string; code?: string } {
  let detail = text;
  let code: string | undefined;
  try {
    const j = JSON.parse(text) as { error?: { message?: unknown; code?: unknown; type?: unknown } | string; message?: unknown };
    const e = typeof j.error === 'object' && j.error ? j.error : undefined;
    detail = String(e?.message ?? (typeof j.error === 'string' ? j.error : j.message) ?? text);
    const c = e?.code ?? e?.type;
    code = typeof c === 'string' && /^[a-z0-9_.-]{1,60}$/i.test(c) ? c : undefined;
  } catch { /* not JSON: keep the text */ }
  const clean = redactSecrets(detail.replace(/\s+/g, ' ').trim()).slice(0, 240);
  return { ...(clean ? { detail: clean } : {}), ...(code ? { code } : {}) };
}

/**
 * How long the model server asked us to wait, in milliseconds: the Retry-After
 * header, or the "Please try again in 1m2.5s" / "in 750ms" that Groq and others
 * put in the message. Undefined when nothing was said.
 */
export function retryAfterMs(detail: string | undefined, header?: string | null): number | undefined {
  const h = Number(header);
  if (Number.isFinite(h) && h > 0) return Math.round(h * 1000);
  const m = /try again in\s+((?:\d+(?:\.\d+)?\s*(?:ms|h|m|s)\s*)+)/i.exec(detail ?? '');
  if (!m) return undefined;
  let ms = 0;
  for (const part of m[1]!.matchAll(/(\d+(?:\.\d+)?)\s*(h|ms|m|s)/gi)) {
    const n = Number(part[1]);
    const unit = part[2]!.toLowerCase();
    ms += unit === 'h' ? n * 3_600_000 : unit === 'm' ? n * 60_000 : unit === 's' ? n * 1000 : n;
  }
  return ms > 0 ? Math.round(ms) : undefined;
}

/** Friendly text for each failure, shown to people instead of library messages. */
export function llmErrorMessage(kind: LlmErrorKind): string {
  switch (kind) {
    case 'timeout': return 'I took too long to think about that. Please try again, or ask a shorter question.';
    case 'rate_limited': return "I'm handling a lot of questions right now. Please try again in a minute.";
    case 'unavailable': return "I can't reach my thinking engine just now. Please try again in a minute.";
    case 'rejected': return "I couldn't answer that one. Please rephrase it and try again.";
    case 'auth':
    case 'not_found': return "I'm not set up correctly at the moment. Please let an administrator know (Settings → Enyo → Test connection).";
    case 'aborted': return 'Stopped.';
    default: return 'Something went wrong on my side. Please try again.';
  }
}

/** For administrators (the connection test): what is wrong and what to change. Never includes the key. */
export function llmAdminMessage(err: LlmError): string {
  if (err.provider === 'anthropic') return anthropicAdminMessage(err);
  const why = err.detail ? ` The model server said: "${err.detail}"` : '';
  const status = err.status ? ` (HTTP ${err.status})` : '';
  switch (err.kind) {
    case 'auth': return `The model server refused the key${status}. Check ENYO_LLM_API_KEY: paste the key again with no quotes or spaces, make sure it has not been deleted or expired, then redeploy.${why}`;
    case 'not_found': return `The model or the address was not found${status}. Check ENYO_LLM_MODEL (the exact model id) and ENYO_LLM_BASE_URL (it ends in /v1 for most providers, without /chat/completions), then redeploy.${why}`;
    case 'rejected': return `The model server rejected the request${status}. The model id may not exist for this provider, or it does not accept one of the settings.${why}`;
    case 'rate_limited': return `The model server says too many requests${status}. Wait a minute and test again; on a free tier, check its limits.${why}`;
    case 'unavailable': return `The model server could not be reached or had an error${status}. Check ENYO_LLM_BASE_URL and that the provider is up.${why}`;
    case 'timeout': return 'The model server took too long to answer. Try again; if it keeps happening, choose a faster model or raise ENYO_LLM_TIMEOUT_MS.';
    case 'bad_response': return `The model server answered in an unexpected format. Check that ENYO_LLM_BASE_URL points at an OpenAI-compatible endpoint.${why}`;
    default: return llmErrorMessage(err.kind);
  }
}

/** The same, for Anthropic: the settings to check and where in the Anthropic Console. */
function anthropicAdminMessage(err: LlmError): string {
  const why = err.detail ? ` Anthropic said: "${err.detail}"` : '';
  const status = err.status ? ` (HTTP ${err.status})` : '';
  switch (err.kind) {
    case 'auth':
      if (err.status === 402 || err.code === 'billing_error') return `Anthropic reports a billing problem${status}. Add a payment method or credits in console.anthropic.com → Billing, then test again.${why}`;
      if (err.status === 403) return `Anthropic says this key may not do that${status}. Check the key's workspace and its access in console.anthropic.com.${why}`;
      return `Anthropic refused the key${status}. Check ENYO_LLM_API_KEY: an API key from console.anthropic.com → API Keys (it starts with sk-ant-), pasted with no quotes or spaces and not deleted, then redeploy.${why}`;
    case 'not_found': return `Anthropic does not offer that model to this key${status}. Check ENYO_LLM_MODEL and ENYO_LLM_FAST_MODEL (for example claude-opus-5-5 and claude-haiku-5-5, exactly as written), then redeploy.${why}`;
    case 'rejected': return `Anthropic rejected the request${status}. Check that ENYO_LLM_MODEL and ENYO_LLM_FAST_MODEL are current Claude models.${why}`;
    case 'rate_limited':
      if (err.code === 'enforced_spend_limit_reached') return `The spend limit for this Anthropic account has been reached${status}. Raise it in console.anthropic.com → Limits, or wait for the next month.${why}`;
      return `Anthropic says too many requests${status}. Wait a minute and test again; the account's rate limits are in console.anthropic.com → Limits.${why}`;
    case 'unavailable': return `Anthropic could not be reached or is busy${status}. Try again in a few minutes; status.anthropic.com shows any incident.${why}`;
    case 'timeout': return 'Anthropic took too long to answer. Try again; if it keeps happening, set ENYO_LLM_EFFORT=low or raise ENYO_LLM_TIMEOUT_MS.';
    case 'bad_response': return `Anthropic answered in an unexpected format. If ENYO_LLM_BASE_URL is set, remove it (it is not needed for Anthropic).${why}`;
    default: return llmErrorMessage(err.kind);
  }
}

export const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new LlmError('aborted', 'Aborted')); }, { once: true });
});

/** The longest the request waits for a per-minute budget to free before retrying. */
export const MAX_RETRY_WAIT_MS = 12_000;

/** Models that said "too many" recently, and until when to leave them alone (per server process). */
export const limitedUntil = new Map<string, number>();
export function noteLimited(model: string, askedMs: number | undefined): void {
  if (!model) return;
  limitedUntil.set(model, Date.now() + Math.min(Math.max(askedMs ?? 20_000, 5_000), 10 * 60_000));
}
/** For tests: forget which models were busy. */
export function resetModelBudgets(): void { limitedUntil.clear(); }
