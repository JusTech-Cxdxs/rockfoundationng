'use client';

import { useActionState } from 'react';
import { sendWhatsAppTest, type WhatsAppTestState } from '@/lib/actions/whatsapp-settings';
import { SubmitButton } from '@/components/SubmitButton';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';

/** Settings → WhatsApp: send one approved template, with its sample values, to a number. */
export function WhatsAppTestForm({ templates, disabled }: { templates: { key: string; name: string }[]; disabled: boolean }) {
  const [state, action] = useActionState<WhatsAppTestState, FormData>(sendWhatsAppTest, { ok: true, message: null });
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" data-testid="whatsapp-test-form">
      <div>
        <label htmlFor="wa-test-number" className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Mobile number</label>
        <input id="wa-test-number" name="number" type="tel" required maxLength={20} placeholder="0803 123 4567" className={field} disabled={disabled} />
      </div>
      <div>
        <label htmlFor="wa-test-template" className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Template</label>
        <select id="wa-test-template" name="template" defaultValue="staff_update" className={field} disabled={disabled}>
          {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
      </div>
      <SubmitButton label="Send a test template" pendingLabel="Sending…" className="inline-flex min-h-11 items-center justify-center rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60" />
      {state.message ? <p role={state.ok ? 'status' : 'alert'} className={`text-xs sm:col-span-3 ${state.ok ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>{state.message}</p> : null}
    </form>
  );
}
