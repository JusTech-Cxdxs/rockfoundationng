/**
 * Seeds the platform skeleton: the module registry, the first organisation's
 * hierarchy (down to its first branch and departments), baseline roles and
 * the Master Administrator. No business data.
 *
 * Run with: npm run seed --workspace=packages/database
 * Requires DATABASE_URL (a migrated database) and MASTER_ADMIN_EMAIL /
 * MASTER_ADMIN_PASSWORD (see below).
 */
import { PrismaClient, ModuleStatus } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';

const prisma = new PrismaClient();

/**
 * The first Master Administrator, who bootstraps the platform. Everyone
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
      `Missing required environment variable: ${name}. Set it in Render's ` +
      `environment variables before running the seed script — this bootstrap ` +
      `script no longer ships with a default credential.`,
    );
  }
  return value;
}

const MASTER_ADMIN = {
  name: process.env.MASTER_ADMIN_NAME ?? 'Master Administrator', // not a secret — harmless default
  email: requireEnv('MASTER_ADMIN_EMAIL'),
};

async function main() {
  // --- Module registry -----------------------------------------------------
  const modules: { key: string; name: string; status: ModuleStatus; sortOrder: number }[] = [
    { key: 'dashboard', name: 'Dashboard', status: 'LIVE', sortOrder: 0 },
    { key: 'organisation', name: 'Organisation', status: 'LIVE', sortOrder: 1 },
    { key: 'business-units', name: 'Business Units', status: 'LIVE', sortOrder: 2 },
    { key: 'workshop', name: 'Workshop', status: 'LIVE', sortOrder: 10 },
    { key: 'inventory', name: 'Inventory', status: 'COMING_SOON', sortOrder: 11 },
    { key: 'procurement', name: 'Procurement', status: 'COMING_SOON', sortOrder: 12 },
    { key: 'finance', name: 'Finance', status: 'COMING_SOON', sortOrder: 13 },
    { key: 'hr', name: 'HR', status: 'COMING_SOON', sortOrder: 14 },
    { key: 'payroll', name: 'Payroll', status: 'COMING_SOON', sortOrder: 15 },
    { key: 'manufacturing', name: 'Manufacturing', status: 'COMING_SOON', sortOrder: 16 },
  ];
  for (const m of modules) {
    await prisma.platformModule.upsert({
      where: { key: m.key },
      update: { name: m.name, status: m.status, sortOrder: m.sortOrder },
      create: m,
    });
  }

  // --- D'Phoenix Autocare hierarchy -----------------------------------------
  // One business, one workshop: the details printed on every estimate, invoice,
  // receipt and email come from here (Settings → Organisation edits them).
  const organisation = await prisma.organisation.upsert({
    where: { slug: 'dphoenix-autocare' },
    update: {},
    create: {
      name: "D'Phoenix Autocare",
      slug: 'dphoenix-autocare',
      legalName: "D'PHOENIX AUTOCARE LIMITED",
      website: 'https://www.dphoenixautocare.com',
      email: 'dphoenixautocare@gmail.com',
      hqAddress: 'Plot 1 Muri Okunola Street, opposite NNPC Hospital, beside Prime Shopping Complex, Sandfill Bus Stop, Victoria Island, Lagos',
      hotlines: ['+234 811 496 6212', '+234 807 654 4837'],
      // Service reminders: every 5,000 km or 6 months, whichever comes first (changeable in Settings).
      primaryServiceIntervalKm: 5000,
      primaryServiceIntervalDays: 180,
      branding: {
        create: {
          // The website's own colours: orange, navy and the logo gold.
          primaryColor: '#F09E2C',
          secondaryColor: '#0A1628',
          accentColor: '#D6890B',
        },
      },
    },
  });

  const nigeria = await prisma.country.upsert({
    where: { name: 'Nigeria' },
    update: {},
    create: { name: 'Nigeria', isoCode: 'NG' },
  });

  const workshopUnit = await prisma.businessUnit.upsert({
    where: { organisationId_slug: { organisationId: organisation.id, slug: 'workshop-fleet' } },
    update: {},
    create: { organisationId: organisation.id, name: 'Workshop & Fleet Services', slug: 'workshop-fleet' },
  });

  await prisma.countryLink.upsert({
    where: { businessUnitId_countryId: { businessUnitId: workshopUnit.id, countryId: nigeria.id } },
    update: {},
    create: { businessUnitId: workshopUnit.id, countryId: nigeria.id },
  });

  const lagos = await prisma.state.upsert({
    where: { countryId_name: { countryId: nigeria.id, name: 'Lagos State' } },
    update: {},
    create: { countryId: nigeria.id, name: 'Lagos State' },
  });

  const victoriaIsland = await prisma.city.upsert({
    where: { stateId_name: { stateId: lagos.id, name: 'Victoria Island' } },
    update: {},
    create: { stateId: lagos.id, name: 'Victoria Island' },
  });

  const workshopBranch = await prisma.branch.upsert({
    where: { id: `${workshopUnit.id}-vi-seed` }, // fixed id so the seed can run again safely
    update: {},
    create: {
      id: `${workshopUnit.id}-vi-seed`,
      businessUnitId: workshopUnit.id,
      cityId: victoriaIsland.id,
      name: 'Victoria Island Workshop',
      code: 'DPA',
      address: 'Plot 1 Muri Okunola Street, opposite NNPC Hospital, beside Prime Shopping Complex, Sandfill Bus Stop, Victoria Island, Lagos',
      email: 'dphoenixautocare@gmail.com',
      hotlines: ['+234 811 496 6212', '+234 807 654 4837'],
    },
  });

  // The workshop department, and the two operational workshops (cars, and
  // commercial and fleet vehicles), each with its own supervisor. Job cards
  // route to one of them by vehicle type. "workshop" stays: the platform
  // finds the workshop branch through it.
  await prisma.department.upsert({
    where: { branchId_slug: { branchId: workshopBranch.id, slug: 'workshop' } },
    update: {},
    create: { branchId: workshopBranch.id, name: 'Workshop', slug: 'workshop' },
  });
  const [passengerWorkshop, commercialWorkshop] = await Promise.all([
    prisma.department.upsert({
      where: { branchId_slug: { branchId: workshopBranch.id, slug: 'workshop-passenger' } },
      update: {},
      create: { branchId: workshopBranch.id, name: 'Cars and SUVs', slug: 'workshop-passenger' },
    }),
    prisma.department.upsert({
      where: { branchId_slug: { branchId: workshopBranch.id, slug: 'workshop-commercial' } },
      update: {},
      create: { branchId: workshopBranch.id, name: 'Fleet and commercial vehicles', slug: 'workshop-commercial' },
    }),
  ]);
  // eslint-disable-next-line no-console
  console.log(`Seeded workshop departments: ${passengerWorkshop.name} (${passengerWorkshop.id}), ${commercialWorkshop.name} (${commercialWorkshop.id})`);

  // --- Baseline roles (system roles, cannot be deleted) --------------------
  // The D'Phoenix edition's roles: the workshop, front desk, finance, security,
  // customer care, leadership and IT. No Store, Warranty or assembly-plant
  // roles while those modules are off (apps/portal/lib/modules.ts).
  const roleNames = ['Administrator', 'Workshop Manager', 'Workshop Supervisor', 'Technician', 'Finance Officer', 'Department Head', 'Chief Security Officer', 'Security Officer', 'Receptionist', 'Calendar User', 'Scheduling Admin', 'Broadcaster', 'Customer Care', 'Customer Care Lead', 'Executive', 'IT Administrator'];
  for (const name of roleNames) {
    await prisma.role.upsert({
      where: { organisationId_slug: { organisationId: organisation.id, slug: slugify(name) } },
      update: {},
      // A Manager runs a branch (the role keeps its stable slug).
      create: { organisationId: organisation.id, name: name === 'Workshop Manager' ? 'Manager' : name, slug: slugify(name), isSystem: true },
    });
  }

  // --- Master Administrator (bootstrap account) -----------------------------
  // isSuperAdmin bypasses permission checks entirely: every current and future
  // permission without RolePermission rows.
  const superAdminRole = await prisma.role.upsert({
    where: { organisationId_slug: { organisationId: organisation.id, slug: 'master-administrator' } },
    update: { isSuperAdmin: true, isSystem: true },
    create: {
      organisationId: organisation.id,
      name: 'Master Administrator',
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
  // the Master Admin has changed their password in the portal, re-running the
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
    console.log('Master Administrator password reset (RESET_MASTER_ADMIN_PASSWORD=yes); open sessions signed out.');
  } else {
    // eslint-disable-next-line no-console
    console.log('Master Administrator already has a password; left unchanged.');
  }

  // eslint-disable-next-line no-console
  console.log(`Seed complete: module registry + D'Phoenix Autocare hierarchy + Master Administrator (${MASTER_ADMIN.email}).`);
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
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
