/**
 * Support text helpers: comparable tokens for matching a customer's words
 * with earlier questions, and a scrubber that removes what could identify a
 * person before text is kept for learning.
 *
 * Pure (no database, no framework imports) so it is unit-tested directly.
 * Workshop complaints are short, typed in a hurry and full of local wording
 * ("AC not cooling", "the car is shaking", "won't start"), so before
 * comparing we:
 *   1. lower-case and strip punctuation (keeping the meaning of "won't"),
 *   2. map common English and Nigerian-English workshop phrases to one
 *      canonical token each ("a/c", "aircon", "air condition" → aircon),
 *   3. drop filler words, and lightly stem what is left ("leaking" → "leak").
 */
/** Phrases → canonical token. Longest phrases are applied first. */
const PHRASES: Record<string, string[]> = {
  aircon: ['air conditioning', 'air conditioner', 'air condition', 'air con', 'aircondition', 'airconditioner', 'aircon', 'a c', 'ac', 'a/c', 'acs'],
  notcooling: ['not cooling', 'no cooling', 'not cold', 'not chilling', 'blowing hot air', 'blowing hot', 'hot air', 'not cooling well', 'cooling poorly', 'weak cooling'],
  brakepad: ['brake pads', 'brake pad', 'brake lining', 'brake linings', 'brake shoes', 'brake shoe', 'pads', 'pad'],
  brakedisc: ['brake discs', 'brake disc', 'brake disk', 'brake rotor', 'brake rotors', 'rotor', 'rotors'],
  brakefluid: ['brake fluid', 'brake oil'],
  vibration: ['vibrations', 'vibration', 'vibrating', 'vibrates', 'vibrate', 'shaking', 'shakes', 'shake', 'wobbling', 'wobbles', 'wobble', 'trembling', 'trembles'],
  knocking: ['knocking sound', 'knocking noise', 'knocking', 'knocks', 'knock'],
  nostart: ['will not start', 'won t start', 'wont start', 'not starting', 'not start', 'refuse to start', 'refuses to start', 'refusing to start', 'cannot start', 'can t start', 'cant start', 'no start', 'does not start', 'doesn t start', 'doesnt start', 'difficult to start', 'hard to start', 'hard starting', 'not cranking', 'no crank'],
  checkengine: ['check engine light', 'check engine lamp', 'engine check light', 'engine light', 'engine lamp', 'check engine', 'cel', 'mil light'],
  overheating: ['overheating', 'overheats', 'overheat', 'over heating', 'heating up', 'temperature rising', 'temperature high', 'high temperature', 'running hot'],
  squeal: ['squealing', 'squeals', 'squeal', 'squeaking', 'squeaks', 'squeak', 'screeching', 'screech'],
  oilleak: ['oil leakage', 'oil leaking', 'leaking oil', 'oil leak', 'oil leaks', 'losing oil'],
  coolantleak: ['coolant leak', 'water leak', 'leaking water', 'leaking coolant', 'coolant leaking'],
  oilchange: ['oil change', 'change oil', 'engine oil change', 'oil service'],
  engineoil: ['engine oil', 'motor oil'],
  service: ['general service', 'routine service', 'routine maintenance', 'full service', 'minor service', 'major service', 'servicing', 'service'],
  gearbox: ['transmission', 'gearbox', 'gear box', 'gear'],
  tyre: ['tyres', 'tires', 'tyre', 'tire'],
  alignment: ['wheel alignment', 'alignment', 'aligning'],
  balancing: ['wheel balancing', 'balancing', 'balance'],
  battery: ['batteries', 'battery', 'batt'],
  shockabsorber: ['shock absorbers', 'shock absorber', 'shocks', 'shock', 'absorbers', 'absorber'],
  sparkplug: ['spark plugs', 'spark plug', 'plugs', 'plug'],
  fanbelt: ['fan belts', 'fan belt', 'drive belt', 'serpentine belt', 'alternator belt'],
  timingbelt: ['timing belts', 'timing belt', 'timing chain'],
  noise: ['noises', 'noise', 'noisy', 'sound', 'sounds', 'sounding'],
  jerking: ['jerking', 'jerks', 'jerk', 'jumping'],
  smoke: ['smoking', 'smokes', 'smoke'],
  steering: ['steering wheel', 'steering'],
  radiator: ['radiators', 'radiator'],
  wiper: ['wipers', 'wiper'],
  headlamp: ['headlights', 'headlight', 'headlamps', 'headlamp'],
  fuelpump: ['fuel pump', 'petrol pump'],
  injector: ['injectors', 'injector'],
  clutch: ['clutch plate', 'clutch'],
  suspension: ['suspension'],
  lowpower: ['low power', 'loss of power', 'losing power', 'no power', 'weak engine', 'not pulling', 'no pulling power'],
};

