/**
 * The D'Phoenix Autocare demo's catalogue: the organisation customers (the
 * fleets the workshop maintains on credit), the individual customers, the
 * vehicles they drive in Lagos (2006 to date), the work the workshop does
 * and what it charges, and the texts the plan (./plan.ts) draws on. Pure data.
 *
 * Nothing here is a real person or number: individuals and fleet contacts
 * have invented names, phones are on the 0800 000 range, plates are
 * Lagos-style but invented, VINs carry the demo's own serial block, and
 * every email is on a reserved domain (example.com, or the demo's own
 * .example domain for the portal sign-ins, lib/demo/people.ts). Prices are
 * in naira, as a Victoria Island workshop charges them; parts are bought
 * outside and priced on the estimate (the Store is off in this edition).
 */

export const DEMO_SOURCE = 'EJO-DEMO';

// ── Customers ───────────────────────────────────────────────────────────
export type CatalogueContact = { name: string; role: string; phone: string; email: string };
export type CatalogueCustomer = {
  key: string; name: string; company?: string; phone: string; address: string; email?: string;
  contacts?: CatalogueContact[]; tags?: string[];
  /** Credit terms (organisation customers): days to pay and the limit, in naira. */
  credit?: { days: number; limit: number };
  /** The fleet: [model key, how many]. Individuals: one or two cars. */
  fleet: [string, number][];
};

/**
 * The organisation customers: fleets on credit. The first is the
 * customer-portal fleet sign-in (lib/demo/people.ts DEMO_CUSTOMERS); its
 * key is that sign-in's local part.
 */
export const COMPANIES: CatalogueCustomer[] = [
  {
    key: 'customer.fleet', name: 'SEEPCO', company: 'SEEPCO', phone: '0800 000 0102', address: 'Plot 12, Adeola Odeku Street, Victoria Island, Lagos',
    contacts: [{ name: 'Ifedayo Arowolo', role: 'Fleet Manager', phone: '0800 000 0112', email: 'fleet.manager@seepco.example.com' }, { name: 'Chinaza Obiorah', role: 'Accounts Payable', phone: '0800 000 0122', email: 'accounts@seepco.example.com' }],
    tags: ['fleet', 'portal'], credit: { days: 30, limit: 15_000_000 }, fleet: [['hilux', 2], ['landcruiser', 2], ['hiace', 1]],
  },
  {
    key: 'rcl', name: 'RCL Africa', company: 'RCL Africa', phone: '0800 000 0301', address: '14 Idowu Taylor Street, Victoria Island, Lagos', email: 'fleet@rclafrica.example.com',
    contacts: [{ name: 'Babatunde Olaniyan', role: 'Fleet Manager', phone: '0800 000 0311', email: 'b.olaniyan@rclafrica.example.com' }],
    tags: ['fleet'], credit: { days: 30, limit: 8_000_000 }, fleet: [['ranger', 2], ['hiace', 1], ['corolla', 2]],
  },
  {
    key: 'nairda', name: 'Nairda Limited', company: 'Nairda Limited', phone: '0800 000 0302', address: '3 Akin Adesola Street, Victoria Island, Lagos', email: 'admin@nairda.example.com',
    contacts: [{ name: 'Morenike Fadipe', role: 'Fleet Manager', phone: '0800 000 0312', email: 'transport@nairda.example.com' }],
    tags: ['fleet'], credit: { days: 15, limit: 4_000_000 }, fleet: [['camry', 1], ['corolla', 1], ['hilux', 1]],
  },
  {
    key: 'desicon', name: 'Desicon Engineering', company: 'Desicon Engineering', phone: '0800 000 0303', address: '22 Kofo Abayomi Street, Victoria Island, Lagos', email: 'fleet@desicon.example.com',
    contacts: [{ name: 'Olawale Akinyemi', role: 'Fleet Manager', phone: '0800 000 0313', email: 'o.akinyemi@desicon.example.com' }],
    tags: ['fleet'], credit: { days: 30, limit: 9_000_000 }, fleet: [['hilux', 2], ['l200', 1], ['patrol', 1]],
  },
  {
    key: 'dori', name: 'Dori Construction', company: 'Dori Construction', phone: '0800 000 0304', address: 'Plot 5, Admiralty Way, Lekki Phase 1, Lagos', email: 'logistics@doriconstruction.example.com',
    contacts: [{ name: 'Usman Garba-Kolo', role: 'Fleet Manager', phone: '0800 000 0314', email: 'fleet@doriconstruction.example.com' }, { name: 'Ebiere Tonye', role: 'Site Logistics Officer', phone: '0800 000 0324', email: 'site.logistics@doriconstruction.example.com' }],
    tags: ['fleet'], credit: { days: 45, limit: 12_000_000 }, fleet: [['hilux', 1], ['l200', 1], ['h100', 1], ['sprinter', 1], ['landcruiser', 1]],
  },
  {
    key: 'inspiration', name: 'Inspiration FM', company: 'Inspiration FM', phone: '0800 000 0305', address: '9 Ozumba Mbadiwe Avenue, Victoria Island, Lagos', email: 'admin@inspirationfm.example.com',
    contacts: [{ name: 'Adaeze Nwachukwu-Ebo', role: 'Fleet Manager', phone: '0800 000 0315', email: 'transport@inspirationfm.example.com' }],
    tags: ['fleet'], credit: { days: 30, limit: 5_000_000 }, fleet: [['hiace', 1], ['corolla', 1], ['ranger', 1]],
  },
];

