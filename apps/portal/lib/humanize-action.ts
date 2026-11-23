/** Names and short forms kept as people write them. */
const PROPER: [RegExp, string][] = [[/\bquickbooks\b/g, 'QuickBooks'], [/\bwhatsapp\b/g, 'WhatsApp'], [/\benyo\b/g, 'Enyo'], [/\bvat\b/g, 'VAT'], [/\bpos\b/g, 'POS'], [/\bpdf\b/g, 'PDF']];

/** Turn an internal audit code ("part.warranty_policy_set") into readable
 * words ("Part warranty policy set") — the fallback whenever a screen has
 * no hand-written label, so no dots or underscores ever reach users. */
export function humanizeAction(action: string): string {
  let words = action.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  for (const [re, name] of PROPER) words = words.replace(re, name);
  return words.charAt(0).toUpperCase() + words.slice(1);
}
