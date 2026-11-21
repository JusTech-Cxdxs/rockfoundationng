import { appShortName, PLATFORM } from './brand';

/**
 * Everything on the website that identifies the organisation, in one
 * place and set per deployment (Vercel → Settings → Environment Variables).
 * NEXT_PUBLIC_* values are read when the site is built, so redeploy after a
 * change. Defaults are neutral: a fresh install shows the product's own name
 * and hides contact lines and social links that are not set.
 *
 * Each value is written out in full (process.env.NEXT_PUBLIC_…) because
 * Next.js only inlines public variables that appear literally in the code.
 */
const organisationName = process.env.NEXT_PUBLIC_ORGANISATION_NAME?.trim() || PLATFORM.name;

export const siteConfig = {
  /** Display name: header and footer wordmark, page titles, emails. */
  organisationName,
  /** Registered name for legal lines; falls back to the display name. */
  legalName: process.env.NEXT_PUBLIC_ORGANISATION_LEGAL_NAME?.trim() || organisationName,
  /** Kept for existing callers: the same as organisationName. */
  companyShortName: organisationName,
  companyName: process.env.NEXT_PUBLIC_ORGANISATION_LEGAL_NAME?.trim() || organisationName,
  tagline: process.env.NEXT_PUBLIC_SITE_TAGLINE?.trim() || '',
  description: process.env.NEXT_PUBLIC_SITE_DESCRIPTION?.trim() || '',
  contact: {
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || '',
    phone: process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() || '',
    /** One line, e.g. "12 Example Road, Ikeja, Lagos". */
    address: process.env.NEXT_PUBLIC_CONTACT_ADDRESS?.trim() || '',
  },
  /** Only the ones that are set are shown. */
  social: {
    facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK?.trim() || '',
    linkedin: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN?.trim() || '',
    x: process.env.NEXT_PUBLIC_SOCIAL_X?.trim() || '',
    youtube: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE?.trim() || '',
    instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM?.trim() || '',
  },
  poweredBy: PLATFORM.poweredBy,
  /** The installed app's home-screen name: NEXT_PUBLIC_APP_SHORT_NAME, or the organisation's initials. */
  appShortName: appShortName(organisationName, process.env.NEXT_PUBLIC_APP_SHORT_NAME),
};

/** First word of the name over the rule, the rest beneath (the wordmark lockup). */
export function wordmarkParts(name: string = siteConfig.organisationName): { top: string; bottom: string } {
  const words = name.trim().split(/\s+/);
  const split = Math.max(1, Math.ceil(words.length / 2));
  return { top: words.slice(0, split).join(' ') || name, bottom: words.slice(split).join(' ') };
}
