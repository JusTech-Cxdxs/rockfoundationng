'use server';

import type { Prisma } from '@ejo/database';
import { authorize, myOrganisationId, orgWhere, reachWhere } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { ageingReport, statementFor } from '@/lib/money/statements-server';

/**
 * What customers owe (Money → Statements): everyone with a balance and its
 * ageing, and one customer's statement. Front desk and Accounts; the Owner.
 */

export async function getAgeing() {
  await requireUser();
  await authorize('money.statement.view', undefined, 'getAgeing');
  const reach = (await reachWhere('money.statement.view', { lens: false })) as Prisma.InvoiceWhereInput;
  return ageingReport({ AND: [await orgWhere(), reach] });
}

export async function getCustomerStatement(customerId: string) {
  await requireUser();
  await authorize('money.statement.view', undefined, 'getCustomerStatement');
  const organisationId = await myOrganisationId();
  if (!organisationId || !/^[a-z0-9]{20,40}$/.test(customerId)) return null;
  // The customer is looked up inside the person's organisation (statementFor).
  return statementFor(customerId, (await orgWhere()).organisationId ?? organisationId);
}
