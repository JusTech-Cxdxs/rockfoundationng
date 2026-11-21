'use client';

import { useState } from 'react';
import { EMBLEM, LOGO } from '@/lib/brand';

/**
 * The organisation's wordmark, used in the sidebar, the phone header and on
 * every sign-in page.
 *
 *  - On a light background ("default") it is the workshop's full logo, used
 *    exactly as published (emblem, name and RC number).
 *  - On the blue panels ("onDark") the full logo's blue lettering would not
 *    show, so it is the emblem on a white tile with the name in white: the
 *    first part large, the rest smaller beneath, set off by a thin rule in the
 *    logo's red.
 *
 *  size  "sm" (phone header) · "md" (sidebar) · "lg" (sign-in brand panel)
 */
export function Wordmark({ name, size = 'md', tone = 'default' }: { name: string; size?: 'sm' | 'md' | 'lg'; tone?: 'default' | 'onDark' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const words = name.trim().split(/\s+/);
  const split = Math.max(1, Math.ceil(words.length / 2));
  const top = words.slice(0, split).join(' ') || name;
  const bottom = words.slice(split).join(' ');
  const h = size === 'lg' ? 52 : size === 'sm' ? 30 : 40;

  if (tone === 'default' && !imageFailed) {
    const logoH = size === 'lg' ? 56 : size === 'sm' ? 34 : 44;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- plain onError fallback to the lettered wordmark
      <img src={LOGO.src} alt={name} title={name} width={Math.round(logoH * (LOGO.width / LOGO.height))} height={logoH} className="block max-w-full object-contain" style={{ height: logoH, width: 'auto' }} onError={() => setImageFailed(true)} />
    );
  }

  const topText = tone === 'onDark' ? 'text-white' : 'text-[var(--ejo-primary-text)]';
  const bottomText = tone === 'onDark' ? 'text-white/80' : 'text-[var(--ejo-text-muted)]';
  return (
    <div className="flex min-w-0 items-center gap-2.5" title={name}>
      {imageFailed ? (
        <span className="flex shrink-0 items-center justify-center rounded-lg bg-[var(--ejo-brand)] font-bold text-white" style={{ width: h, height: h }}>{top.charAt(0)}</span>
      ) : (
        <span className="flex shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5" style={{ width: h, height: h }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- plain onError fallback to the monogram */}
          <img src={EMBLEM.src} alt="" width={h - 8} height={h - 8} className="block h-full w-full object-contain" onError={() => setImageFailed(true)} />
        </span>
      )}
      <div className="inline-flex min-w-0 flex-col items-stretch">
        <span className={`truncate font-bold leading-none tracking-[0.01em] ${topText} ${size === 'lg' ? 'text-[26px]' : size === 'sm' ? 'text-[15px]' : 'text-[18px]'}`}>{top}</span>
        {bottom ? (
          <span className={`flex min-w-0 items-center ${size === 'lg' ? 'mt-1.5' : 'mt-1'}`}>
            <span className={`truncate font-medium uppercase leading-none tracking-[0.14em] ${bottomText} ${size === 'lg' ? 'text-xs' : 'text-[10px]'}`}>{bottom}</span>
            {/* A real border (not a background) so it prints. */}
            <span className="ml-1.5 min-w-[12px] flex-1" style={{ borderBottom: `${size === 'lg' ? 2 : 1.5}px solid var(--ejo-brand)` }} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
