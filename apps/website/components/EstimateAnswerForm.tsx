'use client';

import { useActionState, useState } from 'react';
import { answerByLink, answerInPortal, type AnswerState } from '@/lib/estimate-approval';

const btn = 'inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-semibold transition disabled:opacity-60';

/**
 * Approve or decline an estimate: on the secure link's page (`token`) or on
 * the customer's own Job Card page (`jobCardId`). Nothing happens until a
 * button is pressed; declining asks for an optional note.
 */
export function EstimateAnswerForm({ token, jobCardId, declined }: { token?: string; jobCardId?: string; declined?: boolean }) {
  const [state, action, pending] = useActionState<AnswerState, FormData>(token ? answerByLink : answerInPortal, null);
  const [declining, setDeclining] = useState(false);
  if (state?.ok) {
    return <p role="status" className="rounded-xl bg-[var(--ejo-primary)]/10 px-4 py-3 text-sm font-medium text-[var(--ejo-primary-dark,var(--ejo-primary))]" data-testid="estimate-answer-done">{state.message}</p>;
  }
  const hidden = token ? <input type="hidden" name="token" value={token} /> : <input type="hidden" name="jobCardId" value={jobCardId} />;
  return (
    <div className="space-y-4" data-testid="estimate-answer">
      {state && !state.ok ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{state.message}</p> : null}
      {declined ? <p className="text-sm text-[var(--ejo-text-muted,#475569)]">You told us you do not want this work. Changed your mind? You can still approve it below.</p> : null}
      {!declining ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <form action={action}>
            {hidden}<input type="hidden" name="answer" value="approve" />
            <button type="submit" disabled={pending} className={`${btn} w-full bg-[var(--ejo-primary)] text-white hover:brightness-110`}>Approve the estimate</button>
          </form>
          {!declined ? (
            <button type="button" disabled={pending} onClick={() => setDeclining(true)} className={`${btn} w-full border border-slate-300 bg-white text-slate-900 hover:border-slate-400`}>Decline</button>
          ) : null}
        </div>
      ) : (
        <form action={action} className="space-y-3">
          {hidden}<input type="hidden" name="answer" value="decline" />
          <label className="block text-sm text-slate-700">Would you like to tell us why? (optional)
            <textarea name="note" rows={3} maxLength={500} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 sm:text-sm" />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={pending} className={`${btn} border border-slate-300 bg-white text-slate-900 hover:border-slate-400`}>Decline the estimate</button>
            <button type="button" disabled={pending} onClick={() => setDeclining(false)} className="text-sm font-semibold text-[var(--ejo-primary)] underline">Go back</button>
          </div>
        </form>
      )}
    </div>
  );
}
