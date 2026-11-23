/**
 * Workshop bookings: the pure rules (@ejo/utils/appointments) for open days,
 * slots, places, notice, reminders and missed bookings, and the wiring that
 * keeps them safe (capacity under a lock, every write fenced, the public
 * booking rate-limited).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addDays, appointmentSettings, bookingMessage, bookingWhen, DEFAULT_APPOINTMENT_SETTINGS, isNoShow, lagosDayOf, lagosInstant, normalisePhone, openDaysFrom, placesLeft, reminderDue, slotProblem, weekdayOf,
} from '@ejo/utils/appointments';
import { ROLE_GRANTS } from '../lib/authz/catalogue';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const S = DEFAULT_APPOINTMENT_SETTINGS;
// Monday 23/11/2026, 09:00 in Lagos.
const MON_9AM = new Date('2026-11-23T08:00:00Z');

test('Lagos days and weekdays (UTC+1 all year)', () => {
  assert.equal(lagosDayOf(new Date('2026-11-23T23:30:00Z')), '2026-11-24', '00:30 in Lagos is already the next day');
  assert.equal(weekdayOf('2026-11-23'), 1);
  assert.equal(weekdayOf('2026-11-29'), 7);
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(lagosInstant('2026-11-24', '10:00').toISOString(), '2026-11-24T09:00:00.000Z');
  assert.equal(bookingWhen('2026-11-24', '10:00'), 'Tuesday 24/11/2026, 10:00');
});

test('saved settings are checked; anything odd falls back to the default', () => {
  assert.deepEqual(appointmentSettings(null), S);
  const s = appointmentSettings({ openDays: [1, 9, 2, 2], slots: ['09:00', '25:00', 'x', '07:30'], capacity: { SERVICE: 3, SPRAYING: -1, CAR_WASH: 500 }, maxDaysAhead: 500, minHoursNotice: 4 });
  assert.deepEqual(s.openDays, [1, 2]);
  assert.deepEqual(s.slots, ['07:30', '09:00']);
  assert.equal(s.capacity.SERVICE, 3);
  assert.equal(s.capacity.SPRAYING, S.capacity.SPRAYING, 'a negative place count is ignored');
  assert.equal(s.capacity.CAR_WASH, S.capacity.CAR_WASH, 'more than 200 a day is ignored');
  assert.equal(s.maxDaysAhead, S.maxDaysAhead);
  assert.equal(s.minHoursNotice, 4);
});

test('a slot: open day, real slot, not in the past, not too far ahead, enough notice', () => {
  assert.equal(slotProblem(S, 'SERVICE', '2026-11-24', '10:00', MON_9AM), null);
  assert.match(slotProblem(S, 'SERVICE', '2026-11-29', '10:00', MON_9AM)!, /do not take bookings on that day/, 'Sunday is closed by default');
  assert.match(slotProblem(S, 'SERVICE', '2026-11-24', '11:00', MON_9AM)!, /times shown/);
  assert.match(slotProblem(S, 'SERVICE', '2026-11-20', '10:00', MON_9AM)!, /passed/);
  assert.match(slotProblem(S, 'SERVICE', addDays('2026-11-23', 31), '10:00', MON_9AM)!, /30 days ahead/);
  assert.match(slotProblem(S, 'SERVICE', '2026-11-23', '10:00', MON_9AM)!, /too soon/, 'one hour away, two hours notice needed');
  assert.equal(slotProblem(S, 'SERVICE', '2026-11-23', '12:00', MON_9AM), null);
  assert.match(slotProblem({ ...S, capacity: { ...S.capacity, SPRAYING: 0 } }, 'SPRAYING', '2026-11-24', '10:00', MON_9AM)!, /not booked online/);
  assert.match(slotProblem(S, 'SERVICE', '2026-13-45', '10:00', MON_9AM)!, /Choose a day/);
});

test('places left per day and kind of visit; the day list skips closed days and days with no slot left', () => {
  assert.equal(placesLeft(S, 'SPRAYING', 0), 2);
  assert.equal(placesLeft(S, 'SPRAYING', 5), 0);
  const days = openDaysFrom(S, 'SPRAYING', MON_9AM, { '2026-11-24': 2 });
  assert.equal(days[0]!.day, '2026-11-23', 'today still has later slots');
  assert.equal(days.find((d) => d.day === '2026-11-24')!.left, 0, 'full');
  assert.ok(!days.some((d) => weekdayOf(d.day) === 7), 'no Sundays');
  // At 15:00 on Monday, no Monday slot is far enough ahead.
  assert.equal(openDaysFrom(S, 'SERVICE', new Date('2026-11-23T14:00:00Z'), {})[0]!.day, '2026-11-24');
});

test('the day-before reminder: from 10:00 the day before, confirmed only, once, never after the slot', () => {
  const a = { status: 'CONFIRMED', day: '2026-11-25', slot: '10:00', reminderSentAt: null };
  assert.equal(reminderDue(a, new Date('2026-11-24T08:59:00Z')), false, '09:59 Lagos the day before');
  assert.equal(reminderDue(a, new Date('2026-11-24T09:00:00Z')), true, '10:00 Lagos the day before');
  assert.equal(reminderDue({ ...a, status: 'REQUESTED' }, new Date('2026-11-24T12:00:00Z')), false, 'not yet confirmed');
  assert.equal(reminderDue({ ...a, reminderSentAt: new Date() }, new Date('2026-11-24T12:00:00Z')), false, 'already sent');
  assert.equal(reminderDue(a, new Date('2026-11-25T09:30:00Z')), false, 'the slot has started');
  assert.equal(isNoShow({ status: 'CONFIRMED', day: '2026-11-24' }, new Date('2026-11-25T06:00:00Z')), true);
  assert.equal(isNoShow({ status: 'ARRIVED', day: '2026-11-24' }, new Date('2026-11-25T06:00:00Z')), false);
});

test('phones and messages', () => {
  assert.equal(normalisePhone('0803 304 9194'), '08033049194');
  assert.equal(normalisePhone('+234 803 304 9194'), '08033049194');
  assert.equal(normalisePhone('2348023891766'), '08023891766');
  assert.equal(normalisePhone('12'), null);
  const m = bookingMessage('CONFIRMED', { name: 'Tunde', number: 'APT-2026-000001', jobType: 'SERVICE', day: '2026-11-24', slot: '10:00', workshop: 'Rock Foundation Automobile', phone: '0803 304 9194' });
  assert.match(m, /^Hello Tunde, your service booking APT-2026-000001 at Rock Foundation Automobile is confirmed for Tuesday 24\/11\/2026, 10:00\./);
  assert.doesNotMatch(m, /!/);
});

test('who handles bookings: front desk manages, the supervisor sees, the technician and Store Keeper do not', () => {
  assert.ok('workshop.appointment.manage' in ROLE_GRANTS['front-desk']!);
  assert.ok('workshop.appointment.view' in ROLE_GRANTS['workshop-supervisor']!);
  assert.ok(!('workshop.appointment.manage' in ROLE_GRANTS['workshop-supervisor']!));
  for (const r of ['technician', 'store-keeper', 'security']) assert.ok(!('workshop.appointment.view' in (ROLE_GRANTS[r] ?? {})), r);
});

test('wiring: a place is claimed under the organisation lock; writes are fenced; the public form is rate-limited and has a robot trap', () => {
  const server = read('lib/appointments/server.ts');
  assert.match(server, /SELECT id FROM "organisations" WHERE id = \$\{organisationId\} FOR UPDATE/);
  assert.match(server, /if \(booked >= s\.capacity\[jobType\]\) throw new BookingError/);
  const site = read('../website/lib/booking.ts');
  assert.match(site, /FOR UPDATE/);
  assert.match(site, /if \(taken >= s\.capacity\[b\.jobType\]\)/);
  assert.match(site, /if \(open >= 3\) throw new BookingProblem/, 'one phone, three open bookings at most');
  const action = read('../website/app/book/actions.ts');
  assert.match(action, /if \(text\(f, 'website', 100\)\) return/, 'the hidden field robots fill');
  assert.match(action, /tooMany\(`book:\$\{ip\}`\)/);
  // A signed-in customer books only their own vehicles.
  assert.match(action, /prisma\.customerVehicle\.findFirst\(\{ where: \{ id: vehicleIdRaw, customerId: mine\.id \}/);
  const actions = read('lib/actions/appointments.ts');
  assert.match(actions, /prisma\.appointment\.findFirst\(\{ where: \{ id, organisationId \}/);
  // Opening the Job Card links only an open booking of this organisation.
  assert.match(read('lib/actions/workshop.ts'), /where: \{ id: input\.appointmentId, \.\.\.\(await orgWhere\(\)\), status: \{ in: \['REQUESTED', 'CONFIRMED'\] \}, jobCardId: null \}/);
});
