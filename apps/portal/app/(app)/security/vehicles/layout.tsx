import type { ReactNode } from 'react';
import { guardAnyPage } from '@/lib/authz/server';

/** Server-side guard for /security/vehicles: the gate desk. */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['security.view'], '/security/vehicles');
  return children;
}
