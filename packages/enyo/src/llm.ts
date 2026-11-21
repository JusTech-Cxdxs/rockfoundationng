/**
 * The single client for every model call Enyo makes, with tool calling and
 * streaming. Two ways to reach a model:
 *  - any OpenAI-compatible chat endpoint, with plain fetch, so it runs the
 *    same on Vercel, Render, a company's own server or in tests;
 *  - Anthropic Claude, through the official SDK (anthropic.ts), when
 *    ENYO_LLM_PROVIDER=anthropic.
 * Callers see the same messages, completions, stream pieces and errors either way.
 */
import { fallbacksFor, type LlmConfig } from './config';
import { anthropicComplete, anthropicOpenStream } from './anthropic';
import { kindForStatus, limitedUntil, LlmError, noteLimited, readErrorBody, retryAfterMs, MAX_RETRY_WAIT_MS, sleep } from './llm-common';

export * from './llm-common';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * One tool call. `invalidInput`: the input did not have the shape the tool's
 * schema asks for (not an object, a required field missing, or cut off at the
 * length limit) — the tool is not run and the model is told so.
 */
export type ToolCall = { id: string; name: string; arguments: string; invalidInput?: boolean };

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  /**
   * `providerContent`: the provider's own content blocks for this turn,
   * exactly as returned (Anthropic: thinking blocks with their signatures,
   * text and tool calls). Sent back unchanged while the same answer's tool
   * loop runs; never stored and never shown.
   */
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[]; providerContent?: unknown[] }
  /** `isError`: the tool did not run or failed; the result says why. */
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean };

/** A tool as the model sees it: a name, what it does, and a JSON Schema for its input. */
export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };

export type CompletionRequest = {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  /**
   * "none": the tools stay declared but none may be called (the agent's last
   * step). The OpenAI-compatible request then carries no tools at all, as before.
   */
  toolChoice?: 'auto' | 'none';
  /** Override the configured model (e.g. the fast model). */
  model?: string;
  /** OpenAI-compatible endpoints only; Anthropic's current models take no sampling settings. */
  temperature?: number;
  maxTokens?: number;
  /**
   * How much to think. Reasoning models on OpenAI-compatible endpoints: low for
   * short jobs, medium otherwise. Anthropic: the effort level (default from
   * ENYO_LLM_EFFORT / ENYO_LLM_FAST_EFFORT).
   */
  reasoning?: 'low' | 'medium' | 'high';
  signal?: AbortSignal;
};

export type Usage = { tokensIn: number; tokensOut: number };

/**
 * One answer. `finishReason` "refusal": the model declined; `content` is then
 * a short polite sentence. `providerContent`: see ChatMessage (assistant).
 */
export type Completion = { content: string; toolCalls: ToolCall[]; usage: Usage; model: string; finishReason: string; providerContent?: unknown[] };

type Fetch = typeof fetch;

function wireMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, name: m.name, content: m.content };
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

/**
 * Reasoning models (OpenAI's gpt-oss, served by Groq and others) think before
 * they answer, and the thinking counts against max_tokens. Short jobs (a
 * brief, a refined sentence, a connection test) ask for little thinking and
 * get extra room, so the answer is never cut to nothing; the reasoning text
 * itself is never returned. A server that refuses these settings gets the
 * request again without them (post()).
 */
export function isReasoningModel(model: string): boolean {
  return /(^|\/)gpt-oss|(^|\/)o[134](-|$)/i.test(model);
}

const REASONING_ROOM = 1024;

/** The request itself carries the reasoning settings (not merely a message mentioning them). */
function hasReasoningSettings(payload: string): boolean {
  try {
    const p = JSON.parse(payload) as Record<string, unknown>;
    return 'reasoning_effort' in p || 'include_reasoning' in p;
  } catch {
    return false;
  }
}

function body(config: LlmConfig, req: CompletionRequest, stream: boolean): string {
  const model = req.model ?? config.model;
  const reasoning = isReasoningModel(model);
  const effort = req.reasoning ?? (req.maxTokens !== undefined && req.maxTokens <= 1200 ? 'low' : 'medium');
  return JSON.stringify({
    model,
    messages: wireMessages(req.messages),
    ...(req.tools?.length && req.toolChoice !== 'none' ? { tools: req.tools.map((t) => ({ type: 'function', function: t })), tool_choice: 'auto' } : {}),
    temperature: req.temperature ?? 0.2,
    ...(req.maxTokens ? { max_tokens: reasoning ? req.maxTokens + REASONING_ROOM : req.maxTokens } : {}),
    ...(reasoning ? { reasoning_effort: effort, include_reasoning: false } : {}),
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  });
}

