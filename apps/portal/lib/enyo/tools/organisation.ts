/**
 * The organisation itself, for any member of staff: its name and contact
 * details (address, phones, website, RC number), its workshop, and
 * background from the public record. Only this organisation's rows; no personal contact details are
 * kept or returned.
 */
import { prisma } from '@ejo/database';
import { getPrincipal } from '@/lib/authz/server';
import { ok } from '../tool-helpers';
import { knownPeople, organisationKnowledge } from '../knowledge';
import type { StaffTool } from '../types';

export const organisationTools: StaffTool[] = [
  {
    name: 'organisation_info',
    kind: 'read',
    status: 'Looking up the organisation…',
    description:
      'This organisation (the workshop): its name and contact details, where it is, and background from the public record. For "who is <name>?" about a colleague use staff_directory; for someone outside, try the web look-up with the name and the organisation.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Optional: a person\'s name or a title to look for, e.g. "GMD" or "Owner".', maxLength: 80 } },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const q = typeof args.name === 'string' ? args.name.trim().slice(0, 80) : '';
      const terms = q.split(/\s+/).filter((w) => w.length >= 2).slice(0, 4);
      // The session is read again: the organisation is the signed-in person's own.
      const org = (await getPrincipal()).organisationId ?? ctx.organisationId;
      const [o, units, branches] = await Promise.all([
        prisma.organisation.findUnique({ where: { id: org }, select: { name: true, slug: true, legalName: true, website: true, hotlines: true, email: true, hqAddress: true } }),
        prisma.businessUnit.findMany({ where: { organisationId: org, isActive: true }, orderBy: { name: 'asc' }, take: 20, select: { name: true } }),
        prisma.branch.findMany({ where: { isActive: true, businessUnit: { organisationId: org } }, orderBy: { name: 'asc' }, take: 40, select: { name: true, businessUnit: { select: { name: true } }, city: { select: { name: true } } } }),
      ]);
      // Background from the public record (the platform's own notes on the organisation), for the questions the records do not answer.
      const known = organisationKnowledge(o?.slug ?? o?.name);
      const background = known ? { summary: known.summary, facts: known.facts, publishedPeople: knownPeople(known, terms).map((p) => ({ name: p.name, title: p.title, about: p.note, source: p.source })) } : null;
      return ok({
        organisation: o ? { name: o.name, legalName: o.legalName, website: o.website, phones: o.hotlines, email: o.email, headOffice: o.hqAddress } : null,
        businesses: units.map((u) => u.name),
        branches: branches.map((b) => ({ name: b.name, business: b.businessUnit?.name ?? null, city: b.city?.name ?? null })),
        background,
        note: q ? (background?.publishedPeople.length ? `"background.publishedPeople" (from the public record) matches "${q}": answer from it and say it is from the public record.` : `Nobody matching "${q}" is in the public record here. Use staff_directory for a colleague, or the web look-up with the name and the organisation, and say if nothing clearly matches.`) : 'Answer from the organisation\'s details above.',
      }, [{ label: 'Organisation', href: '/organisation' }]);
    },
  },
];
