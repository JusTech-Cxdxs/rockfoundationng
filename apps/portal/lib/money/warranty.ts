/**
 * The workshop's warranty, pure (no database). The workshop guarantees its
 * own work for a time and/or a distance per job type ("whichever comes
 * first"), fixed on the Job Card when the vehicle is checked out; parts carry
 * their own warranty per line. A vehicle that comes back while a guarantee
 * runs is a comeback: put right under warranty, with the Owner's approval.
 */

export type WarrantyTerm = { days: number | null; km: number | null };
export type JobTypeKey = 'SERVICE' | 'REPAIR' | 'SERVICE_AND_REPAIR' | 'DIAGNOSTICS' | 'SPRAYING' | 'CAR_WASH';
export const WARRANTY_JOB_TYPES: JobTypeKey[] = ['SERVICE', 'REPAIR', 'SERVICE_AND_REPAIR', 'DIAGNOSTICS', 'SPRAYING', 'CAR_WASH'];

/** What a new workshop starts with (changed in Settings → Billing → Warranty). */
export const DEFAULT_WARRANTY: Record<JobTypeKey, WarrantyTerm> = {
  SERVICE: { days: 30, km: 1_000 },
  REPAIR: { days: 90, km: 5_000 },
  SERVICE_AND_REPAIR: { days: 90, km: 5_000 },
  DIAGNOSTICS: { days: null, km: null },
  SPRAYING: { days: 365, km: null },
  CAR_WASH: { days: null, km: null },
};

const DAY = 86_400_000;
const whole = (v: unknown, max: number): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
};

/** The organisation's stored terms (JSON) over the defaults; anything malformed falls back to the default for that job type. */
export function warrantyTerms(stored: unknown): Record<JobTypeKey, WarrantyTerm> {
  const out = { ...DEFAULT_WARRANTY };
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const k of WARRANTY_JOB_TYPES) {
      const t = (stored as Record<string, unknown>)[k];
      if (t && typeof t === 'object') {
        const o = t as Record<string, unknown>;
        out[k] = { days: whole(o.days, 3650), km: whole(o.km, 500_000) };
      }
    }
  }
  return out;
}

/** Terms from the Settings form (`days_SERVICE`, `km_SERVICE`, …): blank = none; otherwise whole numbers in range. */
export function parseWarrantyForm(get: (name: string) => unknown): Record<JobTypeKey, WarrantyTerm> | string {
  const out = {} as Record<JobTypeKey, WarrantyTerm>;
  for (const k of WARRANTY_JOB_TYPES) {
    const rawDays = String(get(`days_${k}`) ?? '').trim();
    const rawKm = String(get(`km_${k}`) ?? '').trim();
    const days = whole(rawDays, 3650);
    const km = whole(rawKm, 500_000);
    if (rawDays && days === null) return 'Enter the guarantee in whole days, up to 3,650 (10 years), or leave it blank.';
    if (rawKm && km === null) return 'Enter the distance in whole kilometres, up to 500,000, or leave it blank.';
    out[k] = { days, km };
  }
  return out;
}

/** The guarantee a job gets at checkout: until a date (days from checkout) and/or a mileage (km from the check-in reading). */
export function guaranteeAtCheckout(term: WarrantyTerm, checkedOutAt: Date, mileageAtCheckIn: number | null | undefined): { until: Date | null; untilKm: number | null } {
  const until = term.days ? new Date(+checkedOutAt + term.days * DAY) : null;
  const untilKm = term.km && mileageAtCheckIn !== null && mileageAtCheckIn !== undefined ? mileageAtCheckIn + term.km : null;
  return { until, untilKm };
}

/**
 * Whether a guarantee still runs: whichever comes first. Past its date, or
 * past its mileage when today's reading is known, it has ended. A guarantee
 * with neither (a car wash) never runs.
 */
export function guaranteeRuns(g: { warrantyUntil: Date | null; warrantyUntilKm: number | null }, now: Date, mileageNow?: number | null): boolean {
  if (!g.warrantyUntil && g.warrantyUntilKm === null) return false;
  if (g.warrantyUntil && +g.warrantyUntil < +now) return false;
  if (g.warrantyUntilKm !== null && mileageNow !== null && mileageNow !== undefined && mileageNow > g.warrantyUntilKm) return false;
  // Only a distance and no reading today: it runs until the reading says otherwise.
  return true;
}

export type PastJob = { id: string; jobNumber: string; jobType: string; checkedOutAt: Date | null; warrantyUntil: Date | null; warrantyUntilKm: number | null; status: string };

/** The vehicle's jobs whose guarantee still runs, newest first: what a new visit may be a comeback on. */
export function comebackCandidates(jobs: readonly PastJob[], now: Date, mileageNow?: number | null): PastJob[] {
  return jobs
    .filter((j) => j.status === 'CHECKED_OUT' && j.checkedOutAt && guaranteeRuns(j, now, mileageNow))
    .sort((a, b) => +(b.checkedOutAt ?? 0) - +(a.checkedOutAt ?? 0));
}

