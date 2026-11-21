import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { moduleIsOn } from '@/lib/modules';

/** Parts requests (PRS) are drawn from the Store: not found where the Store is switched off, pasted links included. */
export default function StoreOnly({ children }: { children: ReactNode }) {
  if (!moduleIsOn('inventory')) notFound();
  return children;
}
