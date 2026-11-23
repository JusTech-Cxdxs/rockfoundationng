'use server';

import { headers } from 'next/headers';
import { prisma } from '@ejo/database';
import { isBookableJobType, normalisePhone } from '@ejo/utils/appointments';
import { clientIp } from '@/lib/customer-audit';
import { logCustomerError } from '@/lib/error-events';
import { currentCustomer } from '@/lib/customer-portal/session';
import { siteOrganisation } from '@/lib/enyo/settings';
import { BookingProblem, bookVisit } from '@/lib/booking';

export type BookingState = { ok: boolean; message: string; number?: string; when?: string } | null;

const hits = new Map<string, number[]>();
/** At most five bookings a quarter of an hour from one address. */
function tooMany(key: string): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < 15 * 60_000);
  list.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(key, list);
  return list.length > 5;
}

const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID = /^[a-z0-9]{20,40}$/;

/** Books a workshop visit: anyone on the website, or a signed-in customer with their vehicle. Front desk confirms it. */
export async function bookVisitAction(_prev: BookingState, f: FormData): Promise<BookingState> {
  // A form field people never see: filled in only by robots.
  if (text(f, 'website', 100)) return { ok: true, message: 'Thank you.' };
  const org = await siteOrganisation().catch(() => null);
  if (!org) return { ok: false, message: 'Booking is not available just now. Please call us.' };
  let ip: string | null = null;
  try { ip = clientIp(await headers()); } catch { ip = null; }
  if (ip && tooMany(`book:${ip}`)) return { ok: false, message: 'Please wait a few minutes, then try again, or call us.' };

  const jobType = String(f.get('jobType') ?? '');
  if (!isBookableJobType(jobType)) return { ok: false, message: 'Choose what the visit is for.' };
  const day = text(f, 'day', 10);
  const slot = text(f, 'slot', 5);
  const me = await currentCustomer().catch(() => null);
  const mine = me && me.organisationId === org.id ? me : null;
  const name = mine?.fullName ?? text(f, 'name', 120);
  if (name.length < 2) return { ok: false, message: 'Enter your name.' };
  const phone = normalisePhone(mine?.phone ?? text(f, 'phone', 20));
  if (!phone) return { ok: false, message: 'Enter a mobile number we can call, for example 0803 304 9194.' };
  const whatsappRaw = text(f, 'whatsapp', 20);
  const whatsappPhone = whatsappRaw ? normalisePhone(whatsappRaw) : null;
  if (whatsappRaw && !whatsappPhone) return { ok: false, message: 'That WhatsApp number does not look right.' };
  const email = mine?.email ?? (text(f, 'email', 160) || null);
  if (email && !EMAIL.test(email)) return { ok: false, message: 'That email address does not look right.' };
  const vehicleIdRaw = text(f, 'vehicleId', 40);
  const vehicle = mine && ID.test(vehicleIdRaw) ? await prisma.customerVehicle.findFirst({ where: { id: vehicleIdRaw, customerId: mine.id }, select: { id: true } }) : null;
  const vehicleText = vehicle ? null : text(f, 'vehicle', 120) || null;
  if (!vehicle && !vehicleText) return { ok: false, message: 'Tell us the vehicle: make and model, e.g. Toyota Corolla 2016.' };

  try {
    const r = await bookVisit({
      organisationId: org.id, jobType, day, slot, name, phone, whatsappPhone, email, vehicleText,
      plateNumber: vehicle ? null : text(f, 'plate', 20).toUpperCase() || null, note: text(f, 'note', 500) || null,
      customerId: mine?.id ?? null, vehicleId: vehicle?.id ?? null,
    });
    return { ok: true, message: `Thank you, ${name.split(' ')[0]}. Your booking ${r.number} for ${r.when} is with our front desk. We will confirm it by phone or WhatsApp.`, number: r.number, when: r.when };
  } catch (err) {
    if (err instanceof BookingProblem) return { ok: false, message: err.message };
    const ref = await logCustomerError('booking.create', err);
    return { ok: false, message: `That did not work just now. Please try again, or call us (reference ${ref}).` };
  }
}
