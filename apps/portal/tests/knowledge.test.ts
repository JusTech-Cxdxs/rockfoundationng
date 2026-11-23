import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OLD_ORGANISATION } from './leftovers';
import { knownPeople, organisationKnowledge } from '../lib/enyo/knowledge';

test('the organisation background is found by slug or name, and nothing is claimed for an unknown organisation', () => {
  assert.ok(organisationKnowledge('rock-foundation'));
  assert.ok(organisationKnowledge('Rock Foundation Automobile'));
  assert.ok(organisationKnowledge('ROCK FOUNDATION AUTOMOBILE INVESTMENT LTD'));
  assert.equal(organisationKnowledge('other-motors'), null);
  assert.equal(organisationKnowledge('another-organisation'), null, 'no other organisation\'s background');
  assert.equal(organisationKnowledge(null), null);
});

test('the background names nobody, carries no prices, and gives only the published contacts', () => {
  const k = organisationKnowledge('rock-foundation')!;
  assert.deepEqual(k.people, [], 'no staff or founder names');
  assert.deepEqual(knownPeople(k, ['manager']), []);
  for (const f of k.facts) assert.doesNotMatch(f, /₦\s?\d/);
  const all = `${k.summary} ${k.facts.join(' ')}`;
  assert.match(all, /Trust your vehicle to the certified service experts/);
  assert.match(all, /RC 1772429/);
  assert.match(all, /\+234 803 304 9194/);
  assert.match(all, /\+234 802 389 1766/);
  assert.match(all, /spray booth/);
  assert.match(all, /https:\/\/rockfoundationng\.com/);
  assert.doesNotMatch(all, /@/, 'no email address is published, so none is claimed');
  assert.doesNotMatch(all, OLD_ORGANISATION);
});
