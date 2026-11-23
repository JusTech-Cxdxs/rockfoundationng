/**
 * The small pieces of an automatic WhatsApp message (pure): the record
 * ("Job Card JC-2026-000123"), the vehicle with its plate, what the visit is
 * for, money as ₦12,345.00 and dates as DD/MM/YYYY in Lagos — the same
 * words as the click-to-send messages (lib/whatsapp-messages).
 */
import { nairaText } from '../whatsapp-messages';
import { isJobType, type JobType } from '../workshop/job-types';

export { nairaText, vehicleText } from '../whatsapp-messages';

/** "Job Card JC-2026-000123" */
export const jobRecord = (jobNumber: string) => `Job Card ${jobNumber}`;
const VISIT: Record<JobType, string> = {
  SERVICE: 'a service',
  REPAIR: 'a repair',
  SERVICE_AND_REPAIR: 'a service and repair',
  DIAGNOSTICS: 'a diagnostic check',
  SPRAYING: 'spraying',
  CAR_WASH: 'a car wash',
};
/** What the visit is for, as the check-in message says it: "a service and repair", "a car wash". */
export function visitText(jobType: string | null | undefined): string {
  return jobType && isJobType(jobType) ? VISIT[jobType] : 'a repair';
}

/** "20/11/2026", in Lagos. */
export function waDate(d: Date | string | null | undefined): string {
  if (!d) return '-';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Africa/Lagos' }).format(new Date(d));
}

/** "Friday, 04/12/2026", in Lagos. */
export function waLongDate(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Africa/Lagos' }).format(new Date(d));
  return `${weekday}, ${waDate(d)}`;
}

/** The details line of a staff notice: "Customer: … Vehicle: …", from label/value pairs, empty ones left out. */
export function detailsLine(pairs: readonly (readonly [string, string | null | undefined])[]): string {
  return pairs.filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${String(v).trim()}.`).join(' ') || '-';
}

/** The estimate's "To start the work:" line. */
export function depositSentence(deposit: number): string {
  return deposit > 0 ? `a deposit of ${nairaText(deposit)} is needed once you approve, then we begin.` : 'we begin as soon as you approve it.';
}

/** The "Balance:" line of an invoice or a receipt. */
export function balanceSentence(balance: number, dueOn?: Date | null): string {
  if (balance <= 0) return 'nothing more is owed. Thank you.';
  return `${nairaText(balance)} still to pay${dueOn ? `, by ${waDate(dueOn)}` : ''}.`;
}
