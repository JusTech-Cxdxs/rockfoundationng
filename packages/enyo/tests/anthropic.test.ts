/**
 * Enyo on Anthropic Claude: the request it sends, how it reads answers and
 * errors, and the agent loop on top. Everything runs against a scripted
 * fetch with recorded responses; no key and no network are needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLlmConfig, type LlmConfig } from '../src/config';
import { complete, llmAdminMessage, LlmError, resetModelBudgets, stream, type ChatMessage, type StreamPiece, type ToolSpec } from '../src/llm';
import { anthropicTraits, buildAnthropicRequest, inputFits, readMessage, REFUSAL_TEXT, SERVER_FALLBACK_BETA, THINKING_BINDING_BETA, toAnthropicMessages } from '../src/anthropic';
import { runAgent } from '../src/agent';
import type { Tool } from '../src/tools';

const config = readLlmConfig({ ENYO_LLM_PROVIDER: 'anthropic', ENYO_LLM_API_KEY: 'test-key' }) as LlmConfig;

type Seen = { url: string; headers: Headers; body: Record<string, unknown> };

/** A fetch that answers each call with the next scripted response and keeps what was sent. */
function scripted(responses: (() => Response)[]) {
  const seen: Seen[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? '{}')) });
    const next = responses.shift();
    if (!next) throw new Error('No more scripted responses');
    return next();
  }) as typeof fetch;
  return { impl, seen };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const apiError = (status: number, type: string, message: string, headers: Record<string, string> = {}, details?: Record<string, unknown>) =>
  json({ type: 'error', error: { type, message, ...(details ? { details } : {}) } }, status, headers);

const usage = { input_tokens: 12, output_tokens: 30, cache_read_input_tokens: 100, cache_creation_input_tokens: 8 };
const message = (content: unknown[], stopReason: string, extra: Record<string, unknown> = {}) => ({
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason: stopReason, stop_sequence: null, usage, ...extra,
});

/** A recorded server-sent event stream, as the Messages API sends it. */
function sse(events: Record<string, unknown>[]): Response {
  const text = events.map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(new Blob([text]).stream(), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
const start = (model = 'claude-opus-5-5', extra: Record<string, unknown> = {}) => ({ type: 'message_start', message: { id: 'msg_s', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 20, output_tokens: 1, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 }, ...extra } });
const thinkingBlock = (index: number, signature: string) => [
  { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } },
  { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature } },
  { type: 'content_block_stop', index },
];
const textBlock = (index: number, words: string[]) => [
  { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
  ...words.map((w) => ({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: w } })),
  { type: 'content_block_stop', index },
];
const toolBlock = (index: number, id: string, name: string, input: string) => [
  { type: 'content_block_start', index, content_block: { type: 'tool_use', id, name, input: {} } },
  { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: input.slice(0, 5) } },
  { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: input.slice(5) } },
  { type: 'content_block_stop', index },
];
const end = (stopReason: string, outputTokens = 40) => [
  { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: outputTokens } },
  { type: 'message_stop' },
];

const partSpec: ToolSpec = { name: 'part_lookup', description: 'Find a part', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } };

type Ctx = { role: string };
const partTool: Tool<Ctx> = {
  name: 'part_lookup', description: 'Find a part by name', kind: 'read', status: 'Looking up the part…',
  parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
  run: async (a) => ({ ok: true, data: { part: a.query, price: 12500 } }),
};

async function collect(it: AsyncGenerator<StreamPiece>): Promise<StreamPiece[]> {
  const out: StreamPiece[] = [];
  for await (const p of it) out.push(p);
  return out;
}

