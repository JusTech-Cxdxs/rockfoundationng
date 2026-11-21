'use client';

import { useActionState } from 'react';
import { sendEstimateApprovalLinkAction, type ApprovalLinkState } from '@/lib/actions/customer-approval-form-handlers';
import { SubmitButton } from './SubmitButton';

/**
 * "Send approval link" on the Job Card: makes a fresh secure link, emails it
 * to the customer, and offers "Share on WhatsApp" — a wa.me link the
 * colleague opens to send the message from their own phone (nothing is sent
 * by the server), with the same approval link and the estimate PDF as a
 * secure document link. The links are shown only here, once.
 */
export function ApprovalLinkPanel({ jobCardId }: { jobCardId: string }) {
  const [state, action] = useActionState<ApprovalLinkState, FormData>(sendEstimateApprovalLinkAction, null);
  return (
    <div className="space-y-2" data-testid="approval-link-panel">
      <form action={action}>
        <input type="hidden" name="jobCardId" value={jobCardId} />
        <SubmitButton
          label="Send approval link"
          pendingLabel="Making the link…"
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
        />
      </form>
      {state ? (
        <p role={state.ok ? 'status' : 'alert'} className={`text-xs ${state.ok ? 'text-[var(--ejo-text)]' : 'text-[var(--ejo-error)]'}`}>{state.message}</p>
      ) : null}
      {state?.ok && state.whatsAppUrl ? (
        <a
          key={state.at}
          href={state.whatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="share-on-whatsapp"
          className="inline-flex items-center rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          Share on WhatsApp
        </a>
      ) : null}
    </div>
  );
}
