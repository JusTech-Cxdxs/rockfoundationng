/**
 * Makes (or refreshes) the demo people and their sign-ins in the demo
 * organisation:
 *
 *   npm run demo:people                     the organisation(s) marked as a demo
 *   npm run demo:people -- --org <slug>     that organisation (made, or marked, first)
 *
 * The demo lives in its own organisation, "D'Phoenix Autocare (Demo)" (slug
 * dphoenix-demo, or DEMO_ORG_SLUG), never in the real one: with no
 * organisation marked yet, that demo organisation is made — its own
 * Victoria Island workshop and departments — and the log says so. The real
 * organisation (dphoenix-autocare), or any organisation that already holds
 * its own customers or job cards, is refused. To stop: set "isDemo" to false
 * on the demo organisation (scripts/v-d1-demo-people.sql shows how) and take
 * the password out of the environment; the next run switches the demo
 * people off.
 *
 * Needs DATABASE_URL and DEMO_STAFF_PASSWORD (optionally
 * DEMO_CUSTOMER_PASSWORD; RESET_DEMO_PASSWORDS=yes to set the passwords
 * again, once). Idempotent; prints counts, never a password or an address.
 * Run by the production build (scripts/db-push-if-vercel.js) and by
 * `npm run demo:reset`.
 */
import { prisma } from '@ejo/database';
import { describeDemoPeople, loadDemoPeople } from '../lib/demo/people-load';
import { DEMO_ORG_SLUG, REAL_ORG_SLUG, demoOrgSlug, ensureDemoOrganisation } from '../lib/demo/organisation';

export const DEFAULT_DEMO_ORG = DEMO_ORG_SLUG;

/** The organisations to load: those marked as a demo, or the demo organisation, made (or marked) when none is. Never the real one. */
export async function demoOrganisations(slugArg: string | undefined, env: Record<string, string | undefined> = process.env): Promise<{ id: string; name: string; slug: string; marked: boolean }[]> {
  if (slugArg) {
    const before = await prisma.organisation.findUnique({ where: { slug: slugArg }, select: { isDemo: true } });
    const org = await ensureDemoOrganisation(prisma, slugArg);
    return [{ id: org.id, name: org.name, slug: org.slug, marked: !before?.isDemo }];
  }
  const marked = (await prisma.organisation.findMany({ where: { isDemo: true }, select: { id: true, name: true, slug: true } })).filter((o) => o.slug !== REAL_ORG_SLUG);
  if (marked.length) return marked.map((o) => ({ ...o, marked: false }));
  const org = await ensureDemoOrganisation(prisma, demoOrgSlug(env));
  return [{ id: org.id, name: org.name, slug: org.slug, marked: true }];
}

async function main() {
  const args = process.argv.slice(2);
  const slugArg = args.includes('--org') ? args[args.indexOf('--org') + 1] : undefined;
  const orgs = await demoOrganisations(slugArg);
  if (!orgs.length) { console.log('Demo people: no demo organisation; nothing done.'); return; }
  for (const org of orgs) {
    if (org.marked) console.log(`${org.name} (${org.slug}) is the demo organisation (made or marked now).`);
    const r = await loadDemoPeople(prisma, org.id, process.env, null);
    console.log(describeDemoPeople(r));
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
}
