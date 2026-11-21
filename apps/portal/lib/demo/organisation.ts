/**
 * The demo organisation: "D'Phoenix Autocare (Demo)", slug dphoenix-demo,
 * kept apart from the real D'Phoenix Autocare organisation so that nothing
 * of the demo ever mixes with real customers, vehicles or money.
 *
 * Made only when the platform owner asks for the demo (DEMO_STAFF_PASSWORD
 * on a deploy, `npm run demo:people` / `npm run demo:reset`, or the IT
 * control room's Demo organisation card), and marked isDemo from the start.
 * It has its own business unit, its own Victoria Island workshop (with the
 * same departments as the real one: the workshop, cars and SUVs, fleet and
 * commercial vehicles), the same service interval, VAT, deposit and
 * discount settings a working workshop would have, and invented contact
 * details only (0800 000 numbers, a reserved email domain).
 *
 * Idempotent: a second call finds it and changes nothing. Takes the Prisma
 * client it should use, like lib/demo/people-load.ts. No '@/…' imports: tsx
 * runs this file outside Next.
 */
import type { PrismaClient } from '@prisma/client';
import { DEMO_DOMAIN } from './people';

export const DEMO_ORG_SLUG = 'dphoenix-demo';
export const DEMO_ORG_NAME = "D'Phoenix Autocare (Demo)";
/** The real organisation (packages/database/prisma/seed.ts): never marked as a demo, never given demo records. */
export const REAL_ORG_SLUG = 'dphoenix-autocare';

const DEMO_ADDRESS = 'Victoria Island, Lagos (demo address)';
const DEMO_HOTLINES = ['0800 000 0001', '0800 000 0002'];

/** The slug the demo tooling uses: DEMO_ORG_SLUG from the environment, or dphoenix-demo. */
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
      legalName: "D'PHOENIX AUTOCARE (DEMO)",
      email: `frontdesk@${DEMO_DOMAIN}`,
      hqAddress: DEMO_ADDRESS,
      hotlines: DEMO_HOTLINES,
      // As the real workshop: every 5,000 km or 6 months, whichever comes first.
      primaryServiceIntervalKm: 5000,
      primaryServiceIntervalDays: 180,
      // Billing & tax as a working Lagos workshop would set it: VAT at 7.5%, a
      // deposit from individual customers, discounts above 10% for the Manager.
      vatEnabled: true,
      vatRate: 7.5,
      vatNumber: 'TIN 00000000-0001 (demo)',
      depositRequired: true,
      depositPercent: 50,
      discountApprovalPercent: 10,
      isDemo: true,
      branding: { create: { primaryColor: '#3E4095', secondaryColor: '#3E4095', accentColor: '#EC3237' } },
    },
    select: { id: true, name: true, slug: true },
  });
  await ensureDemoWorkshop(prisma, org.id);
  return { ...org, created: true };
}

/** The demo organisation's business unit, Victoria Island workshop and departments (only what is missing). */
async function ensureDemoWorkshop(prisma: PrismaClient, organisationId: string): Promise<void> {
  const nigeria = await prisma.country.upsert({ where: { name: 'Nigeria' }, update: {}, create: { name: 'Nigeria', isoCode: 'NG' } });
  const lagos = await prisma.state.upsert({ where: { countryId_name: { countryId: nigeria.id, name: 'Lagos State' } }, update: {}, create: { countryId: nigeria.id, name: 'Lagos State' } });
  const vi = await prisma.city.upsert({ where: { stateId_name: { stateId: lagos.id, name: 'Victoria Island' } }, update: {}, create: { stateId: lagos.id, name: 'Victoria Island' } });
  const unit = await prisma.businessUnit.upsert({
    where: { organisationId_slug: { organisationId, slug: 'workshop-fleet' } },
    update: {},
    create: { organisationId, name: 'Workshop & Fleet Services', slug: 'workshop-fleet' },
  });
  await prisma.countryLink.upsert({ where: { businessUnitId_countryId: { businessUnitId: unit.id, countryId: nigeria.id } }, update: {}, create: { businessUnitId: unit.id, countryId: nigeria.id } });
  const branchId = `${unit.id}-vi-demo`;
  const branch = await prisma.branch.upsert({
    where: { id: branchId },
    update: {},
    create: {
      id: branchId, businessUnitId: unit.id, cityId: vi.id, name: 'Victoria Island Workshop (Demo)', code: 'DPD', type: 'WORKSHOP',
      address: DEMO_ADDRESS, email: `frontdesk@${DEMO_DOMAIN}`, hotlines: DEMO_HOTLINES,
      bankName: 'Demo Bank', bankAccountName: "D'Phoenix Autocare (Demo)", bankAccountNumber: '0000000000',
    },
    select: { id: true },
  });
  for (const [slug, name] of [['workshop', 'Workshop'], ['workshop-passenger', 'Cars and SUVs'], ['workshop-commercial', 'Fleet and commercial vehicles']] as const) {
    await prisma.department.upsert({ where: { branchId_slug: { branchId: branch.id, slug } }, update: {}, create: { branchId: branch.id, name, slug } });
  }
}
