/**
 * The parts store and customer care in the workshop demo (Sample data), on
 * top of the job cards (./plan.ts): 80 parts with what they cost, what they
 * sell for and what is on the shelf (an opening balance at the cut-over and
 * two deliveries since), counter sales, a stock count waiting for the Owner,
 * credit notes, bookings, "How did we do?" ratings, the callback list and
 * the customers who agreed to WhatsApp.
 *
 * Pure: the same every run for the same anchor, nothing dated after it. The
 * loader (./load.ts) writes it; tests/workshop-demo.test.ts checks the rules
 * the portal keeps (stock never below nothing, VAT to the kobo, a credit note
 * never more than the invoice, a stock count never approved by the person
 * who counted).
 */
import type { WorkshopDemoPlan } from './plan';
import { DEMO_VAT_RATE } from './plan';

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
const DAY = 86_400_000;
const HOUR = 3_600_000;
const kobo = (n: number) => Math.round(n * 100) / 100;
const round50 = (n: number) => Math.round(n / 50) * 50;

// ── The parts: [part number, name, category, unit, cost price ₦, quantity on the shelf at the cut-over, reorder point] ──
type PartRow = readonly [string, string, string, string, number, number, number];
const PARTS: readonly PartRow[] = [
  // Oils and fluids (per litre or per can)
  ['OIL-5W30-1L', 'Engine oil 5W-30 fully synthetic, 1 litre', 'Oils and fluids', 'litre', 7_200, 120, 40],
  ['OIL-15W40-1L', 'Engine oil 15W-40 diesel, 1 litre', 'Oils and fluids', 'litre', 6_800, 160, 50],
  ['OIL-10W40-1L', 'Engine oil 10W-40 semi-synthetic, 1 litre', 'Oils and fluids', 'litre', 5_900, 80, 30],
  ['ATF-WS-1L', 'Automatic transmission fluid (WS), 1 litre', 'Oils and fluids', 'litre', 9_400, 36, 12],
  ['ATF-D3-1L', 'Automatic transmission fluid Dexron III, 1 litre', 'Oils and fluids', 'litre', 6_500, 30, 12],
  ['GEAR-80W90-1L', 'Gear oil 80W-90, 1 litre', 'Oils and fluids', 'litre', 5_200, 24, 8],
  ['BRK-DOT4-500', 'Brake fluid DOT 4, 500 ml', 'Oils and fluids', 'piece', 4_800, 30, 10],
  ['CLT-LL-4L', 'Coolant, long life, 4 litres', 'Oils and fluids', 'piece', 16_500, 20, 6],
  ['PS-FLUID-1L', 'Power steering fluid, 1 litre', 'Oils and fluids', 'litre', 5_600, 18, 6],
  ['GREASE-500', 'Multipurpose grease, 500 g', 'Oils and fluids', 'piece', 3_900, 14, 4],
  // Filters
  ['TY-90915-YZZE1', 'Oil filter, Toyota Corolla / Camry petrol', 'Filters', 'piece', 4_600, 40, 12],
  ['TY-90915-YZZD2', 'Oil filter, Toyota Hilux / Hiace diesel', 'Filters', 'piece', 6_900, 36, 12],
  ['TY-90915-YZZJ3', 'Oil filter, Land Cruiser / Prado', 'Filters', 'piece', 8_200, 16, 6],
  ['TY-17801-0H050', 'Air filter, Toyota Camry 2.4', 'Filters', 'piece', 9_800, 14, 5],
  ['TY-17801-0C010', 'Air filter, Toyota Hilux 2.5 D-4D', 'Filters', 'piece', 12_500, 16, 6],
  ['TY-17801-0D060', 'Air filter, Toyota Corolla 1.8', 'Filters', 'piece', 8_900, 14, 5],
  ['TY-23390-0L041', 'Fuel filter, Toyota Hilux / Hiace diesel', 'Filters', 'piece', 15_800, 16, 6],
  ['TY-87139-YZZ08', 'Cabin air filter, Toyota', 'Filters', 'piece', 7_400, 20, 6],
  ['FD-RNG-OF', 'Oil filter, Ford Ranger 2.2 TDCi', 'Filters', 'piece', 8_600, 10, 4],
  ['FD-RNG-FF', 'Fuel filter, Ford Ranger 2.2 TDCi', 'Filters', 'piece', 19_500, 8, 3],
  ['MB-SPR-OF', 'Oil filter, Mercedes Sprinter', 'Filters', 'piece', 12_800, 10, 4],
  ['MI-L200-OF', 'Oil filter, Mitsubishi L200', 'Filters', 'piece', 7_800, 10, 4],
  ['HY-ELN-OF', 'Oil filter, Hyundai Elantra / Kia', 'Filters', 'piece', 5_200, 14, 5],
  ['LX-RX350-OF', 'Oil filter cartridge, Lexus RX 350', 'Filters', 'piece', 7_900, 10, 4],
  // Brakes
  ['BP-COR-F', 'Brake pad set, front, Toyota Corolla', 'Brakes', 'set', 24_000, 10, 4],
  ['BP-CAM-F', 'Brake pad set, front, Toyota Camry', 'Brakes', 'set', 28_500, 10, 4],
  ['BP-HLX-F', 'Brake pad set, front, Toyota Hilux', 'Brakes', 'set', 34_000, 12, 4],
  ['BP-HIA-F', 'Brake pad set, front, Toyota Hiace', 'Brakes', 'set', 36_500, 8, 3],
  ['BP-RX-F', 'Brake pad set, front, Lexus RX 350', 'Brakes', 'set', 42_000, 6, 2],
  ['BS-HLX-R', 'Brake shoe set, rear, Toyota Hilux', 'Brakes', 'set', 29_000, 8, 3],
  ['BD-COR-F', 'Brake disc, front, Toyota Corolla', 'Brakes', 'piece', 31_000, 6, 2],
  ['BD-HLX-F', 'Brake disc, front, Toyota Hilux', 'Brakes', 'piece', 46_000, 6, 2],
  ['BRK-CLEAN', 'Brake cleaner spray', 'Brakes', 'piece', 3_400, 24, 8],
  // Ignition and electrical
  ['SP-ILKAR7B11', 'Spark plug, iridium (NGK ILKAR7B11)', 'Ignition and electrical', 'piece', 6_800, 64, 16],
  ['SP-BKR6E', 'Spark plug, nickel (NGK BKR6E)', 'Ignition and electrical', 'piece', 2_400, 48, 16],
  ['IC-COR-1ZZ', 'Ignition coil, Toyota 1ZZ / 2ZR', 'Ignition and electrical', 'piece', 34_000, 8, 4],
  ['BAT-75AH', 'Battery 12V 75Ah, sealed', 'Ignition and electrical', 'piece', 92_000, 8, 3],
  ['BAT-100AH', 'Battery 12V 100Ah, sealed', 'Ignition and electrical', 'piece', 128_000, 5, 2],
  ['BAT-60AH', 'Battery 12V 60Ah, sealed', 'Ignition and electrical', 'piece', 78_000, 6, 2],
  ['GLOW-HLX', 'Glow plug, Toyota 2KD diesel', 'Ignition and electrical', 'piece', 14_500, 16, 4],
  ['BULB-H4', 'Headlamp bulb H4 12V', 'Ignition and electrical', 'piece', 2_900, 30, 10],
  ['BULB-H7', 'Headlamp bulb H7 12V', 'Ignition and electrical', 'piece', 3_200, 24, 8],
  ['FUSE-KIT', 'Blade fuse assortment', 'Ignition and electrical', 'piece', 4_500, 10, 3],
  ['ALT-BELT-HLX', 'Alternator belt (V-ribbed), Toyota Hilux', 'Ignition and electrical', 'piece', 11_500, 8, 3],
  // Belts and engine
  ['TB-KIT-COR', 'Timing belt kit, Toyota 4A / 7A', 'Belts and engine', 'set', 58_000, 4, 2],
  ['DB-CAM-6PK', 'Drive belt 6PK, Toyota Camry', 'Belts and engine', 'piece', 12_800, 8, 3],
  ['TH-COR-82', 'Thermostat and gasket, Toyota', 'Belts and engine', 'piece', 16_500, 10, 4],
  ['WP-HLX-2KD', 'Water pump, Toyota 2KD', 'Belts and engine', 'piece', 68_000, 4, 2],
  ['RAD-HOSE-UP', 'Radiator hose, upper, Toyota Hilux', 'Belts and engine', 'piece', 12_500, 6, 2],
  ['RAD-CAP-108', 'Radiator cap 1.08 bar', 'Belts and engine', 'piece', 4_200, 12, 4],
  ['VC-GSK-1ZZ', 'Valve cover gasket, Toyota 1ZZ', 'Belts and engine', 'piece', 9_800, 6, 2],
  ['ENG-MNT-COR', 'Engine mount, front, Toyota Corolla', 'Belts and engine', 'piece', 27_500, 4, 2],
  // Suspension and steering
  ['SA-COR-F', 'Shock absorber, front, Toyota Corolla', 'Suspension and steering', 'piece', 52_000, 6, 2],
  ['SA-HLX-F', 'Shock absorber, front, Toyota Hilux', 'Suspension and steering', 'piece', 61_000, 6, 2],
  ['SA-HLX-R', 'Shock absorber, rear, Toyota Hilux', 'Suspension and steering', 'piece', 48_000, 6, 2],
  ['SL-COR-F', 'Stabiliser link, front, Toyota Corolla', 'Suspension and steering', 'piece', 12_500, 12, 4],
  ['TRE-HLX', 'Tie-rod end, Toyota Hilux', 'Suspension and steering', 'piece', 18_000, 10, 4],
  ['TRE-COR', 'Tie-rod end, Toyota Corolla', 'Suspension and steering', 'piece', 14_500, 10, 4],
  ['BJ-HLX-L', 'Lower ball joint, Toyota Hilux', 'Suspension and steering', 'piece', 24_000, 6, 2],
  ['CVJ-COR', 'CV joint, outer, Toyota Corolla', 'Suspension and steering', 'piece', 38_000, 4, 2],
  ['WB-HLX-F', 'Wheel bearing, front, Toyota Hilux', 'Suspension and steering', 'piece', 29_500, 6, 2],
  ['BUSH-SHK-HLX', 'Leaf spring shackle bush kit, Toyota Hilux', 'Suspension and steering', 'set', 11_000, 8, 3],
  // Clutch and drivetrain
  ['CK-HLX-2KD', 'Clutch kit, Toyota Hilux 2KD', 'Clutch and drivetrain', 'set', 185_000, 3, 1],
  ['CK-HIA-2KD', 'Clutch kit, Toyota Hiace 2KD', 'Clutch and drivetrain', 'set', 195_000, 2, 1],
  ['PSB-HLX', 'Propeller shaft centre bearing, Toyota Hilux', 'Clutch and drivetrain', 'piece', 42_000, 4, 2],
  ['CLT-CYL-HLX', 'Clutch slave cylinder, Toyota Hilux', 'Clutch and drivetrain', 'piece', 26_000, 4, 2],
  // Air conditioning
  ['AC-R134A', 'Refrigerant R134a, 1 kg', 'Air conditioning', 'piece', 18_500, 12, 4],
  ['AC-FAN-COR', 'Condenser fan motor, Toyota Corolla', 'Air conditioning', 'piece', 52_000, 3, 1],
  ['AC-DRY-UNI', 'A/C receiver drier', 'Air conditioning', 'piece', 16_000, 4, 2],
  ['AC-OIL-PAG46', 'Compressor oil PAG 46', 'Air conditioning', 'piece', 7_800, 8, 3],
  // Wipers, tyres and body
  ['WB-22', 'Wiper blade 22"', 'Wipers, tyres and body', 'piece', 4_600, 30, 10],
  ['WB-18', 'Wiper blade 18"', 'Wipers, tyres and body', 'piece', 4_100, 24, 8],
  ['TYR-195-65-15', 'Tyre 195/65 R15', 'Wipers, tyres and body', 'piece', 78_000, 12, 4],
  ['TYR-265-65-17', 'Tyre 265/65 R17 all-terrain', 'Wipers, tyres and body', 'piece', 138_000, 8, 4],
  ['TYR-215-70-15C', 'Tyre 215/70 R15C (van)', 'Wipers, tyres and body', 'piece', 96_000, 8, 4],
  ['VALVE-TR414', 'Tyre valve TR414', 'Wipers, tyres and body', 'piece', 450, 100, 30],
  ['PAINT-CLR-1L', 'Clear coat, 1 litre', 'Wipers, tyres and body', 'litre', 21_000, 10, 4],
  ['FILLER-1KG', 'Body filler, 1 kg', 'Wipers, tyres and body', 'piece', 7_600, 10, 4],
  ['SANDP-P800', 'Sandpaper P800, pack of 50', 'Wipers, tyres and body', 'piece', 9_500, 8, 3],
  ['WASH-SHAMPOO-5L', 'Car shampoo, 5 litres', 'Wipers, tyres and body', 'piece', 12_000, 10, 4],
];
/** Margin on cost the store prices to, by category (a selling price ends in ₦50). */
const MARGIN: Record<string, number> = { 'Oils and fluids': 0.3, Filters: 0.4, Brakes: 0.35, 'Ignition and electrical': 0.3, 'Belts and engine': 0.35, 'Suspension and steering': 0.35, 'Clutch and drivetrain': 0.25, 'Air conditioning': 0.35, 'Wipers, tyres and body': 0.3 };

