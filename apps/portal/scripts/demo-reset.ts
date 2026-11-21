/**
 * Loads (or removes) the whole demo in the demo organisation, "D'Phoenix
 * Autocare (Demo)": the demo people with their sign-ins
 * (lib/demo/people-load.ts, when DEMO_STAFF_PASSWORD is set) and the seven
 * months of the Victoria Island Workshop (lib/workshop/demo):
 *
 *   npm run demo:reset                 the organisation marked as the demo (dphoenix-demo, made when there is none)
 *   npm run demo:reset -- --org dphoenix-demo    that organisation (made, or marked, first)
 *   npm run demo:reset -- --remove     take the demo records out, load nothing (people are kept, switched off only by un-marking the organisation)
 *
 * Never the real organisation (dphoenix-autocare) or any organisation with
 * its own customers or job cards. Refused against a production
 * database unless DEMO_RESET_CONFIRM is set to "replace the demo records":
 * the reset deletes the previous demo's records (only those, listed in
 * demo_records) and writes the plan again as of now. Needs DATABASE_URL.
 * Prints counts, never data or secrets. Every step is audited.
 */
import { prisma } from '@ejo/database';
import { loadWorkshopDemo, removeWorkshopDemo } from '../lib/workshop/demo/load';
import { describeDemoPeople, loadDemoPeople } from '../lib/demo/people-load';
import { demoOrganisations } from './demo-people';

const CONFIRM = 'replace the demo records';

function looksProduction(): string | null {
  const url = process.env.DATABASE_URL ?? '';
  if (process.env.NODE_ENV === 'production') return 'NODE_ENV is production';
  if (process.env.VERCEL_ENV === 'production' || process.env.RENDER_SERVICE_ID) return 'this is a hosted environment';
  if (/supabase\.co|supabase\.com|pooler\.|amazonaws\.com|render\.com|neon\.tech/i.test(url)) return 'DATABASE_URL points at a hosted database';
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const remove = args.includes('--remove');
  const slug = args.includes('--org') ? args[args.indexOf('--org') + 1] : undefined;
  const why = looksProduction();
  if (why && process.env.DEMO_RESET_CONFIRM !== CONFIRM) {
    console.error(`Refused: ${why}. The reset deletes the previous demo's records (and only those) and loads them again.\nTo go ahead, run it with DEMO_RESET_CONFIRM="${CONFIRM}".`);
    process.exit(2);
  }
  const orgs = await demoOrganisations(slug);
  if (!orgs.length) { console.error('No demo organisation.'); process.exit(1); }
  if (orgs.length > 1) { console.error(`Several organisations are marked as demos; say which with --org <slug>: ${orgs.map((c) => c.slug).join(', ')}`); process.exit(1); }
  const org = orgs[0]!;
  if (org.marked) console.log(`${org.name} (${org.slug}) is the demo organisation (made or marked now).`);
  if (remove) {
    const w = await removeWorkshopDemo(org.id);
    console.log(`Removed the workshop demo from ${org.name}: ${w} records.`);
    return;
  }
  const started = Date.now();
  console.log(describeDemoPeople(await loadDemoPeople(prisma, org.id, process.env, null)));
  const w = await loadWorkshopDemo(org.id, new Date());
  console.log(`Workshop demo loaded into ${org.name} → ${w.branchName} in ${Math.round((Date.now() - started) / 100) / 10}s (removed ${w.removed} records of the previous demo).`);
  console.log(`Made: ${Object.entries(w.made).map(([k, v]) => `${v} ${k}`).join(', ')}.`);
  console.log(`Figures: ${JSON.stringify(w.figures)}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
