import { portalBaseUrl, websiteBaseUrl } from '@/lib/portal-url';
import { prisma } from '@ejo/database';
import { sendEmail } from '@/lib/email';
import { renderStaffNoticeEmail } from '@/lib/email-templates/staff-notice';
import { BROADCAST_CATEGORY, reaches, isCustomerAudience } from '@/lib/notification-rules';
import { renderCustomerBroadcastEmail } from '@/lib/email-templates/customer-broadcast';
import { whatsAppToCustomer, whatsAppToStaff } from '@/lib/whatsapp/send';

const CUSTOMER_BATCH = 5;
const NO_SENDS = { sent: 0, failed: 0, whatsApp: 0 };

/** A customer broadcast by email: to the organisation's active customers who
 * want email updates (all, or those chosen), a few at a time. Each failure is
 * logged (Settings → Email delivery); a failure never stops the others. */
async function emailCustomers(b: { id: string; title: string; message: string; category: string; organisationId: string; audience: string; audienceIds: string[]; organisation: { name: string } }): Promise<{ sent: number; failed: number; whatsApp: number }> {
  const customers = await prisma.customer.findMany({
    // Only customers with an email on file: one imported without an address is not a failed send.
    where: { organisationId: b.organisationId, isActive: true, notifyByEmail: true, email: { not: null }, ...(b.audience === 'CUSTOMERS_SELECTED' ? { id: { in: b.audienceIds } } : {}) },
    select: { id: true, fullName: true, email: true },
  });
  const meta = BROADCAST_CATEGORY[b.category] ?? BROADCAST_CATEGORY.ANNOUNCEMENT!;
  const website = websiteBaseUrl();
  let sent = 0, failed = 0;
  for (let i = 0; i < customers.length; i += CUSTOMER_BATCH) {
    const batch = customers.slice(i, i + CUSTOMER_BATCH);
    const results = await Promise.allSettled(batch.map((c: (typeof batch)[number]) => {
      const preferencesUrl = `${website}/customer-portal/dashboard/profile`;
      const { subject, html } = renderCustomerBroadcastEmail({
        customerName: c.fullName, title: b.title, message: b.message, categoryLabel: meta.heading,
        portalUrl: `${website}/customer-portal`, logoUrl: `${website}/brand/emblem.png`, companyName: b.organisation.name,
        preferencesUrl,
      });
      // Announcements are optional (notifyByEmail), so mail clients may offer an unsubscribe link to the preference page.
      return sendEmail(c.email, subject, html, undefined, { headers: { 'List-Unsubscribe': `<${preferencesUrl}>` } });
    }));
    for (let k = 0; k < results.length; k += 1) {
      const r = results[k]!;
      const c = batch[k]!;
      if (r.status === 'fulfilled') { sent += 1; continue; }
      failed += 1;
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      await prisma.securityEmailLog.create({ data: { entityType: 'Broadcast', entityId: b.id, recipient: `${c.fullName} <${c.email}>`, subject: b.title.slice(0, 200), sent: false, error: reason.slice(0, 300) } }).catch(() => undefined);
    }
  }
  // The same broadcast on WhatsApp, to those who agreed to it (with or without an email).
  return { sent, failed, whatsApp: await whatsAppCustomers(b) };
}

/**
 * A customer broadcast on WhatsApp (rf_customer_announcement, a marketing
 * template): only to customers who agreed to WhatsApp and still want
 * announcements (notifyByEmail is their announcements choice), whether or
 * not they have an email. A few at a time; never throws.
 */
