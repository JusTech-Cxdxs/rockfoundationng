import Link from 'next/link';
import { siteConfig } from '@/lib/site-config';
import { SiteWordmark } from './SiteWordmark';
import { PoweredByBadge } from './PoweredByBadge';
import { FacebookIcon, LinkedInIcon, XIcon, YouTubeIcon, InstagramIcon } from './icons';
import { WORKSHOP } from '@/lib/content/workshop';

// Social links come from lib/site-config.ts; only the ones that are set show.
const SOCIALS = [
  { label: 'Facebook', icon: FacebookIcon, href: siteConfig.social.facebook },
  { label: 'LinkedIn', icon: LinkedInIcon, href: siteConfig.social.linkedin },
  { label: 'X (Twitter)', icon: XIcon, href: siteConfig.social.x },
  { label: 'YouTube', icon: YouTubeIcon, href: siteConfig.social.youtube },
  { label: 'Instagram', icon: InstagramIcon, href: siteConfig.social.instagram },
].filter((s) => s.href);

/**
 * The footer of the pages outside the customer portal: the organisation, how
 * to reach it (the deployment's own contact settings, or Rock Foundation
 * Autocare's published contacts when none are set) and the legal links.
 */
export function Footer() {
  const contact = siteConfig.contact;
  const own = Boolean(contact.address || contact.phone || contact.email);
  return (
    <footer className="relative bg-[var(--ejo-secondary)] text-white">
      <div className="mx-auto grid max-w-[1480px] gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:px-10">
        <div>
          <SiteWordmark tone="light" size="footer" />
          <p className="mt-3 max-w-sm text-sm text-white/70">{WORKSHOP.tagline} {WORKSHOP.summary}</p>
          {SOCIALS.length > 0 ? (
            <div className="mt-5 flex gap-3">
              {SOCIALS.map(({ label, icon: Icon, href }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-[var(--ejo-primary)] hover:text-[var(--ejo-on-primary)]">
                  <Icon />
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <p className="text-sm font-semibold text-white">Contact us</p>
          <address className="mt-3 space-y-2 text-sm not-italic text-white/60">
            {own ? (
              <>
                {contact.address ? <p>{contact.address}</p> : null}
                {contact.phone ? <p><a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="hover:text-white">{contact.phone}</a></p> : null}
                {contact.email ? <p><a href={`mailto:${contact.email}`} className="hover:text-white">{contact.email}</a></p> : null}
              </>
            ) : (
              <>
                <p>{WORKSHOP.address}</p>
                {WORKSHOP.phones.map((p) => <p key={p}><a href={`tel:${p.replace(/[^\d+]/g, '')}`} className="hover:text-white">{p}</a></p>)}
                {WORKSHOP.email ? <p><a href={`mailto:${WORKSHOP.email}`} className="hover:text-white">{WORKSHOP.email}</a></p> : null}
                {WORKSHOP.hours ? <p>{WORKSHOP.hours}</p> : null}
              </>
            )}
          </address>
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-white/50">© {new Date().getFullYear()} {siteConfig.legalName}. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-5 text-xs text-white/50">
            <Link href="/support" className="hover:text-white">Customer support</Link>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms of use</Link>
            <PoweredByBadge />
          </div>
        </div>
      </div>
    </footer>
  );
}