/**
 * Individual customers (invented names). The first is the customer-portal
 * sign-in; the others are reached by phone.
 */
export const INDIVIDUALS: CatalogueCustomer[] = [
  { key: 'customer.individual', name: 'Tolani Bamgbose', phone: '0800 000 0101', address: '7 Ajose Adeogun Street, Victoria Island, Lagos', tags: ['portal'], fleet: [['camry', 1]] },
  { key: 'i01', name: 'Kelechi Amadi-Okeke', phone: '0800 000 0201', address: '18 Bishop Aboyade Cole Street, Victoria Island, Lagos', fleet: [['rx350', 1]] },
  { key: 'i02', name: 'Funmilola Adetokunbo', phone: '0800 000 0202', address: '4 Ligali Ayorinde Street, Victoria Island, Lagos', fleet: [['highlander', 1], ['corolla', 1]] },
  { key: 'i03', name: 'Emeka Nwoye-Ibe', phone: '0800 000 0203', address: '27 Admiralty Road, Lekki Phase 1, Lagos', fleet: [['c300', 1]] },
  { key: 'i04', name: 'Halima Sadiq-Bature', phone: '0800 000 0204', address: '9 Glover Road, Ikoyi, Lagos', fleet: [['venza', 1]] },
  { key: 'i05', name: 'Oluwaseun Afolabi-Dada', phone: '0800 000 0205', address: '15 Saka Tinubu Street, Victoria Island, Lagos', fleet: [['accord', 1]] },
  { key: 'i06', name: 'Ngozika Eluwa', phone: '0800 000 0206', address: '3 Musa Yar’Adua Street, Victoria Island, Lagos', fleet: [['sienna', 1]] },
  { key: 'i07', name: 'Tamunotonye Briggs', phone: '0800 000 0207', address: '21 Fola Osibo Road, Lekki Phase 1, Lagos', fleet: [['es350', 1]] },
  { key: 'i08', name: 'Abdulmalik Danfulani', phone: '0800 000 0208', address: '6 Bourdillon Road, Ikoyi, Lagos', fleet: [['landcruiser', 1]] },
  { key: 'i09', name: 'Yewande Ogunsola', phone: '0800 000 0209', address: '11 Oniru Estate Road, Victoria Island, Lagos', fleet: [['rav4', 1]] },
  { key: 'i10', name: 'Chukwuebuka Anozie', phone: '0800 000 0210', address: '30 Ahmadu Bello Way, Victoria Island, Lagos', fleet: [['elantra', 1]] },
  { key: 'i11', name: 'Mosunmola Adeyemo-Coker', phone: '0800 000 0211', address: '2 Alexander Avenue, Ikoyi, Lagos', fleet: [['sorento', 1]] },
  { key: 'i12', name: 'Ikechukwu Odinaka', phone: '0800 000 0212', address: '45 Agungi Road, Lekki, Lagos', fleet: [['explorer', 1]] },
];

