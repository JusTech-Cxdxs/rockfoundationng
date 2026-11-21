/**
 * Enyo on Anthropic Claude, through the official SDK (@anthropic-ai/sdk).
 * complete() and stream() in llm.ts hand over here when
 * ENYO_LLM_PROVIDER=anthropic; callers see the same messages, completions,
 * stream pieces and errors as with any other provider.
 *
 * What the request carries, and why:
 *  - The leading system messages become the top-level `system`, marked for
 *    caching; conversations (tools or several turns) also use automatic
 *    caching, so the growing history is read from the cache on each step.
 *  - Thinking is adaptive (never switched off) and its depth is set with
 *    `output_config.effort`: medium for the main model, low for the fast one.
 *    Its text is never returned or shown.
 *  - Within one answer's tool loop the model's own turn is sent back exactly
 *    as it came (ChatMessage.providerContent), and the system prompt and tools
 *    stay identical. Should they differ, the earlier thinking is dropped
 *    rather than the request refused (`prefix_mismatch_behavior: drop_block`).
 *  - No temperature, top_p or top_k, and tool choice is never forced: current
 *    models refuse them.
 *  - Claude Opus 5.5 and the other models that support it retry a declined
 *    request on Anthropic's recommended model (`fallbacks: "default"`). A
 *    decline that stands reads as a short polite answer, never an error page.
 */
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AnthropicError,
  AuthenticationError,
  BadRequestError,
  ContentTooLargeError,
  InternalServerError,
  NotFoundError,
  OverloadedError,
  PaymentRequiredError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from '@anthropic-ai/sdk';