export type DemoPart = { key: string; partNumber: string; name: string; category: string; uom: string; cost: number; sellingPrice: number; openingQty: number; reorderPoint: number; createdAt: Date };
export type DemoReceiptLine = { partKey: string; quantity: number; unitCost: number; totalCost: number };
export type DemoReceipt = { key: string; supplierName: string; receivedAt: Date; receivedByKey: string; opening: boolean; notes: string | null; lines: DemoReceiptLine[] };
export type DemoCounterSale = { key: string; customerKey: string | null; buyerName: string; buyerPhone: string | null; soldAt: Date; soldByKey: string; method: 'CASH' | 'POS' | 'BANK_TRANSFER'; paymentReference: string | null; lines: { partKey: string; quantity: number; unitPrice: number; amount: number }[]; subtotal: number; vatAmount: number; total: number };
export type DemoStockCount = { key: string; status: 'PENDING_APPROVAL' | 'NO_DIFFERENCE'; countedAt: Date; countedByKey: string; decidedAt: Date | null; decidedByKey: string | null; note: string; lines: { partKey: string; system: number; counted: number; reason: string | null }[] };
export type DemoCreditNote = { key: string; jobCardKey: string; status: 'APPROVED' | 'PENDING'; amount: number; vatAmount: number; reason: string; requestedAt: Date; requestedByKey: string; decidedAt: Date | null; decidedByKey: string | null };
export type DemoAppointment = { key: string; customerKey: string | null; vehicleKey: string | null; jobType: 'SERVICE' | 'REPAIR' | 'SPRAYING' | 'CAR_WASH' | 'DIAGNOSTICS'; day: string; slot: string; name: string; phone: string; vehicleText: string; plate: string | null; note: string | null; status: 'REQUESTED' | 'CONFIRMED' | 'NO_SHOW' | 'CANCELLED'; source: 'WEBSITE' | 'PORTAL' | 'STAFF'; createdAt: Date; confirmedAt: Date | null; cancelledAt: Date | null; cancelReason: string | null };
export type DemoRating = { jobCardKey: string; customerKey: string; sentAt: Date; expiresAt: Date; score: number | null; comment: string | null; respondedAt: Date | null };
export type DemoFollowUp = { key: string; customerKey: string; vehicleKey: string | null; jobCardKey: string | null; reason: 'AFTER_JOB' | 'CALLBACK' | 'SERVICE_DUE' | 'BIRTHDAY' | 'LOW_RATING'; note: string | null; dueAt: Date; status: 'OPEN' | 'DONE' | 'NO_ANSWER'; outcome: string | null; attempts: number; doneAt: Date | null; createdAt: Date };
export type WorkshopDemoExtras = {
  parts: DemoPart[]; receipts: DemoReceipt[]; counterSales: DemoCounterSale[]; stockCounts: DemoStockCount[]; creditNotes: DemoCreditNote[];
  appointments: DemoAppointment[]; ratings: DemoRating[]; followUps: DemoFollowUp[];
  /** Customers who agreed to WhatsApp updates at registration (recorded by front desk). */
  whatsappOptIn: string[];
  /** Support tickets that are complaints (customer care), with their category. */
  complaints: Record<string, string>;
  /** What is on the shelf today, by part key. */
  onHand: Record<string, number>;
  figures: Record<string, number>;
};

