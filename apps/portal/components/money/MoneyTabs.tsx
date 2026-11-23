import Link from 'next/link';
import { allows } from '@/lib/authz/server';

/** The Money area's lists: what customers owe, credit notes, and the QuickBooks export — each shown only to those who may open it. */
export async function MoneyTabs({ active }: { active: 'statements' | 'credit-notes' | 'quickbooks' }) {
  const [statements, notes, quickbooks] = await Promise.all([
    allows('money.statement.view'),
    Promise.all([allows('money.credit_note.request'), allows('money.credit_note.approve')]).then((x) => x.some(Boolean)),
    allows('money.quickbooks.export'),
  ]);
  const tab = (key: typeof active, href: string, label: string) => (
    <Link href={href} aria-current={active === key ? 'page' : undefined} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${active === key ? 'bg-[var(--ejo-primary)] text-white' : 'text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]'}`}>{label}</Link>
  );
  return (
    <nav aria-label="Money" className="mb-6 inline-flex max-w-full flex-wrap gap-1 rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1">
      {statements ? tab('statements', '/money/statements', 'What customers owe') : null}
      {notes ? tab('credit-notes', '/money/credit-notes', 'Credit notes') : null}
      {quickbooks ? tab('quickbooks', '/money/quickbooks', 'QuickBooks') : null}
    </nav>
  );
}
