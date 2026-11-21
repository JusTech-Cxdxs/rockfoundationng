/**
 * Reporting periods and a median (pure, tested): the periods leadership
 * figures are read over, as Lagos calendar dates. No database access here.
 */
import { lagosYmd } from './nigeria-calendar';

export const REPORT_PERIODS = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_quarter', label: 'This quarter' },
  { key: 'this_year', label: 'This year' },
] as const;
export type ReportPeriodKey = (typeof REPORT_PERIODS)[number]['key'];

/** The period as Lagos calendar dates: [from, to). Unknown keys mean this month. */
export function reportPeriod(key: string | undefined, now: Date = new Date()): { key: ReportPeriodKey; from: Date; to: Date; label: string } {
  const k = (REPORT_PERIODS.some((p) => p.key === key) ? key : 'this_month') as ReportPeriodKey;
  const ymd = lagosYmd(now);
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const at = (yy: number, mm: number) => new Date(`${yy}-${String(mm).padStart(2, '0')}-01T00:00:00+01:00`);
  const tomorrow = new Date(new Date(`${ymd}T00:00:00+01:00`).getTime() + 86_400_000);
  const month = (d: Date) => d.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', month: 'long', year: 'numeric' });
  if (k === 'last_month') {
    const ly = m === 1 ? y - 1 : y;
    const lm = m === 1 ? 12 : m - 1;
    return { key: k, from: at(ly, lm), to: at(y, m), label: month(at(ly, lm)) };
  }
  if (k === 'this_quarter') {
    const qm = Math.floor((m - 1) / 3) * 3 + 1;
    return { key: k, from: at(y, qm), to: tomorrow, label: `Q${Math.floor((m - 1) / 3) + 1} ${y} to date` };
  }
  if (k === 'this_year') return { key: k, from: at(y, 1), to: tomorrow, label: `${y} to date` };
  return { key: k, from: at(y, m), to: tomorrow, label: `${month(at(y, m))} to date` };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
