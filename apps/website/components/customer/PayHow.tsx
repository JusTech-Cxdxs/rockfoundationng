import { CopyButton } from './CopyButton';
import { Icon } from './Icon';

export type BankDetails = { bankName: string | null; accountName: string | null; accountNumber: string | null };

/** A usable account has a bank, a name and a number with digits. */
function usable(b: BankDetails | null | undefined): b is { bankName: string; accountName: string; accountNumber: string } {
  return Boolean(b?.bankName && b.accountName && b.accountNumber && /\d{6,}/.test(b.accountNumber));
}

/**
 * How to pay: the branch's own bank account (set by the organisation under
 * Branches), the payment reference to use, each with a copy button, and the
 * pay-in-person option.
 */
export function PayHow({ branchBank, reference, compact = false }: { branchBank?: BankDetails | null; reference?: string; compact?: boolean }) {
  const bank = usable(branchBank) ? branchBank : null;
  const rows: { label: string; value: string; copy?: boolean }[] = bank
    ? [
        { label: 'Bank', value: bank.bankName },
        { label: 'Account name', value: bank.accountName, copy: true },
        { label: 'Account number', value: bank.accountNumber, copy: true },
      ]
    : [];
  if (reference) rows.push({ label: 'Payment reference', value: reference, copy: true });
  return (
    <div className={compact ? '' : 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4'}>
      {!compact ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ejo-text)]"><span className="text-[var(--ejo-primary)]"><Icon name="bank" size={17} /></span>How to pay</p>
      ) : null}
      {bank ? (
        <dl className="mt-3 divide-y divide-[var(--ejo-border)] rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
          {rows.map((r) => (
            // Each row holds only its dt and dd (a valid description list); the
            // copy button is its own dd in the right-hand column.
            <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5">
              <dt className="col-start-1 text-xs text-[var(--ejo-text-muted)]">{r.label}</dt>
              <dd className="col-start-1 break-words text-sm font-semibold tracking-wide text-[var(--ejo-text)] [overflow-wrap:anywhere]">{r.value}</dd>
              {r.copy ? <dd className="col-start-2 row-span-2 row-start-1"><CopyButton value={r.value} label={r.label.toLowerCase()} /></dd> : null}
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">Please call your branch for our bank details{reference ? <> and quote <strong className="text-[var(--ejo-text)]">{reference}</strong></> : null}.</p>
      )}
      <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-[var(--ejo-text-muted)]">
        <li className="flex gap-2"><span className="mt-0.5 text-[var(--ejo-primary)]"><Icon name="check" size={13} strokeWidth={2.4} /></span>Use the reference so we can match your transfer quickly.</li>
        <li className="flex gap-2"><span className="mt-0.5 text-[var(--ejo-primary)]"><Icon name="check" size={13} strokeWidth={2.4} /></span>Or pay in person at our office — the cashier confirms it on the spot.</li>
        <li className="flex gap-2"><span className="mt-0.5 text-[var(--ejo-primary)]"><Icon name="check" size={13} strokeWidth={2.4} /></span>After a transfer, reply to our estimate email with your proof of payment. It shows here once our team records it.</li>
      </ul>
    </div>
  );
}
