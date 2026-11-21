import Link from 'next/link';
import { siteConfig } from '@/lib/site-config';
import { SiteWordmark } from './SiteWordmark';
import { ThemeToggle } from './ThemeToggle';

/**
 * The header of the few pages outside the customer portal (support, privacy,
 * terms, an estimate approval): the logo and the organisation's name, the
 * theme switch and the way into the customer portal. The portal itself has
 * its own frame (components/customer/PortalShell.tsx).
 */
export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-[var(--ejo-bg)]/95 shadow-[0_1px_0_var(--ejo-border)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--ejo-bg)]/85" data-testid="site-header">
      <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:h-[76px] lg:px-10">
        <Link href="/customer-portal" className="flex min-w-0 shrink items-center" aria-label={siteConfig.organisationName}>
          <SiteWordmark />
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <Link
            href="/customer-portal"
            className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-[var(--ejo-border)] px-4 text-[13px] font-semibold text-[var(--ejo-text)] transition-colors hover:border-[var(--ejo-primary)] hover:text-[var(--ejo-primary)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="8" r="4" /></svg>
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