// ── Vehicles ────────────────────────────────────────────────────────────
/** Lagos fleets and private cars, 2006 to date. `code` makes the VIN; `fleet` routes the job to the fleet bay. */
export type CatalogueModel = { key: string; make: string; model: string; type: 'PASSENGER' | 'COMMERCIAL'; engine: string; years: [number, number]; wmi: string; code: string; diesel: boolean };
export const MODELS: CatalogueModel[] = [
  { key: 'hilux', make: 'Toyota', model: 'Hilux', type: 'COMMERCIAL', engine: '2GD-FTV', years: [2012, 2024], wmi: 'AHT', code: 'HLUX', diesel: true },
  { key: 'hiace', make: 'Toyota', model: 'Hiace', type: 'COMMERCIAL', engine: '2KD-FTV', years: [2010, 2023], wmi: 'JTF', code: 'HACE', diesel: true },
  { key: 'landcruiser', make: 'Toyota', model: 'Land Cruiser', type: 'PASSENGER', engine: '1VD-FTV', years: [2012, 2023], wmi: 'JTM', code: 'LCRZ', diesel: true },
  { key: 'corolla', make: 'Toyota', model: 'Corolla', type: 'PASSENGER', engine: '2ZR-FE', years: [2009, 2022], wmi: 'JTD', code: 'CRLA', diesel: false },
  { key: 'camry', make: 'Toyota', model: 'Camry', type: 'PASSENGER', engine: '2AR-FE', years: [2010, 2023], wmi: '4T1', code: 'CMRY', diesel: false },
  { key: 'ranger', make: 'Ford', model: 'Ranger', type: 'COMMERCIAL', engine: 'P5AT 2.2 TDCi', years: [2015, 2024], wmi: 'MPB', code: 'RNGR', diesel: true },
  { key: 'patrol', make: 'Nissan', model: 'Patrol', type: 'PASSENGER', engine: 'VK56VD', years: [2013, 2022], wmi: 'JN1', code: 'PTRL', diesel: false },
  { key: 'l200', make: 'Mitsubishi', model: 'L200', type: 'COMMERCIAL', engine: '4D56', years: [2012, 2022], wmi: 'MMB', code: 'L2KX', diesel: true },
  { key: 'h100', make: 'Hyundai', model: 'H-100', type: 'COMMERCIAL', engine: 'D4BB', years: [2010, 2021], wmi: 'KMF', code: 'H1KX', diesel: true },
  { key: 'sprinter', make: 'Mercedes-Benz', model: 'Sprinter 311 CDI', type: 'COMMERCIAL', engine: 'OM646', years: [2008, 2019], wmi: 'WDB', code: 'SPRT', diesel: true },
  { key: 'rx350', make: 'Lexus', model: 'RX 350', type: 'PASSENGER', engine: '2GR-FE', years: [2007, 2015], wmi: '2T2', code: 'RX35', diesel: false },
  { key: 'highlander', make: 'Toyota', model: 'Highlander', type: 'PASSENGER', engine: '2GR-FE', years: [2008, 2020], wmi: '5TD', code: 'HGLD', diesel: false },
  { key: 'c300', make: 'Mercedes-Benz', model: 'C300', type: 'PASSENGER', engine: 'M272', years: [2008, 2016], wmi: 'WDD', code: 'C3KX', diesel: false },
  { key: 'venza', make: 'Toyota', model: 'Venza', type: 'PASSENGER', engine: '2AR-FE', years: [2009, 2016], wmi: '4T3', code: 'VNZA', diesel: false },
  { key: 'accord', make: 'Honda', model: 'Accord', type: 'PASSENGER', engine: 'K24Z', years: [2006, 2017], wmi: '1HG', code: 'ACRD', diesel: false },
  { key: 'sienna', make: 'Toyota', model: 'Sienna', type: 'PASSENGER', engine: '2GR-FE', years: [2006, 2018], wmi: '5TD', code: 'SNNA', diesel: false },
  { key: 'es350', make: 'Lexus', model: 'ES 350', type: 'PASSENGER', engine: '2GR-FE', years: [2007, 2018], wmi: 'JTH', code: 'ES35', diesel: false },
  { key: 'rav4', make: 'Toyota', model: 'RAV4', type: 'PASSENGER', engine: '2AR-FE', years: [2013, 2024], wmi: 'JTM', code: 'RAV4', diesel: false },
  { key: 'elantra', make: 'Hyundai', model: 'Elantra', type: 'PASSENGER', engine: 'G4FG', years: [2012, 2022], wmi: 'KMH', code: 'ELNT', diesel: false },
  { key: 'sorento', make: 'Kia', model: 'Sorento', type: 'PASSENGER', engine: 'G6DB', years: [2011, 2021], wmi: 'KNA', code: 'SRNT', diesel: false },
  { key: 'explorer', make: 'Ford', model: 'Explorer', type: 'PASSENGER', engine: 'Duratec 35', years: [2011, 2019], wmi: '1FM', code: 'EXPL', diesel: false },
];
export const COLOURS = ['White', 'White', 'Silver', 'Black', 'Grey', 'Dark Blue', 'Champagne'];

