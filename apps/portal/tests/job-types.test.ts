import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIn, fuelLevelLabel, isServiceType, jobTypeLabel, JOB_TYPES, sprayPanelLabels } from '../lib/workshop/job-types';

test('six kinds of visit; service and service-and-repair start the next-service count', () => {
  assert.deepEqual(JOB_TYPES.map((t) => t.key), ['SERVICE', 'REPAIR', 'SERVICE_AND_REPAIR', 'DIAGNOSTICS', 'SPRAYING', 'CAR_WASH']);
  assert.equal(isServiceType('SERVICE'), true);
  assert.equal(isServiceType('SERVICE_AND_REPAIR'), true);
  assert.equal(isServiceType('CAR_WASH'), false);
  assert.equal(jobTypeLabel('DIAGNOSTICS'), 'Diagnostics');
});

test('a repair needs a reason; a service needs the mileage and writes its own reason', () => {
  assert.match(String(checkIn({ jobType: 'REPAIR', complaints: [] })), /at least one reason/);
  assert.match(String(checkIn({ jobType: 'SERVICE', complaints: [] })), /mileage/);
  const s = checkIn({ jobType: 'SERVICE', complaints: [], mileageAtCheckIn: 48210, fuelLevel: 4 });
  assert.equal(typeof s, 'object');
  if (typeof s === 'object') { assert.deepEqual(s.complaints, ['Routine service']); assert.equal(s.isService, true); assert.equal(fuelLevelLabel(s.fuelLevel), 'Half'); }
});

test('spraying needs a colour and panels; a full respray replaces single panels', () => {
  assert.match(String(checkIn({ jobType: 'SPRAYING', complaints: [], sprayPanels: ['BONNET'] })), /colour/);
  assert.match(String(checkIn({ jobType: 'SPRAYING', complaints: [], sprayColour: 'Pearl white' })), /panels/);
  const s = checkIn({ jobType: 'SPRAYING', complaints: [], sprayColour: 'Pearl white', sprayColourCode: '070', sprayPanels: ['BONNET', 'FULL_BODY', 'NOT_A_PANEL'] });
  assert.equal(typeof s, 'object');
  if (typeof s === 'object') { assert.deepEqual(s.sprayPanels, ['FULL_BODY']); assert.match(s.complaints[0]!, /Full body respray in Pearl white/); }
  assert.deepEqual(sprayPanelLabels(['ROOF']), ['Roof']);
});

test('car wash: the quick check-in needs only the package', () => {
  assert.match(String(checkIn({ jobType: 'CAR_WASH', complaints: [] })), /package/);
  const s = checkIn({ jobType: 'CAR_WASH', complaints: [], washPackage: 'FULL' });
  assert.equal(typeof s, 'object');
  if (typeof s === 'object') { assert.deepEqual(s.complaints, ['Car wash: Full wash (inside and out)']); assert.equal(s.isService, false); }
});

test('junk is refused: unknown type, fuel off the gauge, very long reasons', () => {
  assert.equal(typeof checkIn({ jobType: 'PLANT', complaints: ['x'] }), 'string');
  assert.match(String(checkIn({ jobType: 'REPAIR', complaints: ['Noise'], fuelLevel: 9 })), /fuel/);
  assert.match(String(checkIn({ jobType: 'REPAIR', complaints: ['x'.repeat(501)] })), /500/);
});
