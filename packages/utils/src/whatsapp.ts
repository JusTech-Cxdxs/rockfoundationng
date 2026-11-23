/**
 * WhatsApp links, shared by both apps: a colleague clicks "Send on WhatsApp"
 * and WhatsApp opens on their own phone or computer with the message
 * written; the server sends nothing. Pure (no crypto, no database), so a
 * server page or a browser component can use it alike. The automatic
 * messages (whatsapp-cloud.ts) use the same number rules and
 * whatsAppRecipient below.
 */

/**
 * A stored phone number as WhatsApp wants it: digits only, Nigerian numbers
 * in 234… form (0803 123 4567, 803 123 4567, +234 803 123 4567 and
 * +234 0803 123 4567 all give 2348031234567). A number written with + and a
 * country code is kept as it is. Anything else (too short, a landline, text)
 * gives null, and no WhatsApp button is shown.
 */
export function whatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const raw = phone.trim();
  if (!/^[+0-9][0-9 ()./-]*$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  let national: string | null = null;
  if (digits.startsWith('2340') && digits.length === 14) national = digits.slice(4);
  else if (digits.startsWith('234') && digits.length === 13) national = digits.slice(3);
  else if (digits.startsWith('0') && digits.length === 11) national = digits.slice(1);
  else if (digits.length === 10 && !raw.startsWith('+')) national = digits;
  if (national !== null) return /^[789]\d{9}$/.test(national) ? `234${national}` : null;
  if (raw.startsWith('+') && digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0')) return digits;
  return null;
}

/** https://wa.me/<number>?text=<message>: opens WhatsApp for the colleague to send it. Null with no usable number. */
export function whatsAppShareUrl(phone: string | null | undefined, text: string): string | null {
  const n = whatsAppNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

/** The link for the first usable number (the main phone, then the other one), or null when neither can take WhatsApp. */
export function whatsAppShareUrlFor(phones: readonly (string | null | undefined)[], text: string): string | null {
  for (const phone of phones) {
    const url = whatsAppShareUrl(phone, text);
    if (url) return url;
  }
  return null;
}

/**
 * Who an automatic WhatsApp message (the WhatsApp Business Platform) may go
 * to: only someone who has agreed to WhatsApp messages (Meta's policy and
 * the Nigeria Data Protection Act need opt-in for messages a business
 * starts), at the first of their numbers WhatsApp can take. Agreement is
 * checked first, so a number is never even looked at without it.
 */
export type WhatsAppRecipient = { ok: true; number: string } | { ok: false; reason: 'NO_CONSENT' | 'NO_NUMBER' };

export function whatsAppRecipient(p: { optIn: boolean | null | undefined; phones: readonly (string | null | undefined)[] }): WhatsAppRecipient {
  if (p.optIn !== true) return { ok: false, reason: 'NO_CONSENT' };
  for (const phone of p.phones) {
    const number = whatsAppNumber(phone);
    if (number) return { ok: true, number };
  }
  return { ok: false, reason: 'NO_NUMBER' };
}

/** The greeting name: a person's first name, an organisation's whole name. */
export function greetingName(fullName: string | null | undefined, organisation: boolean): string {
  const name = String(fullName ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return 'there';
  return organisation ? name : name.split(' ')[0]!;
}
