'use client';

import { useState, useTransition } from 'react';
import { makeWelcomeWhatsAppMessage, makeWhatsAppMessage, type WhatsAppPrepared } from '@/lib/actions/whatsapp';

type Prepare =
  | { document: { kind: 'ESTIMATE' | 'INVOICE' | 'RECEIPT'; id: string } }
  | { access: { customerId: string; kind: 'welcome' | 'access' } };

const green = 'inline-flex items-center rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60';

/**
 * "Send on WhatsApp" for a document (with its PDF as a secure link) or the
 * portal set-password link. Two steps, so it works on phones and past
 * pop-up blockers: the press asks the server to prepare the message (a new
 * link each time, audited), then "Open WhatsApp" appears as an ordinary link
 * the colleague taps; WhatsApp opens with the message written and they send
 * it themselves. Nothing is sent by the server. Shown only when the
 * customer's phone can take WhatsApp (the page decides).
 */
export function WhatsAppSendButton({ prepare, label = 'Send on WhatsApp', testId = 'send-on-whatsapp' }: { prepare: Prepare; label?: string; testId?: string }) {
  const [state, setState] = useState<WhatsAppPrepared | null>(null);
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    setState(null);
    setState('document' in prepare ? await makeWhatsAppMessage(prepare.document) : await makeWelcomeWhatsAppMessage(prepare.access));
  });
  return (
    <span className="inline-flex flex-col items-start gap-1" data-testid={`${testId}-panel`}>
      {state?.ok ? (
        <a href={state.url} target="_blank" rel="noopener noreferrer" data-testid={`${testId}-open`} className={green}>
          Open WhatsApp
        </a>
      ) : (
        <button type="button" onClick={run} disabled={pending} data-testid={testId} className={green}>
          {pending ? 'Preparing the message…' : label}
        </button>
      )}
      {state ? (
        <span role={state.ok ? 'status' : 'alert'} className={`max-w-xs text-[11px] ${state.ok ? 'text-[var(--ejo-text-muted)]' : 'text-[var(--ejo-error)]'}`}>
          {state.ok ? state.note : state.message}
          {state.ok ? (
            <>
              {' '}
              <button type="button" onClick={run} disabled={pending} className="font-medium text-[var(--ejo-primary)] hover:underline">
                Prepare it again
              </button>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
