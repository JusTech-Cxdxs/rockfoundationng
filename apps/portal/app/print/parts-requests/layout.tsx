import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { moduleIsOn } from '@/lib/modules';

/** Printed parts requests (PRS): Store documents, not found where the Store is switched off. */
export default function StoreDocument({ children }: { children: ReactNode }) {
  if (!moduleIsOn('inventory')) notFound();
  return children;
}