const nf = (n: number) => n.toLocaleString('en-NG');
const period = (days: number) => (days % 365 === 0 ? `${days / 365} ${days === 365 ? 'year' : 'years'}` : days % 30 === 0 && days >= 60 ? `${days / 30} months` : `${days} ${days === 1 ? 'day' : 'days'}`);

/** "90 days or 5,000 km, whichever comes first" · "12 months" · "No guarantee". */
export function termText(t: WarrantyTerm): string {
  if (t.days && t.km) return `${period(t.days)} or ${nf(t.km)} km, whichever comes first`;
  if (t.days) return period(t.days);
  if (t.km) return `${nf(t.km)} km`;
  return 'No guarantee';
}

/** A part's warranty on the invoice: "6 months or 10,000 km, whichever comes first". */
export function partWarrantyText(months: number | null | undefined, km: number | null | undefined): string | null {
  if (!months && !km) return null;
  const m = months ? `${months} ${months === 1 ? 'month' : 'months'}` : null;
  if (m && km) return `${m} or ${nf(km)} km, whichever comes first`;
  return m ?? `${nf(km!)} km`;
}

/** The guarantee as fixed on a Job Card, in words: "until 21/02/2027 or 66,250 km, whichever comes first". */
export function guaranteeText(g: { warrantyUntil: Date | null; warrantyUntilKm: number | null }): string | null {
  const d = g.warrantyUntil ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: '2-digit', year: 'numeric' }).format(g.warrantyUntil) : null;
  if (d && g.warrantyUntilKm !== null) return `until ${d} or ${nf(g.warrantyUntilKm)} km, whichever comes first`;
  if (d) return `until ${d}`;
  if (g.warrantyUntilKm !== null) return `until ${nf(g.warrantyUntilKm)} km`;
  return null;
}

/** A line's parts warranty from the form: months 1–120, km 1–500,000, both optional. */
export function parsePartWarranty(monthsRaw: unknown, kmRaw: unknown): { months: number | null; km: number | null } | string {
  const ms = String(monthsRaw ?? '').trim();
  const ks = String(kmRaw ?? '').trim();
  const months = whole(ms, 120);
  const km = whole(ks, 500_000);
  if (ms && months === null) return 'Enter the warranty in whole months, 1 to 120.';
  if (ks && km === null) return 'Enter the warranty distance in whole kilometres.';
  return { months, km };
}

/** Comebacks as a share of finished jobs, to one decimal place (null with no finished jobs). */
export function comebackRate(comebacks: number, finished: number): number | null {
  return finished > 0 ? Math.round((comebacks / finished) * 1000) / 10 : null;
}

// ─────────────────────────────────────────────── claims to suppliers

export type ClaimStatus = 'OPEN' | 'SUBMITTED' | 'SETTLED' | 'REJECTED';
export const CLAIM_LABEL: Record<ClaimStatus, string> = { OPEN: 'Recorded', SUBMITTED: 'Sent to the supplier', SETTLED: 'Settled', REJECTED: 'Refused by the supplier' };

/** Where a claim may go next: sent, then settled or refused (a claim can be settled or refused before it is formally sent). */
export function claimNext(status: string): ClaimStatus[] {
  if (status === 'OPEN') return ['SUBMITTED', 'SETTLED', 'REJECTED'];
  if (status === 'SUBMITTED') return ['SETTLED', 'REJECTED'];
  return [];
}

/** A new claim from the form: what failed, how many, what we ask back. */
export function checkClaim(input: { partName: unknown; supplierName: unknown; quantity: unknown; amountClaimed: unknown; fault: unknown }):
  { partName: string; supplierName: string; quantity: number; amountClaimed: number; fault: string } | string {
  const t = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const partName = t(input.partName, 120);
  const supplierName = t(input.supplierName, 120);
  const fault = t(input.fault, 1000);
  const quantity = Number(String(input.quantity ?? '1').trim() || '1');
  const amount = Number(String(input.amountClaimed ?? '').replace(/[₦,\s]/g, ''));
  if (partName.length < 2) return 'Enter the part that failed.';
  if (supplierName.length < 2) return 'Choose or enter the supplier.';
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return 'Enter how many, as a whole number.';
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) return 'Enter what the part cost us, in naira.';
  if (fault.length < 5) return 'Say what went wrong with the part.';
  return { partName, supplierName, quantity, amountClaimed: Math.round(amount * 100) / 100, fault };
}

/** Settling: what the supplier gave back (credit, refund or the value of a replacement), up to what was claimed. */
export function checkRecovered(raw: unknown, claimed: number): number | string {
  const n = Number(String(raw ?? '').replace(/[₦,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return 'Enter what the supplier gave back, in naira (0 if nothing).';
  if (n > claimed + 0.004) return 'What came back cannot be more than what was claimed.';
  return Math.round(n * 100) / 100;
}
