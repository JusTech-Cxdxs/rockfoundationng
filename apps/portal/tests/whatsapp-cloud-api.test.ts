import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { cloudApiConfig, deliveryUpdates, sendTemplate, templateBody, toWhatsAppId, verifyWebhookSignature } from '../lib/whatsapp/cloud-api';

test('automatic WhatsApp is off until both the number id and the token are set', () => {
  assert.equal(cloudApiConfig({}), null);
  assert.equal(cloudApiConfig({ WHATSAPP_PHONE_NUMBER_ID: '123' }), null);
  const c = cloudApiConfig({ WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_ACCESS_TOKEN: 'tok', WHATSAPP_GRAPH_VERSION: 'latest' });
  assert.equal(c?.graphVersion, 'v26.0');
});

test('Nigerian numbers become WhatsApp ids; junk does not', () => {
  assert.equal(toWhatsAppId('0803 304 9194'), '2348033049194');
  assert.equal(toWhatsAppId('+234 802 389 1766'), '2348023891766');
  assert.equal(toWhatsAppId('n/a'), null);
});

test('a template message carries its document and clean body values', () => {
  const b = templateBody({ to: '2348033049194', template: 'invoice_ready', language: 'en', bodyParams: ['Chiamaka', 'INV-0042\n', ''], document: { link: 'https://example.com/d/abc', filename: 'INV-0042.pdf' } }) as { template: { components: { type: string; parameters: { text?: string }[] }[] } };
  assert.equal(b.template.components[0]!.type, 'header');
  assert.deepEqual(b.template.components[1]!.parameters.map((p) => p.text), ['Chiamaka', 'INV-0042', '-']);
});

test('sending: success returns the message id; a refusal is reported, never thrown', async () => {
  const config = { phoneNumberId: '123', accessToken: 'tok', graphVersion: 'v26.0', appSecret: null };
  const ok = await sendTemplate(config, { to: '234', template: 't', language: 'en', bodyParams: [] }, (async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 })) as typeof fetch);
  assert.deepEqual(ok, { ok: true, messageId: 'wamid.1' });
  const bad = await sendTemplate(config, { to: '234', template: 't', language: 'en', bodyParams: [] }, (async () => new Response(JSON.stringify({ error: { message: 'Template not approved' } }), { status: 400 })) as typeof fetch);
  assert.deepEqual(bad, { ok: false, error: 'Template not approved', retryable: false });
});

test('delivery receipts are accepted only with Meta\'s signature', () => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'read', timestamp: '1763700000' }] } }] }] });
  const sig = 'sha256=' + createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, sig, 'secret'), true);
  assert.equal(verifyWebhookSignature(body, sig, 'other'), false);
  assert.equal(verifyWebhookSignature(body, null, 'secret'), false);
  assert.equal(deliveryUpdates(JSON.parse(body))[0]!.status, 'read');
});
