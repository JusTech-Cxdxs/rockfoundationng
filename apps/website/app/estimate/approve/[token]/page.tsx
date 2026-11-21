import type { Metadata } from 'next';
import { EstimateAnswerForm } from '@/components/EstimateAnswerForm';
import { LINK_PROBLEM, viewApprovalLink } from '@/lib/estimate-approval-core';
import { naira } from '@/lib/customer-portal/format';

export const dynamic = 'force-dynamic';
// The link is the customer's key: never indexed, never passed on to another site.
export const metadata: Metadata = { title: 'Your estimate', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/**
 * The customer's page for one estimate (the secure link in our email or
 * WhatsApp message, no sign-in): the workshop's name, the Job Card number,
 * the vehicle, the estimate lines the customer pays for with the totals and
 * the deposit when one applies, and Approve / Decline. Opening it changes
 * nothing; only pressing a button does, once. Nothing else about the
 * customer is shown.
 */
export default async function EstimateApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await viewApprovalLink(token);
  if (view.state !== 'open' && view.state !== 'answered') {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-28 sm:px-6 lg:px-10 sm:pt-32">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center" data-testid="estimate-link-problem">
          <h1 className="text-xl font-bold text-slate-900">{view.state === 'used' ? 'This link has been used' : view.state === 'expired' ? 'This link has expired' : view.state === 'revoked' ? 'This link has been replaced' : 'This estimate cannot be answered here'}</h1>
          {view.state === 'used' && view.answered ? (
            <p className="mt-2 text-sm font-medium text-slate-800">You {view.answered.answer} this estimate on {view.answered.at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' })}.</p>
          ) : null}
          <p className="mt-2 text-sm text-slate-600">{LINK_PROBLEM[view.state]}</p>
        </div>
      </main>
    );
  }
  const f = view.figures;
  const t = f.totals;
  const discounts = Math.round((t.lineDiscounts + t.discountAmount) * 100) / 100;
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-28 sm:px-6 lg:px-10 sm:pt-32">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ejo-primary-dark)]">{view.organisationName} · {view.branchName}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Your estimate — Job Card {view.jobNumber}</h1>
        <p className="mt-1 text-sm text-slate-600">{view.vehicle}{view.plate ? ` · ${view.plate}` : ''}</p>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-2 font-semibold">Item</th>
              <th className="py-2 pr-2 text-right font-semibold">Quantity</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {f.lines.map((l, i) => (
              <tr key={l.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-2 text-slate-900">{l.description}{t.lines[i] && t.lines[i]!.discount > 0 ? <span className="block text-xs text-slate-500">Discount −{naira(t.lines[i]!.discount)}</span> : null}</td>
                <td className="py-2 pr-2 text-right tabular-nums text-slate-700">{l.quantity}{l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ''}</td>
                <td className="py-2 text-right tabular-nums text-slate-900">{naira(Number(l.amount ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-slate-600">Subtotal</dt><dd className="tabular-nums text-slate-900">{naira(t.gross)}</dd></div>
          {discounts > 0 ? <div className="flex justify-between gap-3"><dt className="text-slate-600">Discount</dt><dd className="tabular-nums text-slate-900">−{naira(discounts)}</dd></div> : null}
          {t.vatRate > 0 ? <div className="flex justify-between gap-3"><dt className="text-slate-600">VAT ({Number(t.vatRate.toFixed(2))}%)</dt><dd className="tabular-nums text-slate-900">{naira(t.vatAmount)}</dd></div> : null}
          <div className="flex justify-between gap-3 border-t border-slate-200 pt-1.5 text-base font-bold"><dt className="text-slate-900">Total</dt><dd className="tabular-nums text-slate-900">{naira(t.total)}</dd></div>
          {f.deposit > 0 ? <div className="flex justify-between gap-3"><dt className="text-slate-600">Deposit before work starts ({f.depositPercent}%)</dt><dd className="tabular-nums font-semibold text-slate-900">{naira(f.depositDue > 0 ? f.depositDue : f.deposit)}{f.depositDue <= 0 ? ' — paid' : ''}</dd></div> : null}
        </dl>

        <div className="mt-8">
          {view.state === 'answered' ? (
            <p className="rounded-xl bg-[var(--ejo-primary)]/10 px-4 py-3 text-sm font-medium text-[var(--ejo-primary-dark)]">{LINK_PROBLEM.answered}{f.depositDue > 0 ? ` Work starts as soon as the deposit of ${naira(f.depositDue)} is received.` : ''}</p>
          ) : (
            <>
              <p className="mb-4 text-sm text-slate-600">{f.depositDue > 0 ? `Approve the estimate and pay the deposit of ${naira(f.depositDue)} so we can start. The bank details are in our email.` : 'Approve the estimate and we can start the work.'}</p>
              <EstimateAnswerForm token={token} />
            </>
          )}
        </div>
        <p className="mt-8 text-xs text-slate-500">This link is only for you and works once. Questions? Call the {view.branchName} branch and quote Job Card {view.jobNumber}.</p>
      </div>
    </main>
  );
}
