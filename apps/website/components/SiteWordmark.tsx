'use client';

import { wordmarkParts } from '@/lib/site-config';
import { BrandLogo } from './BrandLogo';

/**
 * The website wordmark: the emblem, the first part of the organisation name
 * large and bold, and the rest smaller beneath it beside a thin rule in the
 * logo's red, as in the staff portal.
 *
 *  tone  "default" (theme colours) · "light" (white text over the hero image or the dark footer)
 *  size  "header" · "footer"
 */
export function SiteWordmark({ tone = 'default', size = 'header' }: { tone?: 'default' | 'light'; size?: 'header' | 'footer' }) {
  const mark = wordmarkParts();
  const top = tone === 'light' ? 'text-white' : 'text-[var(--ejo-primary-text)]';
  const bottom = tone === 'light' ? 'text-white/75' : 'text-[var(--ejo-text-muted)]';
  const footer = size === 'footer';
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <BrandLogo transparent={tone === 'light'} size={footer ? 40 : 34} />
      <span className="inline-flex min-w-0 flex-col items-stretch">
        <span className={`block font-bold leading-none tracking-[0.01em] ${top} ${footer ? 'text-[20px]' : 'text-[17px] sm:text-[19px]'}`}>{mark.top}</span>
        {mark.bottom ? (
          <span className="mt-1 flex items-center">
            <span className={`block font-medium uppercase leading-none tracking-[0.14em] ${bottom} text-[10px]`}>{mark.bottom}</span>
            <span className="ml-1.5 min-w-[12px] flex-1" style={{ borderBottom: '1.5px solid var(--ejo-brand)' }} aria-hidden="true" />
          </span>
        ) : null}
      </span>
    </span>
  );
}
