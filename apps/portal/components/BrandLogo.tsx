'use client';

import { useState } from 'react';
import { portalConfig } from '@/lib/site-config';
import { EMBLEM } from '@/lib/brand';

interface BrandLogoProps {
  size?: number;
}

/**
 * The organisation's emblem (public/brand/emblem.png), or a one-letter
 * monogram if it is missing. The portal and website have separate `public/`
 * folders, so the file must be uploaded to both.
 */
export function BrandLogo({ size = 40 }: BrandLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className="flex items-center justify-center rounded-full bg-[var(--ejo-primary)] text-lg font-bold text-white"
        style={{ height: size, width: size }}
      >
        {portalConfig.organisationName.charAt(0)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- needs a plain onError fallback to the monogram
    <img
      src={EMBLEM.src}
      alt={portalConfig.organisationName}
      style={{ height: size, width: 'auto' }}
      onError={() => setFailed(true)}
    />
  );
}
