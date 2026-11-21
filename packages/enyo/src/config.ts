/**
 * Which language model Enyo talks to.
 *  - Anthropic Claude (ENYO_LLM_PROVIDER=anthropic): only a key is needed;
 *    the models default to claude-opus-5-5 and claude-haiku-5-5.
 *  - Any OpenAI-compatible endpoint: a free hosted tier (Groq, OpenRouter,
 *    Google's OpenAI-compatible endpoint), a model on the company's own
 *    server (Ollama, vLLM, LiteLLM), or another paid API.
 * The key is read from the server environment only; it never reaches a browser.
 */
export type LlmProvider = 'openai-compatible' | 'anthropic';

/** How much an Anthropic model thinks before it answers. */
export type LlmEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type LlmConfig = {
  /** Unset means an OpenAI-compatible endpoint. */
  provider?: LlmProvider;
  /** The endpoint; for Anthropic, the API host without /v1 (https://api.anthropic.com unless set). */
  baseUrl: string;
  apiKey: string;
  /** The model for conversations and tool use. */
  model: string;
  /** A smaller model for quick jobs (titles, email briefs, text refinement). Falls back to `model`. */
  fastModel: string;
  /** A short label shown on the Enyo settings page ("Groq", "Company server"). */
  providerLabel: string;
  timeoutMs: number;
  /**
   * Models to try, in order, when the one asked for is out of its per-minute
   * or per-day budget. Free tiers (Groq) budget each model separately, so a
   * chain of models multiplies what Enyo can answer. ENYO_LLM_FALLBACK_MODELS
   * (comma-separated; "off" for none); Groq gets a sensible chain by default.
   */
  fallbackModels?: string[];
  /**
   * Anthropic: the effort for each configured model (ENYO_LLM_EFFORT for the
   * main model, default medium; ENYO_LLM_FAST_EFFORT for the fast one, default
   * low). Any other model gets `effort`.
   */
  efforts?: Record<string, LlmEffort>;
  effort?: LlmEffort;
};

export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5';
export const ANTHROPIC_DEFAULT_FAST_MODEL = 'claude-haiku-5-5';
export const ANTHROPIC_API_URL = 'https://api.anthropic.com';

/** Groq's production chat models, strongest first (each has its own free-tier budget). */
export const GROQ_CHAIN = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];

/** The models to try after `primary`, in order, never repeating it. */
export function fallbacksFor(config: LlmConfig, primary: string): string[] {
  const list = config.fallbackModels ?? (/groq\.com/i.test(config.baseUrl) ? GROQ_CHAIN : []);
  return [...new Set(list.filter((m) => m && m !== primary))];
}

type Env = Record<string, string | undefined>;