/** Lagos-style plates, invented: three letters, three digits, two letters (EKY is Eti-Osa, where Victoria Island is). */
export const PLATE_PREFIXES = ['EKY', 'EKY', 'LND', 'KJA', 'LSR', 'APP', 'FST', 'SMK', 'KTU', 'MUS', 'AAA', 'EPE', 'LSD', 'AKD', 'GGE'];

// ── Workshop texts ──────────────────────────────────────────────────────
/** [what the customer reports, what the technician finds, the kind of job]. */
export const PASSENGER_COMPLAINTS = [
  ['Brakes squeal when stopping; pedal feels soft', 'Front pads worn to the wear indicator; discs scored; fluid dark', 'brakes'],
  ['Check engine light on; car jerks when accelerating', 'Scan shows misfire on cylinder 3 (P0303); ignition coil failed, plugs worn', 'diagnostics'],
  ['A/C blowing warm air in traffic', 'Condenser fan motor not running; system low on refrigerant', 'ac'],
  ['Knocking from the front over bumps on the expressway', 'Front shock absorbers leaking; stabiliser links worn', 'suspension'],
  ['Car will not start in the morning', 'Battery failed the load test; alternator output normal', 'battery'],
  ['Gear changes harsh and late; slipping between 2nd and 3rd', 'ATF dark and low; transmission filter blocked', 'gearbox'],
  ['Temperature gauge climbing in traffic', 'Radiator core leaking at the seam; thermostat sticking', 'cooling'],
  ['Steering vibrates at speed; tyres wearing on the inside', 'Tie-rod ends worn; front toe out of specification; tyres cupped', 'steering'],
  ['Driver’s window will not go up', 'Window regulator cable snapped; motor working', 'electrical'],
  ['Tyres worn and one keeps losing pressure', 'Four tyres below the legal tread; nail in the rear left', 'tyres'],
] as const satisfies readonly (readonly [string, string, string])[];
export const COMMERCIAL_COMPLAINTS = [
  ['Brakes pulling to one side with a load', 'Front pads worn; right caliper slide pins seized', 'brakes'],
  ['Clutch slipping on the bridge with a full load', 'Clutch plate worn below limit; pressure plate fingers scored', 'clutch'],
  ['Overheating in Lekki traffic', 'Radiator core blocked; thermostat sticking; fan clutch weak', 'cooling'],
  ['Black smoke and poor pulling power', 'Injectors dribbling; air filter blocked', 'injectors'],
  ['Rear sagging and knocking over potholes', 'Rear leaf spring cracked; shackle bushes worn', 'spring'],
  ['Engine light on; limp mode on the highway', 'Scan shows EGR valve stuck (P0401); boost hose cracked', 'diagnostics'],
  ['Hard to start in the morning; white smoke', 'Glow plugs 2 and 4 open circuit; battery weak', 'battery'],
  ['Vibration from under the vehicle at speed', 'Propeller shaft centre bearing worn', 'propshaft'],
  ['Tyres worn unevenly; steering pulls', 'Tyres past their life; wheel alignment out', 'tyres'],
  ['A/C not cooling for passengers', 'Rear A/C blower resistor burnt; low refrigerant', 'ac'],
] as const satisfies readonly (readonly [string, string, string])[];
export const SERVICE_TEXTS = ['Routine service', 'Carry out 5,000 km service', 'Carry out 10,000 km service', 'Preventive maintenance service', 'Service and safety check', 'Fleet preventive maintenance'];
/** Jobs that are not a repair or a service: what else the workshop sells. */
export const OTHER_JOBS = [
  ['Full valet before a company inspection', 'Interior stained; engine bay dusty', 'detailing'],
  ['Roadside call-out: vehicle will not start at the office', 'Battery flat; jump-started on site, towed in for a new battery', 'roadside'],
] as const satisfies readonly (readonly [string, string, string])[];

