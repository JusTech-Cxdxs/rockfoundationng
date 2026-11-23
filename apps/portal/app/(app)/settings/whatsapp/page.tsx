import { prisma } from '@ejo/database';
import { whatsAppCloudConfig, listWhatsAppTemplates, type MetaTemplate } from '@ejo/utils/whatsapp-cloud';
import { WHATSAPP_TEMPLATES, type WhatsAppTemplateDef } from '@ejo/utils/whatsapp-templates';
import { guardPage, myOrganisationId } from '@/lib/authz/server';
import { BackLink, PageHeader } from '@/components/ui';
import { WhatsAppTestForm } from '@/components/WhatsAppTestForm';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 sm:p-6';
const TONE: Record<string, string> = {
  APPROVED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  PENDING: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text,var(--ejo-warning))]',
  REJECTED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
  MISSING: 'bg-[var(--ejo-error)]/10 text-[var(--ejo-error)]',
};
const STATUS_WORD: Record<string, string> = { SENT: 'Sent', FAILED: 'Failed', SKIPPED: 'Skipped' };

export const dynamic = 'force-dynamic';

/**
 * Settings → WhatsApp: whether automatic WhatsApp sending is set up (never
 * a secret: only whether each setting is there), each template in the
 * catalogue with Meta's approval when the WhatsApp Business Account ID is
 * set, the latest messages and failures, and "Send a test template".
 */
