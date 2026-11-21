import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { moduleIsOn } from '@/lib/modules';

/** Raising a parts request (PRS) on a Job Card needs the Store: not found where the Store is switched off. */
export default function StoreOnly({ children }: { children: ReactNode }) {
  if (!moduleIsOn('inventory')) notFound();
  return children;
}
