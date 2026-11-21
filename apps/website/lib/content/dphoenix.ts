/**
 * D'Phoenix Autocare's own published facts, for the customer portal, the
 * legal pages, the support page and Enyo. Only what the business publishes;
 * no staff or founder names.
 */
export const DPHOENIX = {
  legalName: 'D\'PHOENIX AUTOCARE LIMITED',
  name: 'D\'Phoenix Autocare',
  tagline: 'Restore Life To Your Vehicle',
  summary: 'An auto workshop in Victoria Island, Lagos, for vehicles from 2006 to the present. We also maintain fleets for client companies.',
  address: 'Plot 1 Muri Okunola Street, opposite NNPC Hospital, beside Prime Shopping Complex, Sandfill Bus Stop, Victoria Island, Lagos',
  phones: ['+234 811 496 6212', '+234 807 654 4837'],
  email: 'dphoenixautocare@gmail.com',
  hours: 'Monday to Saturday 8:00 AM to 6:00 PM; Sunday closed',
  /** The same hours as the Support centre stores them ({"1":["08:00","18:00"],…}; a missing day is closed). */
  hoursByDay: { 1: ['08:00', '18:00'], 2: ['08:00', '18:00'], 3: ['08:00', '18:00'], 4: ['08:00', '18:00'], 5: ['08:00', '18:00'], 6: ['08:00', '18:00'] } as Record<string, [string, string]>,
  website: 'https://www.dphoenixautocare.com',
  services: ['Fleet Maintenance', 'Diagnostics & Repairs', 'Preventive Maintenance', 'Car Wash & Detailing', 'Roadside Assistance (24/7)', 'Tire Services'],
} as const;
