'use server';

/**
 * The platform team's demo console (Settings → System health): which
 * organisation is the demo, how much demo is in it, one button to make the
 * demo organisation ("Rock Foundation Automobile (Demo)", kept apart from the
 * real one), one to load it again as of now (people → workshop) and one to
 * take the demo records out. The same code as `npm run demo:reset`.
 *
 * Only the platform team (the Platform Administrator) — never an organisation's
 * own administrators. Typed words confirm every change, and every step is
 * audited. Only an organisation marked
 * as a demo is ever loaded, and the real organisation (or any organisation
 * with its own customers or job cards) is never marked; a person's own
 * records are never touched (the demo removes exactly what it made, listed
 * in demo_records).
 */
import { revalidatePath } from 'next/cache';
import { authorize, getPrincipal, refuse } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { prisma } from '@ejo/database';
import { describeDemoPeople, disableStrayDemoPeople, loadDemoPeople, markDemoOrganisation } from '@/lib/demo/people-load';
import { loadWorkshopDemo, removeWorkshopDemo } from '@/lib/workshop/demo/load';
import { PULSE_MODEL, pulseEnabled } from '@/lib/demo/pulse-core';
import { DEMO_DOMAIN } from '@/lib/demo/people';
import { DEMO_ORG_NAME, REAL_ORG_SLUG, demoMarkRefusal, demoOrgSlug, ensureDemoOrganisation } from '@/lib/demo/organisation';

type Done<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const ONLY = 'The demo organisation is the platform team’s.';

export type DemoConsoleOrg = { id: string; name: string; slug: string; isDemo: boolean; isReal: boolean; records: number; people: number; signIns: number; loadedAt: Date | null; lastPulseDay: string | null };
export type DemoConsoleState = { orgs: DemoConsoleOrg[]; passwordSet: boolean; pulseOn: boolean; demoSlug: string; demoName: string; demoExists: boolean };

/** The platform team only: authorize, then the Platform Administrator check. */
async function platformTeam(where: string): Promise<string> {
  await authorize('admin.organisation.manage', undefined, where, ONLY);
  const p = await getPrincipal();
  if (!p.isSuperAdmin) return refuse('admin.organisation.manage', where, ONLY);
  return p.userId;
}

/** An organisation by id — for the platform team, any organisation (the console is cross-organisation by design; platformTeam() came first). */
async function platformOrg(id: string) {
  return prisma.organisation.findUnique({ where: { id: String(id ?? '') }, select: { id: true, slug: true, name: true, isDemo: true } });
}