/** What the technician writes on the estimate for each kind of job. Prices in naira. */
export type LineSpec = { type: 'LABOUR' | 'STORE_PART' | 'EXTERNAL_PART' | 'EXTERNAL_JOB' | 'INTERNAL_JOB' | 'SUNDRY'; description: string; qty?: number; price: number; uom?: string };
const L = (description: string, price: number): LineSpec => ({ type: 'LABOUR', description, price });
const P = (description: string, price: number, qty = 1, uom = 'pcs'): LineSpec => ({ type: 'EXTERNAL_PART', description, price, qty, uom });
const S = (description: string, price: number): LineSpec => ({ type: 'SUNDRY', description, price });
const X = (description: string, price: number): LineSpec => ({ type: 'EXTERNAL_JOB', description, price });

export const JOB_LINES: Record<string, LineSpec[]> = {
  // Services: petrol cars, diesel pickups and SUVs, buses and vans.
  service: [L('Routine service: oil and filters, fluids, 27-point check', 25_000), P('Engine oil 5W-30 fully synthetic', 9_500, 5, 'litres'), P('Oil filter', 9_500), P('Air filter', 14_000), S('Workshop consumables (rags, cleaner, washers)', 4_500)],
  'service-diesel': [L('Diesel service: oil and filters, fluids, 32-point check', 35_000), P('Engine oil 15W-40 diesel', 9_800, 7, 'litres'), P('Oil filter (diesel)', 14_500), P('Fuel filter', 22_000), P('Air filter', 18_500), S('Workshop consumables (rags, cleaner, washers)', 5_000)],
  'service-van': [L('Bus and van service: oil and filters, brakes adjusted, 32-point check', 40_000), P('Engine oil 15W-40 diesel', 9_800, 8, 'litres'), P('Oil filter (diesel)', 15_500), P('Fuel filter', 24_000), P('Air filter', 19_500), S('Workshop consumables (rags, cleaner, washers)', 5_000)],
  // Repairs.
  brakes: [L('Replace front brake pads; skim front discs; bleed the system', 45_000), P('Brake pad set, front', 55_000), P('Brake fluid DOT 4', 8_500, 1, 'litres')],
  diagnostics: [L('Computer diagnosis (scan and report)', 20_000), L('Replace ignition coil and spark plugs; clear codes; road test', 18_000), P('Ignition coil', 48_000), P('Spark plug (iridium)', 9_500, 4)],
  ac: [L('A/C diagnosis, leak test, evacuate and recharge', 35_000), P('Condenser fan motor', 68_000), P('Cabin air filter', 12_000), S('Refrigerant R134a and compressor oil', 25_000)],
  suspension: [L('Replace front shock absorbers and stabiliser links', 45_000), P('Front shock absorber', 95_000, 2), P('Stabiliser link', 22_000, 2)],
  battery: [L('Battery load test, replace battery, clean terminals', 5_000), P('Battery 12V 75Ah (sealed)', 115_000)],
  gearbox: [L('Transmission service: drain, new filter, refill, adapt', 30_000), P('Automatic transmission fluid (ATF WS)', 12_500, 6, 'litres'), P('Transmission filter and gasket', 28_000)],
  cooling: [L('Replace radiator and thermostat; pressure test; refill', 35_000), P('Radiator', 135_000), P('Thermostat and gasket', 28_000), S('Coolant (long life), 4 litres', 24_000)],
  steering: [L('Replace tie-rod ends; four-wheel alignment', 30_000), P('Tie-rod end', 32_000, 2), S('Split pins and grease', 2_500)],
  electrical: [L('Replace driver’s window regulator; test all windows', 25_000), P('Window regulator, front right', 58_000)],
  tyres: [L('Fit and balance four tyres; wheel alignment', 18_000), P('Tyre (all-season, 17-inch)', 145_000, 4), S('Valves and balancing weights', 4_000)],
  clutch: [L('Remove gearbox; replace clutch kit; skim flywheel; refit', 85_000), P('Clutch kit (plate, pressure plate, release bearing)', 245_000), S('Gear oil top-up and sealant', 9_000)],
  injectors: [L('Remove and refit injectors; replace air filter; road test', 30_000), X('Injector cleaning and test (outside diesel specialist)', 85_000), P('Air filter', 18_500)],
  spring: [L('Remove rear spring pack; replace cracked leaf and shackle bushes', 55_000), P('Rear leaf spring (main leaf)', 98_000), P('Shackle bush kit', 18_000)],
  propshaft: [L('Remove propeller shaft; replace centre bearing; balance check', 40_000), P('Propeller shaft centre bearing', 62_000)],
  detailing: [L('Full valet: interior shampoo, engine wash, polish and wax', 45_000), S('Detailing chemicals and microfibre', 8_000)],
  roadside: [L('Roadside call-out, Victoria Island and Lekki (24/7)', 35_000), X('Tow to the workshop', 45_000), L('Battery load test, replace battery, clean terminals', 5_000), P('Battery 12V 75Ah (sealed)', 115_000)],
};

