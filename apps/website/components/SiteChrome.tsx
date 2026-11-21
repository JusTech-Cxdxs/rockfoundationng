'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * The header and footer of the support and legal pages — left out on the customer portal,
 * which has its own calm, app-like frame (sign-in split screen, dashboard
 * sidebar). One wrapper, so app/layout.tsx stays the single root layout.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  if (pathname === '/customer-portal' || pathname.startsWith('/customer-portal/')) return null;
  return <>{children}</>;
}
