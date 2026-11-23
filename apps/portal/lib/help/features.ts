/**
 * "What I can do here" (pure, tested): the features people miss (Enyo on
 * every page, refining text, voice notes, the daily brief, service tracking,
 * the Support centre), each with where it lives and who has it, plus the
 * how-to guide grouped by area. Shown only for what the person's own
 * permissions open (the same decide() as the menu and the pages), and only
 * for the modules switched on (lib/modules.ts).
 */
import { decide, type PermissionKey, type Principal } from '../authz/catalogue';
import { canOpenGuide, GUIDE, guideInEdition, type GuideEntry } from '../enyo/guide';
import { moduleIsOn } from '../modules';

// The Parts store can be switched off: the texts leave it out then.
const STORE_ON = moduleIsOn('inventory');
const list = (items: (string | false)[]) => {
  const w = items.filter(Boolean) as string[];
  return w.length <= 1 ? (w[0] ?? '') : `${w.slice(0, -1).join(', ')} and ${w.at(-1)}`;
};

export type Highlight = {
  id: string;
  title: string;
  /** One or two sentences: what it does for the person. */
  text: string;
  /** Where to find it, in plain words. */
  where: string;
  href: string;
  /** Seeing it needs ANY of these (empty: everyone signed in). */
  needs: PermissionKey[];
  /** A question to try with Enyo. */
  try?: string;
  tag: 'Enyo' | 'Everyday' | 'Workshop' | 'Owner' | 'Support' | 'Administration';
  /** Only while this module is switched on (lib/modules.ts). */
  module?: string;
};