import type { BetaMessage, BetaMessageStreamParams, BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { ANTHROPIC_API_URL, isAnthropicApi, type LlmConfig, type LlmEffort } from './config';
import { kindForStatus, LlmError, MAX_RETRY_WAIT_MS, noteLimited, readErrorBody, retryAfterMs, sleep, type LlmErrorKind } from './llm-common';
import type { ChatMessage, Completion, CompletionRequest, StreamPiece, ToolCall, ToolSpec, Usage } from './llm';

type Fetch = typeof fetch;
type Block = Record<string, unknown> & { type: string };
type WireMessage = { role: 'user' | 'assistant' | 'system'; content: Block[] };
/** A message as sent: a later system message carries plain text. */
export type AnthropicMessage = { role: 'user' | 'assistant'; content: Block[] } | { role: 'system'; content: string };

/** What a declined request answers. */
export const REFUSAL_TEXT = "I can't help with that request.";

/** The beta that lets a request say what happens when replayed thinking no longer matches. */
export const THINKING_BINDING_BETA = 'thinking-binding-controls-2026-08-01';
/** The beta for server-side fallback with `fallbacks: "default"`. */
export const SERVER_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Room for thinking plus the reply when the caller gives no limit. */
const MAX_TOKENS = { complete: 16_000, stream: 32_000 } as const;

/** What a model accepts. Unknown (newer) Claude models are treated as current ones. */
export function anthropicTraits(model: string): { adaptive: boolean; fallback: boolean; midSystem: boolean } {
  const m = model.toLowerCase();
  // Claude 3.x and the 4 / 4.1 / 4.5 models: no adaptive thinking and no effort.
  const legacy = /^claude-(instant|2|3)/.test(m) || /^claude-(opus|sonnet|haiku)-4(-[015])?(-\d{8})?$/.test(m);
  return {
    adaptive: !legacy,
    // Server-side fallback: Opus 5 and 5.5, Fable 5.1 and 5.2, Sonnet 5.5 (not Haiku 5.5).
    fallback: /^claude-(opus-5(-5)?|fable-5-[12]|sonnet-5-5)(-\d{8})?$/.test(m),
    // A system message inside `messages`.
    midSystem: /^claude-(opus-5(-5)?|opus-4-8|fable-|mythos-|sonnet-5-5|haiku-5-5)/.test(m),
  };
}

function parseInput(args: string): Record<string, unknown> {
  try {
    const v = JSON.parse(args || '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Enyo's conversation in Anthropic's shape: the system messages that come
 * first become `system`; tool calls and their results become tool_use /
 * tool_result blocks with their ids kept, consecutive results in one user
 * message. A system message later in the list stays a system message where
 * the model allows one there (after a user turn, last or before the model's
 * turn) and otherwise joins the user turn as text. The list starts with the
 * person's message and never ends with the model's own plain text.
 */
export function toAnthropicMessages(messages: ChatMessage[], model: string): { system: string; messages: AnthropicMessage[] } {
  const system: string[] = [];
  let i = 0;
  for (; i < messages.length && messages[i]!.role === 'system'; i += 1) {
    const text = messages[i]!.content.trim();
    if (text) system.push(messages[i]!.content);
  }
  const raw: WireMessage[] = [];
  for (const m of messages.slice(i)) {
    if (m.role === 'system') {
      if (m.content.trim()) raw.push({ role: 'system', content: [{ type: 'text', text: m.content }] });
    } else if (m.role === 'user') {
      if (m.content.trim()) raw.push({ role: 'user', content: [{ type: 'text', text: m.content }] });
    } else if (m.role === 'tool') {
      raw.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content || '(no result)', ...(m.isError ? { is_error: true } : {}) }] });
    } else if (m.providerContent?.length) {
      // Exactly as the model returned it: thinking blocks and signatures included.
      raw.push({ role: 'assistant', content: m.providerContent as Block[] });
    } else {
      const blocks: Block[] = [];
      if (m.content.trim()) blocks.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: parseInput(c.arguments) });
      if (blocks.length) raw.push({ role: 'assistant', content: blocks });
    }
  }
  const midSystem = anthropicTraits(model).midSystem;
  const placed = raw.map((m, k): WireMessage => {
    if (m.role !== 'system') return m;
    const ok = midSystem && raw[k - 1]?.role === 'user' && (k === raw.length - 1 || raw[k + 1]?.role === 'assistant');
    return ok ? m : { role: 'user', content: m.content };
  });
  // Consecutive user content in one message, tool results first.
  const out: WireMessage[] = [];
  for (const m of placed) {
    const last = out[out.length - 1];
    if (last && last.role === 'user' && m.role === 'user') {
      const all = [...last.content, ...m.content];
      last.content = [...all.filter((b) => b.type === 'tool_result'), ...all.filter((b) => b.type !== 'tool_result')];
    } else {
      out.push({ role: m.role, content: [...m.content] });
    }
  }
  while (out.length && out[0]!.role !== 'user') out.shift();
  while (out.length && out[out.length - 1]!.role === 'assistant' && !out[out.length - 1]!.content.some((b) => b.type === 'tool_use')) out.pop();
  const sent = out.map((m): AnthropicMessage => (m.role === 'system' ? { role: 'system', content: m.content.map((b) => String(b.text ?? '')).join('\n\n') } : { role: m.role, content: m.content }));
  return { system: system.join('\n\n'), messages: sent };
}

/** The effort for this request: the caller's, else the one configured for this model. */
export function effortFor(config: LlmConfig, model: string, req: CompletionRequest): LlmEffort {
  return req.reasoning ?? config.efforts?.[model] ?? config.effort ?? 'medium';
}

/** The whole request body (`betas` included) for one model. */
export function buildAnthropicRequest(config: LlmConfig, req: CompletionRequest, streaming: boolean): BetaMessageStreamParams {
  const model = req.model ?? config.model;
  const traits = anthropicTraits(model);
  const official = isAnthropicApi(config.baseUrl || ANTHROPIC_API_URL);
  const { system, messages } = toAnthropicMessages(req.messages, model);
  const effort = effortFor(config, model, req);
  const base = streaming ? MAX_TOKENS.stream : MAX_TOKENS.complete;
  const room = effort === 'low' ? 4_000 : effort === 'medium' ? 8_000 : 16_000;
  const maxTokens = !traits.adaptive ? req.maxTokens ?? 4_096 : req.maxTokens ? Math.min(base, req.maxTokens + room) : base;
  const tools = (req.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
    // Tool input streams as it is written; it is checked here before any tool runs (readMessage).
    ...(streaming && official ? { eager_input_streaming: true } : {}),
  }));
  const betas = [...(traits.adaptive ? [THINKING_BINDING_BETA] : []), ...(traits.fallback && official ? [SERVER_FALLBACK_BETA] : [])];
  const conversation = tools.length > 0 || messages.length > 1;
  const params: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    ...(system ? { system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] } : {}),
    messages,
    ...(tools.length ? { tools, tool_choice: { type: req.toolChoice === 'none' ? 'none' : 'auto' } } : {}),
    ...(traits.adaptive ? { thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } }, output_config: { effort } } : {}),
    ...(conversation ? { cache_control: { type: 'ephemeral' } } : {}),
    ...(traits.fallback && official ? { fallbacks: 'default' } : {}),
    ...(betas.length ? { betas } : {}),
  };
  return params as unknown as BetaMessageStreamParams;
}

