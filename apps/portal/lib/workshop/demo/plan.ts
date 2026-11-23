/**
 * The workshop demo (Sample data): four months of Rock Foundation
 * Automobile's Ota Workshop, with the invented fleets it maintains on credit
 * and its private customers, their vehicles, and one Job Card for every visit:
 * services, repairs, diagnostics, spraying and quick car washes (each Job
 * Card's job type, filed under the department that does the work), in every
 * status, with the guarantee fixed at checkout and one comeback under it,
 * with estimates
 * (labour, parts bought outside, sundries) in naira with VAT and some
 * discounts, the customer's answer (by link, in the portal, by phone or by
 * paying the deposit at the counter), deposits, invoices and receipts for
 * finished work, fleet invoices on credit (paid, not yet due, and past due),
 * a refund after a cancellation and rework; the Service Tracker (vehicles
 * due and overdue, the reminders sent); gate exits, broadcasts, support
 * tickets; and the QuickBooks and spreadsheet imports of the cut-over,
 * with exports made since.
 *
 * Pure: a seeded plan from an anchor ("now"), the same every run for the
 * same anchor, cut so that nothing is dated after it. The loader
 * (./load.ts) writes it; the tests check that every rule the portal
 * enforces holds inside the plan (statuses in order, the customer's
 * approval and any deposit before work, an individual paid in full before
 * closing, a fleet on credit leaving only with its invoice, a refund only
 * after a cancellation…).
 */
import { billingTotals, depositOf, type BillingTotals } from '@ejo/utils/billing';
import { DEMO_CUSTOMERS, DEMO_STAFF, demoPerson, type DemoStaff } from '../../demo/people';
import {
  BROADCASTS, COLOURS, COMMERCIAL_COMPLAINTS, COMPANIES, DEMO_SOURCE, EXPORTS, IMPORTS, INDIVIDUALS, JOB_LINES, MODELS, OTHER_JOBS, PASSENGER_COMPLAINTS,
  PLATE_PREFIXES, SERVICE_TEXTS, SPRAY_JOBS, TICKETS, WASH_PRICES, serviceKindFor, type CatalogueCustomer, type CatalogueModel, type LineSpec,
} from './catalogue';
import { departmentSlugFor, type WorkDepartmentSlug } from '../routing';
import { DEFAULT_WARRANTY, guaranteeAtCheckout } from '../../money/warranty';

export { DEMO_SOURCE };

// ── Randomness that is the same every run ───────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const between = (r: Rng, lo: number, hi: number) => lo + r() * (hi - lo);
const int = (r: Rng, lo: number, hi: number) => Math.floor(between(r, lo, hi + 1));
const chance = (r: Rng, p: number) => r() < p;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms);
const isWorkDay = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
const utcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
/** A Lagos clock time (UTC+1) on the day of `day`. */
const at = (day: Date, hh: number, mm = 0) => new Date(utcMidnight(day).getTime() + ((hh - 1) * 60 + mm) * 60_000);
const round100 = (n: number) => Math.round(n / 100) * 100;
const kobo = (n: number) => Math.round(n * 100) / 100;

// ── Working time in Lagos (UTC+1): 07:30–17:30, Monday to Friday ────────
const SHIFT_START_UTC_MIN = 6 * 60 + 30;
const SHIFT_MIN = 10 * 60;
const shiftStart = (day: Date) => new Date(utcMidnight(day).getTime() + SHIFT_START_UTC_MIN * 60_000);
function nextWorkDay(day: Date): Date {
  let d = new Date(utcMidnight(day).getTime() + DAY);
  while (!isWorkDay(d)) d = new Date(d.getTime() + DAY);
  return d;
}
/** Moves forward over the working calendar: whatever does not fit before 17:30 continues at 07:30 on the next working day. */
export function addWorkingMinutes(from: Date, minutes: number): Date {
  let t = from;
  let left = minutes;
  for (let guard = 0; guard < 2000; guard += 1) {
    const day = utcMidnight(t);
    const start = shiftStart(day);
    const end = new Date(start.getTime() + SHIFT_MIN * 60_000);
    if (!isWorkDay(day) || t >= end) { t = shiftStart(nextWorkDay(day)); continue; }
    if (t < start) t = start;
    const room = (end.getTime() - t.getTime()) / 60_000;
    if (left <= room) return new Date(t.getTime() + left * 60_000);
    left -= room;
    t = shiftStart(nextWorkDay(day));
  }
  return t;
}
const wm = (d: Date, minutes: number) => addWorkingMinutes(d, minutes);

// ── The people (keys are the demo sign-ins) ─────────────────────────────
const P = {
  frontdesk: demoPerson('front-desk', 'OTA'), owner: demoPerson('owner', 'BIZ'), accounts: demoPerson('accounts', 'OTA'),
  advisor: demoPerson('workshop-supervisor', 'OTA'), gate: demoPerson('security', 'OTA'),
  tech1: DEMO_STAFF.find((s) => s.email.startsWith('tech.1@'))!, tech2: DEMO_STAFF.find((s) => s.email.startsWith('tech.2@'))!, tech3: DEMO_STAFF.find((s) => s.email.startsWith('tech.3@'))!,
};
const who = (s: DemoStaff) => s.email;

// ── What the organisation charges (lib/demo/organisation.ts) ────────────
/** VAT on every estimate the Owner approves. */
export const DEMO_VAT_RATE = 7.5;
/** Individuals pay this share before work starts; organisation customers never do (@ejo/utils/billing depositFractionFor). */
export const DEMO_DEPOSIT_FRACTION = 0.5;
/** A whole-estimate discount above this share of the subtotal needs the Owner. */
export const DEMO_DISCOUNT_APPROVAL_PERCENT = 10;
/** Every 5,000 km or three months, whichever comes first. */
export const DEMO_SERVICE_INTERVAL = { km: 5000, days: 90 } as const;

