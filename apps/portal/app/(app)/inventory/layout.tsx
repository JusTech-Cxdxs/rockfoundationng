import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { areaNotAtMyBranch, guardAnyPage } from '@/lib/authz/server';
import { AreaNotHere } from '@/components/AreaNotHere';
import { moduleIsOn } from '@/lib/modules';

/**
 * Server-side guard for /inventory — pasted links included. (Store, Workshop supervisors and technicians, Finance, management.)
 * Someone whose own branch has no such area (the menu does not offer it) is
 * told so in place of the page.
 * In an edition with this module off (D'Phoenix Autocare) the whole tree is not found, for everyone.
 */
export default async function Guard({ children }: { children: ReactNode }) {
  if (!moduleIsOn('inventory')) notFound();
  await guardAnyPage(['store.view'], '/inventory');
  const elsewhere = await areaNotAtMyBranch('inventory');
  if (elsewhere) return <AreaNotHere area="inventory" {...elsewhere} />;
  return children;
}