/** A Lagos calendar day, YYYY-MM-DD. */
const lagosDay = (d: Date) => new Date(d.getTime() + HOUR).toISOString().slice(0, 10);
const atLagos = (day: Date, hh: number, mm = 0) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hh - 1, mm));

export function planWorkshopExtras(plan: WorkshopDemoPlan, staff: { owner: string; frontdesk: string; store: string; accounts: string }): WorkshopDemoExtras {
  const r = mulberry32(20261124);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  /** The first `n` of a seeded shuffle (Fisher–Yates). */
  const some = <T,>(xs: readonly T[], n: number): T[] => { const a = [...xs]; for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a.slice(0, n); };
  const now = plan.anchor;
  const cutover = new Date(plan.from.getTime() - 2 * DAY);

  // ── Parts and what came in ────────────────────────────────────────────
  const parts: DemoPart[] = PARTS.map(([partNumber, name, category, uom, cost, openingQty, reorderPoint], i) => ({
    key: `p${i + 1}`, partNumber, name, category, uom, cost, openingQty, reorderPoint, createdAt: cutover,
    sellingPrice: Math.max(500, round50(cost * (1 + (MARGIN[category] ?? 0.3)))),
  }));
  const byKey = new Map(parts.map((p) => [p.key, p]));
  const receipts: DemoReceipt[] = [{ key: 'grn1', supplierName: 'Opening stock at the cut-over', receivedAt: cutover, receivedByKey: staff.store, opening: true, notes: 'Shelf count at the cut-over, valued at the last purchase price.', lines: parts.map((p) => ({ partKey: p.key, quantity: p.openingQty, unitCost: p.cost, totalCost: kobo(p.cost * p.openingQty) })) }];
  const deliveries: [number, string, number][] = [[70, 'Ladipo Auto Parts (Mushin)', 9], [24, 'Toyota parts dealer, Ikeja', 7]];
  for (const [i, [daysAgo, supplier, n]] of deliveries.entries()) {
    const at = atLagos(new Date(now.getTime() - daysAgo * DAY), 10, int(0, 50));
    const lines = some(parts, n).map((p) => { const q = Math.max(2, Math.round(p.openingQty * 0.5)); const unit = round50(p.cost * (1 + (i === 1 ? 0.04 : 0))); return { partKey: p.key, quantity: q, unitCost: unit, totalCost: kobo(unit * q) }; });
    receipts.push({ key: `grn${i + 2}`, supplierName: supplier, receivedAt: at, receivedByKey: staff.store, opening: false, notes: i === 0 ? 'Delivery note LAP-2231' : 'Dealer invoice 88412', lines });
  }
  const received = new Map<string, number>();
  for (const g of receipts) for (const l of g.lines) received.set(l.partKey, (received.get(l.partKey) ?? 0) + l.quantity);

  // ── Counter sales: walk-ins and registered customers ──────────────────
  const walkIns: [string, string][] = [['Musa Ibrahim', '0800 000 0301'], ['Ngozi Eze', '0800 000 0302'], ['Tunde Bakare', '0800 000 0303'], ['Blessing Uche', '0800 000 0304'], ['Yusuf Bello', '0800 000 0305']];
  const counterSales: DemoCounterSale[] = [];
  const sold = new Map<string, number>();
  const quickSellers = parts.filter((p) => ['Oils and fluids', 'Filters', 'Ignition and electrical', 'Wipers, tyres and body', 'Brakes'].includes(p.category) && p.sellingPrice < 100_000);
  for (let k = 0; k < 10; k += 1) {
    const soldAt = atLagos(new Date(now.getTime() - int(1, 110) * DAY), int(9, 16), int(0, 59));
    if (soldAt > now) continue;
    const registered = r() < 0.35 ? pick(plan.customers.filter((c) => c.type === 'INDIVIDUAL')) : null;
    const [name, phone] = registered ? [registered.name, registered.phone] : pick(walkIns);
    const lines = some(quickSellers, int(1, 3)).map((p) => {
      const quantity = p.uom === 'litre' ? int(1, 5) : int(1, 4);
      return { partKey: p.key, quantity, unitPrice: p.sellingPrice, amount: kobo(p.sellingPrice * quantity) };
    }).filter((l) => (received.get(l.partKey) ?? 0) - (sold.get(l.partKey) ?? 0) >= l.quantity);
    if (!lines.length) continue;
    for (const l of lines) sold.set(l.partKey, (sold.get(l.partKey) ?? 0) + l.quantity);
    const subtotal = kobo(lines.reduce((s, l) => s + l.amount, 0));
    const vatAmount = kobo((subtotal * DEMO_VAT_RATE) / 100);
    const method = pick(['CASH', 'POS', 'POS', 'BANK_TRANSFER'] as const);
    counterSales.push({ key: `cs${k + 1}`, customerKey: registered?.key ?? null, buyerName: name, buyerPhone: phone, soldAt, soldByKey: staff.store, method, paymentReference: method === 'POS' ? `POS-${int(100_000, 999_999)}` : method === 'BANK_TRANSFER' ? `TRF-${int(1_000_000, 9_999_999)}` : null, lines, subtotal, vatAmount, total: kobo(subtotal + vatAmount) });
  }
  counterSales.sort((a, b) => a.soldAt.getTime() - b.soldAt.getTime());
  counterSales.forEach((c, i) => { c.key = `cs${i + 1}`; });
  const onHand: Record<string, number> = Object.fromEntries(parts.map((p) => [p.key, (received.get(p.key) ?? 0) - (sold.get(p.key) ?? 0)]));

  // ── Stock counts: a clean one last month, one waiting for the Owner now ─
  const shelf = (keys: string[]) => keys.map((k) => byKey.get(k)!).filter(Boolean);
  const clean = shelf(['p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17', 'p18']);
  const waiting = shelf(['p1', 'p34', 'p71', 'p72', 'p7']);
  const countedAgo = (d: number, hh: number) => atLagos(new Date(now.getTime() - d * DAY), hh, 15);
  const stockCounts: DemoStockCount[] = [
    { key: 'sc1', status: 'NO_DIFFERENCE', countedAt: countedAgo(30, 16), countedByKey: staff.store, decidedAt: null, decidedByKey: null, note: 'Month-end count of the filters shelf', lines: clean.map((p) => ({ partKey: p.key, system: onHand[p.key]!, counted: onHand[p.key]!, reason: null })) },
    { key: 'sc2', status: 'PENDING_APPROVAL', countedAt: countedAgo(1, 17), countedByKey: staff.store, decidedAt: null, decidedByKey: null, note: 'Count of the fluids and wiper shelf after the leak on Tuesday', lines: waiting.map((p, i) => ({ partKey: p.key, system: onHand[p.key]!, counted: i === 0 ? onHand[p.key]! - 2 : i === 2 ? onHand[p.key]! + 1 : onHand[p.key]!, reason: i === 0 ? 'Damaged (leaking can)' : i === 2 ? 'Found on the shelf' : null })) },
  ].filter((c) => c.countedAt <= now) as DemoStockCount[];

  // ── Credit notes: one approved, one waiting ───────────────────────────
  const invoiced = plan.jobCards.filter((j) => j.invoice && j.estimate && j.estimate.totals.total > 50_000 && j.status === 'CHECKED_OUT' && j.jobType !== 'CAR_WASH');
  const creditNotes: DemoCreditNote[] = [];
  const cn = (j: (typeof invoiced)[number] | undefined, status: 'APPROVED' | 'PENDING', share: number, reason: string, daysAfter: number) => {
    if (!j) return;
    const amount = Math.round((j.estimate!.totals.total * share) / 100) * 100;
    const requestedAt = new Date(j.checkedOutAt!.getTime() + daysAfter * DAY);
    if (requestedAt > now) return;
    const decidedAt = status === 'APPROVED' ? new Date(requestedAt.getTime() + 3 * HOUR) : null;
    creditNotes.push({ key: `cn${creditNotes.length + 1}`, jobCardKey: j.key, status, amount, vatAmount: kobo((amount * DEMO_VAT_RATE) / (100 + DEMO_VAT_RATE)), reason, requestedAt, requestedByKey: staff.accounts, decidedAt: decidedAt && decidedAt <= now ? decidedAt : null, decidedByKey: status === 'APPROVED' ? staff.owner : null });
  };
  cn(invoiced.find((j) => j.checkedOutAt! < new Date(now.getTime() - 20 * DAY)), 'APPROVED', 0.05, 'Goodwill: the vehicle was ready a day later than promised', 2);
  cn([...invoiced].reverse().find((j) => j.checkedOutAt! < new Date(now.getTime() - 3 * DAY)), 'PENDING', 0.1, 'Labour charged twice for the wheel alignment', 1);

  // ── Bookings: website, portal and phone ───────────────────────────────
  const inDays = (n: number) => lagosDay(new Date(now.getTime() + n * DAY));
  const cars = plan.vehicles.filter((v) => !plan.jobCards.some((j) => j.vehicleKey === v.key && !j.checkedOutAt && j.status !== 'CANCELLED'));
  const custOf = (key: string) => plan.customers.find((c) => c.key === key)!;
  const appt = (n: number, jobType: DemoAppointment['jobType'], slot: string, status: DemoAppointment['status'], source: DemoAppointment['source'], withVehicle: boolean, note: string | null): DemoAppointment => {
    const v = withVehicle ? cars[n % cars.length]! : null;
    const c = v ? custOf(v.customerKey) : null;
    const createdAt = new Date(now.getTime() - int(1, 4) * DAY);
    const guest = pick(walkIns);
    return {
      key: `apt${n + 1}`, customerKey: c?.key ?? null, vehicleKey: v?.key ?? null, jobType, day: status === 'NO_SHOW' ? inDays(-2) : inDays(n < 2 ? 1 : n + 1), slot, name: c?.name ?? guest[0], phone: c?.phone ?? guest[1],
      vehicleText: v ? `${v.year} ${v.make} ${v.model}` : 'Toyota Corolla 2014', plate: v?.plate ?? null, note, status, source, createdAt,
      confirmedAt: status === 'CONFIRMED' || status === 'NO_SHOW' ? new Date(createdAt.getTime() + 2 * HOUR) : null, cancelledAt: status === 'CANCELLED' ? new Date(createdAt.getTime() + 20 * HOUR) : null, cancelReason: status === 'CANCELLED' ? 'Customer travelled; will book again next month' : null,
    };
  };
  const appointments = [
    appt(0, 'SERVICE', '08:00', 'CONFIRMED', 'PORTAL', true, null),
    appt(1, 'SPRAYING', '10:00', 'CONFIRMED', 'STAFF', true, 'Rear bumper scratch, same colour'),
    appt(2, 'CAR_WASH', '12:00', 'REQUESTED', 'WEBSITE', false, 'Full wash before a wedding'),
    appt(3, 'DIAGNOSTICS', '14:00', 'REQUESTED', 'WEBSITE', true, 'Check engine light on since Monday'),
    appt(4, 'REPAIR', '10:00', 'CANCELLED', 'WEBSITE', true, 'Brakes squeal'),
    appt(5, 'SERVICE', '08:00', 'NO_SHOW', 'STAFF', true, null),
  ].filter((a) => a.createdAt <= now);

  // ── "How did we do?": sent after collection; most answer ─────────────
  const ratings: DemoRating[] = [];
  const COMMENTS: Record<number, string[]> = { 5: ['Excellent service, very professional.', 'Ready on time and clearly explained.', 'Good work, I will come again.'], 4: ['Good job; the wait at reception was long.', 'Fair price and clean car.'], 3: ['The work is fine but it took two days longer.'], 2: ['Nobody called me when the car was ready.'] };
  for (const j of plan.jobCards.filter((x) => x.status === 'CHECKED_OUT' && x.completedAt && x.checkedOutAt! > new Date(now.getTime() - 45 * DAY))) {
    const sentAt = new Date(j.checkedOutAt!.getTime() + 2 * HOUR);
    if (sentAt > now) continue;
    const answered = r() < 0.7 && sentAt.getTime() + 6 * HOUR <= now.getTime();
    const score = answered ? pick([5, 5, 5, 4, 4, 4, 3, 2]) : null;
    ratings.push({ jobCardKey: j.key, customerKey: j.customerKey, sentAt, expiresAt: new Date(sentAt.getTime() + 14 * DAY), score, comment: score ? pick(COMMENTS[score]!) : null, respondedAt: answered ? new Date(sentAt.getTime() + int(1, 6) * HOUR) : null });
  }

  // ── The callback list ─────────────────────────────────────────────────
  const followUps: DemoFollowUp[] = [];
  const fu = (f: Omit<DemoFollowUp, 'key'>) => { if (f.createdAt <= now) followUps.push({ key: `fu${followUps.length + 1}`, ...f }); };
  const recent = plan.jobCards.filter((j) => j.status === 'CHECKED_OUT' && j.completedAt && j.checkedOutAt! > new Date(now.getTime() - 20 * DAY)).slice(-7);
  for (const [i, j] of recent.entries()) {
    const dueAt = new Date(j.checkedOutAt!.getTime() + 2 * DAY);
    const done = dueAt < new Date(now.getTime() - DAY) && i % 3 !== 2;
    fu({ customerKey: j.customerKey, vehicleKey: j.vehicleKey, jobCardKey: j.key, reason: 'AFTER_JOB', note: null, dueAt, status: done ? 'DONE' : i % 5 === 4 ? 'NO_ANSWER' : 'OPEN', outcome: done ? pick(['Happy with the work', 'All fine; asked about the next service', 'Satisfied; will refer a friend']) : i % 5 === 4 ? 'No answer after several tries.' : null, attempts: done ? 1 : i % 5 === 4 ? 3 : 0, doneAt: done ? new Date(dueAt.getTime() + 3 * HOUR) : null, createdAt: j.checkedOutAt! });
  }
  for (const rt of ratings.filter((x) => x.score !== null && x.score <= 3)) fu({ customerKey: rt.customerKey, vehicleKey: null, jobCardKey: rt.jobCardKey, reason: 'LOW_RATING', note: `Rated ${rt.score} of 5: "${rt.comment}"`, dueAt: new Date(rt.respondedAt!.getTime() + 4 * HOUR), status: 'OPEN', outcome: null, attempts: 0, doneAt: null, createdAt: rt.respondedAt! });
  for (const rm of plan.reminders.slice(0, 2)) { const v = plan.vehicles.find((x) => x.key === rm.vehicleKey)!; fu({ customerKey: v.customerKey, vehicleKey: v.key, jobCardKey: null, reason: 'SERVICE_DUE', note: 'Service due: offer a booking', dueAt: new Date(rm.sentAt.getTime() + DAY), status: 'OPEN', outcome: null, attempts: 0, doneAt: null, createdAt: rm.sentAt }); }
  const bday = plan.customers.find((c) => c.type === 'INDIVIDUAL' && c.key !== 'customer.individual');
  if (bday) fu({ customerKey: bday.key, vehicleKey: null, jobCardKey: null, reason: 'BIRTHDAY', note: 'Birthday today: a short call or WhatsApp', dueAt: atLagos(now, 9), status: 'OPEN', outcome: null, attempts: 0, doneAt: null, createdAt: new Date(atLagos(now, 9).getTime() - 3 * HOUR) });
  fu({ customerKey: plan.customers[0]!.key, vehicleKey: null, jobCardKey: null, reason: 'CALLBACK', note: 'Wants a quote for four new tyres on the Hilux', dueAt: atLagos(now, 15), status: 'OPEN', outcome: null, attempts: 0, doneAt: null, createdAt: new Date(now.getTime() - 5 * HOUR) });

  // ── WhatsApp agreement and complaints ─────────────────────────────────
  const whatsappOptIn = plan.customers.filter((_, i) => i % 5 !== 3).map((c) => c.key);
  const complaints: Record<string, string> = {};
  for (const t of plan.tickets) if (t.tags.includes('complaint')) complaints[t.key] = /wash|scratch/i.test(t.subject) ? 'WORKMANSHIP' : /waited|wait/i.test(t.subject) ? 'DELAY' : 'COMMUNICATION';

  const stockValue = kobo(parts.reduce((s, p) => s + onHand[p.key]! * p.cost, 0));
  return {
    parts, receipts, counterSales, stockCounts, creditNotes, appointments, ratings, followUps, whatsappOptIn, complaints, onHand,
    figures: { parts: parts.length, counterSales: counterSales.length, stockCounts: stockCounts.length, creditNotes: creditNotes.length, appointments: appointments.length, ratings: ratings.length, ratingsAnswered: ratings.filter((x) => x.respondedAt).length, followUps: followUps.length, whatsappOptIn: whatsappOptIn.length, lowStock: parts.filter((p) => onHand[p.key]! <= p.reorderPoint).length, stockValue },
  };
}