function client(config: LlmConfig, fetchImpl: Fetch): Anthropic {
  // maxRetries 0: Enyo's own retries (below) keep the per-model budgets and the model chain working.
  // logLevel "off": a debug setting in the environment never writes requests (prompts) to the log;
  // failures reach the app as LlmError, without the key or the prompt.
  return new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl || ANTHROPIC_API_URL, timeout: config.timeoutMs, maxRetries: 0, fetch: fetchImpl, logLevel: 'off' });
}

const anthropicError = (kind: LlmErrorKind, message: string, status?: number, detail?: string, code?: string) => new LlmError(kind, message, status, detail, code, 'anthropic');

/** The SDK's typed errors, most specific first, as Enyo's failure kinds. */
export function toLlmError(err: unknown, signal?: AbortSignal): LlmError {
  if (err instanceof LlmError) return err;
  if (err instanceof APIUserAbortError) return signal?.aborted ? anthropicError('aborted', 'Aborted') : anthropicError('timeout', 'The model took too long');
  if (err instanceof APIConnectionTimeoutError) return anthropicError('timeout', 'The model took too long');
  if (err instanceof APIConnectionError) return signal?.aborted ? anthropicError('aborted', 'Aborted') : anthropicError('unavailable', 'Could not reach Anthropic');
  if (err instanceof APIError && typeof err.status === 'number') {
    const body = (err.error ?? {}) as { error?: { details?: { error_code?: unknown } } };
    const read = readErrorBody(JSON.stringify(body));
    const special = body.error?.details?.error_code;
    const code = typeof special === 'string' && /^[a-z0-9_.-]{1,60}$/i.test(special) ? special : read.code;
    const kind: LlmErrorKind =
      err instanceof RateLimitError ? 'rate_limited'
        : err instanceof NotFoundError ? 'not_found'
          : err instanceof AuthenticationError || err instanceof PermissionDeniedError || err instanceof PaymentRequiredError ? 'auth'
            : err instanceof OverloadedError || err instanceof InternalServerError ? 'unavailable'
              : err instanceof BadRequestError || err instanceof ContentTooLargeError || err instanceof UnprocessableEntityError ? 'rejected'
                : kindForStatus(err.status);
    return anthropicError(kind, `Anthropic answered ${err.status}`, err.status, read.detail, code);
  }
  if (signal?.aborted) return anthropicError('aborted', 'Aborted');
  if (err instanceof AnthropicError) return anthropicError('bad_response', 'Anthropic sent something unexpected');
  return anthropicError('unavailable', 'Could not reach Anthropic');
}

/**
 * Up to three retries on 429 / 5xx / network errors, as for any provider:
 * a short wait the server asks for is kept, a long one is reported at once,
 * and a busy model hands over at once when another model is waiting.
 */
async function withRetries<T>(model: string, signal: AbortSignal | undefined, quickFail: boolean, run: () => Promise<T>): Promise<T> {
  let last = anthropicError('unavailable', 'No attempt made');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (signal?.aborted) throw anthropicError('aborted', 'Aborted');
    try {
      return await run();
    } catch (raw) {
      const err = toLlmError(raw, signal);
      if (err.kind !== 'rate_limited' && err.kind !== 'unavailable') throw err;
      last = err;
      let wait = 600 * (attempt + 1);
      if (err.kind === 'rate_limited') {
        // A monthly spend limit does not free in seconds.
        if (err.code === 'enforced_spend_limit_reached') throw err;
        const asked = retryAfterMs(err.detail, raw instanceof APIError ? raw.headers?.get('retry-after') : undefined);
        noteLimited(model, asked);
        if (quickFail || (asked !== undefined && asked > MAX_RETRY_WAIT_MS)) throw err;
        if (asked !== undefined) wait = Math.max(asked + 250, 500);
      }
      if (attempt === 3) break;
      await sleep(wait, signal);
    }
  }
  throw last;
}