/** POST with a timeout and up to three retries on 429 / 5xx / network errors. */
async function post(config: LlmConfig, firstPayload: string, signal: AbortSignal | undefined, fetchImpl: Fetch, quickFail = false): Promise<Response> {
  let lastError: LlmError = new LlmError('unavailable', 'No attempt made');
  let payload = firstPayload;
  let toolRetry = false;
  let giveUp = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (signal?.aborted) throw new LlmError('aborted', 'Aborted');
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), config.timeoutMs);
    const onAbort = () => timeout.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) },
        body: payload,
        signal: timeout.signal,
      });
      if (res.ok) return res;
      const { detail, code } = readErrorBody((await res.text().catch(() => '')).slice(0, 4000));
      const kind = kindForStatus(res.status);
      lastError = new LlmError(kind, `Model server answered ${res.status}`, res.status, detail, code);
      // Some servers do not accept stream_options: send the request again without it.
      if (kind === 'rejected' && payload.includes('"stream_options"') && /stream_options/i.test(detail ?? '')) {
        const p = JSON.parse(payload) as Record<string, unknown>;
        delete p.stream_options;
        payload = JSON.stringify(p);
        continue;
      }
      // A server that does not know the reasoning settings: send it again without them.
      if (kind === 'rejected' && /reasoning/i.test(detail ?? '') && hasReasoningSettings(payload)) {
        const p = JSON.parse(payload) as Record<string, unknown>;
        delete p.reasoning_effort;
        delete p.include_reasoning;
        payload = JSON.stringify(p);
        continue;
      }
      // A model sometimes writes a malformed tool call (Groq: "tool_use_failed"): one more try.
      if (kind === 'rejected' && code === 'tool_use_failed' && !toolRetry) {
        toolRetry = true;
        continue;
      }
      const retryable = kind === 'rate_limited' || kind === 'unavailable';
      if (!retryable) throw lastError;
      // Wait as long as the server asked, when that is short enough to be worth it (a per-minute
      // token budget usually frees in seconds); a long wait is reported at once instead.
      const asked = retryAfterMs(detail, res.headers.get('retry-after'));
      if (kind === 'rate_limited') noteLimited(modelOf(payload), asked);
      // Another model is waiting: move on at once rather than wait for this one.
      if (kind === 'rate_limited' && quickFail) { giveUp = true; throw lastError; }
      if (asked !== undefined && asked > MAX_RETRY_WAIT_MS) { giveUp = true; throw lastError; }
      await sleep(asked !== undefined ? Math.max(asked + 250, 500) : 600 * (attempt + 1), signal);
    } catch (err) {
      if (err instanceof LlmError) {
        if (giveUp || err.kind === 'rejected' || err.kind === 'auth' || err.kind === 'not_found' || err.kind === 'aborted') throw err;
        lastError = err;
      } else if (signal?.aborted) {
        throw new LlmError('aborted', 'Aborted');
      } else if (timeout.signal.aborted) {
        throw new LlmError('timeout', 'The model took too long');
      } else {
        lastError = new LlmError('unavailable', 'Could not reach the model server');
        await sleep(600 * (attempt + 1), signal).catch(() => undefined);
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastError;
}

const modelOf = (payload: string): string => { try { return String((JSON.parse(payload) as { model?: unknown }).model ?? ''); } catch { return ''; } };

/**
 * Sends the request to the model asked for and, when that model is out of
 * budget (429), refuses the tools it was given (tool_use_failed twice) or has
 * been withdrawn (404), to the next model in the chain — so a busy free tier
 * means a slightly different model, not "try again in a minute". Models known
 * to be busy are skipped until their wait is over.
 */
async function send(config: LlmConfig, req: CompletionRequest, streaming: boolean, fetchImpl: Fetch): Promise<Response> {
  return withModelChain(config, req, (model, more) => post(config, body(config, { ...req, model }, streaming), req.signal, fetchImpl, more));
}

/** The chain of models above, for any provider: `attempt` makes one model's request (`more`: another model is waiting). */
async function withModelChain<T>(config: LlmConfig, req: CompletionRequest, attempt: (model: string, more: boolean) => Promise<T>): Promise<T> {
  const primary = req.model ?? config.model;
  const chain = [primary, ...fallbacksFor(config, primary)];
  const now = Date.now();
  const ready = chain.filter((m) => (limitedUntil.get(m) ?? 0) <= now);
  // Everything busy: try the one that frees first, waiting as usual.
  const order = ready.length ? ready : [...chain].sort((a, b) => (limitedUntil.get(a) ?? 0) - (limitedUntil.get(b) ?? 0)).slice(0, 1);
  let last: unknown = new LlmError('unavailable', 'No model tried');
  for (let i = 0; i < order.length; i += 1) {
    const model = order[i]!;
    const more = i < order.length - 1;
    try {
      return await attempt(model, more);
    } catch (err) {
      last = err;
      if (!(err instanceof LlmError) || !more) throw err;
      const next = err.kind === 'rate_limited' || err.kind === 'not_found' || err.kind === 'unavailable' || (err.kind === 'rejected' && (err.code === 'tool_use_failed' || /model/i.test(err.detail ?? '') && /decommission|not exist|not found|deprecat/i.test(err.detail ?? '')));
      if (!next) throw err;
    }
  }
  throw last;
}

type WireToolCall = { id?: string; index?: number; function?: { name?: string; arguments?: string } };

function readUsage(u: unknown): Usage {
  const x = (u ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
  return { tokensIn: x.prompt_tokens ?? 0, tokensOut: x.completion_tokens ?? 0 };
}

/** One request, whole answer. */
export async function complete(config: LlmConfig, req: CompletionRequest, fetchImpl: Fetch = fetch): Promise<Completion> {
  if (config.provider === 'anthropic') return withModelChain(config, req, (model, more) => anthropicComplete(config, { ...req, model }, fetchImpl, more));
  const res = await send(config, req, false, fetchImpl);
  let json: { choices?: { message?: { content?: string | null; tool_calls?: WireToolCall[] }; finish_reason?: string }[]; usage?: unknown; model?: string };
  try {
    json = await res.json();
  } catch {
    throw new LlmError('bad_response', 'The model server sent something that is not JSON');
  }
  const choice = json.choices?.[0];
  if (!choice?.message) throw new LlmError('bad_response', 'The model server sent no answer');
  const toolCalls = (choice.message.tool_calls ?? []).map((c, i) => ({ id: c.id || `call_${i}`, name: c.function?.name ?? '', arguments: c.function?.arguments ?? '{}' })).filter((c) => c.name);
  return { content: choice.message.content ?? '', toolCalls, usage: readUsage(json.usage), model: json.model ?? req.model ?? config.model, finishReason: choice.finish_reason ?? 'stop' };
}

export type StreamPiece = { type: 'text'; text: string } | { type: 'done'; completion: Completion };

/**
 * Streams one request. Text arrives piece by piece; tool calls are assembled
 * and returned with the final `done` piece.
 */
export async function* stream(config: LlmConfig, req: CompletionRequest, fetchImpl: Fetch = fetch): AsyncGenerator<StreamPiece> {
  if (config.provider === 'anthropic') {
    // The chain moves to the next model only while nothing has been said yet.
    const opened = await withModelChain(config, req, (model, more) => anthropicOpenStream(config, { ...req, model }, fetchImpl, more));
    yield* opened;
    return;
  }
  const res = await send(config, req, true, fetchImpl);
  if (!res.body) throw new LlmError('bad_response', 'The model server sent no stream');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let usage: Usage = { tokensIn: 0, tokensOut: 0 };
  let finishReason = 'stop';
  let model = req.model ?? config.model;
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  const idle = () => new LlmError('timeout', 'The model stopped sending');
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(idle()), config.timeoutMs); }),
      ]).finally(() => clearTimeout(timer));
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let json: { choices?: { delta?: { content?: string | null; tool_calls?: WireToolCall[] }; finish_reason?: string | null }[]; usage?: unknown; model?: string };
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        if (json.model) model = json.model;
        if (json.usage) usage = readUsage(json.usage);
        const choice = json.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const text = choice.delta?.content;
        if (text) {
          content += text;
          yield { type: 'text', text };
        }
        for (const d of choice.delta?.tool_calls ?? []) {
          const i = d.index ?? 0;
          const cur = calls.get(i) ?? { id: '', name: '', arguments: '' };
          if (d.id) cur.id = d.id;
          if (d.function?.name) cur.name += d.function.name;
          if (d.function?.arguments) cur.arguments += d.function.arguments;
          calls.set(i, cur);
        }
      }
    }
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (req.signal?.aborted) throw new LlmError('aborted', 'Aborted');
    throw new LlmError('unavailable', 'The stream from the model server broke off');
  } finally {
    reader.releaseLock?.();
  }
  const toolCalls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([i, c]) => ({ id: c.id || `call_${i}`, name: c.name, arguments: c.arguments || '{}' })).filter((c) => c.name);
  yield { type: 'done', completion: { content, toolCalls, usage, model, finishReason } };
}