/** Trimmed, and without quotes pasted around the value (a common copy-paste slip). */
const clean = (v: string | undefined): string => (v ?? '').trim().replace(/^(['"`])(.*)\1$/s, '$2').trim();

/** Null when Enyo has no model configured: every Enyo feature then shows "not switched on yet". */
export function readLlmConfig(env: Env = process.env): LlmConfig | null {
  const baseUrl = clean(env.ENYO_LLM_BASE_URL).replace(/\/+$/, '');
  if (readProvider(env.ENYO_LLM_PROVIDER, baseUrl) === 'anthropic') return readAnthropicConfig(env, baseUrl);
  const model = clean(env.ENYO_LLM_MODEL);
  // A local model server (Ollama) needs no key; a hosted one does.
  const apiKey = clean(env.ENYO_LLM_API_KEY);
  if (!baseUrl || !model) return null;
  if (!/^https?:\/\//.test(baseUrl)) return null;
  const local = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/.test(baseUrl);
  if (!apiKey && !local) return null;
  const timeout = Number(clean(env.ENYO_LLM_TIMEOUT_MS));
  return {
    baseUrl,
    apiKey,
    model,
    fastModel: clean(env.ENYO_LLM_FAST_MODEL) || model,
    providerLabel: clean(env.ENYO_LLM_PROVIDER_LABEL) || hostLabel(baseUrl),
    timeoutMs: Number.isFinite(timeout) && timeout >= 5_000 && timeout <= 120_000 ? timeout : 45_000,
    ...readFallbacks(env.ENYO_LLM_FALLBACK_MODELS),
  };
}

/** "anthropic" when asked for, or when the address is Anthropic's own API; otherwise OpenAI-compatible. */
function readProvider(raw: string | undefined, baseUrl: string): LlmProvider {
  const v = clean(raw).toLowerCase();
  if (v === 'anthropic' || v === 'claude') return 'anthropic';
  if (v) return 'openai-compatible';
  return isAnthropicApi(baseUrl) ? 'anthropic' : 'openai-compatible';
}

/** Anthropic's own API (not a gateway in front of it). */
export function isAnthropicApi(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'api.anthropic.com';
  } catch {
    return false;
  }
}

const EFFORTS: readonly LlmEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const readEffort = (raw: string | undefined, fallback: LlmEffort): LlmEffort => {
  const v = clean(raw).toLowerCase() as LlmEffort;
  return EFFORTS.includes(v) ? v : fallback;
};

/**
 * Anthropic needs only the key (ENYO_LLM_API_KEY, or ANTHROPIC_API_KEY). The
 * address is Anthropic's API unless ENYO_LLM_BASE_URL names another (written
 * with or without /v1).
 */
function readAnthropicConfig(env: Env, rawBase: string): LlmConfig | null {
  const apiKey = clean(env.ENYO_LLM_API_KEY) || clean(env.ANTHROPIC_API_KEY);
  if (!apiKey) return null;
  const baseUrl = (rawBase || ANTHROPIC_API_URL).replace(/\/v1$/, '');
  if (!/^https?:\/\//.test(baseUrl)) return null;
  const model = clean(env.ENYO_LLM_MODEL) || ANTHROPIC_DEFAULT_MODEL;
  const fastModel = clean(env.ENYO_LLM_FAST_MODEL) || ANTHROPIC_DEFAULT_FAST_MODEL;
  const effort = readEffort(env.ENYO_LLM_EFFORT, 'medium');
  const fastEffort = readEffort(env.ENYO_LLM_FAST_EFFORT, 'low');
  const timeout = Number(clean(env.ENYO_LLM_TIMEOUT_MS));
  return {
    provider: 'anthropic',
    baseUrl,
    apiKey,
    model,
    fastModel,
    providerLabel: clean(env.ENYO_LLM_PROVIDER_LABEL) || 'Anthropic Claude',
    timeoutMs: Number.isFinite(timeout) && timeout >= 5_000 && timeout <= 120_000 ? timeout : 45_000,
    ...readFallbacks(env.ENYO_LLM_FALLBACK_MODELS),
    // When both names are the same model, the main model's effort wins.
    efforts: { [fastModel]: fastEffort, [model]: effort },
    effort,
  };
}

function readFallbacks(raw: string | undefined): { fallbackModels?: string[] } {
  const v = clean(raw);
  if (!v) return {};
  if (/^(off|none|false|0)$/i.test(v)) return { fallbackModels: [] };
  return { fallbackModels: v.split(',').map((m) => m.trim()).filter((m) => /^[\w./:-]{1,120}$/.test(m)).slice(0, 6) };
}

function hostLabel(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname;
    if (host.includes('groq')) return 'Groq';
    if (host.includes('openrouter')) return 'OpenRouter';
    if (host.includes('googleapis')) return 'Google';
    if (host.includes('anthropic')) return 'Anthropic';
    if (host.includes('openai')) return 'OpenAI';
    if (host === 'localhost' || host === '127.0.0.1') return 'Local model server';
    // Never show an internal host name to staff: set ENYO_LLM_PROVIDER_LABEL to name it.
    return 'Model server';
  } catch {
    return 'Model server';
  }
}
