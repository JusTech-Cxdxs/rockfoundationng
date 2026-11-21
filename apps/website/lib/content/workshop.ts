/**
 * Rock Foundation Automobile's own published facts (rockfoundationng.com),
 * for the customer portal, the legal pages, the support page and Enyo. Only
 * what the business publishes; no staff names. Opening hours are not
 * published, so they come from the Support centre's settings once saved.
 */
export const WORKSHOP = {
  legalName: 'ROCK FOUNDATION AUTOMOBILE INVESTMENT LTD',
  rcNumber: 'RC 1772429',
  name: 'Rock Foundation Automobile',
  tagline: 'Trust your vehicle to the certified service experts.',
  summary: 'A full-service auto workshop in Ota, Ogun State, for all car makes: diagnostics, repairs, servicing, spraying in our own spray booth, car wash and spare parts.',
  address: '1, Heal The World Avenue, Opp. Gateway Hotel, Ota, Ogun State',
  postalAddress: 'P.O. Box 257, Ota, Ogun State',
  phones: ['+234 803 304 9194', '+234 802 389 1766'],
  email: null as string | null,
  hours: null as string | null,
  /** Opening hours as the Support centre stores them ({"1":["08:00","18:00"],…}); none published yet. */
  hoursByDay: {} as Record<string, [string, string]>,
  website: 'https://rockfoundationng.com',
  services: ['Auto diagnostics', 'General repair and maintenance', 'Repairs and parts', 'Spraying (own spray booth)', 'Car wash', 'Servicing and sales'],
} as const;
