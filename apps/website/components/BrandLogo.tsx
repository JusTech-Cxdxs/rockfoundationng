'use client';

import { siteConfig } from '@/lib/site-config';
import { useState } from 'react';
import { EMBLEM } from '@/lib/brand';

interface BrandLogoProps {
  transparent?: boolean;
  size?: number;
}

/** The workshop's emblem (public/brand/emblem.png) for the header and footer, on a white tile so it reads on the blue footer; a one-letter monogram if it is missing. */
export function BrandLogo({ transparent = false, size = 44 }: BrandLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={`flex items-center justify-center rounded-full text-lg font-bold ${
          transparent ? 'bg-white/15 text-white' : 'bg-[var(--ejo-primary)] text-white'
        }`}
        style={{ height: size, width: size }}
      >
        {siteConfig.organisationName.charAt(0)}
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5" style={{ height: size, width: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- needs a plain onError fallback to the monogram */}
      <img src={EMBLEM.src} alt={siteConfig.organisationName} className="block h-full w-full object-contain" onError={() => setFailed(true)} />
    </span>
  );
}