export const HIGHLIGHTS: Highlight[] = [
  { id: 'bookings', tag: 'Workshop', title: 'Bookings from the website', text: 'Customers choose a kind of visit, a day with a place left and a time. Front desk confirms, moves or cancels; the customer is told and reminded the day before; the Job Card opens from the booking.', where: 'Workshop → Bookings', href: '/workshop/bookings', needs: ['workshop.appointment.view'] },
  { id: 'fleet-report', tag: 'Everyday', title: 'Fleet reports', text: 'A company\'s vehicles, visits, what was charged, what is still owed and what is due for service, as a PDF for any period. The fleet contact sees the same in their portal.', where: 'Customers → the company → Fleet report', href: '/crm', needs: ['money.fleet_report.view'] },
  { id: 'enyo-brief', tag: 'Enyo', title: 'A briefing in one line', text: `Say "brief me" or "how is the business doing": Enyo gathers your day, what waits on others and, for the Owner, revenue and collections this month, the workshop now${STORE_ON ? ', stock' : ''} and customer care, then writes it up.`, where: 'The Enyo button (bottom right)', href: '/dashboard', needs: [], try: 'Brief me on everything happening today' },
  { id: 'enyo', tag: 'Enyo', title: 'Enyo, the assistant on every page', text: 'Ask in your own words: what needs you today, where a job is, a vehicle\'s history in a sentence, how to do something for your role. It answers only from what you are allowed to see, with links.', where: 'The Enyo button (bottom right), or Ctrl + J', href: '/dashboard', needs: [], try: 'What needs my attention today?' },
  { id: 'enyo-drafts', tag: 'Enyo', title: 'Messages to customers, drafted', text: 'Ask Enyo to draft an update, a payment reminder or an apology to a customer. You read it, change it, then send it on WhatsApp or email yourself.', where: 'The Enyo button, on a Job Card or customer', href: '/crm/customers', needs: ['crm.view'], try: 'Draft a WhatsApp message telling Mrs Okafor her car is ready for pickup' },
  { id: 'brief', tag: 'Enyo', title: 'Your daily brief', text: 'Approvals waiting, reminders and what changed in your areas, counted, with links, and a short summary you can listen to.', where: 'Top of the Dashboard', href: '/dashboard', needs: [] },
  { id: 'voice', tag: 'Enyo', title: 'Voice notes to Enyo', text: 'Press the microphone and speak. Pause, carry on, edit the words as text, or send. Nothing is sent until you choose.', where: 'The microphone in the Enyo chat', href: '/dashboard', needs: [] },
  { id: 'refine', tag: 'Enyo', title: 'Refine with Enyo on any notes box', text: 'Write roughly, then let Enyo tidy it: clearer, more formal or shorter. You see the new text before it replaces yours.', where: 'The wand button on description, notes and reason boxes', href: '/workshop/job-cards', needs: ['workshop.view'] },
  { id: 'search', tag: 'Everyday', title: 'Search everything at once', text: `${list(['Job Cards', 'customers', 'vehicles', STORE_ON && 'parts', 'invoices', 'staff'])}, by number, name, phone or plate.`, where: 'The search bar at the top, or Ctrl + K', href: '/dashboard', needs: [] },
  { id: 'approvals', tag: 'Everyday', title: 'One place for every decision', text: `${list(['Estimates', 'discounts', 'closes and cancellations', STORE_ON && 'parts requests'])} waiting for you, oldest first.`, where: 'Approvals', href: '/approvals', needs: [] },
  { id: 'reminders', tag: 'Everyday', title: 'Reminders and callbacks', text: 'Set a reminder with a time (a customer to call back, a payment to chase); it rings the bell and can email you. Enyo can prepare one from a sentence.', where: 'Reminders', href: '/reminders', needs: [], try: 'Remind me tomorrow at 9 to call the customer about JC-2026-000123' },
  { id: 'help', tag: 'Everyday', title: 'Get help', text: 'Ask the Owner or the EJO platform team, and follow every answer. Enyo answers first when it can.', where: 'Help → Get help', href: '/support/help', needs: [] },
  { id: 'job-card', tag: 'Workshop', title: 'Open a Job Card in a minute', text: 'Search the customer, pick the vehicle, list the complaints; the supervisor is told at once. Enyo can pre-fill it from a sentence for you to check.', where: 'Workshop → Job Cards', href: '/workshop/job-cards', needs: ['workshop.job_card.create'], try: 'Prepare a Job Card for the Corolla of Ada Obi: brakes squeal and the AC is weak' },
  { id: 'whatsapp', tag: 'Workshop', title: 'Send on WhatsApp', text: 'The estimate, invoice and receipt each have a "Send on WhatsApp" button: WhatsApp opens with the message and a secure link to the PDF already written.', where: 'On the Job Card', href: '/workshop/job-cards', needs: ['workshop.customer.notify', 'workshop.payment.record'] },
  { id: 'service-tracker', tag: 'Workshop', title: 'Service tracking after the vehicle leaves', text: 'Next service due for every vehicle by date or mileage (km), and the reminders sent to customers.', where: 'Workshop → Service Tracker', href: '/workshop/service-tracker', needs: ['workshop.view'] },
  { id: 'custody', tag: 'Workshop', title: 'Vehicles in custody, live', text: 'Every vehicle on site with its stage, waiting time and who has it.', where: 'Workshop → Vehicles in custody', href: '/workshop/custody', needs: ['workshop.view'] },
  { id: 'parts-history', module: 'inventory', tag: 'Workshop', title: 'Every part that went into a vehicle', text: 'Parts issued to a Job Card show on the vehicle\'s history: part number, quantity, date, price and the technician.', where: 'The vehicle\'s page', href: '/workshop/vehicles', needs: ['workshop.view'] },
  { id: 'customer-360', tag: 'Workshop', title: 'Customer page', text: 'A customer\'s or fleet company\'s vehicles, jobs, spend, balance, support requests and notes on one page.', where: 'Customers', href: '/crm/customers', needs: ['crm.view'] },
  { id: 'analytics', tag: 'Owner', title: 'Business analytics', text: 'Revenue, cost, profit and cash by period, with what changed and why.', where: 'Business Analytics', href: '/analytics', needs: ['analytics.business.view'], try: 'How is the business doing this month compared with last month?' },
  { id: 'workflows', tag: 'Owner', title: 'How work flows', text: 'Where approvals wait longest, what gets sent back and why.', where: 'Business Analytics → How work flows', href: '/analytics/workflows', needs: ['analytics.business.view'] },
  { id: 'integrity', tag: 'Owner', title: 'Integrity watch', text: 'Unusual or risky activity found every night (the same person asking and approving, refunds above what was paid, discounts out of the ordinary) for the Owner to look at. A flag is a reason to look, never proof.', where: 'Integrity watch', href: '/integrity', needs: ['integrity.review'] },
  { id: 'support', tag: 'Support', title: 'The Support centre', text: 'Every customer request and complaint (email, portal, chat hand-overs, calls and walk-ins) numbered, with a target, an owner and Enyo\'s draft, followed to resolution.', where: 'Customers → Support centre', href: '/crm/support', needs: ['support.tickets.manage'] },
  { id: 'enyo-replies', tag: 'Support', title: 'Checking Enyo\'s replies', text: 'Every answer Enyo sent by itself, to mark good, corrected or wrong, and why Enyo handed requests over.', where: 'Support centre → Enyo\'s replies', href: '/crm/support/enyo', needs: ['support.tickets.manage'] },
  { id: 'users', tag: 'Administration', title: 'Staff and access', text: 'Invite staff, switch access off at once, give roles, and switch the optional roles on or off; everyone is emailed their full, current access when it changes.', where: 'Staff and Roles', href: '/users', needs: ['admin.users.manage'] },
  { id: 'errors', tag: 'Administration', title: 'Error log and system health', text: 'Every error reference people were shown, with what happened; scheduled jobs and email delivery.', where: 'Audit logs → Errors, and Settings → System health', href: '/audit-logs/errors', needs: ['audit.view'] },
  { id: 'enyo-learning', tag: 'Administration', title: 'What Enyo learns', text: 'Answers people found helpful and corrections from the Support centre, waiting for approval before Enyo reuses them.', where: 'Settings → Enyo learning', href: '/enyo/learning', needs: ['enyo.manage'] },
];