/** The input has the basic shape the tool's schema asks for: an object with every required field. */
export function inputFits(spec: ToolSpec | undefined, input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const required = Array.isArray(spec?.parameters.required) ? (spec!.parameters.required as unknown[]) : [];
  return required.every((k) => typeof k !== 'string' || (input as Record<string, unknown>)[k] !== undefined);
}

/** What the model's turn is sent back as: after a mid-answer fallback, only the text from before it (and the switch points) is kept. */
function replayable(content: Block[]): Block[] {
  let boundary = -1;
  content.forEach((b, k) => { if (b.type === 'fallback') boundary = k; });
  if (boundary < 0) return content;
  return content.filter((b, k) => k > boundary || b.type === 'text' || b.type === 'fallback');
}

function readUsage(msg: BetaMessage): Usage {
  const one = (u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) => ({
    tokensIn: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    tokensOut: u.output_tokens ?? 0,
  });
  const iterations = (msg.usage?.iterations ?? []) as { type: string }[];
  // After a fallback the top-level usage covers only the attempt that answered; each attempt is in `iterations`.
  if (iterations.some((x) => x.type === 'fallback_message')) {
    return iterations.reduce((sum, x) => { const u = one(x as never); return { tokensIn: sum.tokensIn + u.tokensIn, tokensOut: sum.tokensOut + u.tokensOut }; }, { tokensIn: 0, tokensOut: 0 });
  }
  return one(msg.usage ?? {});
}

/** Earlier thinking the API set aside (the conversation or the model changed): counted, never the content. */
function noteDropped(msg: BetaMessage): void {
  const dropped = (msg.input_transformations ?? []).filter((t) => t.type === 'thinking_dropped');
  if (!dropped.length) return;
  const reasons = [...new Set(dropped.map((t) => String((t as { reason?: unknown }).reason ?? 'unknown')))].join(', ');
  console.warn(`[enyo] ${dropped.length} earlier thinking block(s) were dropped by Anthropic (${reasons})`);
}

const FINISH: Record<string, string> = { end_turn: 'stop', stop_sequence: 'stop', tool_use: 'tool_calls', max_tokens: 'length', model_context_window_exceeded: 'length', pause_turn: 'stop', refusal: 'refusal' };

/** The model's message as a Completion: blocks read by type; thinking never becomes text. */
export function readMessage(msg: BetaMessage, tools: ToolSpec[] | undefined, requestedModel: string): Completion {
  noteDropped(msg);
  const usage = readUsage(msg);
  const model = msg.model || requestedModel;
  if (msg.stop_reason === 'refusal') return { content: REFUSAL_TEXT, toolCalls: [], usage, model, finishReason: 'refusal' };
  const content = (msg.content ?? []) as unknown as Block[];
  const sent = replayable(content);
  const text = content.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('');
  const specs = new Map((tools ?? []).map((t) => [t.name, t]));
  const truncated = msg.stop_reason === 'max_tokens';
  const toolCalls: ToolCall[] = sent.filter((b) => b.type === 'tool_use').map((b) => {
    const input = b.input ?? {};
    const fits = !truncated && inputFits(specs.get(String(b.name)), input);
    return { id: String(b.id), name: String(b.name), arguments: JSON.stringify(input), ...(fits ? {} : { invalidInput: true }) };
  });
  return {
    content: text,
    toolCalls,
    usage,
    model,
    finishReason: FINISH[msg.stop_reason ?? ''] ?? String(msg.stop_reason ?? 'stop'),
    ...(toolCalls.length ? { providerContent: sent } : {}),
  };
}

/** One request, whole answer. */
export async function anthropicComplete(config: LlmConfig, req: CompletionRequest, fetchImpl: Fetch, quickFail = false): Promise<Completion> {
  const model = req.model ?? config.model;
  const params = buildAnthropicRequest(config, req, false);
  const api = client(config, fetchImpl);
  const msg = await withRetries(model, req.signal, quickFail, () => api.beta.messages.create({ ...params, stream: false }, { signal: req.signal }) as Promise<BetaMessage>);
  return readMessage(msg, req.tools, model);
}

