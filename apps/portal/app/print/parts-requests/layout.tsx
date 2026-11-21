import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { moduleIsOn } from '@/lib/modules';

/** Printed parts requests (PRS): Store documents, not found where the Store is switched off (the D'Phoenix Autocare edition). */
export default function StoreDocument({ children }: { children: ReactNode }) {
  if (!moduleIsOn('inventory')) notFound();
  return children;
}
