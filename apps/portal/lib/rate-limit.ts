/**
 * Per-instance rate limits: a second line of defence against a burst of
 * requests (sign-in, mail servers and the model have their own). Server-only.
 */
const hits = new Map<string, number[]>();

/** True while `key` has been used fewer than `max` times in the last `windowMs`; counts this use. */
export function withinLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(key, list);
  return true;
}