// ── What the plan holds ─────────────────────────────────────────────────
export type Dept = WorkDepartmentSlug;
export type DemoJobType = 'SERVICE' | 'REPAIR' | 'SERVICE_AND_REPAIR' | 'DIAGNOSTICS' | 'SPRAYING' | 'CAR_WASH';
/** The job type a kind of work is opened as (front desk's "What is this visit for?"). */
export function jobTypeOf(kind: string, service: boolean, complaints: number): DemoJobType {
  if (service) return complaints > 1 ? 'SERVICE_AND_REPAIR' : 'SERVICE';
  if (kind === 'diagnostics') return 'DIAGNOSTICS';
  if (kind === 'spraying') return 'SPRAYING';
  if (kind === 'wash' || kind === 'detailing') return 'CAR_WASH';
  return 'REPAIR';
}
export type DemoContact = { name: string; role: string; phone: string; email: string };
export type DemoCustomer = {
  key: string; name: string; type: 'INDIVIDUAL' | 'ORGANIZATION'; company: string | null; phone: string; address: string; email: string | null; since: Date; contacts: DemoContact[]; tags: string[]; createdAt: Date;
  /** Credit terms (organisation customers), approved by the Owner. */
  credit: { days: number; limit: number; approvedAt: Date; byKey: string } | null;
};
export type DemoVehicle = { key: string; customerKey: string; modelKey: string; make: string; model: string; type: 'PASSENGER' | 'COMMERCIAL'; year: number; plate: string; vin: string; engineNumber: string; engineType: string; colour: string; mileage: number; createdAt: Date };
export type EstimateLine = { key: string; type: LineSpec['type']; description: string; quantity: number; unitPrice: number; amount: number; discount: number; uom: string | null; billTo: 'CUSTOMER' | 'WARRANTY' };
export type CustomerAnswer = { via: 'LINK' | 'PORTAL' | 'PHONE' | 'DEPOSIT'; at: Date; byStaffKey: string | null; note: string | null };
export type DemoEstimate = {
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'MANAGER_APPROVED'; lines: EstimateLine[]; createdAt: Date; submittedAt: Date | null; approvedAt: Date | null; managerApprovedAt: Date | null; customerNotifiedAt: Date | null;
  /** The whole-estimate discount and its reason; discountApprovedAt when it needed the Owner. */
  discountAmount: number; discountReason: string | null; discountApprovedAt: Date | null;
  /** Fixed at the Owner's approval; null before. */
  vatRate: number | null;
  approval: CustomerAnswer | null; declined: { at: Date; note: string } | null;
  /** The secure link sent to the customer (only its hash is stored). */
  link: { createdAt: Date; expiresAt: Date; usedAt: Date | null; revokedAt: Date | null } | null;
  totals: BillingTotals;
};
export type DemoPayment = { key: string; amount: number; method: 'BANK_TRANSFER' | 'CASH' | 'POS'; at: Date; note: string; byKey: string; posReference?: string };
export type DemoInvoice = { issuedAt: Date; byKey: string; dueDate: Date | null; amountPaidAtIssue: number };
/** byKey null: the customer did it themselves (by link or in the portal). */
export type AuditEntry = { action: string; at: Date; byKey: string | null; metadata?: Record<string, unknown> };
export type JobCardStatus = 'CHECKED_IN' | 'AWAITING_CUSTOMER_APPROVAL' | 'IN_PROGRESS' | 'AWAITING_PARTS' | 'QUALITY_CHECK' | 'COMPLETED' | 'READY_FOR_COLLECTION' | 'CLOSED' | 'CHECKED_OUT' | 'CANCELLED';
export type DemoJobCard = {
  key: string; vehicleKey: string; customerKey: string; dept: Dept; kind: string; service: boolean; jobType: DemoJobType; openedAt: Date; status: JobCardStatus;
  /** Check-in: fuel in eighths, what was left in the vehicle; spraying colour and panels; the car wash package. */
  fuelLevel: number; itemsInVehicle: string | null; spray: { colour: string; code: string; panels: string[] } | null; wash: keyof typeof WASH_PRICES | null;
  /** The guarantee fixed at checkout (lib/money/warranty.ts); null for none. */
  guarantee: { until: Date | null; untilKm: number | null } | null;
  /** A comeback: the earlier Job Card whose work this visit puts right under its guarantee. */
  comebackOfKey: string | null;
  complaints: string[]; diagnosis: string | null; notes: string | null; mileage: number; technicianKey: string; supervisorKey: string;
  approvalStatus: 'PENDING' | 'APPROVED'; approvedAt: Date | null; technicianAcceptance: 'PENDING' | 'ACCEPTED'; technicianRespondedAt: Date | null;
  workStartedAt: Date | null; completedAt: Date | null; readyForCollectionAt: Date | null; closedAt: Date | null; checkedOutAt: Date | null; collectedByName: string | null;
  estimate: DemoEstimate | null; payments: DemoPayment[]; invoice: DemoInvoice | null;
  /** On credit when the job card was opened (an organisation customer with approved terms). */
  onCredit: boolean;
  rework: { at: Date; reason: string; byKey: string } | null;
  cancellation: { reason: string; requestedAt: Date; decidedAt: Date | null; status: 'PENDING' | 'APPROVED' } | null;
  close: { requestedAt: Date; decidedAt: Date | null; status: 'PENDING' | 'APPROVED' } | null;
  refund: { amount: number; method: 'BANK_TRANSFER' | 'CASH'; at: Date; paidToName: string; reason: string } | null;
  gateExit: { at: Date; driverName: string } | null;
  audit: AuditEntry[];
};
export type DemoTicket = { key: string; channel: 'CUSTOMER_PORTAL' | 'WEBSITE' | 'EMAIL' | 'STAFF'; subject: string; summary: string; priority: string; status: 'OPEN' | 'WAITING_ON_CUSTOMER' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED'; createdAt: Date; customerKey: string | null; contactName: string; contactPhone: string | null; contactEmail: string | null; assignedToKey: string | null; requesterKey: string | null; tags: string[]; firstResponseAt: Date | null; resolvedAt: Date | null; closedAt: Date | null; dueFirstResponseAt: Date; dueResolutionAt: Date; csat: number | null; replies: { at: Date; kind: 'CUSTOMER' | 'AGENT' | 'AI' | 'NOTE'; body: string; authorKey: string | null }[] };
export type DemoImport = { key: string; entity: string; fileName: string; rows: number; created: number; warnings: number; rejected: number; createdAt: Date; createdByKey: string; approvedByKey: string; signedOffByKey: string | null; totals: Record<string, unknown> | null };
export type DemoExport = { key: string; kind: string; format: 'xlsx' | 'csv'; summary: string; rows: number; createdAt: Date; createdByKey: string };
export type DemoReminder = { vehicleKey: string; sentAt: Date; byKey: string; dueOdometer: number; dueDate: Date; odometerAtSend: number; reminderNumber: number; trigger: 'DUE_SOON' | 'OVERDUE' };

export type WorkshopDemoPlan = {
  anchor: Date; from: Date;
  customers: DemoCustomer[]; vehicles: DemoVehicle[];
  jobCards: DemoJobCard[];
  reminders: DemoReminder[];
  broadcasts: { key: string; category: string; title: string; message: string; audience: string; startsAt: Date; endsAt: Date; createdAt: Date; byKey: string }[];
  announcement: { message: string; expiresAt: Date; createdAt: Date; byKey: string };
  tickets: DemoTicket[]; imports: DemoImport[]; exports: DemoExport[];
  figures: Record<string, number>;
};

// ── Helpers that keep the rules ─────────────────────────────────────────
/** What the customer pays on an estimate (the one rule, @ejo/utils/billing), with VAT once it is fixed. */
export function estimateTotals(e: Pick<DemoEstimate, 'lines' | 'discountAmount' | 'vatRate'>, vatRateIfOpen: number = DEMO_VAT_RATE): BillingTotals {
  const rate = e.vatRate ?? vatRateIfOpen;
  return billingTotals({ lines: e.lines.filter((l) => l.billTo === 'CUSTOMER').map((l) => ({ amount: l.amount, discountAmount: l.discount })), discountAmount: e.discountAmount, vat: { vatEnabled: rate > 0, vatRate: rate } });
}
/** The deposit an individual pays before work starts (none for an organisation). */
export const depositFor = (total: number, organisation: boolean) => (organisation ? 0 : depositOf(total, DEMO_DEPOSIT_FRACTION));
/** The next service due: the later of the two bounds is never used — whichever comes first. */
export function nextServiceDue(mileage: number, checkedOutAt: Date): { km: number; date: Date } {
  return { km: mileage + DEMO_SERVICE_INTERVAL.km, date: plus(checkedOutAt, DEMO_SERVICE_INTERVAL.days * DAY) };
}

// ── The plan ────────────────────────────────────────────────────────────
export function planWorkshopDemo(anchor: Date): WorkshopDemoPlan {
  const r = mulberry32(20261121);
  const now = anchor;
  const today = utcMidnight(now);
  const from = plus(today, -122 * DAY);

  // ── Customers and their vehicles ───────────────────────────────────────
  const customers: DemoCustomer[] = [];
  const vehicles: DemoVehicle[] = [];
  let plateSeq = 100;
  let vinSeq = 520_000;
  const usedPlates = new Set<string>();
  const plate = () => {
    for (;;) {
      const p = `${pick(r, PLATE_PREFIXES)} ${String((plateSeq += int(r, 1, 37)) % 1000).padStart(3, '0')} ${String.fromCharCode(65 + int(r, 0, 25))}${String.fromCharCode(65 + int(r, 0, 25))}`;
      if (!usedPlates.has(p)) { usedPlates.add(p); return p; }
    }
  };
  const regDay = (daysAgoLo: number, daysAgoHi: number) => wm(at(plus(today, -int(r, daysAgoLo, daysAgoHi) * DAY), 8, int(r, 0, 59)), int(r, 0, 300));
  const portalEmail = (key: string) => DEMO_CUSTOMERS.find((c) => c.email.startsWith(`${key}@`))?.email ?? null;
  const modelByKey = new Map(MODELS.map((m) => [m.key, m]));
  /** Kilometres a day: fleets work hard, private cars less. */
  const dailyKm = new Map<string, number>();
  const baseMileage = new Map<string, number>();
  const addVehicle = (c: DemoCustomer, m: CatalogueModel, fleet: boolean) => {
    const year = int(r, m.years[0], m.years[1]);
    const age = Math.max(1, 2026 - year);
    const key = `v${vehicles.length + 1}`;
    vinSeq += int(r, 1, 9);
    const v: DemoVehicle = {
      key, customerKey: c.key, modelKey: m.key, make: m.make, model: m.model, type: m.type, year, plate: plate(),
      vin: `${m.wmi}${m.code}${String(year % 100).padStart(2, '0')}DP${String(vinSeq).slice(-6)}`, engineNumber: `${m.engine.split(/[ -]/)[0]}-${String(700_000 + vinSeq)}`, engineType: m.engine, colour: pick(r, COLOURS),
      mileage: 0, createdAt: c.createdAt,
    };
    dailyKm.set(key, fleet ? int(r, 30, 60) : int(r, 18, 45));
    baseMileage.set(key, Math.round(age * (fleet ? between(r, 28_000, 42_000) : between(r, 11_000, 17_000)) + int(r, 0, 4_000)));
    vehicles.push(v);
  };
  const addCustomer = (c: CatalogueCustomer, organisation: boolean) => {
    const createdAt = regDay(116, 121);
    const email = portalEmail(c.key) ?? c.email ?? null;
    const cust: DemoCustomer = {
      key: c.key, name: c.name, type: organisation ? 'ORGANIZATION' : 'INDIVIDUAL', company: c.company ?? null, phone: c.phone, address: c.address, email, since: plus(createdAt, -int(r, 200, 2400) * DAY),
      contacts: c.contacts ?? [], tags: c.tags ?? [], createdAt,
      credit: c.credit ? { days: c.credit.days, limit: c.credit.limit, approvedAt: wm(createdAt, int(r, 60, 600)), byKey: who(P.owner) } : null,
    };
    customers.push(cust);
    for (const [modelKey, n] of c.fleet) for (let i = 0; i < n; i += 1) addVehicle(cust, modelByKey.get(modelKey)!, organisation);
  };
  for (const c of COMPANIES) addCustomer(c, true);
  for (const c of INDIVIDUALS) addCustomer(c, false);
  const customerByKey = new Map(customers.map((c) => [c.key, c]));
  const vehicleByKey = new Map(vehicles.map((v) => [v.key, v]));
  const mileageAt = (v: DemoVehicle, d: Date) => Math.round(baseMileage.get(v.key)! + dailyKm.get(v.key)! * Math.max(0, (d.getTime() - from.getTime()) / DAY));

  // ── Job cards ───────────────────────────────────────────────────────────
  const jobCards: DemoJobCard[] = [];
  /** When each vehicle is in the workshop (opened → left, or still in): no vehicle is in twice at once. */
  const stays = new Map<string, { from: Date; to: Date }[]>();
  const free = (v: DemoVehicle, a: Date, b: Date) => !(stays.get(v.key) ?? []).some((s) => s.from < b && a < s.to);
  const occupy = (v: DemoVehicle, jc: DemoJobCard) => {
    const left = jc.checkedOutAt ?? (jc.status === 'CANCELLED' ? jc.cancellation?.decidedAt ?? now : jc.status === 'CLOSED' ? plus(now, DAY) : plus(now, 30 * DAY));
    stays.set(v.key, [...(stays.get(v.key) ?? []), { from: jc.openedAt, to: left }]);
  };
  // Technician 1 does mechanical work, 2 electrical and diagnostics, 3 the spray booth and the wash bay.
  const peopleFor = (dept: Dept) => ({ tech: dept === 'mechanical' ? P.tech1 : dept === 'electrical' ? P.tech2 : P.tech3, sup: P.advisor });
  const collectorName = (c: DemoCustomer) => (c.type === 'ORGANIZATION' ? `${c.name} driver` : c.name);
  let lineSeq = 0;

  const makeEstimate = (specs: LineSpec[], createdAt: Date, customer: DemoCustomer): DemoEstimate => {
    const lines: EstimateLine[] = specs.map((l) => {
      const qty = l.qty ?? 1;
      return { key: `el${(lineSeq += 1)}`, type: l.type, description: l.description, quantity: qty, unitPrice: l.price, amount: qty * l.price, discount: 0, uom: l.uom ?? null, billTo: 'CUSTOMER' as const };
    });
    const est: DemoEstimate = { status: 'DRAFT', lines, createdAt, submittedAt: null, approvedAt: null, managerApprovedAt: null, customerNotifiedAt: null, discountAmount: 0, discountReason: null, discountApprovedAt: null, vatRate: null, approval: null, declined: null, link: null, totals: billingTotals({ lines: [] }) };
    // Discounts: fleets often have 10% off labour; a few estimates carry a whole-estimate discount (above 10%, the Owner approves it).
    if (customer.type === 'ORGANIZATION' && chance(r, 0.45)) for (const l of lines) if (l.type === 'LABOUR') l.discount = round100(l.amount * 0.1);
    if (chance(r, 0.18)) {
      const sub = estimateTotals(est).subtotal;
      const big = chance(r, 0.35);
      est.discountAmount = round100(sub * (big ? between(r, 0.12, 0.15) : between(r, 0.03, 0.08)));
      est.discountReason = big ? pick(r, ['Goodwill: the job took longer than promised', 'Agreed with the GMD for a long-standing customer']) : pick(r, ['Loyal customer', 'Second vehicle this month', 'Paid by transfer in advance']);
    }
    est.totals = estimateTotals(est);
    return est;
  };
  /**
   * A quick car wash (Phase 5): the package's list price is the one line, approved and started at check-in;
   * finished, invoiced, paid at the counter and checked out, with no close request and no guarantee.
   */
  const quickWash = (jc: DemoJobCard, o: { target?: JobCardStatus; openedAt: Date }, customer: DemoCustomer, tech: DemoStaff): DemoJobCard => {
    const log = (action: string, when: Date, by: DemoStaff | null, metadata?: Record<string, unknown>) => jc.audit.push({ action, at: when, byKey: by ? who(by) : null, metadata });
    const pkg = jc.wash ?? 'FULL';
    const price = WASH_PRICES[pkg];
    const start = o.openedAt;
    const label = pkg === 'EXTERIOR' ? 'Exterior wash' : pkg === 'FULL' ? 'Full wash (inside and out)' : pkg === 'FULL_ENGINE' ? 'Full wash with engine wash' : 'Interior detailing';
    const est: DemoEstimate = {
      status: 'MANAGER_APPROVED', lines: [{ key: `el${(lineSeq += 1)}`, type: 'LABOUR', description: `Car wash: ${label}`, quantity: 1, unitPrice: price, amount: price, discount: 0, uom: null, billTo: 'CUSTOMER' }],
      createdAt: start, submittedAt: start, approvedAt: start, managerApprovedAt: start, customerNotifiedAt: null, discountAmount: 0, discountReason: null, discountApprovedAt: null, vatRate: DEMO_VAT_RATE,
      approval: { via: 'PHONE', at: start, byStaffKey: who(P.frontdesk), note: 'Quick car wash: the customer chose the package at the counter.' }, declined: null, link: null, totals: billingTotals({ lines: [] }),
    };
    est.totals = estimateTotals(est);
    jc.estimate = est;
    jc.approvalStatus = 'APPROVED'; jc.approvedAt = start; jc.technicianAcceptance = 'ACCEPTED'; jc.technicianRespondedAt = start;
    jc.status = 'IN_PROGRESS'; jc.workStartedAt = start; log('job_card.status_updated', start, P.frontdesk, { status: 'IN_PROGRESS', quickCarWash: true });
    if (o.target === 'IN_PROGRESS' || o.target === 'CHECKED_IN') return jc;
    let t = wm(start, int(r, 25, 70)); if (t > now) return jc;
    jc.status = 'COMPLETED'; jc.completedAt = t; log('job_card.status_updated', t, tech, { status: 'COMPLETED' });
    const onCredit = Boolean(customer.credit && customer.credit.approvedAt <= start);
    jc.invoice = { issuedAt: t, byKey: who(P.frontdesk), dueDate: onCredit ? plus(t, customer.credit!.days * DAY) : null, amountPaidAtIssue: 0 };
    log('invoice.issued', t, P.frontdesk, { invoiceNumber: '{invoice}' });
    if (o.target === 'COMPLETED') return jc;
    t = wm(t, int(r, 5, 30)); if (t > now) return jc;
    if (!onCredit) {
      const method = pick(r, ['CASH', 'POS', 'POS', 'BANK_TRANSFER'] as const);
      jc.payments.push({ key: `${jc.key}-p1`, amount: est.totals.total, method, at: t, note: 'Car wash paid at the counter', byKey: who(P.frontdesk), ...(method === 'POS' ? { posReference: `POS-${String(int(r, 100_000, 999_999))}` } : {}) });
      log('payment.recorded', t, P.frontdesk, { amount: est.totals.total });
    }
    t = wm(t, int(r, 5, 25)); if (t > now) return jc;
    jc.status = 'CHECKED_OUT'; jc.checkedOutAt = t; jc.collectedByName = collectorName(customer); jc.gateExit = { at: plus(t, int(r, 3, 10) * 60_000), driverName: jc.collectedByName }; log('job_card.status_updated', t, P.frontdesk, { status: 'CHECKED_OUT' });
    return jc;
  };
  const needsManagerForDiscount = (est: DemoEstimate) => est.discountAmount * 100 > est.totals.subtotal * DEMO_DISCOUNT_APPROVAL_PERCENT;

  type JobOpts = {
    vehicle: DemoVehicle; openedAt: Date; kind?: string; service?: boolean; target?: JobCardStatus; slow?: 'customer' | 'parts' | null; rework?: boolean;
    /** A quick job: the customer answers within the hour and the work is short, so a card opened a few days ago reaches its stage. */ quick?: boolean;
    /** A cancelled card: was the vehicle handed back (CHECKED_OUT)? */ collected?: boolean;
    /** How the customer answers (otherwise chosen). */ via?: CustomerAnswer['via'];
    /** At AWAITING_CUSTOMER_APPROVAL: the customer declined (asked for changes). */ declined?: boolean;
    /** A fleet invoice on credit: paid, or still open. */ creditPaid?: boolean;
    /** A cancelled card whose deposit was paid (and is refunded). */ refund?: boolean;
    /** A comeback on this earlier Job Card: the lines are covered by its guarantee. */ comebackOf?: DemoJobCard;
  };
  /**
   * One job card from check-in to its state at the anchor. The timeline is
   * built in working time; the status is wherever the timeline has reached
   * by "now" (so recent cards sit at every stage), or stops at `target`.
   */
  const makeJobCard = (o: JobOpts): DemoJobCard => {
    const v = o.vehicle;
    /** Minutes for a step: a quick job moves at a third of the usual pace. */
    const q = (lo: number, hi: number) => Math.max(1, Math.round(int(r, lo, hi) * (o.quick ? 0.35 : 1)));
    const customer = customerByKey.get(v.customerKey)!;
    const org = customer.type === 'ORGANIZATION';
    const onCredit = Boolean(customer.credit && customer.credit.approvedAt <= o.openedAt);
    const service = o.service ?? false;
    const complaintsList = (v.type === 'COMMERCIAL' ? COMMERCIAL_COMPLAINTS : PASSENGER_COMPLAINTS) as readonly (readonly [string, string, string])[];
    const all = [...complaintsList, ...(OTHER_JOBS as readonly (readonly [string, string, string])[])];
    const kind = o.kind ?? (service ? serviceKindFor(modelByKey.get(v.modelKey)!) : pick(r, complaintsList)[2]);
    const row = all.find((c) => c[2] === kind);
    const complaints = service ? [pick(r, SERVICE_TEXTS)] : kind === 'wash' ? ['Car wash'] : [row?.[0] ?? kind];
    if (o.comebackOf) complaints[0] = `Comeback: ${o.comebackOf.complaints[0]} again after the last visit`;
    if (kind !== 'wash' && !o.comebackOf && chance(r, 0.2)) complaints.push(pick(r, ['Also check the horn', 'Customer asks for a wash before collection', 'Spare key not with the vehicle', 'Check tyre pressures', 'Wiper blades smearing']));
    const jobType = jobTypeOf(kind, service, complaints.length);
    const dept = departmentSlugFor(jobType);
    const { tech, sup } = peopleFor(dept);
    const mileage = mileageAt(v, o.openedAt);
    const audit: AuditEntry[] = [];
    const log = (action: string, when: Date, by: DemoStaff | null, metadata?: Record<string, unknown>) => audit.push({ action, at: when, byKey: by ? who(by) : null, metadata });
    const jc: DemoJobCard = {
      key: `jc${jobCards.length + 1}`, vehicleKey: v.key, customerKey: v.customerKey, dept, kind, service, jobType, openedAt: o.openedAt, status: 'CHECKED_IN', complaints, diagnosis: null, notes: null, mileage,
      fuelLevel: int(r, 1, 8), itemsInVehicle: chance(r, 0.5) ? pick(r, ['Spare tyre and jack', 'Car documents in the glovebox', 'Child seat in the back', 'Umbrella and phone charger', 'Fire extinguisher and warning triangle']) : null,
      spray: kind === 'spraying' ? pick(r, SPRAY_JOBS) : null, wash: kind === 'wash' ? pick(r, ['EXTERIOR', 'FULL', 'FULL', 'FULL_ENGINE'] as const) : null, guarantee: null, comebackOfKey: null,
      technicianKey: who(tech), supervisorKey: who(sup), approvalStatus: 'PENDING', approvedAt: null, technicianAcceptance: 'PENDING', technicianRespondedAt: null,
      workStartedAt: null, completedAt: null, readyForCollectionAt: null, closedAt: null, checkedOutAt: null, collectedByName: null, estimate: null, payments: [], invoice: null, onCredit,
      rework: null, cancellation: null, close: null, refund: null, gateExit: null, audit,
    };
    log('job_card.created', o.openedAt, P.frontdesk, { jobNumber: '{number}', isService: service, jobType });
    if (o.target === 'CHECKED_IN' && kind !== 'wash') return jc;
    // A quick car wash (the package has a list price): approved and started at check-in, one priced line, no supervisor review or estimate to send.
    if (kind === 'wash') return quickWash(jc, o, customer, tech);
    // 1. The supervisor accepts, the technician accepts, inspects and writes the estimate.
    let t = wm(o.openedAt, q(20, 70));
    if (t > now) return jc;
    jc.approvalStatus = 'APPROVED'; jc.approvedAt = t; log('job_card.approved', t, sup, { jobNumber: '{number}' });
    t = wm(t, q(10, 60)); if (t > now) return jc;
    jc.technicianAcceptance = 'ACCEPTED'; jc.technicianRespondedAt = t; log('assignment.accepted', t, tech);
    t = wm(t, q(40, 150)); if (t > now) return jc;
    jc.diagnosis = service ? `Service at ${mileage.toLocaleString('en-NG')} km; ${pick(r, ['brake pads 50% left', 'tyres fine', 'coolant topped up', 'wiper blades due next visit', 'battery tested OK', 'drive belt fine'])}.` : row?.[1] ?? null;
    const est = makeEstimate(JOB_LINES[kind] ?? JOB_LINES.service!, t, customer);
    if (o.comebackOf) {
      // Put right under the earlier job's guarantee: nothing charged to the customer; the Owner approves.
      for (const l of est.lines) { l.billTo = 'WARRANTY'; l.discount = 0; }
      est.discountAmount = 0; est.discountReason = null;
      est.totals = estimateTotals(est);
    }
    jc.estimate = est;
    log('estimate.line_item_added', t, tech, { lines: est.lines.length });
    const deposit = () => depositFor(est.totals.total, org);
    const payDeposit = (when: Date, note: string) => {
      const amount = Math.min(est.totals.total, Math.ceil(deposit() / 1000) * 1000);
      jc.payments.push({ key: `${jc.key}-p${jc.payments.length + 1}`, amount, method: chance(r, 0.75) ? 'BANK_TRANSFER' : 'CASH', at: when, note, byKey: who(P.accounts) });
      log('payment.recorded', when, P.accounts, { amount });
    };
    const managerApprove = (when: Date) => {
      est.status = 'MANAGER_APPROVED'; est.managerApprovedAt = when; est.vatRate = DEMO_VAT_RATE;
      if (needsManagerForDiscount(est)) est.discountApprovedAt = when;
      est.totals = estimateTotals(est);
      log('estimate.manager_approved', when, P.owner, { total: est.totals.total, vatRate: DEMO_VAT_RATE });
    };
    const sendLink = (when: Date) => { est.link = { createdAt: when, expiresAt: plus(when, 7 * DAY), usedAt: null, revokedAt: null }; log('estimate.approval_link_sent', when, P.frontdesk, { channel: chance(r, 0.6) ? 'whatsapp' : 'email' }); };
    // Cancellation before the work: the customer changes their mind (an individual's deposit is refunded).
    if (o.target === 'CANCELLED') {
      // An individual who paid the deposit (their go-ahead: work started) and then changed their mind gets it back.
      let last = t;
      if (!org && (o.refund ?? chance(r, 0.6))) {
        const steps = [wm(t, 20), wm(t, 40), wm(t, 60), wm(t, 70), wm(t, 130)];
        if (steps[4]! <= now) {
          est.status = 'SUBMITTED'; est.submittedAt = steps[0]!; est.status = 'APPROVED'; est.approvedAt = steps[1]!; managerApprove(steps[2]!); est.customerNotifiedAt = steps[3]!;
          sendLink(steps[3]!);
          est.approval = { via: 'DEPOSIT', at: steps[4]!, byStaffKey: null, note: null }; est.link!.revokedAt = steps[4]!;
          payDeposit(steps[4]!, 'Deposit (50%) at the counter');
          jc.status = 'IN_PROGRESS'; jc.workStartedAt = steps[4]!; log('job_card.status_updated', steps[4]!, P.accounts, { status: 'IN_PROGRESS' });
          last = steps[4]!;
        }
      }
      const paid = jc.payments.length > 0;
      const reqAt = wm(last, int(r, 30, 400));
      const decidedAt = wm(reqAt, int(r, 30, 300));
      if (reqAt > now) return jc;
      jc.cancellation = { reason: pick(r, ['Customer will repair elsewhere (price)', 'Vehicle sold; owner no longer wants the repair', 'Insurance company took the vehicle to its own workshop', 'Customer travelled; will return next month']), requestedAt: reqAt, decidedAt: decidedAt <= now ? decidedAt : null, status: decidedAt <= now ? 'APPROVED' : 'PENDING' };
      log('cancellation.requested', reqAt, P.frontdesk);
      if (decidedAt <= now) {
        jc.status = 'CANCELLED'; log('cancellation.approved', decidedAt, P.owner);
        if (paid) { const refAt = wm(decidedAt, int(r, 120, 900)); if (refAt <= now) { jc.refund = { amount: jc.payments.reduce((s, p) => s + p.amount, 0), method: 'BANK_TRANSFER', at: refAt, paidToName: customer.name, reason: 'Job Card cancelled before work started; deposit returned.' }; log('refund.recorded', refAt, P.accounts, { amount: jc.refund.amount }); } }
        const outAt = wm(decidedAt, int(r, 60, 600));
        const collected = o.collected ?? chance(r, 0.6);
        if (outAt <= now && collected) { jc.status = 'CHECKED_OUT'; jc.checkedOutAt = outAt; jc.collectedByName = collectorName(customer); jc.gateExit = { at: plus(outAt, 12 * 60_000), driverName: jc.collectedByName }; log('job_card.status_updated', outAt, P.frontdesk, { status: 'CHECKED_OUT' }); }
      }
      return jc;
    }
    // 2. Estimate: submitted → supervisor → Owner (VAT fixed, any large discount approved) → the customer is sent it.
    t = wm(t, q(10, 40)); if (t > now) return jc;
    est.status = 'SUBMITTED'; est.submittedAt = t; log('estimate.submitted', t, tech);
    t = wm(t, q(20, 120)); if (t > now) return jc;
    est.status = 'APPROVED'; est.approvedAt = t; log('estimate.approved', t, sup);
    t = wm(t, q(30, 200)); if (t > now) return jc;
    managerApprove(t);
    t = wm(t, q(5, 30)); if (t > now) return jc;
    est.customerNotifiedAt = t; log('estimate.customer_notified', t, P.frontdesk);
    jc.status = 'AWAITING_CUSTOMER_APPROVAL';
    const via: CustomerAnswer['via'] = o.via ?? (customer.key === 'customer.individual' || customer.key === 'customer.fleet' ? (chance(r, 0.6) ? 'PORTAL' : 'LINK') : org ? (chance(r, 0.65) ? 'LINK' : 'PHONE') : pick(r, ['LINK', 'LINK', 'PHONE', 'DEPOSIT', 'DEPOSIT'] as const));
    if (via === 'LINK' || o.target === 'AWAITING_CUSTOMER_APPROVAL') sendLink(t);
    if (o.declined) {
      const decAt = wm(t, int(r, 60, 300));
      if (decAt <= now) { est.declined = { at: decAt, note: 'Please price the brake pads only; the discs can wait until the next service.' }; if (est.link) est.link.usedAt = decAt; log('estimate.customer_declined', decAt, null, { via: 'LINK' }); }
      return jc;
    }
    if (o.target === 'AWAITING_CUSTOMER_APPROVAL') return jc;
    // 3. The customer's answer — by link, in the portal, by phone, or by paying the deposit at the counter. A slow customer takes days.
    t = wm(t, o.slow === 'customer' ? int(r, 2_500, 4_000) : o.quick ? int(r, 30, 120) : int(r, 60, 700)); if (t > now) return jc;
    est.approval = { via, at: t, byStaffKey: via === 'PHONE' ? who(P.frontdesk) : null, note: via === 'PHONE' ? pick(r, ['Spoke with the customer; go ahead.', 'Fleet Owner approved by phone.', 'Approved on a call; asked for the old parts back.']) : null };
    if (est.link) { if (via === 'LINK') est.link.usedAt = t; else est.link.revokedAt = t; }
    log('estimate.customer_approved', t, via === 'PHONE' || via === 'DEPOSIT' ? P.frontdesk : null, { via });
    // Work starts once the customer has approved and any deposit is paid (none for an organisation).
    if (deposit() > 0) {
      const payAt = via === 'DEPOSIT' ? t : wm(t, q(10, 240));
      if (payAt > now) return jc;
      payDeposit(payAt, 'Deposit (50%) before work starts');
      t = payAt;
    }
    jc.status = 'IN_PROGRESS'; jc.workStartedAt = t; log('job_card.status_updated', t, deposit() > 0 ? P.accounts : P.frontdesk, { status: 'IN_PROGRESS' });
    if (o.target === 'IN_PROGRESS') return jc;
    // 4. Parts bought outside (Ladipo, the dealers): a slow supplier holds the card at AWAITING_PARTS.
    const partsAt = wm(t, q(10, 60));
    if (o.slow === 'parts' || o.target === 'AWAITING_PARTS') {
      if (partsAt <= now) { jc.status = 'AWAITING_PARTS'; jc.notes = 'Parts ordered from the dealer; delivery expected within two working days.'; log('job_card.status_updated', partsAt, sup, { status: 'AWAITING_PARTS' }); }
      return jc;
    }
    // 5. Work, quality check, rework for a few, a road test where it matters, completion and the invoice.
    const workMinutes = o.quick ? int(r, 90, 240) : service ? int(r, 120, 300) : int(r, 240, 1_500);
    t = wm(partsAt, workMinutes); if (t > now) return jc;
    jc.status = 'QUALITY_CHECK'; log('job_card.status_updated', t, tech, { status: 'QUALITY_CHECK' });
    if (o.target === 'QUALITY_CHECK' && !o.rework) return jc;
    if (o.rework) {
      const rwAt = wm(t, q(20, 90)); if (rwAt > now) return jc;
      jc.rework = { at: rwAt, reason: pick(r, ['Brake pedal still soft after the road test: bleed again', 'Check engine light returned on the road test', 'A/C vent temperature 14 °C, limit 8 °C', 'Oil weep at the filter housing after the test run']), byKey: who(sup) };
      jc.status = 'IN_PROGRESS'; log('job_card.rework_requested', rwAt, sup, { reason: jc.rework.reason });
      t = wm(rwAt, int(r, 90, 400)); if (t > now) return jc;
      jc.status = 'QUALITY_CHECK'; log('job_card.status_updated', t, tech, { status: 'QUALITY_CHECK' });
      if (o.target === 'QUALITY_CHECK') return jc;
    }
    t = wm(t, q(20, 90)); if (t > now) return jc;
    jc.status = 'COMPLETED'; jc.completedAt = t; log('job_card.status_updated', t, sup, { status: 'COMPLETED' });
    const paidBy = (when: Date) => jc.payments.filter((p) => p.at <= when).reduce((s, p) => s + p.amount, 0);
    jc.invoice = { issuedAt: t, byKey: who(sup), dueDate: onCredit ? plus(t, customer.credit!.days * DAY) : null, amountPaidAtIssue: kobo(paidBy(t)) };
    log('invoice.issued', t, sup, { invoiceNumber: '{invoice}' });
    if (o.target === 'COMPLETED') return jc;
    // 6. Ready for collection; an individual pays the balance; the close request; checkout and the gate.
    t = wm(t, q(15, 90)); if (t > now) return jc;
    jc.status = 'READY_FOR_COLLECTION'; jc.readyForCollectionAt = t; log('job_card.status_updated', t, sup, { status: 'READY_FOR_COLLECTION' }); log('collection.ready_reminder_sent', wm(t, 5), P.frontdesk, { channel: chance(r, 0.5) ? 'whatsapp' : 'email' });
    if (o.target === 'READY_FOR_COLLECTION') return jc;
    t = wm(t, int(r, 60, 900)); if (t > now) return jc;
    const balance = kobo(est.totals.total - paidBy(t));
    if (!onCredit && balance > 0) { jc.payments.push({ key: `${jc.key}-p${jc.payments.length + 1}`, amount: balance, method: chance(r, 0.65) ? 'BANK_TRANSFER' : 'CASH', at: t, note: 'Balance on collection', byKey: who(P.accounts) }); log('payment.recorded', t, P.accounts, { amount: balance }); }
    const closeReq = wm(t, int(r, 5, 40));
    const closeDec = wm(closeReq, int(r, 10, 120));
    if (closeReq > now) return jc;
    jc.close = { requestedAt: closeReq, decidedAt: closeDec <= now ? closeDec : null, status: closeDec <= now ? 'APPROVED' : 'PENDING' }; log('close.requested', closeReq, P.frontdesk);
    if (closeDec > now) return jc;
    jc.status = 'CLOSED'; jc.closedAt = closeDec; log('job_card.status_updated', closeDec, P.owner, { status: 'CLOSED', ...(onCredit && balance > 0 ? { onCredit: { balance } } : {}) });
    if (o.target === 'CLOSED') return jc;
    t = wm(closeDec, int(r, 10, 200)); if (t > now) return jc;
    jc.status = 'CHECKED_OUT'; jc.checkedOutAt = t; jc.collectedByName = collectorName(customer); jc.gateExit = { at: plus(t, int(r, 5, 20) * 60_000), driverName: jc.collectedByName }; log('job_card.status_updated', t, P.frontdesk, { status: 'CHECKED_OUT' });
    const g = guaranteeAtCheckout(DEFAULT_WARRANTY[jobType], t, mileage);
    if (g.until || g.untilKm) jc.guarantee = g;
    // A fleet on credit pays by transfer within its terms (or a little after), or still owes it.
    if (onCredit && balance > 0) {
      // Older invoices have all been paid by now; a recent one may still be open.
      const pays = o.creditPaid ?? (jc.invoice.issuedAt < plus(now, -75 * DAY) || chance(r, 0.85));
      const payAt = wm(plus(jc.invoice.issuedAt, int(r, 8, customer.credit!.days + 12) * DAY), int(r, 30, 400));
      if (pays && payAt <= now) { jc.payments.push({ key: `${jc.key}-p${jc.payments.length + 1}`, amount: balance, method: 'BANK_TRANSFER', at: payAt, note: 'Invoice paid by bank transfer (credit account)', byKey: who(P.accounts) }); log('payment.recorded', payAt, P.accounts, { amount: balance }); }
    }
    return jc;
  };
  const add = (o: JobOpts) => { const jc = makeJobCard(o); jobCards.push(jc); occupy(o.vehicle, jc); return jc; };
  const workingDayBack = (daysAgo: number) => { let d = plus(today, -daysAgo * DAY); while (!isWorkDay(d)) d = plus(d, -DAY); return d; };
  /** `n` working days before today (0: today, or the last working day when today is not one). */
  const workingDaysBack = (n: number) => { let d = today; while (!isWorkDay(d)) d = plus(d, -DAY); for (let k = 0; k < n; k += 1) { d = plus(d, -DAY); while (!isWorkDay(d)) d = plus(d, -DAY); } return d; };
  const freeVehicle = (a: Date, filter: (v: DemoVehicle) => boolean = () => true): DemoVehicle | null => {
    const pool = vehicles.filter((v) => filter(v) && free(v, plus(a, -DAY), plus(now, 60 * DAY)));
    return pool.length ? pick(r, pool) : null;
  };

  // The stories the sign-ins show first (their vehicles are kept for them).
  const individualCar = vehicles.find((v) => v.customerKey === 'customer.individual')!;
  const fleetCars = vehicles.filter((v) => v.customerKey === 'customer.fleet');
  add({ vehicle: individualCar, openedAt: at(workingDayBack(34), 8, 40), service: true, via: 'PORTAL' });
  add({ vehicle: individualCar, openedAt: at(workingDayBack(1), 9, 15), kind: 'brakes', target: 'AWAITING_CUSTOMER_APPROVAL', quick: true });
  add({ vehicle: fleetCars[0]!, openedAt: at(workingDayBack(52), 9, 0), kind: 'suspension', via: 'PORTAL', creditPaid: false });
  add({ vehicle: fleetCars[1]!, openedAt: at(workingDayBack(18), 8, 30), service: true, via: 'LINK', creditPaid: false });
  add({ vehicle: fleetCars[2]!, openedAt: plus(now, -40 * 60_000) < at(today, 8, 0) || !isWorkDay(today) ? plus(now, -40 * 60_000) : at(today, 8, 10), service: true, target: 'CHECKED_IN' });
  add({ vehicle: fleetCars[3]!, openedAt: at(workingDayBack(2), 9, 10), kind: 'cooling', target: 'IN_PROGRESS', quick: true, via: 'PORTAL' });

  // Each vehicle's visits over the four months: services at its interval, repairs in between.
  const SERVICE_EVERY: Record<'ORGANIZATION' | 'INDIVIDUAL', [number, number]> = { ORGANIZATION: [70, 100], INDIVIDUAL: [130, 185] };
  const visitsOf: { v: DemoVehicle; at: Date; service: boolean; kind?: string }[] = [];
  /** Vehicles whose service is lapsing or due: the Service Tracker's story, kept out of today's open job cards. */
  const trackerStory = new Set<string>();
  for (const [i, v] of vehicles.entries()) {
    const c = customerByKey.get(v.customerKey)!;
    const [lo, hi] = SERVICE_EVERY[c.type];
    // Where the vehicle's service count stands at the start: some services fall early and are not repeated (the Service Tracker's overdue list), some fall due in the coming weeks.
    const pattern = i % 9 === 4 ? 'lapsed' : i % 9 === 7 ? 'due-soon' : 'regular';
    // About half the vehicles were serviced before the four months began (their history is the old system's): no service here.
    // A lapsed vehicle works hard: past its 5,000 km since that service (the tracker's overdue list).
    if (pattern === 'lapsed') dailyKm.set(v.key, Math.max(dailyKm.get(v.key)!, 55));
    if (pattern !== 'regular') trackerStory.add(v.key);
    const servicedBefore = pattern === 'regular' && i % 2 === 1;
    let day = servicedBefore ? 0 : pattern === 'lapsed' ? int(r, 100, 115) : pattern === 'due-soon' ? int(r, 65, 82) : int(r, 15, 58);
    while (day > 3) {
      visitsOf.push({ v, at: at(plus(today, -day * DAY), int(r, 7, 13), int(r, 0, 59)), service: true });
      if (pattern !== 'regular') break;
      day -= int(r, lo, hi);
    }
    // Repairs, washes and the odd roadside call-out between the services.
    const repairs = trackerStory.has(v.key) ? 0 : c.type === 'ORGANIZATION' ? int(r, 0, 1) : chance(r, 0.35) ? 1 : 0;
    for (let k = 0; k < repairs; k += 1) visitsOf.push({ v, at: at(plus(today, -int(r, 8, 115) * DAY), int(r, 7, 14), int(r, 0, 59)), service: false, kind: chance(r, 0.12) ? pick(r, ['roadside', 'tyres']) : undefined });
  }
  // The spray booth (private cars) and the wash bay (anyone): a few of each over the months.
  const cars = vehicles.filter((v) => v.type === 'PASSENGER' && !trackerStory.has(v.key));
  for (let k = 0; k < 4; k += 1) visitsOf.push({ v: pick(r, cars), at: at(plus(today, -int(r, 10, 110) * DAY), int(r, 8, 11), int(r, 0, 59)), service: false, kind: 'spraying' });
  for (let k = 0; k < 6; k += 1) visitsOf.push({ v: pick(r, vehicles.filter((v) => !trackerStory.has(v.key))), at: at(plus(today, -int(r, 5, 115) * DAY), int(r, 8, 15), int(r, 0, 59)), service: false, kind: 'wash' });
  visitsOf.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const x of visitsOf) {
    let openedAt = x.at;
    while (!isWorkDay(openedAt)) openedAt = plus(openedAt, DAY);
    if (openedAt > plus(now, -3 * DAY)) continue;
    // Room for the whole visit, however long the job runs.
    if (!free(x.v, openedAt, plus(openedAt, 12 * DAY))) continue;
    const wash = x.kind === 'wash';
    add({ vehicle: x.v, openedAt, service: x.service, kind: x.kind, target: !wash && chance(r, 0.03) ? 'CANCELLED' : undefined, slow: !wash && chance(r, 0.04) ? 'customer' : null, rework: !wash && !x.service && chance(r, 0.08) });
  }
  // One comeback: a repair checked out in the last few weeks, back under its guarantee.
  const comebackOf = jobCards.filter((j) => j.jobType === 'REPAIR' && !trackerStory.has(j.vehicleKey) && j.checkedOutAt && j.guarantee && j.checkedOutAt > plus(now, -45 * DAY) && j.checkedOutAt < plus(now, -6 * DAY) && free(vehicleByKey.get(j.vehicleKey)!, plus(now, -3 * DAY), plus(now, 30 * DAY))).at(-1);
  const comebackPairs: [DemoJobCard, DemoJobCard][] = [];
  if (comebackOf) comebackPairs.push([add({ vehicle: vehicleByKey.get(comebackOf.vehicleKey)!, openedAt: at(workingDayBack(2), 9, 20), kind: comebackOf.kind, target: 'IN_PROGRESS', quick: true, comebackOf, via: 'PHONE' }), comebackOf]);

  // Job cards that show every stage today, whatever the dice did above.
  const stageDays: [JobCardStatus, number, Partial<JobOpts>][] = [
    ['CHECKED_IN', 0, {}], ['CHECKED_IN', 0, { service: true }], ['AWAITING_CUSTOMER_APPROVAL', 1, {}], ['AWAITING_CUSTOMER_APPROVAL', 9, { slow: 'customer' }], ['AWAITING_CUSTOMER_APPROVAL', 3, { declined: true, kind: 'brakes', quick: true }],
    ['IN_PROGRESS', 2, { quick: true }], ['IN_PROGRESS', 1, { service: true, quick: true }], ['AWAITING_PARTS', 3, { quick: true, kind: 'suspension' }], ['AWAITING_PARTS', 2, { quick: true, kind: 'cooling' }],
    ['QUALITY_CHECK', 3, { quick: true }], ['QUALITY_CHECK', 4, { quick: true, rework: true, kind: 'diagnostics' }], ['COMPLETED', 4, { quick: true }], ['COMPLETED', 5, { quick: true, service: true }],
    ['READY_FOR_COLLECTION', 5, { quick: true }], ['READY_FOR_COLLECTION', 6, { quick: true, service: true }], ['CLOSED', 7, { quick: true }], ['CANCELLED', 2, { collected: false }], ['CANCELLED', 6, { collected: true, refund: true }],
    ['IN_PROGRESS', 0, { kind: 'wash' }], ['IN_PROGRESS', 3, { kind: 'spraying', quick: true }], ['IN_PROGRESS', 1, { kind: 'diagnostics', quick: true }],
  ];
  for (const [target, daysAgo, extra] of stageDays) {
    const d = workingDaysBack(daysAgo);
    let openedAt = daysAgo === 0 ? plus(now, -int(r, 30, 150) * 60_000) : at(d, int(r, 8, 10), int(r, 0, 59));
    if (openedAt > now) openedAt = plus(now, -int(r, 15, 60) * 60_000);
    const v = freeVehicle(openedAt, (x) => !trackerStory.has(x.key) && !['customer.individual'].includes(x.customerKey) && (!['brakes', 'spraying'].includes(extra.kind ?? '') || x.type === 'PASSENGER') && (!extra.refund || customerByKey.get(x.customerKey)!.type === 'INDIVIDUAL'));
    if (v) add({ vehicle: v, openedAt, target, ...extra });
  }
  jobCards.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  jobCards.forEach((j, i) => { j.key = `jc${i + 1}`; });
  for (const [cb, original] of comebackPairs) cb.comebackOfKey = original.key;
  for (const v of vehicles) v.mileage = Math.max(mileageAt(v, v.createdAt), ...jobCards.filter((j) => j.vehicleKey === v.key).map((j) => j.mileage));

  // ── The Service Tracker: where each vehicle's count stands today ───────
  const lastService = new Map<string, DemoJobCard>();
  for (const j of jobCards) if (j.service && j.checkedOutAt && j.cancellation?.status !== 'APPROVED') { const cur = lastService.get(j.vehicleKey); if (!cur || cur.checkedOutAt! < j.checkedOutAt) lastService.set(j.vehicleKey, j); }
  const dueOf = (j: DemoJobCard) => {
    const due = nextServiceDue(j.mileage, j.checkedOutAt!);
    const v = vehicleByKey.get(j.vehicleKey)!;
    const kmLeft = due.km - v.mileage;
    const daysLeft = Math.ceil((due.date.getTime() - now.getTime()) / DAY);
    return { due, status: kmLeft <= 0 || daysLeft <= 0 ? 'OVERDUE' as const : kmLeft <= 1000 || daysLeft <= 30 ? 'DUE_SOON' as const : 'ON_TRACK' as const };
  };
  const reminders: DemoReminder[] = [];
  for (const j of lastService.values()) {
    const { due, status } = dueOf(j);
    if (status === 'ON_TRACK') continue;
    const inNow = jobCards.some((x) => x.vehicleKey === j.vehicleKey && x.openedAt > j.checkedOutAt! && !x.checkedOutAt && x.status !== 'CANCELLED');
    if (inNow || reminders.length >= 6 || (reminders.length > 0 && chance(r, 0.35))) continue;
    const sentAt = wm(at(workingDayBack(int(r, 1, 8)), 9), int(r, 0, 240));
    if (sentAt > now || sentAt < j.checkedOutAt!) continue;
    reminders.push({ vehicleKey: j.vehicleKey, sentAt, byKey: who(P.frontdesk), dueOdometer: due.km, dueDate: due.date, odometerAtSend: vehicleByKey.get(j.vehicleKey)!.mileage, reminderNumber: status === 'OVERDUE' ? 3 : 1, trigger: status === 'OVERDUE' ? 'OVERDUE' : 'DUE_SOON' });
  }

  // ── Broadcasts and support ─────────────────────────────────────────────
  const broadcasts = BROADCASTS.map((b, i) => { const createdAt = plus(now, -b.daysAgo * DAY); return { key: `bc${i + 1}`, category: b.category, title: b.title, message: b.message, audience: b.audience, startsAt: createdAt, endsAt: plus(createdAt, b.days * DAY), createdAt, byKey: who(b.audience === 'BRANCH' ? P.owner : b.category === 'SECURITY_ALERT' ? P.gate : P.owner) }; });
  const announcement = { message: 'Fleet customers: book December preventive maintenance with the front desk before the 15th.', expiresAt: plus(now, 14 * DAY), createdAt: plus(now, -2 * DAY), byKey: who(P.owner) };
  const tickets: DemoTicket[] = TICKETS.map((t, i) => {
    const createdAt = plus(now, -t.daysAgo * DAY);
    const customer = t.customerKey ? customerByKey.get(t.customerKey) ?? null : null;
    const staff = t.channel === 'STAFF';
    const requester = staff ? pick(r, [P.frontdesk, P.tech1, P.accounts]) : null;
    const replies = t.replies.map((rp) => ({ at: plus(createdAt, rp.hoursLater * HOUR), kind: rp.from === 'customer' ? 'CUSTOMER' as const : rp.from === 'ai' ? 'AI' as const : rp.from === 'note' ? 'NOTE' as const : 'AGENT' as const, body: rp.text, authorKey: rp.from === 'agent' || rp.from === 'note' ? who(staff ? P.owner : P.frontdesk) : null })).filter((x) => x.at <= now);
    const firstResponse = replies.find((x) => x.kind !== 'CUSTOMER')?.at ?? null;
    const done = t.status === 'RESOLVED' || t.status === 'CLOSED';
    const last = replies.length ? replies[replies.length - 1]!.at : createdAt;
    const closedAt = t.status === 'CLOSED' ? plus(last, 2 * DAY) : null;
    return { key: `sup${i + 1}`, channel: t.channel, subject: t.subject, summary: t.summary, priority: t.priority, status: t.status, createdAt, customerKey: customer?.key ?? null, contactName: customer?.name ?? (staff ? requester!.name : pick(r, ['Mr Okoro', 'Mrs Adeniyi', 'Mr Lawal', 'Ms Umar'])), contactPhone: customer?.phone ?? null, contactEmail: customer?.email ?? null, assignedToKey: staff ? who(P.owner) : t.status === 'OPEN' && i === 0 ? null : who(P.frontdesk), requesterKey: requester ? who(requester) : null, tags: [...(t.complaint ? ['complaint'] : []), ...(staff ? ['staff_help'] : [])], firstResponseAt: firstResponse, resolvedAt: done ? last : null, closedAt: closedAt && closedAt <= now ? closedAt : done ? last : null, dueFirstResponseAt: plus(createdAt, (t.priority === 'URGENT' ? 1 : t.priority === 'HIGH' ? 4 : 24) * HOUR), dueResolutionAt: plus(createdAt, (t.priority === 'URGENT' ? 8 : t.priority === 'HIGH' ? 48 : 120) * HOUR), csat: done && chance(r, 0.6) ? int(r, 4, 5) : null, replies };
  });
  const imports: DemoImport[] = IMPORTS.map((im, i) => ({ key: `imp${i + 1}`, entity: im.entity, fileName: im.fileName, rows: im.rows, created: im.created, warnings: im.warnings, rejected: im.rejected, createdAt: plus(now, -im.daysAgo * DAY), createdByKey: who(P.owner), approvedByKey: who(P.owner), signedOffByKey: im.totals ? who(P.accounts) : null, totals: im.totals ? { check: { ...im.totals }, loaded: { ...im.totals } } : null }));
  const exportsOut: DemoExport[] = EXPORTS.map((ex, i) => ({ key: `exp${i + 1}`, kind: ex.kind, format: ex.format, summary: ex.summary, rows: ex.rows, createdAt: plus(now, -ex.daysAgo * DAY), createdByKey: who(i === 1 ? P.accounts : P.owner) }));

  // ── The figures the pages show ─────────────────────────────────────────
  const byStatus = (xs: { status: string }[]) => xs.reduce<Record<string, number>>((m, x) => { m[x.status] = (m[x.status] ?? 0) + 1; return m; }, {});
  const invoiced = jobCards.filter((j) => j.invoice);
  const paidOf = (j: DemoJobCard) => j.payments.reduce((s, p) => s + p.amount, 0) - (j.refund?.amount ?? 0);
  const owing = invoiced.filter((j) => j.estimate!.totals.total - paidOf(j) > 0.005);
  const tracker = [...lastService.values()].map(dueOf);
  const figures: Record<string, number> = {
    customers: customers.length, organisations: customers.filter((c) => c.type === 'ORGANIZATION').length, vehicles: vehicles.length, jobCards: jobCards.length, serviceJobCards: jobCards.filter((j) => j.service).length,
    invoices: invoiced.length, receipts: jobCards.reduce((n, j) => n + j.payments.length, 0), invoicesOwing: owing.length, invoicesOverdue: owing.filter((j) => j.invoice!.dueDate && j.invoice!.dueDate < now).length,
    discounts: jobCards.filter((j) => j.estimate && (j.estimate.discountAmount > 0 || j.estimate.lines.some((l) => l.discount > 0))).length,
    approvedByLink: jobCards.filter((j) => j.estimate?.approval?.via === 'LINK').length, approvedInPortal: jobCards.filter((j) => j.estimate?.approval?.via === 'PORTAL').length, approvedByPhone: jobCards.filter((j) => j.estimate?.approval?.via === 'PHONE').length, approvedByDeposit: jobCards.filter((j) => j.estimate?.approval?.via === 'DEPOSIT').length,
    serviceDueSoon: tracker.filter((x) => x.status === 'DUE_SOON').length, serviceOverdue: tracker.filter((x) => x.status === 'OVERDUE').length, reminders: reminders.length,
    tickets: tickets.length, comebacks: jobCards.filter((j) => j.comebackOfKey).length,
    ...Object.fromEntries(Object.entries(jobCards.reduce<Record<string, number>>((m, j) => { m[j.jobType] = (m[j.jobType] ?? 0) + 1; return m; }, {})).map(([k, v]) => [`type_${k}`, v])),
    ...Object.fromEntries(Object.entries(byStatus(jobCards)).map(([k, v]) => [`jc_${k}`, v])),
  };
  return { anchor, from, customers, vehicles, jobCards, reminders, broadcasts, announcement, tickets, imports, exports: exportsOut, figures };
}