test('anthropic config: the provider and a key are enough; models, label and effort have defaults', () => {
  assert.equal(config.provider, 'anthropic');
  assert.equal(config.baseUrl, 'https://api.anthropic.com');
  assert.equal(config.model, 'claude-opus-5-5');
  assert.equal(config.fastModel, 'claude-haiku-5-5');
  assert.equal(config.providerLabel, 'Anthropic Claude');
  assert.deepEqual(config.efforts, { 'claude-haiku-5-5': 'low', 'claude-opus-5-5': 'medium' });
  assert.deepEqual(config.fallbackModels, undefined);
  // No key: Enyo stays off. ANTHROPIC_API_KEY is accepted too.
  assert.equal(readLlmConfig({ ENYO_LLM_PROVIDER: 'anthropic' }), null);
  assert.equal(readLlmConfig({ ENYO_LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k2' })?.apiKey, 'k2');
  // Anthropic's own address means Anthropic, with or without /v1; an explicit provider wins.
  const inferred = readLlmConfig({ ENYO_LLM_BASE_URL: 'https://api.anthropic.com/v1/', ENYO_LLM_API_KEY: 'k' });
  assert.equal(inferred?.provider, 'anthropic');
  assert.equal(inferred?.baseUrl, 'https://api.anthropic.com');
  assert.equal(readLlmConfig({ ENYO_LLM_PROVIDER: 'openai', ENYO_LLM_BASE_URL: 'https://api.anthropic.com/v1', ENYO_LLM_MODEL: 'x', ENYO_LLM_API_KEY: 'k' })?.provider, undefined);
  // Overrides, and a mistyped effort falls back to the default.
  const custom = readLlmConfig({ ENYO_LLM_PROVIDER: ' Anthropic ', ENYO_LLM_API_KEY: '"k"', ENYO_LLM_MODEL: 'claude-sonnet-5-5', ENYO_LLM_FAST_MODEL: 'claude-haiku-5-5', ENYO_LLM_EFFORT: 'HIGH', ENYO_LLM_FAST_EFFORT: 'fastest', ENYO_LLM_PROVIDER_LABEL: 'Claude' });
  assert.equal(custom?.apiKey, 'k');
  assert.deepEqual(custom?.efforts, { 'claude-haiku-5-5': 'low', 'claude-sonnet-5-5': 'high' });
  assert.equal(custom?.providerLabel, 'Claude');
  // The OpenAI-compatible path is unchanged.
  assert.equal(readLlmConfig({ ENYO_LLM_BASE_URL: 'https://api.groq.com/openai/v1', ENYO_LLM_MODEL: 'x', ENYO_LLM_API_KEY: 'k' })?.provider, undefined);
});

test('anthropic messages: leading system messages become `system`, tool results are grouped, ids are kept', () => {
  const convo: ChatMessage[] = [
    { role: 'system', content: 'You are Enyo.' },
    { role: 'system', content: 'Be brief.' },
    { role: 'assistant', content: 'A greeting left over from a trimmed history.' },
    { role: 'user', content: 'Find two parts' },
    { role: 'assistant', content: 'Checking.', toolCalls: [{ id: 'toolu_a', name: 'part_lookup', arguments: '{"query":"filter"}' }, { id: 'toolu_b', name: 'part_lookup', arguments: 'not json' }] },
    { role: 'tool', toolCallId: 'toolu_a', name: 'part_lookup', content: '{"price":1}' },
    { role: 'tool', toolCallId: 'toolu_b', name: 'part_lookup', content: '{"error":"x"}', isError: true },
    { role: 'user', content: '' },
  ];
  const { system, messages } = toAnthropicMessages(convo, 'claude-opus-5-5');
  assert.equal(system, 'You are Enyo.\n\nBe brief.');
  assert.deepEqual(messages, [
    { role: 'user', content: [{ type: 'text', text: 'Find two parts' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Checking.' }, { type: 'tool_use', id: 'toolu_a', name: 'part_lookup', input: { query: 'filter' } }, { type: 'tool_use', id: 'toolu_b', name: 'part_lookup', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_a', content: '{"price":1}' }, { type: 'tool_result', tool_use_id: 'toolu_b', content: '{"error":"x"}', is_error: true }] },
  ]);
  // Never ends with the model's own plain text (that would be a prefill).
  assert.equal(toAnthropicMessages([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hel' }], 'claude-opus-5-5').messages.length, 1);
});

test('anthropic messages: a later system message stays one where the model allows it, else joins the user turn', () => {
  const convo: ChatMessage[] = [{ role: 'system', content: 'Core.' }, { role: 'user', content: 'Hi' }, { role: 'system', content: 'Short answers now.' }];
  assert.deepEqual(toAnthropicMessages(convo, 'claude-opus-5-5').messages, [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }, { role: 'system', content: 'Short answers now.' }]);
  assert.deepEqual(toAnthropicMessages(convo, 'claude-sonnet-5').messages, [{ role: 'user', content: [{ type: 'text', text: 'Hi' }, { type: 'text', text: 'Short answers now.' }] }]);
  // Before a user turn (not allowed there): folded into it.
  const before: ChatMessage[] = [{ role: 'user', content: 'A' }, { role: 'assistant', content: 'B' }, { role: 'system', content: 'Note.' }, { role: 'user', content: 'C' }];
  assert.deepEqual(toAnthropicMessages(before, 'claude-opus-5-5').messages.at(-1), { role: 'user', content: [{ type: 'text', text: 'Note.' }, { type: 'text', text: 'C' }] });
});

test('anthropic request: no sampling settings, auto tool choice, adaptive thinking with drop_block, effort and room to think', () => {
  const req = { messages: [{ role: 'system' as const, content: 'S' }, { role: 'user' as const, content: 'Q' }], tools: [partSpec], temperature: 0.2 };
  const main = buildAnthropicRequest(config, req, false) as unknown as Record<string, unknown>;
  for (const k of ['temperature', 'top_p', 'top_k']) assert.equal(k in main, false, k);
  assert.equal(main.model, 'claude-opus-5-5');
  assert.equal(main.max_tokens, 16_000);
  assert.deepEqual(main.tool_choice, { type: 'auto' });
  assert.deepEqual(main.thinking, { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } });
  assert.deepEqual(main.output_config, { effort: 'medium' });
  assert.deepEqual(main.system, [{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(main.cache_control, { type: 'ephemeral' });
  assert.deepEqual(main.tools, [{ name: 'part_lookup', description: 'Find a part', input_schema: partSpec.parameters }]);
  assert.equal(main.fallbacks, 'default');
  assert.deepEqual(main.betas, [THINKING_BINDING_BETA, SERVER_FALLBACK_BETA]);
  // Streaming: more room, and tool input streams as written.
  const streamed = buildAnthropicRequest(config, req, true) as unknown as Record<string, unknown>;
  assert.equal(streamed.max_tokens, 32_000);
  assert.equal((streamed.tools as Record<string, unknown>[])[0]?.eager_input_streaming, true);
  // The fast model thinks little; a short job gets its limit plus room to think; the caller's effort wins.
  const fast = buildAnthropicRequest(config, { messages: [{ role: 'user', content: 'Q' }], model: config.fastModel, maxTokens: 300 }, false) as unknown as Record<string, unknown>;
  assert.deepEqual(fast.output_config, { effort: 'low' });
  assert.equal(fast.max_tokens, 4_300);
  assert.equal('cache_control' in fast, false);
  assert.deepEqual((buildAnthropicRequest(config, { ...req, reasoning: 'low' }, false) as unknown as Record<string, unknown>).output_config, { effort: 'low' });
  // The last step of a tool loop: tools stay declared, none may be called.
  const last = buildAnthropicRequest(config, { ...req, toolChoice: 'none' }, true) as unknown as Record<string, unknown>;
  assert.deepEqual(last.tool_choice, { type: 'none' });
  assert.equal(JSON.stringify(last.tools), JSON.stringify(streamed.tools));
  // Never thinking switched off, never forced tool choice, anywhere.
  for (const body of [main, streamed, fast, last]) {
    const text = JSON.stringify(body);
    assert.ok(!text.includes('"disabled"') && !text.includes('budget_tokens') && !/"type":"(any|tool)"/.test(text));
  }
});

test('anthropic request: server-side fallback only for models that support it, and only on Anthropic\'s API', () => {
  const body = (model: string, c: LlmConfig = config) => buildAnthropicRequest(c, { messages: [{ role: 'user', content: 'Q' }], model }, false) as unknown as Record<string, unknown>;
  assert.equal(body('claude-opus-5-5').fallbacks, 'default');
  assert.equal(body('claude-sonnet-5-5').fallbacks, 'default');
  assert.equal('fallbacks' in body('claude-haiku-5-5'), false);
  assert.deepEqual(body('claude-haiku-5-5').betas, [THINKING_BINDING_BETA]);
  assert.equal('fallbacks' in body('claude-sonnet-5'), false);
  assert.equal(anthropicTraits('claude-haiku-5-5').fallback, false);
  // Older models: no adaptive thinking, no effort, no betas.
  const old = body('claude-haiku-4-5');
  assert.equal('thinking' in old || 'output_config' in old || 'betas' in old, false);
  // A gateway in front of the API: no fallbacks and no eager tool input.
  const gateway = { ...config, baseUrl: 'https://llm-gateway.example.com' };
  assert.equal('fallbacks' in body('claude-opus-5-5', gateway), false);
  const streamed = buildAnthropicRequest(gateway, { messages: [{ role: 'user', content: 'Q' }], tools: [partSpec] }, true) as unknown as Record<string, unknown>;
  assert.equal('eager_input_streaming' in (streamed.tools as Record<string, unknown>[])[0]!, false);
});

test('anthropic complete(): one call to the Messages API; thinking never becomes text; tool calls keep their ids; usage counts cached input', async () => {
  const content = [
    { type: 'thinking', thinking: '', signature: 'sig-1' },
    { type: 'text', text: 'Let me check.' },
    { type: 'tool_use', id: 'toolu_1', name: 'part_lookup', input: { query: 'oil filter' } },
  ];
  const { impl, seen } = scripted([() => json(message(content, 'tool_use'))]);
  const r = await complete(config, { messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'Oil filter price?' }], tools: [partSpec] }, impl);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.url, 'https://api.anthropic.com/v1/messages');
  assert.match(seen[0]?.headers.get('anthropic-beta') ?? '', new RegExp(THINKING_BINDING_BETA));
  assert.equal('betas' in (seen[0]?.body ?? {}), false);
  assert.equal(r.content, 'Let me check.');
  assert.deepEqual(r.toolCalls, [{ id: 'toolu_1', name: 'part_lookup', arguments: '{"query":"oil filter"}' }]);
  assert.deepEqual(r.providerContent, content);
  assert.equal(r.finishReason, 'tool_calls');
  assert.deepEqual(r.usage, { tokensIn: 120, tokensOut: 30 });
});

test('anthropic complete(): a refusal is a polite answer, not an error', async () => {
  const { impl } = scripted([() => json(message([], 'refusal', { stop_details: { type: 'refusal', category: 'cyber', explanation: null } }))]);
  const r = await complete(config, { messages: [{ role: 'user', content: 'x' }] }, impl);
  assert.equal(r.content, REFUSAL_TEXT);
  assert.equal(r.finishReason, 'refusal');
  assert.deepEqual(r.toolCalls, []);
});

test('anthropic stream(): text pieces as they arrive, then the tool calls from the final message', async () => {
  const { impl, seen } = scripted([() => sse([start(), ...thinkingBlock(0, 'sig-s'), ...textBlock(1, ['Checking ', 'the parts.']), ...toolBlock(2, 'toolu_9', 'part_lookup', '{"query":"brake pads"}'), ...end('tool_use')])]);
  const pieces = await collect(stream(config, { messages: [{ role: 'user', content: 'Brake pads?' }], tools: [partSpec] }, impl));
  assert.deepEqual(pieces.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text), ['Checking ', 'the parts.']);
  const done = pieces.at(-1);
  assert.equal(done?.type, 'done');
  const c = (done as Extract<StreamPiece, { type: 'done' }>).completion;
  assert.equal(c.content, 'Checking the parts.');
  assert.deepEqual(c.toolCalls, [{ id: 'toolu_9', name: 'part_lookup', arguments: '{"query":"brake pads"}' }]);
  assert.equal((c.providerContent?.[0] as { signature?: string }).signature, 'sig-s');
  assert.deepEqual(c.usage, { tokensIn: 70, tokensOut: 40 });
  assert.equal(seen[0]?.body.stream, true);
});

test('anthropic stream(): a tool input without a required field, or cut off at the limit, is marked and never run', async () => {
  const { impl } = scripted([() => sse([start(), ...toolBlock(0, 'toolu_x', 'part_lookup', '{"q":"pads"}  '), ...end('tool_use')])]);
  const pieces = await collect(stream(config, { messages: [{ role: 'user', content: 'x' }], tools: [partSpec] }, impl));
  const c = (pieces.at(-1) as Extract<StreamPiece, { type: 'done' }>).completion;
  assert.equal(c.toolCalls[0]?.invalidInput, true);
  assert.equal(inputFits(partSpec, { query: 'a' }), true);
  assert.equal(inputFits(partSpec, ['a']), false);
  const truncated = readMessage(message([{ type: 'tool_use', id: 't', name: 'part_lookup', input: { query: 'a' } }], 'max_tokens') as never, [partSpec], 'claude-opus-5-5');
  assert.equal(truncated.toolCalls[0]?.invalidInput, true);
});

test('anthropic agent: the model\'s turn is replayed exactly, with the same system prompt and tools, and the tool result answers its id', async () => {
  const { impl, seen } = scripted([
    () => sse([start(), ...thinkingBlock(0, 'sig-turn-1'), ...toolBlock(1, 'toolu_p', 'part_lookup', '{"query":"oil filter"}'), ...end('tool_use')]),
    () => sse([start(), ...thinkingBlock(0, 'sig-turn-2'), ...toolBlock(1, 'toolu_q', 'part_lookup', '{"nope":1}'), ...end('tool_use')]),
    () => sse([start(), ...textBlock(0, ['The oil filter ', 'costs ₦12,500.']), ...end('end_turn')]),
  ]);
  const r = await runAgent({ config, system: 'You are Enyo.', messages: [{ role: 'user', content: 'Oil filter price?' }], tools: [partTool], ctx: { role: 'store' }, emit: () => undefined, fetchImpl: impl, maxSteps: 3 });
  assert.equal(r.error, undefined);
  assert.equal(r.answer, 'The oil filter costs ₦12,500.');
  assert.equal(r.toolRuns.length, 2);
  assert.equal(r.toolRuns[0]?.ok, true);
  assert.equal(r.toolRuns[1]?.ok, false);
  const [first, second, third] = seen.map((s) => s.body);
  // Byte-identical system prompt and tools across the loop.
  assert.equal(JSON.stringify(second?.system), JSON.stringify(first?.system));
  assert.equal(JSON.stringify(third?.tools), JSON.stringify(first?.tools));
  assert.deepEqual(third?.tool_choice, { type: 'none' });
  // The assistant turn exactly as returned: thinking block and signature included.
  const msgs = second?.messages as { role: string; content: Record<string, unknown>[] }[];
  assert.deepEqual(msgs[1], { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig-turn-1' }, { type: 'tool_use', id: 'toolu_p', name: 'part_lookup', input: { query: 'oil filter' } }] });
  assert.equal(msgs[2]?.role, 'user');
  assert.equal(msgs[2]?.content[0]?.tool_use_id, 'toolu_p');
  assert.match(String(msgs[2]?.content[0]?.content), /12500/);
  // The input that did not fit was not run; the model sees what it sent, as an error.
  const last = (third?.messages as { content: Record<string, unknown>[] }[]).at(-1)!;
  assert.equal(last.content[0]?.tool_use_id, 'toolu_q');
  assert.equal(last.content[0]?.is_error, true);
  assert.deepEqual(JSON.parse(String(last.content[0]?.content)), { INVALID_JSON: '{"nope":1}' });
  // Earlier turns are replayed unchanged too.
  assert.deepEqual((third?.messages as unknown[])[1], msgs[1]);
});

test('anthropic agent: a declined request answers politely; the partial text is not kept as the answer', async () => {
  const { impl } = scripted([() => sse([start(), ...textBlock(0, ['Sure, here ']), ...end('refusal')])]);
  const shown: string[] = [];
  const r = await runAgent({ config, system: 's', messages: [{ role: 'user', content: 'x' }], tools: [partTool], ctx: { role: 'store' }, emit: (e) => { if (e.type === 'text') shown.push(e.text); }, fetchImpl: impl });
  assert.equal(r.error, undefined);
  assert.equal(r.answer, REFUSAL_TEXT);
  assert.equal(shown.join(''), `Sure, here \n\n${REFUSAL_TEXT}`);
});

test('anthropic: after a mid-answer fallback, only the text before it goes back, and only the later tool calls run', () => {
  const content = [
    { type: 'thinking', thinking: '', signature: 'a' },
    { type: 'text', text: 'Part one. ' },
    { type: 'tool_use', id: 'toolu_old', name: 'part_lookup', input: { query: 'x' } },
    { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-5' } },
    { type: 'thinking', thinking: '', signature: 'b' },
    { type: 'tool_use', id: 'toolu_new', name: 'part_lookup', input: { query: 'y' } },
  ];
  const r = readMessage(message(content, 'tool_use', { model: 'claude-opus-5' }) as never, [partSpec], 'claude-opus-5-5');
  assert.deepEqual(r.toolCalls.map((c) => c.id), ['toolu_new']);
  assert.deepEqual(r.providerContent, [content[1], content[3], content[4], content[5]]);
  assert.equal(r.model, 'claude-opus-5');
});

test('anthropic: dropped thinking is logged as a count and reason, never the content', () => {
  const warned: string[] = [];
  const original = console.warn;
  console.warn = (...a: unknown[]) => { warned.push(a.join(' ')); };
  try {
    readMessage(message([{ type: 'text', text: 'secret customer words' }], 'end_turn', { input_transformations: [{ type: 'thinking_dropped', path: 'messages.1.content.0', reason: 'prefix_binding_mismatch' }] }) as never, undefined, 'claude-opus-5-5');
  } finally {
    console.warn = original;
  }
  assert.equal(warned.length, 1);
  assert.match(warned[0]!, /1 earlier thinking block\(s\).*prefix_binding_mismatch/);
  assert.ok(!warned[0]!.includes('secret'));
});

test('anthropic errors: a bad key reads as "auth" with Anthropic\'s own advice and no key', async () => {
  const { impl, seen } = scripted([() => apiError(401, 'authentication_error', 'invalid x-api-key sk-ant-api03-abcdefghijklmnop')]);
  await assert.rejects(complete(config, { messages: [{ role: 'user', content: 'hi' }] }, impl), (e: unknown) => {
    assert.ok(e instanceof LlmError);
    assert.equal(e.kind, 'auth');
    assert.equal(e.status, 401);
    assert.equal(e.code, 'authentication_error');
    assert.ok(!(e.detail ?? '').includes('abcdefghijklmnop'));
    const admin = llmAdminMessage(e);
    assert.match(admin, /console\.anthropic\.com/);
    assert.ok(!admin.includes('/v1'));
    return true;
  });
  assert.equal(seen.length, 1);
});

test('anthropic errors: unknown model, bad request, billing', async () => {
  const one = async (r: Response): Promise<LlmError> => {
    try {
      await complete(config, { messages: [{ role: 'user', content: 'hi' }] }, scripted([() => r]).impl);
    } catch (e) {
      if (e instanceof LlmError) return e;
    }
    throw new Error('expected an LlmError');
  };
  const nf = await one(apiError(404, 'not_found_error', 'model: claude-opus-9'));
  assert.equal(nf.kind, 'not_found');
  assert.match(llmAdminMessage(nf), /ENYO_LLM_MODEL/);
  assert.equal((await one(apiError(400, 'invalid_request_error', 'messages: bad'))).kind, 'rejected');
  const billing = await one(apiError(402, 'billing_error', 'Your credit balance is too low'));
  assert.equal(billing.kind, 'auth');
  assert.match(llmAdminMessage(billing), /Billing/);
});

test('anthropic errors: a 429 with a short retry-after is retried after it; a long one, or the spend limit, is reported at once', async () => {
  resetModelBudgets();
  const short = scripted([() => apiError(429, 'rate_limit_error', 'Rate limited', { 'retry-after': '1' }), () => json(message([{ type: 'text', text: 'OK' }], 'end_turn'))]);
  const began = Date.now();
  const r = await complete(config, { messages: [{ role: 'user', content: 'hi' }] }, short.impl);
  assert.equal(r.content, 'OK');
  assert.equal(short.seen.length, 2);
  assert.ok(Date.now() - began >= 1_000);
  resetModelBudgets();
  const long = scripted([() => apiError(429, 'rate_limit_error', 'Rate limited', { 'retry-after': '60' })]);
  await assert.rejects(complete(config, { messages: [{ role: 'user', content: 'hi' }] }, long.impl), (e: unknown) => e instanceof LlmError && e.kind === 'rate_limited');
  assert.equal(long.seen.length, 1);
  resetModelBudgets();
  const cap = scripted([() => apiError(429, 'rate_limit_error', 'Spend limit reached', {}, { error_code: 'enforced_spend_limit_reached' })]);
  await assert.rejects(complete(config, { messages: [{ role: 'user', content: 'hi' }] }, cap.impl), (e: unknown) => e instanceof LlmError && e.code === 'enforced_spend_limit_reached' && /spend limit/i.test(llmAdminMessage(e)));
  assert.equal(cap.seen.length, 1);
  resetModelBudgets();
});

test('anthropic errors: overloaded (529) and server errors are retried, then read as "unavailable"', async () => {
  const ok = scripted([() => apiError(529, 'overloaded_error', 'Overloaded'), () => json(message([{ type: 'text', text: 'OK' }], 'end_turn'))]);
  assert.equal((await complete(config, { messages: [{ role: 'user', content: 'hi' }] }, ok.impl)).content, 'OK');
  assert.equal(ok.seen.length, 2);
  const down = scripted([0, 1, 2, 3].map(() => () => apiError(500, 'api_error', 'Internal error')));
  await assert.rejects(complete(config, { messages: [{ role: 'user', content: 'hi' }] }, down.impl), (e: unknown) => e instanceof LlmError && e.kind === 'unavailable' && e.status === 500);
  assert.equal(down.seen.length, 4);
});

test('anthropic errors: a streamed request refused before any text is retried; a broken stream reads calmly', async () => {
  const { impl, seen } = scripted([() => apiError(529, 'overloaded_error', 'Overloaded'), () => sse([start(), ...textBlock(0, ['Hi']), ...end('end_turn')])]);
  const pieces = await collect(stream(config, { messages: [{ role: 'user', content: 'hi' }] }, impl));
  assert.equal(seen.length, 2);
  assert.equal((pieces[0] as { text: string }).text, 'Hi');
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(collect(stream(config, { messages: [{ role: 'user', content: 'hi' }], signal: aborted.signal }, scripted([]).impl)), (e: unknown) => e instanceof LlmError && e.kind === 'aborted');
});
