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

const DPHOENIX: OrganisationKnowledge = {
  summary:
    'D\'PHOENIX AUTOCARE LIMITED ("D\'Phoenix Autocare", tagline "Restore Life To Your Vehicle") is an auto workshop in Victoria Island, Lagos, for vehicles from 2006 to the present, that also maintains vehicle fleets for client companies.',
  facts: [
    'Address: Plot 1 Muri Okunola Street, opposite NNPC Hospital, beside Prime Shopping Complex, Sandfill Bus Stop, Victoria Island, Lagos.',
    'Works on vehicles from 2006 to the present, and maintains vehicle fleets for client companies.',
    'Services: Fleet Maintenance, Diagnostics & Repairs, Preventive Maintenance, Car Wash & Detailing, Roadside Assistance (24/7) and Tire Services.',
    'Phones: +234 811 496 6212 and +234 807 654 4837. Email: dphoenixautocare@gmail.com.',
    'Opening hours: Monday to Saturday, 8:00 AM to 6:00 PM; closed on Sunday. Roadside Assistance runs 24/7.',
    'Website: https://www.dphoenixautocare.com',
  ],
  people: [],
  sources: [{ label: 'D\'Phoenix Autocare', href: 'https://www.dphoenixautocare.com' }],
};

const BY_SLUG: Record<string, OrganisationKnowledge> = { 'dphoenix-autocare': DPHOENIX, dphoenix: DPHOENIX, 'dphoenix-autocare-limited': DPHOENIX };

/** Background for an organisation, by slug or name; null when the platform knows nothing about it. */
export function organisationKnowledge(slugOrName: string | null | undefined): OrganisationKnowledge | null {
  const key = (slugOrName ?? '').toLowerCase().trim();
  if (!key) return null;
  if (BY_SLUG[key]) return BY_SLUG[key]!;
  if (/d.?phoenix/.test(key)) return DPHOENIX;
  return null;
}

/** The people in the background whose name or title matches the words asked (all of them when nothing was asked). */
export function knownPeople(k: OrganisationKnowledge, terms: string[]): OrganisationKnowledge['people'] {
  if (!terms.length) return k.people;
  // Whole words, so "IT" finds Information Technology and not Mittal.
  const words = terms.map((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
  return k.people.filter((p) => words.some((w) => w.test(p.name) || w.test(p.title)));
}
