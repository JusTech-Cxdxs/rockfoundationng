/**
 * Background on the organisation for Enyo, from the public record, so that
 * "where is the workshop", "what services do we offer" or "when are we open"
 * are answered even when the web look-up is refused from the server (free
 * search engines often refuse data-centre addresses). Facts only — no prices,
 * no personal contact details (only the business's own published phones and
 * email). The organisation's own records (organisation_info) always win over
 * this; it is background, not the source of truth.
 *
 * Keyed by organisation slug, with a general entry for the platform.
 */
export type OrganisationKnowledge = {
  summary: string;
  facts: string[];
  /** Public background on people the organisation itself names in press releases and on its website: name, public title, one line. */
  people: { name: string; title: string; note: string; source: string }[];
  sources: { label: string; href: string }[];
};

const ROCK_FOUNDATION: OrganisationKnowledge = {
  summary:
    'ROCK FOUNDATION AUTOMOBILE INVESTMENT LTD (RC 1772429, "Rock Foundation Automobile", tagline "Trust your vehicle to the certified service experts.") is an auto workshop in Ota, Ogun State, for all makes of vehicle, that also sells spare parts.',
  facts: [
    'Head office: 1, Heal The World Avenue, Opp. Gateway Hotel, Ota, Ogun State.',
    'Services: auto diagnostics and computer diagnostic testing, general repair and maintenance, repairs and parts, spraying (own spray booth), car wash, servicing; fuel, exhaust, transmission, cooling, starting and charging, electrical, brakes, A/C, steering and suspension, wheel alignment, CV axles, emissions, tune-up and oil change.',
    'Phones: +234 803 304 9194 and +234 802 389 1766.',
    'Website: https://rockfoundationng.com',
  ],
  people: [],
  sources: [{ label: 'Rock Foundation Automobile', href: 'https://rockfoundationng.com' }],
};

const BY_SLUG: Record<string, OrganisationKnowledge> = { 'rock-foundation': ROCK_FOUNDATION, 'rock-foundation-automobile': ROCK_FOUNDATION, rockfoundation: ROCK_FOUNDATION };

/** Background for an organisation, by slug or name; null when the platform knows nothing about it. */
export function organisationKnowledge(slugOrName: string | null | undefined): OrganisationKnowledge | null {
  const key = (slugOrName ?? '').toLowerCase().trim();
  if (!key) return null;
  if (BY_SLUG[key]) return BY_SLUG[key]!;
  if (/rock.?foundation/.test(key)) return ROCK_FOUNDATION;
  return null;
}

/** The people in the background whose name or title matches the words asked (all of them when nothing was asked). */
export function knownPeople(k: OrganisationKnowledge, terms: string[]): OrganisationKnowledge['people'] {
  if (!terms.length) return k.people;
  // Whole words, so "IT" finds Information Technology and not Smith.
  const words = terms.map((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
  return k.people.filter((p) => words.some((w) => w.test(p.name) || w.test(p.title)));
}