/** Words that carry no meaning for "what was wrong" in a workshop. */
const STOPWORDS = new Set(
  ('a an the and or but if of to in on at by for from with without into onto over under up down out off is are was were be been being am ' +
    'it its it s this that these those there here i me my we our you your he she they them their his her him ' +
    'do does did done doing have has had having will would should could can may might must shall ' +
    'not no yes very too also just only so then than when while where which who whom what why how ' +
    'please pls kindly customer client complain complains complained complaint complaints says said reports reported report ' +
    'car vehicle vehicles cars motor truck bus jeep machine the car ' +
    'check checking checked inspect inspection look looking see seen ' +
    'some any all every each other another more most much many few little ' +
    'time times day days week weeks now still again always sometimes often ' +
    'when whenever after before during since until ' +
    'etc ok okay well good bad').split(/\s+/).filter(Boolean),
);

/** Canonical tokens are never stemmed or dropped. */
const CANONICAL = new Set(Object.keys(PHRASES));

/** Phrase table compiled once, longest phrase first, as whole-word patterns. */
const PHRASE_RULES: { re: RegExp; token: string }[] = Object.entries(PHRASES)
  .flatMap(([token, list]) => list.map((p) => ({ phrase: p.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(), token })))
  .filter((r) => r.phrase.length > 0)
  .sort((a, b) => b.phrase.length - a.phrase.length)
  .map((r) => ({ re: new RegExp(`(^| )${r.phrase}(?= |$)`, 'g'), token: r.token }));

/** Lower case, contractions kept readable, punctuation → spaces, one space between words. */
export function normaliseText(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/n't\b/g, 'nt')
    .replace(/\ba\/c\b/g, ' ac ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Applies the phrase table: every known phrase becomes its canonical token. */
export function applySynonyms(normalised: string): string {
  let s = normalised;
  for (const { re, token } of PHRASE_RULES) s = s.replace(re, `$1${token}`);
  return s.replace(/\s+/g, ' ').trim();
}

/** A light English stemmer: plurals and -ing / -ed endings, nothing clever. */
export function stem(word: string): string {
  if (CANONICAL.has(word) || word.length <= 3) return word;
  let w = word;
  if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) w = w.slice(0, -1);
  // -ing / -ed only when a real word is left ("leaking" → "leak"; "speed", "string" stay).
  const cut = w.endsWith('ing') && w.length > 5 ? 3 : w.endsWith('ed') && !w.endsWith('eed') && w.length > 4 ? 2 : 0;
  if (cut && /[aeiouy]/.test(w.slice(0, -cut))) {
    w = w.slice(0, -cut);
    if (/(.)\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1);
  }
  return w;
}

/** Complaint text → meaningful tokens (order kept, duplicates kept for term frequency). */
export function tokenise(raw: string): string[] {
  const s = applySynonyms(normaliseText(raw));
  if (!s) return [];
  const out: string[] = [];
  for (const t of s.split(' ')) {
    if (!t || STOPWORDS.has(t)) continue;
    // Pure numbers (mileage, years, plate fragments) say nothing about the fault.
    if (/^\d+$/.test(t)) continue;
    const w = stem(t);
    if (w.length < 2 || STOPWORDS.has(w)) continue;
    out.push(w);
  }
  return out;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Nigerian and international phone numbers: +234 803 123 4567, 0803-123-4567, 08031234567, (01) 234 5678.
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}\b/g;
const PLATE_JOINED = /\b[A-Z][A-Z0-9]{1,2}-?\d{2,4}-?[A-Z]{1,3}\b/gi;
const PLATE_SPACED = /\b[A-Z]{2,3} \d{2,4} [A-Z]{1,3}\b/g;
// Seventeen-character VINs.
const VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;
const URL_RE = /\bhttps?:\/\/\S+/gi;

/**
 * Removes what could identify a person from free text: email addresses,
 * phone numbers, number plates, VINs, links, and any of the given names
 * (the customer's and the staff's own names, matched as whole words).
 */
export function scrubText(text: string, names: string[] = []): string {
  let s = String(text ?? '');
  s = s.replace(URL_RE, '[link]').replace(EMAIL, '[email]').replace(VIN, (m) => (/\d/.test(m) ? '[vin]' : m)).replace(PLATE_SPACED, '[plate]').replace(PLATE_JOINED, '[plate]');
  s = s.replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 7 ? '[phone]' : m));
  const parts = new Set<string>();
  for (const n of names) {
    for (const p of String(n ?? '').split(/\s+/)) {
      const w = p.replace(/[^\p{L}'-]/gu, '');
      if (w.length >= 3) parts.add(w);
    }
  }
  for (const p of [...parts].sort((a, b) => b.length - a.length)) {
    s = s.replace(new RegExp(`(^|[^\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'giu'), '$1[name]');
  }
  return s.replace(/\s+/g, ' ').trim().slice(0, 1000);
}
