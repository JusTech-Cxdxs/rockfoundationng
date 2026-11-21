/**
 * Data Exchange — finding existing customers for a block of rows (server
 * only, never a 'use server' file). By SAP / old-system number within the
 * organisation, by email (unique on the platform), by phone (last ten digits).
 */
import { prisma, type Prisma } from '@ejo/database';

/** Existing customers of the organisation these keys point at (SAP number, email, phone). */
export async function findCustomers(db: Prisma.TransactionClient | typeof prisma, organisationId: string, source: string, keys: { ext: string[]; email: string[]; phone: string[]; name?: string[] }) {
  const names = [...new Set((keys.name ?? []).map((n) => n.trim()).filter(Boolean))];
  const [byExt, byEmail, byPhone, byName] = await Promise.all([
    keys.ext.length ? db.customer.findMany({ where: { organisationId, externalSource: source, externalId: { in: keys.ext } }, select: { id: true, externalId: true } }) : [],
    keys.email.length ? db.customer.findMany({ where: { email: { in: keys.email } }, select: { id: true, email: true, organisationId: true } }) : [],
    keys.phone.length
      ? db.$queryRaw<{ id: string; k: string }[]>`
          SELECT id, right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) AS k FROM customers
           WHERE "organisationId" = ${organisationId}
             AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = ANY(${keys.phone.map((p) => p.slice(-10))}::text[])`
      : [],
    // By name (an invoice file that gives only the customer's name, as Zoho's does): the person's name or the company's.
    names.length
      ? db.customer.findMany({ where: { organisationId, OR: [{ fullName: { in: names, mode: 'insensitive' } }, { customerCompany: { companyName: { in: names, mode: 'insensitive' } } }] }, select: { id: true, fullName: true, customerCompany: { select: { companyName: true } } } })
      : [],
  ]);
  // A name finds a customer only when exactly one has it.
  const nameHits = new Map<string, Set<string>>();
  for (const c of byName) for (const n of [c.fullName, c.customerCompany?.companyName]) if (n) { const k = n.trim().toLowerCase(); nameHits.set(k, (nameHits.get(k) ?? new Set()).add(c.id)); }
  return {
    ext: new Map(byExt.map((c) => [String(c.externalId).toUpperCase(), c.id])),
    email: new Map(byEmail.map((c) => [String(c.email), { id: c.id, sameOrg: c.organisationId === organisationId }])),
    phone: new Map(byPhone.map((c) => [c.k, c.id])),
    name: new Map([...nameHits].filter(([, ids]) => ids.size === 1).map(([k, ids]) => [k, [...ids][0]!])),
  };
}
