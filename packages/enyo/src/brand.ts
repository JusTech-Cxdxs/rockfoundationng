/**
 * THE ONE PLACE for the platform's name and its "Powered by" line.
 *
 * Every screen, email, printed document, PDF, the installed app and Enyo's
 * own answers read these values. Change it here, then run
 * `npm run brand:sync`: it copies this file to apps/portal/lib/brand.ts and
 * apps/website/lib/brand.ts (a unit test fails if the copies differ).
 *
 * The workshop's own name, address and phones are not here: they live in
 * Settings (the organisation record), so documents always show what the
 * workshop typed.
 */
export const PLATFORM = {
  /** The product, as people say it. */
  name: 'EJO',
  /** What it is. */
  descriptor: 'Workshop Platform',
  /** Name and descriptor together (sign-in pages, About, document titles). */
  fullName: 'EJO Workshop Platform',
  /** The mark on every footer, email, print-out and PDF. */
  poweredBy: 'Powered by EJO · JusTech',
  /** Who makes it. */
  maker: 'Just Technologies (JusTech)',
  makerShort: 'JusTech',
  developer: 'Enefola Justice Ojonuba',
  /** The AI built into it. */
  assistant: 'Enyo',
  assistantVersion: 'Enyo 1.0',
  website: 'https://justech-dev.vercel.app',
} as const;

/**
 * The workshop's two logo files, used exactly as published on its website:
 * the full logo (public/brand/logo.png: emblem, name and RC number) for the
 * sign-in page, letterheads, PDFs and emails, and the square emblem
 * (public/brand/emblem.png) for the sidebar, small spaces and app icons.
 * Their shapes let every place size them without squashing.
 */
export const LOGO = {
  src: '/brand/logo.png',
  width: 720,
  height: 172,
} as const;
export const EMBLEM = {
  src: '/brand/emblem.png',
  width: 512,
  height: 512,
} as const;

/** "Lagos Fleet Services Limited" → "LFSL": the installed app's home-screen name. */
export function appShortName(organisationName: string, override?: string | null): string {
  const o = (override ?? '').trim();
  if (o) return o.slice(0, 12);
  const name = organisationName.trim();
  if (name.length <= 12) return name || PLATFORM.name;
  const initials = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|and|the|&)$/i.test(w)).map((w) => w[0]!.toUpperCase()).join('');
  return (initials.length >= 2 ? initials : name.split(/\s+/)[0] ?? name).slice(0, 12);
}
