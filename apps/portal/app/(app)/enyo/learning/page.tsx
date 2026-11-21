import Link from 'next/link';
import { allows, getPrincipal, guardPage, myOrganisationId } from '@/lib/authz/server';
import { getEnyoSettings } from '@/lib/enyo/settings';
import { PageHeader, SectionCard, Icon } from '@/components/ui';
import { Suspense } from 'react';
import { LearnedAnswersCard } from '@/components/enyo/LearnedAnswersCard';
import { ConversationInsightsCard } from '@/components/enyo/ConversationInsightsCard';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

const LEARNED_STATUS: Record<string, string> = { learned_approved: 'Approved. Enyo now follows that answer.', learned_removed: 'Removed. Enyo no longer uses that answer.' };

export const dynamic = 'force-dynamic';

/**
 * Enyo's learning: what it gathers from its own conversations and the
 * answers people have approved for it to reuse. For administrators who
 * manage Enyo.
 */
export default async function EnyoLearningPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  const sp = await searchParams;
  const status = typeof sp.status === 'string' ? LEARNED_STATUS[sp.status] : undefined;
  const error = typeof sp.error === 'string' ? sp.error.slice(0, 300) : undefined;
  await guardPage('enyo.manage', '/enyo/learning');
  const p = await getPrincipal();
  const orgId = p.organisationId ?? (await myOrganisationId());
  const [settings, canSupport] = await Promise.all([getEnyoSettings(orgId), allows('support.tickets.manage')]);

  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        icon="sparkles"
        eyebrow={`${settings.displayName} · Learning`}
        title={`${settings.displayName} learning`}
        description={<>What {settings.displayName} learns from its conversations, and the answers your team has approved for it to reuse. Nothing is reused until someone approves it.</>}
        back={{ href: '/settings/enyo', label: 'Settings' }}
        actions={
          canSupport ? (
            <Link href="/crm/support/enyo" className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] sm:min-h-9">
              <Icon name="inbox" size={15} />Enyo&rsquo;s support replies
            </Link>
          ) : null
        }
      />

      {error ? <div role="alert"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {status ? <div role="status"><FormFeedbackBanner kind="success" message={status} /></div> : null}

      <div id="conversations" className="mb-6 scroll-mt-24">
        <Suspense fallback={<SectionCard icon="activity" title="What Enyo learns from its conversations"><p role="status" className="text-sm text-[var(--ejo-text-muted)]">Reading the conversations…</p></SectionCard>}>
          <ConversationInsightsCard />
        </Suspense>
      </div>
      <div id="learned" className="mb-6 scroll-mt-24">
        <Suspense fallback={<SectionCard icon="sparkles" title="What Enyo has learned"><p role="status" className="text-sm text-[var(--ejo-text-muted)]">Loading…</p></SectionCard>}>
          <LearnedAnswersCard />
        </Suspense>
      </div>

      <p className="text-xs text-[var(--ejo-text-muted)]">Names, phone numbers, emails, plates and VINs are removed from what {settings.displayName} learns from.</p>
    </div>
  );
}
