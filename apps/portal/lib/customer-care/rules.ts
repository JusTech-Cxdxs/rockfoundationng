/**
 * Customer care rules (pure: no database). Complaints are support tickets of
 * kind COMPLAINT; the callback list is FollowUp; "How did we do?" is
 * JobRating. Everything here is plain data and plain dates in Lagos time, so
 * it can be unit-tested and used on the server and in the browser.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const COMPLAINT_CATEGORIES = [
  { key: 'WORKMANSHIP', label: 'Quality of the work', hint: 'The fault came back, or the work was not done well.' },
  { key: 'DELAY', label: 'Delay', hint: 'The vehicle was not ready when promised.' },
  { key: 'PRICE', label: 'Price or bill', hint: 'The bill was higher than expected, or a charge is not clear.' },
  { key: 'PARTS', label: 'Parts', hint: 'A wrong, faulty or missing part.' },
  { key: 'STAFF', label: 'Staff attitude', hint: 'How the customer was treated.' },
  { key: 'COMMUNICATION', label: 'Communication', hint: 'The customer was not kept informed.' },
  { key: 'DAMAGE', label: 'Damage or missing items', hint: 'Damage to the vehicle, or items missing from it.' },
  { key: 'OTHER', label: 'Something else', hint: '' },
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number]['key'];
export const isComplaintCategory = (v: unknown): v is ComplaintCategory => COMPLAINT_CATEGORIES.some((c) => c.key === v);
export const complaintCategoryLabel = (v: string | null | undefined): string => COMPLAINT_CATEGORIES.find((c) => c.key === v)?.label ?? 'Not given';

/** Where a complaint came in, as front desk logs it. */
export const COMPLAINT_CHANNELS = [
  { key: 'WALK_IN', label: 'At the front desk' },
  { key: 'PHONE', label: 'Phone call' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'STAFF', label: 'Other (logged by staff)' },
] as const;
export type ComplaintChannel = (typeof COMPLAINT_CHANNELS)[number]['key'];
export const isComplaintChannel = (v: unknown): v is ComplaintChannel => COMPLAINT_CHANNELS.some((c) => c.key === v);

/** How serious a complaint is, as the support centre's priority. */
export const COMPLAINT_SEVERITY = [
  { key: 'NORMAL', label: 'Normal' },
  { key: 'HIGH', label: 'Serious' },
  { key: 'URGENT', label: 'Urgent (customer very unhappy, or safety)' },
] as const;

export const FOLLOW_UP_REASONS = {
  AFTER_JOB: 'After the job: is all well?',
  CALLBACK: 'Customer asked for a call',
  SERVICE_DUE: 'Service due',
  BIRTHDAY: 'Birthday',
  COMPLAINT: 'About a complaint',
  LOW_RATING: 'Low rating: call to put it right',
  OTHER: 'Other',
} as const;
export type FollowUpReason = keyof typeof FOLLOW_UP_REASONS;
export const isFollowUpReason = (v: unknown): v is FollowUpReason => typeof v === 'string' && v in FOLLOW_UP_REASONS;
/** The reasons front desk adds by hand (the others are made for them). */
export const MANUAL_FOLLOW_UP_REASONS: FollowUpReason[] = ['CALLBACK', 'COMPLAINT', 'OTHER'];

export type FollowUpStatus = 'OPEN' | 'DONE' | 'NO_ANSWER' | 'CANCELLED';
export const FOLLOW_UP_STATUS_LABEL: Record<FollowUpStatus, string> = { OPEN: 'To do', DONE: 'Done', NO_ANSWER: 'No answer', CANCELLED: 'Cancelled' };

/** After this many unanswered tries the call is closed as "No answer". */
export const MAX_ATTEMPTS = 3;

/** A rating of 3 or less is unhappy: it opens a complaint and a callback. */
export const LOW_RATING = 3;
export const isLowRating = (score: number | null | undefined): boolean => typeof score === 'number' && score >= 1 && score <= LOW_RATING;
export const RATING_WORDS: Record<number, string> = { 1: 'Very poor', 2: 'Poor', 3: 'Okay', 4: 'Good', 5: 'Excellent' };
/** How long a "How did we do?" link works. */
export const RATING_LINK_DAYS = 30;

export const isScore = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5;

// ─────────────────────────────────────────────────────────── Lagos dates

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // Africa/Lagos is UTC+1 all year (no daylight saving).

/** The Lagos calendar day of an instant, as YYYY-MM-DD. */
export function lagosDay(d: Date): string {
  return new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** That Lagos day (YYYY-MM-DD) at a Lagos clock time, as an instant. */
export function lagosAt(day: string, hour: number, minute = 0): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) + (hour * 60 + minute) * 60_000 - LAGOS_OFFSET_MS);
}

/** n Lagos days after an instant's day, at a given Lagos hour. */
export function lagosDaysLater(from: Date, days: number, hour: number): Date {
  const base = Date.parse(`${lagosDay(from)}T00:00:00Z`) + days * 86_400_000;
  return lagosAt(new Date(base).toISOString().slice(0, 10), hour);
}

/** The "after the job" call: two days after the vehicle was collected, at 10:00 in Lagos. */
export const afterJobDueAt = (checkedOutAt: Date): Date => lagosDaysLater(checkedOutAt, 2, 10);

