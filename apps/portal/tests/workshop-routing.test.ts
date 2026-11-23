import { test } from 'node:test';
import assert from 'node:assert/strict';
import { departmentSlugFor, WORK_DEPARTMENTS, WORKSHOP_SLUG } from '../lib/workshop/routing';
import { SYSTEM_DEPARTMENT_SLUGS } from '../lib/structure-rules';

test('a Job Card is filed under the department that does the work', () => {
  assert.equal(departmentSlugFor('SERVICE'), 'mechanical');
  assert.equal(departmentSlugFor('REPAIR'), 'mechanical');
  assert.equal(departmentSlugFor('SERVICE_AND_REPAIR'), 'mechanical');
  assert.equal(departmentSlugFor('DIAGNOSTICS'), 'electrical');
  assert.equal(departmentSlugFor('SPRAYING'), 'body-spray');
  assert.equal(departmentSlugFor('CAR_WASH'), 'car-wash');
});

test('unknown or missing work is mechanical work', () => {
  assert.equal(departmentSlugFor(undefined), 'mechanical');
  assert.equal(departmentSlugFor(null), 'mechanical');
  assert.equal(departmentSlugFor('SOMETHING_ELSE'), 'mechanical');
  assert.equal(departmentSlugFor('constructor'), 'mechanical');
});

test('every routed department, and the Workshop it falls back to, is a protected system department', () => {
  for (const d of WORK_DEPARTMENTS) assert.ok(SYSTEM_DEPARTMENT_SLUGS.has(d.slug), d.slug);
  assert.ok(SYSTEM_DEPARTMENT_SLUGS.has(WORKSHOP_SLUG));
  assert.ok(!SYSTEM_DEPARTMENT_SLUGS.has('workshop-passenger'));
  assert.ok(!SYSTEM_DEPARTMENT_SLUGS.has('workshop-commercial'));
});
