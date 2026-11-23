/**
 * Seeds the platform skeleton: the module registry, the first organisation's
 * hierarchy (down to its first branch and departments), baseline roles and
 * the Platform Administrator. No business data.
 *
 * Run with: npm run seed --workspace=packages/database
 * Requires DATABASE_URL (a migrated database) and MASTER_ADMIN_EMAIL /
 * MASTER_ADMIN_PASSWORD (see below).
 */
import { PrismaClient, ModuleStatus } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';

const prisma = new PrismaClient();

/**
 * The first Platform Administrator, who bootstraps the platform. Everyone
 * else is created from the portal.
 *
 * No fallback credentials: MASTER_ADMIN_EMAIL and MASTER_ADMIN_PASSWORD must
 * be set in the environment, and the script fails if they are missing, so no
 * password ever sits in source control.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in the hosting ` +
      `provider's environment variables before running the seed script — this bootstrap ` +
      `script no longer ships with a default credential.`,
    );
  }
  return value;
}

const MASTER_ADMIN = {
  name: process.env.MASTER_ADMIN_NAME ?? 'Platform Administrator', // not a secret — harmless default
  email: requireEnv('MASTER_ADMIN_EMAIL'),
};

async function main() {
  // --- Module registry -----------------------------------------------------
  const modules: { key: string; name: string; status: ModuleStatus; sortOrder: number }[] = [
    { key: 'dashboard', name: 'Dashboard', status: 'LIVE', sortOrder: 0 },
    { key: 'organisation', name: 'Organisation', status: 'LIVE', sortOrder: 1 },
    { key: 'business-units', name: 'Business Units', status: 'LIVE', sortOrder: 2 },
    { key: 'workshop', name: 'Workshop', status: 'LIVE', sortOrder: 10 },
    { key: 'inventory', name: 'Parts store', status: 'LIVE', sortOrder: 11 },
    { key: 'security', name: 'Gate', status: 'LIVE', sortOrder: 12 },
  ];
  for (const m of modules) {
    await prisma.platformModule.upsert({
      where: { key: m.key },
      update: { name: m.name, status: m.status, sortOrder: m.sortOrder },
      create: m,
    });
  }

  // --- Rock Foundation Automobile -------------------------------------------
  // One business, one workshop: the details printed on every estimate, invoice,
  // receipt and email come from here (Settings → Business details edits them).
  // Only what the business publishes (rockfoundationng.com); no email is
  // published, so none is set.
  const ADDRESS = '1, Heal The World Avenue, Opp. Gateway Hotel, Ota, Ogun State';
  const HOTLINES = ['+234 803 304 9194', '+234 802 389 1766'];
  const organisation = await prisma.organisation.upsert({
    where: { slug: 'rock-foundation' },
    update: {},
    create: {
      name: 'Rock Foundation Automobile',
      slug: 'rock-foundation',
      legalName: 'Rock Foundation Automobile Investment Ltd',
      rcNumber: 'RC 1772429',
      website: 'https://rockfoundationng.com',
      hqAddress: ADDRESS,
      poBox: 'P.O. Box 257, Ota, Ogun State',
      hotlines: HOTLINES,
      // VAT at 7.5% (Settings → Business details can switch it off or change the rate).
      vatEnabled: true,
      vatRate: 7.5,
      // Service reminders: every 5,000 km or 6 months, whichever comes first (changeable in Settings).
      primaryServiceIntervalKm: 5000,
      primaryServiceIntervalDays: 180,
      // The optional roles start off: the Owner switches each on in Settings → Roles.
      optionalRoles: [],
      branding: {
        create: {
          // The logo's own colours: blue, with the logo red for accents.
          primaryColor: '#3E4095',
          secondaryColor: '#3E4095',
          accentColor: '#EC3237',
        },
      },
    },
  });

  const nigeria = await prisma.country.upsert({
    where: { name: 'Nigeria' },
    update: {},
    create: { name: 'Nigeria', isoCode: 'NG' },
  });

  const unit = await prisma.businessUnit.upsert({
    where: { organisationId_slug: { organisationId: organisation.id, slug: 'automobile' } },
    update: {},
    create: { organisationId: organisation.id, name: 'Automobile Services', slug: 'automobile' },
  });

  await prisma.countryLink.upsert({
    where: { businessUnitId_countryId: { businessUnitId: unit.id, countryId: nigeria.id } },
    update: {},
    create: { businessUnitId: unit.id, countryId: nigeria.id },
  });

  const ogun = await prisma.state.upsert({
    where: { countryId_name: { countryId: nigeria.id, name: 'Ogun State' } },
    update: {},
    create: { countryId: nigeria.id, name: 'Ogun State' },
  });

  const ota = await prisma.city.upsert({
    where: { stateId_name: { stateId: ogun.id, name: 'Ota' } },
    update: {},
    create: { stateId: ogun.id, name: 'Ota' },
  });

  const workshopBranch = await prisma.branch.upsert({
    where: { id: `${unit.id}-ota-seed` }, // fixed id so the seed can run again safely
    update: {},
    create: {
      id: `${unit.id}-ota-seed`,
      businessUnitId: unit.id,
      cityId: ota.id,
      name: 'Ota Workshop',
      code: 'OTA',
      type: 'WORKSHOP',
      address: ADDRESS,
      hotlines: HOTLINES,
    },
  });

  // The workshop department ("workshop" stays: the platform finds the
  // workshop branch through it), the workshop's own sections and the Store
  // (the parts store: stock, counter sales and stock counts).
  const departments: [string, string][] = [['workshop', 'Workshop'], ['mechanical', 'Mechanical'], ['electrical', 'Electrical and diagnostics'], ['body-spray', 'Body and spraying'], ['car-wash', 'Car wash'], ['store', 'Store']];
  for (const [slug, name] of departments) {
    await prisma.department.upsert({
      where: { branchId_slug: { branchId: workshopBranch.id, slug } },
      update: {},
      create: { branchId: workshopBranch.id, name, slug },
    });
  }

  // --- Roles (system roles, cannot be deleted) -----------------------------
  // The same slugs and names as apps/portal/lib/authz/catalogue.ts
  // (ROLE_GRANTS, ROLE_LABELS): the Owner and Front Desk always on; the
  // other five optional, switched on in Settings → Roles.
  const roles: [string, string][] = [
    ['owner', 'Owner / GMD'],
    ['front-desk', 'Front Desk / Customer Care'],
    ['workshop-supervisor', 'Workshop Supervisor / Service Advisor'],
    ['technician', 'Technician'],
    ['store-keeper', 'Store Keeper'],
    ['accounts', 'Accounts'],
    ['security', 'Security'],
  ];
  for (const [slug, name] of roles) {
    await prisma.role.upsert({
      where: { organisationId_slug: { organisationId: organisation.id, slug } },
      update: {},
      create: { organisationId: organisation.id, name, slug, isSystem: true },
    });
  }

  // --- Platform Administrator (bootstrap account) -----------------------------
  // isSuperAdmin bypasses permission checks entirely: every current and future
  // permission without RolePermission rows.
  const superAdminRole = await prisma.role.upsert({
    where: { organisationId_slug: { organisationId: organisation.id, slug: 'master-administrator' } },
    update: { isSuperAdmin: true, isSystem: true },
    create: {
      organisationId: organisation.id,
      name: 'Platform Administrator',
      slug: 'master-administrator',
      description: 'System owner. Unrestricted access to every organisation, module, and setting.',
      isSystem: true,
      isSuperAdmin: true,
    },
  });

  const masterAdminUser = await prisma.user.upsert({
    where: { email: MASTER_ADMIN.email },
    update: {},
    create: {
      organisationId: organisation.id,
      accountType: 'ADMIN',
      fullName: MASTER_ADMIN.name,
      email: MASTER_ADMIN.email,
      emailVerified: true, // bootstrap account — skip the email-verification step
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: masterAdminUser.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: masterAdminUser.id, roleId: superAdminRole.id },
  });

  // Better Auth credential row, hashed with Better Auth's hashPassword() so the
  // normal /login page verifies it. Set only when the account is created: once
  // the Platform Administrator has changed their password in the portal, re-running the
  // seed must never put an older one back (SEC-01c). An existing password is
  // replaced only when RESET_MASTER_ADMIN_PASSWORD=yes is set for that run,
  // and then every open session of that account is signed out.
  const existingAccount = await prisma.account.findFirst({
    where: { userId: masterAdminUser.id, providerId: 'credential' },
    select: { id: true },
  });
  const resetRequested = process.env.RESET_MASTER_ADMIN_PASSWORD === 'yes';
  if (!existingAccount) {
    const password = requireEnv('MASTER_ADMIN_PASSWORD');
    await prisma.account.create({
      data: {
        userId: masterAdminUser.id,
        accountId: masterAdminUser.id,
        providerId: 'credential',
        password: await hashPassword(password),
      },
    });
  } else if (resetRequested) {
    const password = requireEnv('MASTER_ADMIN_PASSWORD');
    await prisma.account.update({ where: { id: existingAccount.id }, data: { password: await hashPassword(password) } });
    await prisma.session.deleteMany({ where: { userId: masterAdminUser.id } });
    // eslint-disable-next-line no-console
    console.log('Platform Administrator password reset (RESET_MASTER_ADMIN_PASSWORD=yes); open sessions signed out.');
  } else {
    // eslint-disable-next-line no-console
    console.log('Platform Administrator already has a password; left unchanged.');
  }

  // eslint-disable-next-line no-console
  console.log(`Seed complete: module registry + Rock Foundation Automobile (Ota Workshop, ${roles.length} roles) + Platform Administrator (${MASTER_ADMIN.email}).`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
