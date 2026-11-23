'use client';

import { useActionState } from 'react';
import { saveMyWhatsApp, type MyWhatsAppState } from '@/lib/actions/my-whatsapp';
import { SubmitButton } from '@/components/SubmitButton';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';

/** My WhatsApp notices: my mobile number and whether work notices come to my WhatsApp too. */
export function MyWhatsAppForm({ phone, optIn, configured }: { phone: string | null; optIn: boolean; configured: boolean }) {
  const [state, action] = useActionState<MyWhatsAppState, FormData>(saveMyWhatsApp, { ok: true, message: null });
  return (
    <form action={action} className="space-y-3" data-testid="my-whatsapp-form">
      <div>
        <label htmlFor="my-wa-phone" className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Mobile number (WhatsApp)</label>
        <input id="my-wa-phone" name="phone" type="tel" maxLength={20} pattern="\+?[0-9 ]{7,20}" defaultValue={phone ?? ''} placeholder="0803 123 4567" className={field} />
      </div>
      <label className="flex items-start gap-2 text-sm text-[var(--ejo-text)]">
        <input type="checkbox" name="whatsappOptIn" value="yes" defaultChecked={optIn} data-testid="my-whatsapp-consent" className="mt-0.5 h-4 w-4" />
        <span>
          Send my work notices to WhatsApp too
          <span className="block text-xs text-[var(--ejo-text-muted)]">Approvals waiting for you, jobs assigned to you and other work notices, as well as by email.{configured ? '' : ' WhatsApp sending is not switched on for the organisation yet; your choice is kept for when it is.'}</span>
        </span>
      </label>
      {state.message ? <p role={state.ok ? 'status' : 'alert'} className={`text-xs ${state.ok ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>{state.message}</p> : null}
      <SubmitButton label="Save" pendingLabel="Saving…" className="inline-flex min-h-11 items-center rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 text-sm font-medium text-white hover:opacity-90" />
    </form>
  );
}
