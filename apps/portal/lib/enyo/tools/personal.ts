/**
 * The person's own things: what they did recently, and the facts they asked
 * Enyo to remember. Memory is theirs alone (by user id and organisation), at
 * most 50 facts of 200 characters.
 */
import { prisma } from '@ejo/database';
import { looksLikeInjection } from '@ejo/enyo';
import { getPrincipal, myOrganisationId } from '@/lib/authz/server';
import { requireUser } from '@/lib/actions/workshop';
import { humanizeAction } from '@/lib/humanize-action';
import { resolveRecords } from '@/lib/record-resolver';
import { nothing, ok, text, when } from '../tool-helpers';
import type { StaffTool } from '../types';

export const MAX_FACTS = 50;
export const MAX_FACT_CHARS = 200;

/** The person's own message asks Enyo to keep or drop a note about them. */
const ASKED_TO_REMEMBER = /\b(remember|note (that|down)|keep in mind|call me|my name is|don'?t forget)\b/i;
const ASKED_TO_FORGET = /\b(forget|stop remembering|remove (that|the note|what you remember)|delete (that|the note|what you remember))\b/i;

export const personalTools: StaffTool[] = [
  {
    name: 'my_recent_activity',
    kind: 'read',
    status: 'Looking at what you worked on recently…',
    description: 'What this person did in the portal recently (their own actions only, newest first, last 7 days by default): records they created, changed, approved or sent, with links. Use for "what was I working on", "where did I stop", "what did I do yesterday", and to pick up where they left off or suggest the next step.',
    parameters: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 30, description: 'How many days back (default 7).' } }, additionalProperties: false },
    run: async (args) => {
      const p = await getPrincipal();
      const days = Math.min(30, Math.max(1, Number(args.days) || 7));
      const rows = await prisma.auditLog.findMany({
        where: { userId: p.userId, ...(p.organisationId ? { organisationId: p.organisationId } : {}), createdAt: { gte: new Date(Date.now() - days * 86_400_000) }, NOT: { action: { startsWith: 'auth.' } } },
        select: { action: true, entityType: true, entityId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 40,
      });
      if (!rows.length) return nothing(`No recorded actions by this person in the last ${days} days.`);
      const records = await resolveRecords(rows.filter((r) => r.entityId).map((r) => ({ type: r.entityType, id: r.entityId! }))).catch(() => new Map());
      const seen = new Set<string>();
      const items = [];
      for (const r of rows) {
        const key = `${r.action}|${r.entityId ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const found = r.entityId ? records.get(`${r.entityType.replace(/^db:/, '')}:${r.entityId}`) : undefined;
        // Names and links only for records still inside the person's organisation.
        const rec = found && (p.isSuperAdmin || !found.branchId || !p.orgBranchIds || p.orgBranchIds.includes(found.branchId)) ? found : undefined;
        items.push({ did: humanizeAction(r.action), record: rec?.label ?? r.entityType.replace(/^db:/, '').replace(/([a-z])([A-Z])/g, '$1 $2'), when: when(r.createdAt), ...(rec?.url ? { href: rec.url } : {}) });
        if (items.length >= 15) break;
      }
      return ok({ days, actions: items }, items.filter((i) => 'href' in i).slice(0, 3).map((i) => ({ label: i.record, href: (i as { href: string }).href })));
    },
  },
  {
    name: 'remember_fact',
    // Changes only this person's own Enyo memory (no business record), visible and deletable by them.
    kind: 'read',
    status: 'Making a note…',
    description: 'Remember a short fact this person asks you to keep in mind in future chats ("call me Ada", "I work on commercial vehicles"). Only when they ask you to remember something. Never store passwords, card numbers or other people\'s private details.',
    parameters: {
      type: 'object',
      properties: { fact: { type: 'string', description: 'The fact, in one short sentence (max 200 characters).', minLength: 2, maxLength: 200 } },
      required: ['fact'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const user = await requireUser();
      // Only when the person's own words ask for it (never on the say-so of an email or page).
      if (!ASKED_TO_REMEMBER.test(ctx.question ?? '')) return nothing('Only remember something when the person themselves asks you to. Nothing was saved.');
      const fact = text(args.fact, MAX_FACT_CHARS).replace(/\s+/g, ' ');
      if (fact.length < 2) return nothing('There is nothing to remember.');
      if (looksLikeInjection(fact) || /\b(password|pin|cvv|card number|otp)\b/i.test(fact)) return nothing('That cannot be remembered (instructions to Enyo, passwords and card details are never stored). Say so kindly.');
      const organisationId = (await getPrincipal()).organisationId ?? (await myOrganisationId());
      if (!organisationId) return nothing('This account is not placed in an organisation yet.');
      const mine = await prisma.enyoMemory.findMany({ where: { userId: user.id, organisationId }, select: { fact: true } });
      if (mine.some((m) => m.fact.toLowerCase() === fact.toLowerCase())) return ok({ remembered: fact, note: 'Already remembered.' });
      if (mine.length >= MAX_FACTS) return nothing(`Enyo already remembers ${MAX_FACTS} facts for this person. Ask them to remove some first (say "forget …").`);
      await prisma.enyoMemory.create({ data: { userId: user.id, organisationId, fact } });
      return ok({ remembered: fact, total: mine.length + 1 });
    },
  },
  {
    name: 'forget_fact',
    // Changes only this person's own Enyo memory.
    kind: 'read',
    status: 'Updating my notes…',
    description: 'Forget facts this person asked you to remember: those containing the given words, or all of them when they say "forget everything".',
    parameters: {
      type: 'object',
      properties: {
        about: { type: 'string', description: 'Words from the fact(s) to forget.', maxLength: 200 },
        all: { type: 'boolean', description: 'True to forget every fact (only when the person clearly asks for that).' },
      },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const user = await requireUser();
      if (!ASKED_TO_FORGET.test(ctx.question ?? '')) return nothing('Only forget something when the person themselves asks you to. Nothing was removed.');
      const organisationId = (await getPrincipal()).organisationId ?? (await myOrganisationId());
      if (!organisationId) return nothing('This account is not placed in an organisation yet.');
      const about = text(args.about, MAX_FACT_CHARS);
      if (!about && args.all !== true) return nothing('Say what to forget, or confirm forgetting everything.');
      const where = { userId: user.id, organisationId, ...(args.all === true ? {} : { fact: { contains: about, mode: 'insensitive' as const } }) };
      const gone = await prisma.enyoMemory.findMany({ where, select: { fact: true }, take: MAX_FACTS });
      if (!gone.length) return nothing('No remembered fact matches that.');
      await prisma.enyoMemory.deleteMany({ where });
      return ok({ forgotten: gone.map((g) => g.fact) });
    },
  },
];
