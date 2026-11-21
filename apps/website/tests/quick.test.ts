import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askedAbout, busyAnswer, cleanHistory, isGreeting, quickAnswer, type QuickInfo } from '../lib/enyo/quick-core';

const info: QuickInfo = {
  organisation: "D'Phoenix Autocare",
  assistantName: 'Enyo',
  headOffice: { address: 'Plot 1 Muri Okunola Street, Victoria Island, Lagos', phones: ['0811 496 6212'], email: 'info@example.com' },
};
const evening = new Date('2026-10-19T21:00:00Z'); // 10 pm Lagos

test('greetings are answered at once, by Lagos time; questions are not mistaken for greetings', () => {
  for (const g of ['Hi', 'hey Enyo', 'Hello there!', 'Good evening', 'hi again', 'How are you doing?', 'how far']) assert.equal(isGreeting(g), true, g);
  for (const q of ['Hi, who is Tunde Bakare?', 'hello I want to book a service', 'hey what services do you have']) assert.equal(isGreeting(q), false, q);
  assert.match(quickAnswer('Hey Enyo', info, evening)!, /^Good evening! I'm Enyo, D'Phoenix Autocare's assistant/);
  assert.doesNotMatch(quickAnswer('Hi', info)!, /offer|store|price/i, 'no store or offers on this site');
});

test('"who is" is left to the model: no staff list is published here', () => {
  for (const q of ["Hi who's Tunde Bakare", 'Who is Mr. Bakare?', 'Tell me about Tunde Bakare']) {
    assert.ok(askedAbout(q), q);
    assert.equal(quickAnswer(q, info), null, q);
  }
  assert.equal(askedAbout('who is the head of IT?'), null, 'a role, not a name');
});

test('how to reach us comes from the records; questions about a job do not', () => {
  assert.match(quickAnswer('What is your phone number?', info)!, /0811 496 6212[\s\S]*\[Customer support\]\(\/support\)/);
  assert.match(quickAnswer('Where is your office?', info)!, /\*\*Workshop:\*\* Plot 1 Muri Okunola Street/);
  assert.equal(quickAnswer('Any discount or financing offers?', info), null, 'no offers here: left to the model');
  assert.equal(quickAnswer('Can you call me about my car JC-2026-000001?', info), null);
  assert.equal(quickAnswer('My phone number is 0803 555 0101, please call me back', info), null, 'a visitor giving theirs is a hand-over');
  assert.equal(quickAnswer('[[tool:request_handover {"name":"Visitor","phone":"08035550102","consent":false}]]', info), null);
  assert.match(quickAnswer('How can I reach you?', info)!, /0811 496 6212/);
  assert.match(quickAnswer('Contact', info)!, /Customer support/);
  assert.equal(quickAnswer('Do you service Toyota cars?', info), null);
});

test('when the model is busy, the person still gets an answer: the records, or how to reach the team', () => {
  assert.match(busyAnswer('Who is Kunle Adeyemi?', info), /I don't have published details about Kunle Adeyemi[\s\S]*0811 496 6212/);
  assert.match(busyAnswer('Do you service Toyota cars?', info), /team can help straight away[\s\S]*Customer support/);
  assert.doesNotMatch(busyAnswer('anything', info), /try again in a minute|handling a lot/);
});

test('turns the model could not answer are left out of the history, with their question', () => {
  const busy = "I'm handling a lot of questions right now. Please try again in a minute.";
  const turns = [
    { role: 'user', content: 'Who is Tunde Bakare' }, { role: 'assistant', content: 'Workshop Manager.' },
    { role: 'user', content: "Who's Ngozi" }, { role: 'assistant', content: busy },
    { role: 'user', content: 'Who is Kunle' }, { role: 'assistant', content: busy },
    { role: 'user', content: 'Hi' },
  ];
  assert.deepEqual(cleanHistory(turns, [busy]).map((t) => t.content), ['Who is Tunde Bakare', 'Workshop Manager.', 'Hi']);
});
