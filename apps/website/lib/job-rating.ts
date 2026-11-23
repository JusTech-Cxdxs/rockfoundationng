/**
 * "How did we do?" on the customer website: the signed link (/rate/<token>)
 * a customer gets by email or WhatsApp after collecting their vehicle. The
 * token is "<rating id>.<HMAC of the id>" made by the staff portal with the
 * shared BETTER_AUTH_SECRET (apps/portal/lib/customer-care/rules.ts,
 * ratingToken: a unit test keeps the two in step). Opening the page changes
 * nothing; the answer is saved once. A low score is turned into a complaint
 * and a callback by the staff portal's next run, so this side stays small.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@ejo/database';

const secret = () => process.env.BETTER_AUTH_SECRET ?? '';

/** The rating id a token stands for, or null when it was not made with this deployment's secret. */
export function ratingIdFromToken(token: unknown, key: string = secret()): string | null {
  if (typeof token !== 'string' || !/^[a-z0-9]{20,40}\.[A-Za-z0-9_-]{32}$/.test(token) || !key) return null;
  const id = token.slice(0, token.indexOf('.'));
  const sig = createHmac('sha256', key).update(`job-rating:${id}`, 'utf8').digest('base64url').slice(0, 32);
  const expected = Buffer.from(`${id}.${sig}`);
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

type RatingJob = { workshop: string; jobNumber: string; vehicle: string };
export type RatingView =
  | { state: 'invalid' }
  | { state: 'expired' }
  | ({ state: 'open'; score: null } & RatingJob)
  | ({ state: 'answered'; score: number | null } & RatingJob);

export async function viewRating(token: string, now: Date = new Date()): Promise<RatingView> {
  const id = ratingIdFromToken(token);
  if (!id) return { state: 'invalid' };
  const r = await prisma.jobRating.findUnique({
    where: { id },
    select: { score: true, respondedAt: true, expiresAt: true, organisationId: true, jobCard: { select: { jobNumber: true, vehicle: { select: { make: true, model: true, plateNumber: true } } } } },
  });
  if (!r) return { state: 'invalid' };
  const org = await prisma.organisation.findUnique({ where: { id: r.organisationId }, select: { name: true } });
  const v = r.jobCard.vehicle;
  const base = { workshop: org?.name ?? 'the workshop', jobNumber: r.jobCard.jobNumber, vehicle: `${[v.make, v.model].filter(Boolean).join(' ') || 'Your vehicle'}${v.plateNumber ? ` (${v.plateNumber})` : ''}` };
  if (r.respondedAt) return { state: 'answered', ...base, score: r.score };
  if (r.expiresAt.getTime() < now.getTime()) return { state: 'expired' };
  return { state: 'open', ...base, score: null };
}

/** Saves the answer once (compare-and-set on respondedAt). */
export async function answerRating(token: string, scoreRaw: unknown, commentRaw: unknown, now: Date = new Date()): Promise<'saved' | 'already' | 'invalid' | 'expired' | 'bad-score'> {
  const id = ratingIdFromToken(token);
  if (!id) return 'invalid';
  const score = Number(scoreRaw);
  if (!Number.isInteger(score) || score < 1 || score > 5) return 'bad-score';
  const comment = String(commentRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000) || null;
  const r = await prisma.jobRating.findUnique({ where: { id }, select: { respondedAt: true, expiresAt: true } });
  if (!r) return 'invalid';
  if (r.respondedAt) return 'already';
  if (r.expiresAt.getTime() < now.getTime()) return 'expired';
  const saved = await prisma.jobRating.updateMany({ where: { id, respondedAt: null }, data: { score, comment, respondedAt: now } });
  return saved.count ? 'saved' : 'already';
}
