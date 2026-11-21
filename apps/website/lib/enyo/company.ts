/**
 * What Enyo may say about the organisation: only what the database and the
 * website's own configuration hold. Nothing is invented — a missing fact
 * (opening hours, prices) is reported as missing.
 */
import { prisma } from '@ejo/database';
import { siteConfig } from '@/lib/site-config';
import { DPHOENIX } from '@/lib/content/dphoenix';

export type CompanyInfo = {
  organisation: string;
  headOffice: { address: string | null; phones: string[]; email: string | null; website: string | null };
  branches: { name: string; area: string | null; address: string | null; phones: string[]; email: string | null }[];
  openingHours: string | null;
  businesses: string[];
  /** D'Phoenix Autocare's own published facts (lib/content/dphoenix.ts). */
  about: { company: string; tagline: string; whatWeDo: string; address: string; services: string[]; phones: string[]; email: string; openingHours: string; website: string };
  websitePages: { title: string; link: string }[];
  howToBook: string[];
  customerPortal: string;
  notes: string[];
};

const unique = (xs: (string | null | undefined)[]) => [...new Set(xs.map((x) => (x ?? '').trim()).filter(Boolean))];

export async function loadCompanyInfo(organisationId: string): Promise<CompanyInfo> {
  const [org, branches, units] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true, hotlines: true, email: true, hqAddress: true, website: true } }),
    prisma.branch.findMany({
      where: { isActive: true, businessUnit: { organisationId, isActive: true } },
      orderBy: { name: 'asc' },
      take: 30,
      select: { name: true, address: true, hotlines: true, email: true, city: { select: { name: true, state: { select: { name: true } } } } },
    }),
    prisma.businessUnit.findMany({ where: { organisationId, isActive: true }, orderBy: { name: 'asc' }, take: 20, select: { name: true } }),
  ]);
  // Opening hours from the Support centre's set-up, when an administrator has saved them.
  const setting = await prisma.supportSetting.findUnique({ where: { organisationId }, select: { hours: true } }).catch(() => null);
  // D'Phoenix Autocare's published contacts fill what the records leave empty.
  const recorded = unique([...(org?.hotlines ?? []), siteConfig.contact.phone]);
  const phones = recorded.length ? recorded : [...DPHOENIX.phones];
  const email = org?.email?.trim() || siteConfig.contact.email || DPHOENIX.email;
  return {
    organisation: org?.name || siteConfig.organisationName,
    headOffice: { address: org?.hqAddress?.trim() || siteConfig.contact.address || DPHOENIX.address, phones, email, website: org?.website?.trim() || DPHOENIX.website },
    branches: branches.map((b) => ({
      name: b.name,
      area: [b.city?.name, b.city?.state?.name].filter(Boolean).join(', ') || null,
      address: b.address?.trim() || null,
      phones: unique(b.hotlines),
      email: b.email?.trim() || null,
    })),
    openingHours: setting?.hours ? hoursText(setting.hours) : DPHOENIX.hours,
    businesses: unique(units.map((u) => u.name)),
    // D'Phoenix Autocare's own facts (lib/content/dphoenix.ts), so the business is described without the web.
    about: {
      company: `${DPHOENIX.legalName} (${DPHOENIX.name})`,
      tagline: DPHOENIX.tagline,
      whatWeDo: DPHOENIX.summary,
      address: DPHOENIX.address,
      services: [...DPHOENIX.services],
      phones: [...DPHOENIX.phones],
      email: DPHOENIX.email,
      openingHours: DPHOENIX.hours,
      website: DPHOENIX.website,
    },
    // The support page and the customer portal are the pages to link to.
    websitePages: [{ title: 'Customer support', link: '/support' }, { title: 'Customer portal', link: '/customer-portal' }],
    howToBook: [
      'Call or email the workshop to book a service or repair; the team arranges the time with you.',
      'Existing customers can follow their vehicles, estimates and payments in the customer portal.',
    ],
    customerPortal: '/customer-portal',
    notes: [
      ...(setting?.hours ? ['Closed on public holidays.'] : []),
      'Prices are not published. Repairs are estimated after the vehicle is inspected.',
      'No staff list is published here. Never give out anyone\'s personal phone number, email or address.',
    ],
  };
}

/** {"1":["08:00","17:00"],…} → "Monday 08:00–17:00; …; Sunday closed" (Lagos time). */
function hoursText(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const names = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const parts = [1, 2, 3, 4, 5, 6, 7].map((d) => {
    const v = (json as Record<string, unknown>)[String(d)];
    return Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string' ? `${names[d]} ${v[0]}–${v[1]}` : `${names[d]} closed`;
  });
  return `${parts.join('; ')} (Lagos time)`;
}
