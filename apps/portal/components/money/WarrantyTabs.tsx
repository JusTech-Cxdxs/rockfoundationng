import Link from 'next/link';

/** The Warranty area: the report (the Owner) and claims to suppliers. */
export function WarrantyTabs({ active }: { active: 'report' | 'claims' }) {
  const tab = (key: typeof active, href: string, label: string) => (
    <Link href={href} aria-current={active === key ? 'page' : undefined} className={`rounded-full px-4 py-2 text-sm font-medium ${active === key ? 'bg-[var(--ejo-primary)] text-white' : 'text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]'}`}>{label}</Link>
  );
  return (
    <nav aria-label="Warranty" className="mb-6 inline-flex gap-1 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1">
      {tab('report', '/warranty', 'Report')}
      {tab('claims', '/warranty/claims', 'Claims to suppliers')}
    </nav>
  );
}