async function whatsAppCustomers(b: { id: string; title: string; message: string; organisationId: string; audience: string; audienceIds: string[] }): Promise<number> {
  const customers = await prisma.customer.findMany({
    where: { organisationId: b.organisationId, isActive: true, notifyByEmail: true, whatsappOptIn: true, ...(b.audience === 'CUSTOMERS_SELECTED' ? { id: { in: b.audienceIds } } : {}) },
    select: { id: true },
    take: 5000,
  }).catch(() => [] as { id: string }[]);
  const portalUrl = `${websiteBaseUrl()}/customer-portal`;
  let sent = 0;
  for (let i = 0; i < customers.length; i += CUSTOMER_BATCH) {
    const results = await Promise.all(customers.slice(i, i + CUSTOMER_BATCH).map((c) => whatsAppToCustomer({ customerId: c.id, key: 'customer_announcement', related: { type: 'Broadcast', id: b.id }, values: { title: b.title, message: b.message.slice(0, 400), link: portalUrl } })));
    sent += results.filter((r) => r.status === 'SENT').length;
  }
  return sent;
}

/**
 * Emails every broadcast that is live, marked for email and not yet sent —
 * to everyone in its audience. Server-only (never a callable action). Each
 * broadcast is claimed first so two runs never both send it; one audit
 * entry records how many went out.
 */
export async function deliverDueBroadcastEmails(now: Date = new Date()): Promise<number> {
  const due = await prisma.broadcast.findMany({
    where: { isActive: true, sendEmail: true, emailedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    select: { id: true, broadcastNumber: true, organisationId: true, category: true, title: true, message: true, audience: true, audienceIds: true, createdById: true, organisation: { select: { name: true } } },
  });
  let total = 0;
  for (const b of due) {
    const claimed = await prisma.broadcast.updateMany({ where: { id: b.id, emailedAt: null }, data: { emailedAt: now } });
    if (claimed.count === 0) continue;
    if (isCustomerAudience(b.audience)) {
      const r = await emailCustomers(b).catch(() => NO_SENDS);
      await prisma.auditLog.create({ data: { userId: b.createdById, organisationId: b.organisationId, action: 'broadcast.emailed', entityType: 'Broadcast', entityId: b.id, metadata: { broadcastNumber: b.broadcastNumber, sent: r.sent, failed: r.failed, whatsApp: r.whatsApp, audience: 'customers' } } });
      total += r.sent;
      continue;
    }
    const users = await prisma.user.findMany({ where: { organisationId: b.organisationId, isActive: true }, select: { fullName: true, email: true, branchId: true, departmentId: true, roles: { select: { role: { select: { slug: true } } } } } });
    const audience = users.filter((u: (typeof users)[number]) => u.email && reaches(b, { branchId: u.branchId, departmentId: u.departmentId, roleSlugs: u.roles.map((r: { role: { slug: string } }) => r.role.slug) }));
    const meta = BROADCAST_CATEGORY[b.category] ?? BROADCAST_CATEGORY.ANNOUNCEMENT!;
    const portal = portalBaseUrl();
    const onWhatsApp = await whatsAppToStaff({ to: audience, key: 'staff_announcement', related: { type: 'Broadcast', id: b.id }, values: { title: b.title, message: b.message.slice(0, 400), link: `${portal}/notifications?tab=broadcasts` } });
    let sent = 0, failed = 0;
    for (const u of audience) {
      try {
        await sendEmail(u.email, `${meta.heading}: ${b.title}`, renderStaffNoticeEmail({
          recipientName: u.fullName, heading: b.title, lines: b.message.split(/\n+/).map((l: string) => l.trim()).filter(Boolean),
          actionUrl: `${portal}/notifications?tab=broadcasts`, actionLabel: 'Read in EJO', statusLabel: meta.label,
          statusTone: b.category === 'URGENT' || b.category === 'SECURITY_ALERT' ? 'danger' : b.category === 'IMPORTANT' ? 'warning' : 'info',
          logoUrl: `${portal}/brand/emblem.png`, companyName: b.organisation.name, branchName: '',
        }));
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    await prisma.auditLog.create({ data: { userId: b.createdById, action: 'broadcast.emailed', entityType: 'Broadcast', entityId: b.id, metadata: { broadcastNumber: b.broadcastNumber, sent, failed, whatsAppSent: onWhatsApp } } });
    total += sent;
  }
  return total;
}
