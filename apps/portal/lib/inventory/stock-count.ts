/**
 * Stock counts: what the shelf holds against what the system holds. Pure, so
 * the count form, the server and the tests agree on the differences, the
 * reasons they need and what approving them will do.
 */

export type CountPart = { id: string; name: string; trackingType: 'QUANTITY' | 'BATCH' | 'SERIALIZED'; baseUnitOfMeasure: string; onHand: number; reserved: number };
export type CountInput = { partId: string; counted: number | string | null | undefined; reason?: string | null };
export type CountedLine = { partId: string; systemQuantity: number; countedQuantity: number; difference: number; reason: string | null };

/** Why a difference happened: offered on the form; "Other" asks for words. */
export const COUNT_REASONS = ['Damaged', 'Expired', 'Lost or missing', 'Found on the shelf', 'Not recorded when received', 'Not recorded when issued', 'Other'] as const;

export const MAX_COUNT_LINES = 300;

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const EPS = 1e-9;

/**
 * The lines of a count. Parts left blank are not counted; serial-tracked
 * parts are counted by their serial numbers on the part's page, not here.
 * A string is the reason the count cannot be sent.
 */
export function checkCount(parts: Map<string, CountPart>, inputs: CountInput[]): CountedLine[] | string {
  const out: CountedLine[] = [];
  const seen = new Set<string>();
  for (const i of inputs) {
    if (i.counted === null || i.counted === undefined || String(i.counted).trim() === '') continue;
    const part = parts.get(i.partId);
    if (!part) return 'One of the parts is no longer in the catalogue. Refresh the page and count again.';
    if (seen.has(part.id)) return `${part.name} is counted twice.`;
    seen.add(part.id);
    if (part.trackingType === 'SERIALIZED') return `${part.name} is counted by its serial numbers, not here.`;
    const counted = round4(Number(i.counted));
    if (!Number.isFinite(counted) || counted < 0) return `Enter what is on the shelf for ${part.name} (0 or more).`;
    const difference = round4(counted - part.onHand);
    const reason = String(i.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || null;
    if (Math.abs(difference) > EPS && (!reason || reason.length < 3)) return `Say why ${part.name} is ${difference < 0 ? 'short' : 'over'} by ${Math.abs(difference).toLocaleString('en-NG')} ${part.baseUnitOfMeasure}.`;
    // Stock kept for a job cannot be counted away: those parts are promised.
    if (counted < part.reserved - EPS) return `${part.name}: ${part.reserved.toLocaleString('en-NG')} ${part.baseUnitOfMeasure} are kept for jobs, so the shelf cannot hold fewer. Check the parts requests first.`;
    out.push({ partId: part.id, systemQuantity: round4(part.onHand), countedQuantity: counted, difference, reason: Math.abs(difference) > EPS ? reason : null });
  }
  if (out.length === 0) return 'Count at least one part.';
  if (out.length > MAX_COUNT_LINES) return `A count holds up to ${MAX_COUNT_LINES} parts. Count the rest separately.`;
  return out;
}

/** Whether anything needs the Owner: any line with a difference. */
export const hasDifference = (lines: Pick<CountedLine, 'difference'>[]) => lines.some((l) => Math.abs(l.difference) > EPS);

export type Adjustment = { partId: string; change: number };

/**
 * What approving moves, given the stock now: each difference as recorded
 * (the shelf was short or over by that much when counted). A shortfall can
 * only take stock that is not kept for a job; if that is no longer there
 * (it was sold or issued since), the count must be done again.
 */
export function planAdjustments(lines: Pick<CountedLine, 'partId' | 'difference'>[], now: Map<string, { name: string; onHand: number; reserved: number }>): Adjustment[] | string {
  const out: Adjustment[] = [];
  for (const l of lines) {
    if (Math.abs(l.difference) <= EPS) continue;
    const s = now.get(l.partId);
    if (!s) return 'A counted part is no longer in the catalogue. Reject this count and count again.';
    if (l.difference < 0 && s.onHand - s.reserved + l.difference < -EPS) {
      return `${s.name} has moved since it was counted: the shortfall is more than the stock free to adjust. Reject this count and count again.`;
    }
    out.push({ partId: l.partId, change: round4(l.difference) });
  }
  return out;
}

/** How a count's status reads on screen. */
export const COUNT_STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'Waiting for the Owner',
  NO_DIFFERENCE: 'Matched the system',
  APPROVED: 'Approved: stock adjusted',
  REJECTED: 'Rejected: count again',
};
