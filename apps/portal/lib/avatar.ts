/** Initials and a stable colour for a person's avatar (pure — see components/Avatar.tsx). */
// Each shade carries white initials at 4.5:1 or better (WCAG AA).
const PALETTE = ['#15803d', '#2563eb', '#9333ea', '#be185d', '#c2410c', '#0e7490', '#4f46e5', '#4d7c0f', '#b45309', '#0f766e'];

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '';
  return (first + last).toUpperCase();
}

export function colourOf(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