/** Every organisation, with how much demo each holds. */
export async function getDemoConsoleState(): Promise<DemoConsoleState> {
  await platformTeam('getDemoConsoleState');
  const orgs = await prisma.organisation.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true, slug: true, isDemo: true }, take: 50 });
  const out: DemoConsoleOrg[] = [];
  for (const o of orgs) {
    const [records, people, signIns, loaded, pulse] = await Promise.all([
      prisma.demoRecord.count({ where: { organisationId: o.id, model: { not: PULSE_MODEL } } }),
      prisma.user.count({ where: { organisationId: o.id, email: { endsWith: `@${DEMO_DOMAIN}` }, isActive: true } }),
      prisma.account.count({ where: { providerId: 'credential', user: { organisationId: o.id, email: { endsWith: `@${DEMO_DOMAIN}` } } } }),
      prisma.auditLog.findFirst({ where: { organisationId: o.id, action: { in: ['demo.workshop_loaded', 'demo.refreshed'] } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      prisma.demoRecord.findFirst({ where: { organisationId: o.id, model: PULSE_MODEL }, orderBy: { recordId: 'desc' }, select: { recordId: true } }),
    ]);
    out.push({ ...o, isReal: o.slug === REAL_ORG_SLUG, records, people, signIns, loadedAt: loaded?.createdAt ?? null, lastPulseDay: pulse?.recordId.split(':').pop() ?? null });
  }
  const demoSlug = demoOrgSlug();
  return { orgs: out, passwordSet: (process.env.DEMO_STAFF_PASSWORD ?? '').trim().length >= 8, pulseOn: pulseEnabled(), demoSlug, demoName: DEMO_ORG_NAME, demoExists: orgs.some((o) => o.slug === demoSlug) };
}

/** Makes the demo organisation (its own Ota workshop and departments; marked as the demo). Typed: its slug. */
export async function createDemoOrganisationNow(confirm: string): Promise<Done<{ summary: string }>> {
  const userId = await platformTeam('createDemoOrganisationNow');
  const slug = demoOrgSlug();
  if (String(confirm ?? '').trim().toLowerCase() !== slug) return fail(`Type “${slug}” to go ahead.`);
  let org: Awaited<ReturnType<typeof ensureDemoOrganisation>>;
  try { org = await ensureDemoOrganisation(prisma, slug); } catch (e) { return fail(e instanceof Error ? e.message : 'The demo organisation could not be made.'); }
  await writeAuditLog({ userId, action: org.created ? 'demo.organisation_created' : 'demo.organisation_marked', entityType: 'Organisation', entityId: org.id, organisationId: org.id, metadata: { organisation: org.name, slug: org.slug } });
  revalidatePath('/it');
  return { ok: true, summary: org.created ? `${org.name} is made and marked as the demo. Load the demo to fill it.` : `${org.name} is the demo organisation.` };
}

/** Marks (or unmarks) an organisation as the demo. Unmarking switches its demo people off on the spot. Typed: the organisation's slug. */
export async function setDemoOrganisation(organisationId: string, isDemo: boolean, confirm: string): Promise<Done<{ summary: string }>> {
  const userId = await platformTeam('setDemoOrganisation');
  const org = await platformOrg(organisationId);
  if (!org) return fail('No such organisation.');
  if (String(confirm ?? '').trim().toLowerCase() !== org.slug.toLowerCase()) return fail(`Type the organisation’s short name, “${org.slug}”, to go ahead.`);
  if (org.isDemo === isDemo) return { ok: true, summary: `${org.name} is already ${isDemo ? '' : 'not '}the demo.` };
  // Never the real organisation, never one that already holds its own records: the demo has its own organisation.
  if (isDemo) { const refusal = await demoMarkRefusal(prisma, org); if (refusal) return fail(refusal); }
  await markDemoOrganisation(prisma, org.id, isDemo);
  const switchedOff = isDemo ? 0 : await disableStrayDemoPeople(prisma);
  await writeAuditLog({ userId, action: isDemo ? 'demo.organisation_marked' : 'demo.organisation_unmarked', entityType: 'Organisation', entityId: org.id, organisationId: org.id, metadata: { organisation: org.name, demoPeopleSwitchedOff: switchedOff } });
  revalidatePath('/it');
  return { ok: true, summary: isDemo ? `${org.name} is now the demo organisation. Load the demo to fill it.` : `${org.name} is no longer a demo: ${switchedOff} demo sign-ins switched off. Its demo records stay until you remove them.` };
}

/** Loads the whole demo again as of now: the people (when the password is set) and the workshop's seven months. */
export async function refreshDemoNow(organisationId: string, confirm: string): Promise<Done<{ summary: string }>> {
  const userId = await platformTeam('refreshDemoNow');
  if (String(confirm ?? '').trim().toLowerCase() !== 'refresh the demo') return fail('Type “refresh the demo” to go ahead: the demo records are replaced as of now (nobody’s own records are touched).');
  const org = await platformOrg(organisationId);
  if (!org) return fail('No such organisation.');
  if (!org.isDemo) return fail(`${org.name} is not marked as the demo; mark it first.`);
  if (org.slug === REAL_ORG_SLUG) return fail(`${org.name} is the real organisation; the demo lives in its own organisation.`);
  const started = Date.now();
  let summary: string;
  try {
    const people = await loadDemoPeople(prisma, org.id, process.env, userId);
    const workshop = await loadWorkshopDemo(org.id, new Date());
    const seconds = Math.round((Date.now() - started) / 1000);
    summary = `Loaded as of now in ${seconds}s: ${workshop.figures.jobCards} job cards (${workshop.figures.serviceJobCards} services), ${workshop.figures.invoices} invoices, ${workshop.figures.customers} customers (${workshop.figures.organisations} fleets on credit). ${people.skipped ? 'Sign-ins: not changed (DEMO_STAFF_PASSWORD is not set).' : 'Sign-ins in place.'}`;
    await writeAuditLog({ userId, action: 'demo.refreshed', entityType: 'Organisation', entityId: org.id, organisationId: org.id, metadata: { seconds, people: describeDemoPeople(people), workshop: workshop.figures, removedWorkshopRecords: workshop.removed } });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'The demo could not be loaded.');
  }
  revalidatePath('/', 'layout');
  return { ok: true, summary };
}

/** Takes the demo records out. The demo people stay — unmark the organisation to switch them off. */
export async function removeDemoNow(organisationId: string, confirm: string): Promise<Done<{ summary: string }>> {
  const userId = await platformTeam('removeDemoNow');
  if (String(confirm ?? '').trim().toLowerCase() !== 'remove the demo') return fail('Type “remove the demo” to go ahead.');
  const org = await platformOrg(organisationId);
  if (!org) return fail('No such organisation.');
  if (!org.isDemo) return fail(`${org.name} is not marked as the demo; nothing of it is demo records.`);
  const workshop = await removeWorkshopDemo(org.id);
  await writeAuditLog({ userId, action: 'demo.removed', entityType: 'Organisation', entityId: org.id, organisationId: org.id, metadata: { workshopRecords: workshop } });
  revalidatePath('/', 'layout');
  return { ok: true, summary: `Removed ${workshop} workshop demo records. Nobody’s own records were touched.` };
}
