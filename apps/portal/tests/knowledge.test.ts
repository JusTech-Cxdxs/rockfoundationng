import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OLD_ORGANISATION } from './leftovers';
import { knownPeople, organisationKnowledge } from '../lib/enyo/knowledge';

test('the organisation background is found by slug or name, and nothing is claimed for an unknown organisation', () => {
  assert.ok(organisationKnowledge('dphoenix-autocare'));
  assert.ok(organisationKnowledge("D'Phoenix Autocare"));
  assert.ok(organisationKnowledge("D'PHOENIX AUTOCARE LIMITED"));
  assert.equal(organisationKnowledge('other-motors'), null);
  assert.equal(organisationKnowledge('another-organisation'), null, 'no other organisation\'s background');
  assert.equal(organisationKnowledge(null), null);
});

test('the background names nobody, carries no prices, and gives only the published contacts', () => {
  const k = organisationKnowledge('dphoenix-autocare')!;
  assert.deepEqual(k.people, [], 'no staff or founder names');
  assert.deepEqual(knownPeople(k, ['manager']), []);
  for (const f of k.facts) assert.doesNotMatch(f, /₦\s?\d/);
  const all = `${k.summary} ${k.facts.join(' ')}`;
  assert.match(all, /Restore Life To Your Vehicle/);
  assert.match(all, /\+234 811 496 6212/);
  assert.match(all, /Tire Services/);
  assert.doesNotMatch(all, OLD_ORGANISATION);
});