const opens = (needs: PermissionKey[], p: Principal) => !needs.length || needs.some((k) => decide(p, k).allowed);

/** The highlights this person has, in the order above. */
export function highlightsFor(p: Principal): Highlight[] {
  return HIGHLIGHTS.filter((h) => (!h.module || moduleIsOn(h.module)) && opens(h.needs, p));
}

/** The guide's areas, from the page each entry lives on. */
export const AREAS: { prefix: string; title: string }[] = [
  { prefix: '/workshop', title: 'Workshop' },
  { prefix: '/approvals', title: 'Approvals' },
  { prefix: '/inventory', title: 'Parts store' },
  { prefix: '/security', title: 'Gate' },
  { prefix: '/crm', title: 'Customers & support' },
  { prefix: '/support', title: 'Help' },
  { prefix: '/money', title: 'Money' },
  { prefix: '/analytics', title: 'Analytics' },
  { prefix: '/notifications', title: 'Notifications' },
  { prefix: '/reminders', title: 'Reminders' },
  { prefix: '/settings', title: 'Settings & administration' },
  { prefix: '/users', title: 'Settings & administration' },
  { prefix: '/roles', title: 'Settings & administration' },
  { prefix: '/organisation', title: 'Settings & administration' },
  { prefix: '/structure', title: 'Settings & administration' },
  { prefix: '/audit-logs', title: 'Settings & administration' },
  { prefix: '/recycle-bin', title: 'Settings & administration' },
  { prefix: '/data-exchange', title: 'Settings & administration' },
  { prefix: '/enyo', title: 'Enyo (AI)' },
];

export function areaOf(page: string): string {
  return AREAS.find((a) => page === a.prefix || page.startsWith(`${a.prefix}/`) || page.startsWith(`${a.prefix}?`))?.title ?? 'Everyday';
}

export type GuideCard = { id: string; title: string; href: string; area: string; steps: string[]; youCanDoThis: boolean; who?: string; keywords: string[] };

/** Every guide entry whose page the person can open, with whether they do it themselves, grouped by area. */
export function guideFor(p: Principal): { area: string; entries: GuideCard[] }[] {
  const canDo = (e: GuideEntry) => !e.does?.length || e.does.some((k) => decide(p, k).allowed);
  const cards = GUIDE.filter((e) => guideInEdition(e) && canOpenGuide(e, p)).map((e) => ({ id: e.id, title: e.title, href: e.page, area: areaOf(e.page), steps: e.steps, youCanDoThis: canDo(e), who: e.who, keywords: e.keywords }));
  const byArea = new Map<string, GuideCard[]>();
  for (const c of cards) byArea.set(c.area, [...(byArea.get(c.area) ?? []), c]);
  return [...byArea.entries()].map(([area, entries]) => ({ area, entries: entries.sort((a, b) => Number(b.youCanDoThis) - Number(a.youCanDoThis)) }));
}
