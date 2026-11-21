/**
 * Support emails are read as text: the bracketed picture addresses that
 * HTML emails leave behind are dropped (lib/mail/parse-core.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBody, stripImageRefs } from '../lib/mail/parse-core';

test('text views drop the bracketed picture addresses that HTML emails leave behind', () => {
  assert.equal(stripImageRefs('Fleet Services [https://example.com/images/logo/logo.png]\nHello'), 'Fleet Services\nHello');
  assert.equal(stripImageRefs('See [cid:image001.png@01DA] here'), 'See here');
  assert.equal(stripImageRefs('Read the terms [https://x.example/terms]'), 'Read the terms [https://x.example/terms]');
  assert.equal(cleanBody('Logo [https://cdn.x/a.PNG?v=2]\r\nBody'), 'Logo\nBody');
});
