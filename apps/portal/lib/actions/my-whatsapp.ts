'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@ejo/database';
import { whatsAppNumber } from '@ejo/utils/whatsapp';
import { writeAuditLog } from '@/lib/workshop-core';
import { cleanPhone } from '@/lib/crm';
import { friendlyError } from '@/lib/errors';
import { requireUser } from './workshop';

/**
 * A colleague's own WhatsApp notices (My profile): their mobile number and
 * whether work notices (an approval waiting, a job assigned, an update)
 * also come to their WhatsApp. Theirs alone; switching it on needs a number WhatsApp can take. Recorded with
 * when, and audited (the number's last four digits only).
 */
export type MyWhatsAppState = { ok: boolean; message: string | null; at?: number };

export async function saveMyWhatsApp(_prev: MyWhatsAppState, f: FormData): Promise<MyWhatsAppState> {
  try {
    const me = await requireUser();
    const optIn = String(f.get('whatsappOptIn') ?? '') === 'yes';
    const phone = cleanPhone(String(f.get('phone') ?? ''), { required: optIn, label: 'Mobile number' });
    if (optIn && !whatsAppNumber(phone)) return { ok: false, message: 'Enter a mobile number WhatsApp can take, e.g. 0803 123 4567 or +234 803 123 4567.' };
    const before = await prisma.user.findUnique({ where: { id: me.id }, select: { phone: true, whatsappOptIn: true, organisationId: true } });
    if (!before) return { ok: false, message: 'Your account could not be found.' };
    const phoneChanged = (before.phone ?? null) !== (phone ?? null);
    const optInChanged = before.whatsappOptIn !== optIn;
    if (!phoneChanged && !optInChanged) return { ok: true, message: 'Saved.', at: Date.now() };
    await prisma.user.update({
      where: { id: me.id },
      data: { phone, ...(optInChanged ? { whatsappOptIn: optIn, whatsappOptInAt: new Date(), whatsappOptInById: me.id } : {}) },
    });
    const last4 = (n: string | null) => (n ? n.replace(/\D/g, '').slice(-4) : null);
    await writeAuditLog({
      userId: me.id, organisationId: before.organisationId, action: 'user.whatsapp_updated', entityType: 'User', entityId: me.id,
      metadata: { ...(optInChanged ? { whatsappOptIn: { from: before.whatsappOptIn, to: optIn } } : {}), ...(phoneChanged ? { phoneLast4: { from: last4(before.phone), to: last4(phone) } } : {}) },
    });
    revalidatePath('/profile');
    return { ok: true, message: optIn ? 'Saved. Work notices now come to your WhatsApp too.' : 'Saved. Work notices come by email only.', at: Date.now() };
  } catch (err) {
    return { ok: false, message: friendlyError(err, 'Could not save your WhatsApp settings.', 'my-whatsapp') };
  }
}
