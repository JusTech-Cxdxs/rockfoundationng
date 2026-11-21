import type { Prisma } from '@ejo/database';

/**
 * ONE definition of "the vehicle is still physically with us", shared by the
 * main dashboard, the custody pages and the Security dashboard — so the
 * numbers on different screens can never quietly disagree.
 *
 * A Job Card is inside until it is checked out at the gate — a cancelled
 * Job Card whose vehicle has not been collected is still inside.
 */
export function jobCardInside(): Prisma.JobCardWhereInput {
  return { status: { not: 'CHECKED_OUT' } };
}

/** Active work (being worked on — not cancelled, not yet out). */
export function jobCardActive(): Prisma.JobCardWhereInput {
  return { status: { notIn: ['CHECKED_OUT', 'CANCELLED'] } };
}