type Opened = { stream: ReturnType<Anthropic['beta']['messages']['stream']>; events: AsyncIterator<BetaRawMessageStreamEvent>; first: IteratorResult<BetaRawMessageStreamEvent>; idle: { fired: boolean }; stop: () => void };

/** The next event, or a timeout when the model goes quiet for longer than the configured time. */
async function next(o: Pick<Opened, 'events' | 'idle' | 'stream'>, timeoutMs: number): Promise<IteratorResult<BetaRawMessageStreamEvent>> {
  const pending = o.events.next();
  pending.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { o.idle.fired = true; o.stream.abort(); reject(anthropicError('timeout', 'The model stopped sending')); }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Opens the stream and waits for its first event, so a refused request is retried or handed to the next model before anything is said. */
async function open(api: Anthropic, params: BetaMessageStreamParams, config: LlmConfig, signal: AbortSignal | undefined): Promise<Opened> {
  const s = api.beta.messages.stream(params, signal ? { signal } : undefined);
  // Failures are read from the events and finalMessage(); this only keeps them from going unhandled.
  s.done().catch(() => undefined);
  const idle = { fired: false };
  const events = s[Symbol.asyncIterator]();
  try {
    const first = await next({ events, idle, stream: s }, config.timeoutMs);
    return { stream: s, events, first, idle, stop: () => s.abort() };
  } catch (err) {
    s.abort();
    throw idle.fired ? anthropicError('timeout', 'The model took too long') : err;
  }
}

/**
 * Streams one request: text as it arrives, then the whole message (tool calls
 * read from the final message, each input checked before Enyo runs it).
 * Resolves once the first event is in.
 */
export async function anthropicOpenStream(config: LlmConfig, req: CompletionRequest, fetchImpl: Fetch, quickFail = false): Promise<AsyncGenerator<StreamPiece>> {
  const model = req.model ?? config.model;
  const params = buildAnthropicRequest(config, req, true);
  const api = client(config, fetchImpl);
  const opened = await withRetries(model, req.signal, quickFail, () => open(api, params, config, req.signal));
  return pieces(opened, () => withRetries(model, req.signal, false, () => open(api, params, config, req.signal)), config, req, model);
}

async function* pieces(first: Opened, reopen: () => Promise<Opened>, config: LlmConfig, req: CompletionRequest, model: string): AsyncGenerator<StreamPiece> {
  let o = first;
  let said = false;
  let reissued = 0;
  let msg: BetaMessage | undefined;
  try {
    for (;;) {
      try {
        let r = o.first;
        while (!r.done) {
          const e = r.value;
          if (e.type === 'content_block_delta' && e.delta.type === 'text_delta' && e.delta.text) {
            said = true;
            yield { type: 'text', text: e.delta.text };
          }
          r = await next(o, config.timeoutMs);
        }
        msg = await o.stream.finalMessage();
        break;
      } catch (err) {
        o.stop();
        if (err instanceof LlmError) throw err;
        if (o.idle.fired) throw anthropicError('timeout', 'The model stopped sending');
        if (req.signal?.aborted) throw anthropicError('aborted', 'Aborted');
        const mapped = err instanceof APIError ? toLlmError(err, req.signal) : undefined;
        if (mapped && mapped.kind !== 'unavailable') throw mapped;
        // A tool input that could not be read at all, an overload or a dropped connection:
        // the turn is asked again while nothing has been said yet (twice at most).
        if (said || reissued >= 2) throw mapped ?? anthropicError('unavailable', 'The stream from Anthropic broke off');
        reissued += 1;
        o = await reopen();
      }
    }
  } finally {
    // Stopped part-way (the person left, or an error above): close the connection.
    if (!msg) o.stop();
  }
  const completion = readMessage(msg!, req.tools, model);
  // A decline mid-answer: what was already shown stays, and the polite sentence follows.
  if (completion.finishReason === 'refusal') yield { type: 'text', text: said ? `\n\n${REFUSAL_TEXT}` : REFUSAL_TEXT };
  yield { type: 'done', completion };
}