/** The estimate lines for a service on this model. */
export const serviceKindFor = (m: Pick<CatalogueModel, 'diesel' | 'key'>): 'service' | 'service-diesel' | 'service-van' => (['hiace', 'h100', 'sprinter'].includes(m.key) ? 'service-van' : m.diesel ? 'service-diesel' : 'service');

// ── Security, scheduling, support texts ─────────────────────────────────
export const BROADCASTS: { category: 'NEWS' | 'ANNOUNCEMENT' | 'IMPORTANT' | 'URGENT' | 'SECURITY_ALERT' | 'MAINTENANCE' | 'GREETING'; title: string; message: string; daysAgo: number; days: number; audience: 'ALL' | 'BRANCH' | 'CUSTOMERS_ALL' }[] = [
  { category: 'MAINTENANCE', title: 'Generator service on Saturday', message: 'The standby generator will be serviced on Saturday from 08:00 to 12:00. Expect short power interruptions in the workshop and the wash bay.', daysAgo: 3, days: 6, audience: 'BRANCH' },
  { category: 'ANNOUNCEMENT', title: 'Fleet invoices: month-end review', message: 'Finance reviews every fleet invoice past its due date on the last Friday of the month. Supervisors: make sure every finished job card has its invoice.', daysAgo: 10, days: 30, audience: 'BRANCH' },
  { category: 'SECURITY_ALERT', title: 'Visitor passes must be returned', message: 'Every visitor pass is returned at the gate on the way out. Security will hold any vehicle whose driver has no pass to return.', daysAgo: 20, days: 60, audience: 'ALL' },
  { category: 'NEWS', title: 'Roadside assistance now 24/7', message: 'Our roadside team now answers calls day and night across Victoria Island, Ikoyi and Lekki. The front desk has the call-out roster.', daysAgo: 14, days: 30, audience: 'ALL' },
  { category: 'GREETING', title: 'Happy new month', message: 'Thank you for a strong month in the workshop. The management wishes every colleague a good month ahead.', daysAgo: 1, days: 7, audience: 'ALL' },
  { category: 'IMPORTANT', title: 'December fleet maintenance slots', message: 'Fleet customers: book your December preventive maintenance with the front desk before the 15th. Weekday slots open from 07:30.', daysAgo: 5, days: 25, audience: 'CUSTOMERS_ALL' },
];
export const TICKETS: { channel: 'CUSTOMER_PORTAL' | 'WEBSITE' | 'EMAIL' | 'STAFF'; subject: string; summary: string; priority: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW'; status: 'OPEN' | 'WAITING_ON_CUSTOMER' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED'; daysAgo: number; replies: { from: 'customer' | 'agent' | 'ai' | 'note'; text: string; hoursLater: number }[]; customerKey?: string; complaint?: boolean }[] = [
  { channel: 'CUSTOMER_PORTAL', subject: 'Question about the estimate', summary: 'The estimate for the brakes is in my portal. Is the disc skimming necessary?', priority: 'NORMAL', status: 'OPEN', daysAgo: 1, customerKey: 'customer.individual', replies: [{ from: 'ai', text: 'Thank you for your message. The supervisor will explain the disc skimming and call you today; you can approve the estimate in the portal when you are ready.', hoursLater: 0.2 }] },
  { channel: 'EMAIL', subject: 'Complaint: scratch on the bumper after the wash', summary: 'The vehicle came back from detailing with a scratch on the rear bumper that was not there before.', priority: 'HIGH', status: 'OPEN', daysAgo: 2, customerKey: 'i04', complaint: true, replies: [{ from: 'agent', text: 'We are sorry about this. Our supervisor will inspect the bumper on your next visit and compare it with the check-in photographs. May we book you in on Thursday at 09:00?', hoursLater: 3 }, { from: 'customer', text: 'Thursday 09:00 is fine.', hoursLater: 6 }] },
  { channel: 'WEBSITE', subject: 'Do you maintain Sprinter vans?', summary: 'We run four Sprinter vans. Do you take them on, and on what terms?', priority: 'LOW', status: 'RESOLVED', daysAgo: 12, replies: [{ from: 'agent', text: 'Yes: our fleet bay maintains Sprinters. Fleet customers can apply for 30-day credit terms; the front desk will send the application.', hoursLater: 2 }] },
  { channel: 'CUSTOMER_PORTAL', subject: 'Statement of account for October', summary: 'Please send our statement and the invoices still open for October.', priority: 'NORMAL', status: 'RESOLVED', daysAgo: 20, customerKey: 'customer.fleet', replies: [{ from: 'agent', text: 'Sent to accounts payable. Each invoice is also under the job card in your portal.', hoursLater: 1.5 }] },
  { channel: 'STAFF', subject: 'Front desk printer not printing invoices', summary: 'The front desk printer shows a paper jam light but there is no paper stuck.', priority: 'NORMAL', status: 'CLOSED', daysAgo: 15, replies: [{ from: 'agent', text: 'Rollers cleaned and the sensor reset; printing again.', hoursLater: 2 }] },
  { channel: 'EMAIL', subject: 'Invoice past due: payment schedule', summary: 'We will pay the two September invoices in two parts; please confirm.', priority: 'HIGH', status: 'WAITING_ON_CUSTOMER', daysAgo: 4, customerKey: 'dori', replies: [{ from: 'agent', text: 'Finance can accept two parts. Please confirm the dates so we can note them on the account.', hoursLater: 5 }] },
  { channel: 'WEBSITE', subject: 'Opening hours on public holidays', summary: 'Are you open on the public holiday next week?', priority: 'LOW', status: 'CLOSED', daysAgo: 30, replies: [{ from: 'ai', text: 'The workshop is closed on public holidays; roadside assistance still answers calls day and night.', hoursLater: 0.1 }] },
  { channel: 'CUSTOMER_PORTAL', subject: 'Change the contact phone on my account', summary: 'My number has changed; please update it to the one on this message.', priority: 'LOW', status: 'RESOLVED', daysAgo: 25, customerKey: 'i02', replies: [{ from: 'agent', text: 'Updated. You will receive the next service reminder on the new number.', hoursLater: 1 }] },
  { channel: 'STAFF', subject: 'Cannot add a discount on the estimate', summary: 'The discount box is greyed out on a fleet estimate.', priority: 'HIGH', status: 'RESOLVED', daysAgo: 6, replies: [{ from: 'note', text: 'The estimate had already been approved by the Manager; it was sent back for changes first.', hoursLater: 1 }, { from: 'agent', text: 'Send the estimate back for changes, then add the discount; above 10% it goes to the Manager.', hoursLater: 1.2 }] },
  { channel: 'EMAIL', subject: 'Fleet service plan for December', summary: 'Please propose a service plan for our pickups and the Land Cruisers in December.', priority: 'NORMAL', status: 'ON_HOLD', daysAgo: 8, customerKey: 'desicon', replies: [{ from: 'agent', text: 'We will send a proposed plan once the December bay schedule is confirmed next week.', hoursLater: 4 }] },
  { channel: 'WEBSITE', subject: 'Price of a Camry service', summary: 'How much is a routine service for a 2016 Camry?', priority: 'LOW', status: 'RESOLVED', daysAgo: 40, replies: [{ from: 'ai', text: 'A routine service for the Camry is from ₦98,000, with fully synthetic oil, filters and labour.', hoursLater: 0.1 }] },
  { channel: 'CUSTOMER_PORTAL', subject: 'Estimate seems high', summary: 'The estimate for the gearbox is more than I expected. Can it be reviewed?', priority: 'NORMAL', status: 'CLOSED', daysAgo: 45, customerKey: 'i05', replies: [{ from: 'agent', text: 'The supervisor has reviewed it: the transmission fluid is the maker’s grade; we can take 5% off the labour, which brings the estimate down.', hoursLater: 20 }, { from: 'customer', text: 'Thank you, please go ahead.', hoursLater: 26 }] },
  { channel: 'STAFF', subject: 'Wash bay pressure washer tripping', summary: 'The pressure washer trips the breaker every few minutes.', priority: 'URGENT', status: 'OPEN', daysAgo: 0.2, replies: [] },
  { channel: 'WEBSITE', subject: 'Complaint: waited an hour at reception', summary: 'I waited an hour on Tuesday before anyone attended to me.', priority: 'HIGH', status: 'OPEN', daysAgo: 3, complaint: true, replies: [{ from: 'ai', text: 'We are sorry for the wait. The Customer Care Lead has been informed and will call you today.', hoursLater: 0.2 }] },
  { channel: 'CUSTOMER_PORTAL', subject: 'Service reminder received — book me in', summary: 'The reminder says my RAV4 is due for its service. Please book next Tuesday.', priority: 'NORMAL', status: 'RESOLVED', daysAgo: 9, customerKey: 'i09', replies: [{ from: 'agent', text: 'Booked for Tuesday at 08:00.', hoursLater: 1 }] },
  { channel: 'WEBSITE', subject: 'Do you buy used vehicles?', summary: 'I have a 2014 Hilux to sell.', priority: 'LOW', status: 'CLOSED', daysAgo: 60, replies: [{ from: 'agent', text: 'We do not buy vehicles, but we can inspect one for you before you sell or buy.', hoursLater: 24 }] },
];
/** The records brought in before the demo's first day: Zoho Books, Zoho CRM and the workshop's own spreadsheets. */
export const IMPORTS: { entity: string; fileName: string; rows: number; created: number; warnings: number; rejected: number; daysAgo: number; totals?: { lines: number; quantity?: number; value: number } }[] = [
  { entity: 'customers', fileName: 'Zoho Books contacts export.csv', rows: 214, created: 209, warnings: 7, rejected: 5, daysAgo: 214 },
  { entity: 'vehicles', fileName: 'Vehicles register (our spreadsheet).xlsx', rows: 286, created: 281, warnings: 9, rejected: 5, daysAgo: 213 },
  { entity: 'invoices', fileName: 'Zoho Books invoices 2024-2026.xlsx', rows: 1_640, created: 1_622, warnings: 21, rejected: 18, daysAgo: 212, totals: { lines: 1_622, value: 187_420_500 } },
  { entity: 'jobs', fileName: 'Past job cards 2024-2026.xlsx', rows: 1_180, created: 1_162, warnings: 30, rejected: 18, daysAgo: 211 },
  { entity: 'staff', fileName: 'Staff list.xlsx', rows: 18, created: 18, warnings: 0, rejected: 0, daysAgo: 215 },
];
export const EXPORTS: { kind: string; format: 'xlsx' | 'csv'; summary: string; rows: number; daysAgo: number }[] = [
  { kind: 'job-cards', format: 'xlsx', summary: 'Job Cards · Victoria Island Workshop · last 30 days', rows: 48, daysAgo: 1 },
  { kind: 'invoices', format: 'xlsx', summary: 'Invoices · fleet accounts · this quarter', rows: 36, daysAgo: 2 },
  { kind: 'customers', format: 'csv', summary: 'Customers · organisation accounts', rows: 6, daysAgo: 6 },
  { kind: 'vehicles', format: 'xlsx', summary: 'Vehicles · every customer', rows: 32, daysAgo: 12 },
];