export default async function WhatsAppSettingsPage() {
  await guardPage('admin.settings.manage', '/settings/whatsapp');
  const orgId = await myOrganisationId();
  const cfg = whatsAppCloudConfig();
  const all = WHATSAPP_TEMPLATES as readonly WhatsAppTemplateDef[];
  const meta = cfg?.businessAccountId ? await listWhatsAppTemplates(cfg) : null;
  const statusOf = (t: WhatsAppTemplateDef): string => {
    if (!meta?.ok) return '—';
    const found = meta.templates.filter((m: MetaTemplate) => m.name === t.name);
    const same = found.find((m) => m.language === cfg!.language) ?? found[0];
    return same ? same.status || 'PENDING' : 'MISSING';
  };
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [recent, failures, counts] = orgId
    ? await Promise.all([
        prisma.whatsAppMessage.findMany({ where: { organisationId: orgId }, orderBy: { createdAt: 'desc' }, take: 50 }).catch(() => []),
        prisma.whatsAppMessage.findMany({ where: { organisationId: orgId, status: 'FAILED' }, orderBy: { createdAt: 'desc' }, take: 20 }).catch(() => []),
        prisma.whatsAppMessage.groupBy({ by: ['status'], where: { organisationId: orgId, createdAt: { gte: since } }, _count: { _all: true } }).catch(() => []),
      ])
    : [[], [], []];
  const count = (s: string) => counts.find((c: { status: string }) => c.status === s)?._count._all ?? 0;
  const nameOf = (key: string) => all.find((t) => t.key === key)?.name ?? key;
  const settings: [string, boolean, string][] = [
    ['WHATSAPP_ACCESS_TOKEN', Boolean(cfg), 'The permanent System User token'],
    ['WHATSAPP_PHONE_NUMBER_ID', Boolean(cfg), 'The business phone number’s ID'],
    ['WHATSAPP_BUSINESS_ACCOUNT_ID', Boolean(cfg?.businessAccountId), 'For the template approvals below'],
  ];

  return (
    <div className="w-full max-w-5xl p-4 sm:p-8">
      <BackLink href="/settings" label="Settings" />
      <PageHeader icon="chat" title="WhatsApp" description="Automatic WhatsApp messages through Meta's WhatsApp Business Platform: the set-up, each template's approval, and what was sent." />

      <section className={`${card} mt-6`} aria-labelledby="wa-setup" data-testid="whatsapp-status">
        <h2 id="wa-setup" className="text-sm font-semibold text-[var(--ejo-text)]">{cfg ? 'Automatic sending is on' : 'Automatic sending is not set up'}</h2>
        <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
          {cfg
            ? `Every email with a WhatsApp template also goes on WhatsApp, to customers who agreed (the tick box on their page) and colleagues who switched it on (their profile). Graph API ${cfg.graphVersion}, templates in “${cfg.language}”.`
            : 'Nothing is sent automatically. The “Send on WhatsApp” buttons still open WhatsApp on your own phone with the message written. To switch automatic sending on, follow docs/SETUP.md (WhatsApp) and set the WHATSAPP_ settings in both Vercel projects.'}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          {settings.map(([k, on, what]) => (
            <div key={k}>
              <dt className="break-all font-mono text-[11px] text-[var(--ejo-text-muted)]">{k}</dt>
              <dd className={`mt-0.5 font-medium ${on ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-text-muted)]'}`}>{on ? 'Set' : 'Not set'} <span className="font-normal text-[var(--ejo-text-muted)]">· {what}</span></dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-[var(--ejo-text-muted)]">Last 7 days: {count('SENT')} sent · <span className={count('FAILED') ? 'text-[var(--ejo-error)]' : ''}>{count('FAILED')} failed</span> · {count('SKIPPED')} skipped (no agreement or no WhatsApp number). Meta charges for each message it delivers.</p>
      </section>

      <section className={`${card} mt-6`} aria-labelledby="wa-test">
        <h2 id="wa-test" className="text-sm font-semibold text-[var(--ejo-text)]">Send a test template</h2>
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Sends one approved template, with its sample values, to the number you type. Use your own phone. It is recorded below and in the audit log.</p>
        <div className="mt-3"><WhatsAppTestForm templates={all.filter((t) => !t.header).map((t) => ({ key: t.key, name: t.name }))} disabled={!cfg} /></div>
      </section>

      <section className={`${card} mt-6`} aria-labelledby="wa-templates">
        <h2 id="wa-templates" className="text-sm font-semibold text-[var(--ejo-text)]">Templates ({all.length})</h2>
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
          Create each one in WhatsApp Manager exactly as docs/WHATSAPP_TEMPLATES.md gives it. {meta ? (meta.ok ? 'Status as Meta reports it now.' : `Meta's list could not be read: ${meta.message}`) : 'Set WHATSAPP_BUSINESS_ACCOUNT_ID to see each one’s approval here.'}
        </p>
        <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Table">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-[var(--ejo-text-muted)]"><tr><th className="py-2 pr-3 font-medium">Name in Meta</th><th className="py-2 pr-3 font-medium">Category</th><th className="py-2 pr-3 font-medium">PDF</th><th className="py-2 pr-3 font-medium">When</th><th className="py-2 font-medium">Status</th></tr></thead>
            <tbody className="divide-y divide-[var(--ejo-border)]">
              {all.map((t) => {
                const s = statusOf(t);
                return (
                  <tr key={t.key} data-testid={`wa-template-${t.key}`}>
                    <td className="py-2 pr-3 font-mono text-xs text-[var(--ejo-text)]">{t.name}</td>
                    <td className="py-2 pr-3 text-xs text-[var(--ejo-text-muted)]">{t.category}</td>
                    <td className="py-2 pr-3 text-xs text-[var(--ejo-text-muted)]">{t.header === 'DOCUMENT' ? 'Yes' : 'No'}</td>
                    <td className="py-2 pr-3 text-xs text-[var(--ejo-text-muted)]">{t.when}</td>
                    <td className="py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[s] ?? 'text-[var(--ejo-text-muted)]'}`}>{s === 'MISSING' ? 'Missing' : s === '—' ? '—' : s.charAt(0) + s.slice(1).toLowerCase()}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {failures.length ? (
        <section className={`${card} mt-6`} aria-labelledby="wa-failures">
          <h2 id="wa-failures" className="text-sm font-semibold text-[var(--ejo-error)]">Latest failures</h2>
          <ul className="mt-3 divide-y divide-[var(--ejo-border)]">
            {failures.map((m) => (
              <li key={m.id} className="py-2 text-sm">
                <span className="font-mono text-xs text-[var(--ejo-text)]">{nameOf(m.templateKey)}</span>
                <span className="text-xs text-[var(--ejo-text-muted)]"> · {m.toLast4 ? `…${m.toLast4}` : 'no number'} · {formatDateTimeCompact(m.createdAt)}</span>
                <p className="mt-0.5 text-xs text-[var(--ejo-error)]">{m.error ?? 'Failed'}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={`${card} mt-6`} aria-labelledby="wa-recent">
        <h2 id="wa-recent" className="text-sm font-semibold text-[var(--ejo-text)]">Latest messages</h2>
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Never the message text or the whole number: the template, the number’s last four digits and what happened. Kept 90 days.</p>
        {recent.length ? (
          <ul className="mt-3 divide-y divide-[var(--ejo-border)]">
            {recent.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-2 py-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.status === 'SENT' ? TONE.APPROVED : m.status === 'FAILED' ? TONE.REJECTED : 'bg-[var(--ejo-border)] text-[var(--ejo-text-muted)]'}`}>{STATUS_WORD[m.status] ?? m.status}</span>
                <span className="font-mono text-xs text-[var(--ejo-text)]">{nameOf(m.templateKey)}</span>
                <span className="text-xs text-[var(--ejo-text-muted)]">{m.toLast4 ? `…${m.toLast4}` : 'no number'} · {m.relatedType ?? ''} · {formatDateTimeCompact(m.createdAt)}</span>
                {m.status !== 'SENT' && m.error ? <span className="w-full text-xs text-[var(--ejo-text-muted)]">{m.error}</span> : null}
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-[var(--ejo-text-muted)]">No WhatsApp messages yet.</p>}
      </section>
    </div>
  );
}