/** Where a callback sits on the list for today (Lagos days). */
export function followUpBucket(dueAt: Date, now: Date): 'overdue' | 'today' | 'upcoming' {
  const due = lagosDay(dueAt);
  const today = lagosDay(now);
  if (due < today) return 'overdue';
  if (due === today) return dueAt.getTime() < now.getTime() - 2 * 3_600_000 ? 'overdue' : 'today';
  return 'upcoming';
}

/** "No answer": try again tomorrow at the same Lagos hour, until the last try. */
export function nextTry(now: Date, attemptsSoFar: number): { closeAsNoAnswer: boolean; dueAt: Date } {
  const attempts = attemptsSoFar + 1;
  const hour = Number(new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(11, 13));
  return { closeAsNoAnswer: attempts >= MAX_ATTEMPTS, dueAt: lagosDaysLater(now, 1, Math.min(Math.max(hour, 9), 17)) };
}

// ─────────────────────────────────────────────────────────── birthdays

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** "14/02" or "14/2" → { day: 14, month: 2 }; empty → null; anything else → an error message. */
export function parseBirthday(input: string): { day: number; month: number } | null | string {
  const v = input.trim();
  if (!v) return null;
  const m = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})$/.exec(v);
  if (!m) return 'Write the birthday as day/month, for example 14/02.';
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > MONTH_DAYS[month - 1]!) return 'That day and month do not exist.';
  return { day, month };
}

export const birthdayText = (day: number | null | undefined, month: number | null | undefined): string | null =>
  day && month ? `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}` : null;

/** Whose birthday is on this Lagos day (29 February birthdays are called on 28 February in other years). */
export function isBirthdayOn(day: number, month: number, lagosDate: string): boolean {
  const [y, mo, d] = lagosDate.split('-').map(Number) as [number, number, number];
  if (day === d && month === mo) return true;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return !leap && day === 29 && month === 2 && mo === 2 && d === 28;
}

// ─────────────────────────────────────────────────────────── dedupe keys

export const dedupe = {
  afterJob: (jobCardId: string) => `after-job:${jobCardId}`,
  birthday: (customerId: string, year: string) => `birthday:${customerId}:${year}`,
  serviceDue: (vehicleId: string, dueDay: string) => `service-due:${vehicleId}:${dueDay}`,
  lowRating: (ratingId: string) => `low-rating:${ratingId}`,
};

// ─────────────────────────────────────────────────────────── rating links

/**
 * The rating link's token: "<rating id>.<signature>", where the signature is
 * an HMAC-SHA256 of the id with the deployment's secret. Nothing secret is
 * stored, the same link can be sent again, and a link cannot be made for
 * another rating without the secret.
 */
export function ratingToken(ratingId: string, secret: string): string {
  return `${ratingId}.${createHmac('sha256', secret).update(`job-rating:${ratingId}`, 'utf8').digest('base64url').slice(0, 32)}`;
}

/** The rating id a token stands for, or null when it was not made with this secret. */
export function ratingIdFromToken(token: unknown, secret: string): string | null {
  if (typeof token !== 'string' || !/^[a-z0-9]{20,40}\.[A-Za-z0-9_-]{32}$/.test(token) || !secret) return null;
  const id = token.slice(0, token.indexOf('.'));
  const expected = Buffer.from(ratingToken(id, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

/** The customer's "How did we do?" message (WhatsApp or email body). */
export function ratingMessage(o: { customerName: string; organisation: boolean; vehicle: string; jobNumber: string; link: string; workshop: string }): string {
  const first = o.organisation ? o.customerName.trim() : o.customerName.trim().split(/\s+/)[0] ?? '';
  return [
    `Hello${first ? ` ${first}` : ''},`,
    `Thank you for bringing your ${o.vehicle} to ${o.workshop} (job ${o.jobNumber}).`,
    'How did we do? It takes ten seconds:',
    o.link,
    'Your answer goes straight to our management.',
  ].join('\n');
}

/** The WhatsApp message front desk sends for a callback, by reason (they can edit it before sending). */
export function callbackMessage(o: { reason: FollowUpReason; customerName: string; organisation: boolean; workshop: string; vehicle?: string | null }): string {
  const first = o.organisation ? o.customerName.trim() : o.customerName.trim().split(/\s+/)[0] ?? '';
  const hello = `Hello${first ? ` ${first}` : ''}, this is ${o.workshop}.`;
  const v = o.vehicle ? ` your ${o.vehicle}` : ' your vehicle';
  switch (o.reason) {
    case 'AFTER_JOB': return `${hello} We are checking that${v} is running well since you collected it. Is everything all right?`;
    case 'SERVICE_DUE': return `${hello}${v.charAt(0).toUpperCase()}${v.slice(1)} is due for service soon. Would you like us to book you in? Reply with a day that suits you.`;
    case 'BIRTHDAY': return `${hello} Happy birthday! Thank you for trusting us with${v}. Have a wonderful day.`;
    case 'LOW_RATING': return `${hello} Thank you for your feedback. We are sorry the service was not what you expected. When is a good time to call you so we can put it right?`;
    case 'COMPLAINT': return `${hello} We are following up on the concern you raised. When is a good time to call you?`;
    default: return `${hello} You asked us to get back to you. When is a good time to talk?`;
  }
}
