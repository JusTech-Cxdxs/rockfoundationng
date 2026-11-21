/**
 * The demo organisation: "Rock Foundation Automobile (Demo)", slug
 * rock-foundation-demo, kept apart from the real Rock Foundation Automobile
 * organisation so that nothing of the demo ever mixes with real customers,
 * vehicles or money.
 *
 * Made only when the platform owner asks for the demo (DEMO_STAFF_PASSWORD
 * on a deploy, `npm run demo:people` / `npm run demo:reset`, or the demo
 * console), and marked isDemo from the start. It has its own business unit,
 * its own Ota workshop (with the departments of a working workshop:
 * mechanical, electrical and diagnostics, body and spraying, car wash), every
 * optional role switched on, the service interval, VAT, deposit and discount
 * settings a working workshop would have, and invented contact details only
 * (0800 000 numbers, an example email domain).
 *
 * Idempotent: a second call finds it and changes nothing. Takes the Prisma
 * client it should use, like lib/demo/people-load.ts. No '@/…' imports: tsx
 * runs this file outside Next.
 */
import type { PrismaClient } from '@prisma/client';
import { DEMO_DOMAIN } from './people';

export const DEMO_ORG_SLUG = 'rock-foundation-demo';
export const DEMO_ORG_NAME = 'Rock Foundation Automobile (Demo)';
/** The real organisation (packages/database/prisma/seed.ts): never marked as a demo, never given demo records. */
export const REAL_ORG_SLUG = 'rock-foundation';

const DEMO_ADDRESS = 'Ota, Ogun State (demo address)';
const DEMO_HOTLINES = ['0800 000 0001', '0800 000 0002'];

/** The slug the demo tooling uses: DEMO_ORG_SLUG from the environment, or rock-foundation-demo. */
export function demoOrgSlug(env: Record<string, string | undefined> = process.env): string {
  return (env.DEMO_ORG_SLUG ?? '').trim() || DEMO_ORG_SLUG;
}

/**
 * Whether an organisation may be marked as the demo: never the real one,
 * and never one that already holds customers or job cards (its own
 * records). A message says why not; null when it may.
 */
export async function demoMarkRefusal(prisma: PrismaClient, org: { id: string; slug: string; isDemo: boolean }): Promise<string | null> {
  if (org.isDemo) return null;
  if (org.slug === REAL_ORG_SLUG) return `${org.slug} is the real organisation; the demo lives in its own organisation (${DEMO_ORG_SLUG}).`;
  const [customers, jobCards] = await Promise.all([
    prisma.customer.count({ where: { organisationId: org.id } }),
    prisma.jobCard.count({ where: { branch: { businessUnit: { organisationId: org.id } } } }),
  ]);
  if (customers || jobCards) return `${org.slug} already holds its own records (${customers} customers, ${jobCards} job cards); the demo is never loaded on top of them. Use ${DEMO_ORG_SLUG} instead.`;
  return null;
}

/** The demo organisation, made the first time it is asked for. */
export async function ensureDemoOrganisation(prisma: PrismaClient, slug: string = DEMO_ORG_SLUG): Promise<{ id: string; name: string; slug: string; created: boolean }> {
  const existing = await prisma.organisation.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, isDemo: true } });
  if (existing) {
    const refusal = await demoMarkRefusal(prisma, existing);
    if (refusal) throw new Error(refusal);
    if (!existing.isDemo) await prisma.organisation.update({ where: { id: existing.id }, data: { isDemo: true } });
    await ensureDemoWorkshop(prisma, existing.id);
    return { id: existing.id, name: existing.name, slug: existing.slug, created: false };
  }
  const org = await prisma.organisation.create({
    data: {
      name: slug === DEMO_ORG_SLUG ? DEMO_ORG_NAME : `${DEMO_ORG_NAME} — ${slug}`,
      slug,
      legalName: 'ROCK FOUNDATION AUTOMOBILE INVESTMENT LTD (DEMO)',
      rcNumber: 'RC 0000000 (demo)',
      email: `frontdesk@${DEMO_DOMAIN}`,
      hqAddress: DEMO_ADDRESS,
      hotlines: DEMO_HOTLINES,
      // Every 5,000 km or 6 months, whichever comes first.
      primaryServiceIntervalKm: 5000,
      primaryServiceIntervalDays: 180,
      // Billing & tax as a working Nigerian workshop would set it: VAT at 7.5%,
      // a deposit from individual customers, discounts above 10% for the Owner.
      vatEnabled: true,
      vatRate: 7.5,
      vatNumber: 'TIN 00000000-0001 (demo)',
      depositRequired: true,
      depositPercent: 50,
      discountApprovalPercent: 10,
      // Every optional role on, so each has a demo person to sign in as.
      optionalRoles: ['workshop-supervisor', 'technician', 'store-keeper', 'accounts', 'security'],
      isDemo: true,
      branding: { create: { primaryColor: '#3E4095', secondaryColor: '#3E4095', accentColor: '#EC3237' } },
    },
    select: { id: true, name: true, slug: true },
  });
  await ensureDemoWorkshop(prisma, org.id);
  return { ...org, created: true };
}

/** The demo organisation's business unit, Ota workshop and departments (only what is missing). */
async function ensureDemoWorkshop(prisma: PrismaClient, organisationId: string): Promise<void> {
  const nigeria = await prisma.country.upsert({ where: { name: 'Nigeria' }, update: {}, create: { name: 'Nigeria', isoCode: 'NG' } });
  const ogun = await prisma.state.upsert({ where: { countryId_name: { countryId: nigeria.id, name: 'Ogun State' } }, update: {}, create: { countryId: nigeria.id, name: 'Ogun State' } });
  const ota = await prisma.city.upsert({ where: { stateId_name: { stateId: ogun.id, name: 'Ota' } }, update: {}, create: { stateId: ogun.id, name: 'Ota' } });
  const unit = await prisma.businessUnit.upsert({
    where: { organisationId_slug: { organisationId, slug: 'automobile' } },
    update: {},
    create: { organisationId, name: 'Automobile Services', slug: 'automobile' },
  });
  await prisma.countryLink.upsert({ where: { businessUnitId_countryId: { businessUnitId: unit.id, countryId: nigeria.id } }, update: {}, create: { businessUnitId: unit.id, countryId: nigeria.id } });
  const branchId = `${unit.id}-ota-demo`;
  const branch = await prisma.branch.upsert({
    where: { id: branchId },
    update: {},
    create: {
      id: branchId, businessUnitId: unit.id, cityId: ota.id, name: 'Ota Workshop (Demo)', code: 'OTD', type: 'WORKSHOP',
      address: DEMO_ADDRESS, email: `frontdesk@${DEMO_DOMAIN}`, hotlines: DEMO_HOTLINES,
      bankName: 'Demo Bank', bankAccountName: 'Rock Foundation Automobile (Demo)', bankAccountNumber: '0000000000',
    },
    select: { id: true },
  });
  for (const [slug, name] of [['workshop', 'Workshop'], ['mechanical', 'Mechanical'], ['electrical', 'Electrical and diagnostics'], ['body-spray', 'Body and spraying'], ['car-wash', 'Car wash']] as const) {
    await prisma.department.upsert({ where: { branchId_slug: { branchId: branch.id, slug } }, update: {}, create: { branchId: branch.id, name, slug } });
  }
}
