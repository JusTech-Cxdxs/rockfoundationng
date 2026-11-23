import Link from 'next/link';

/** The Money area's two lists: what customers owe, and credit notes. */
export function MoneyTabs({ active }: { active: 'statements' | 'credit-notes' }) {
  const tab = (key: typeof active, href: string, label: string) => (
    <Link href={href} aria-current={active === key ? 'page' : undefined} className={`rounded-full px-4 py-2 text-sm font-medium ${active === key ? 'bg-[var(--ejo-primary)] text-white' : 'text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]'}`}>{label}</Link>
  );
  return (
    <nav aria-label="Money" className="mb-6 inline-flex gap-1 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1">
      {tab('statements', '/money/statements', 'What customers owe')}
      {tab('credit-notes', '/money/credit-notes', 'Credit notes')}
    </nav>
  );
}
