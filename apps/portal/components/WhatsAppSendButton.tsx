'use client';

import { useState, useTransition } from 'react';
import { makeWelcomeWhatsAppMessage, makeWhatsAppMessage, sendWhatsAppNow, type WhatsAppPrepared, type WhatsAppSentNow } from '@/lib/actions/whatsapp';

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
 *
 * With automatic sending set up (sendNow, from the page: Meta's WhatsApp
 * Business Platform configured), a document also offers "Send now on
 * WhatsApp": the server sends the approved template with the PDF, to a
 * customer who agreed to WhatsApp messages. "Open WhatsApp" stays beside it.
 */
export function WhatsAppSendButton({ prepare, label = 'Send on WhatsApp', testId = 'send-on-whatsapp', sendNow = false }: { prepare: Prepare; label?: string; testId?: string; sendNow?: boolean }) {
  const [state, setState] = useState<WhatsAppPrepared | null>(null);
  const [sent, setSent] = useState<WhatsAppSentNow | null>(null);
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    setState(null);
    setState('document' in prepare ? await makeWhatsAppMessage(prepare.document) : await makeWelcomeWhatsAppMessage(prepare.access));
  });
  const runNow = () => start(async () => {
    if (!('document' in prepare)) return;
    setSent(null);
    setSent(await sendWhatsAppNow(prepare.document));
  });
  const now = sendNow && 'document' in prepare;
  return (
    <span className="inline-flex flex-col items-start gap-1" data-testid={`${testId}-panel`}>
      {now ? (
        <span className="inline-flex flex-col items-start gap-1">
          <button type="button" onClick={runNow} disabled={pending || sent?.ok === true} data-testid={`${testId}-now`} className={green}>
            {pending ? 'Sending…' : sent?.ok ? 'Sent on WhatsApp' : 'Send now on WhatsApp'}
          </button>
          {sent ? (
            <span role={sent.ok ? 'status' : 'alert'} className={`max-w-xs text-[11px] ${sent.ok ? 'text-[var(--ejo-text-muted)]' : 'text-[var(--ejo-error)]'}`}>{sent.ok ? sent.note : sent.message}</span>
          ) : null}
        </span>
      ) : null}
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
