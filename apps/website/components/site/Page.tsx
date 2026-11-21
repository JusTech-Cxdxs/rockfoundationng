import type { ReactNode } from 'react';

/**
 * The building blocks of the few plain pages outside the customer portal
 * (privacy, terms): an introduction, a section with one rhythm of spacing,
 * and prose. Motion only on the first paint (ejo-intro), which
 * reduced-motion turns off.
 */

export function PageIntro({ title, lede, kicker }: { title: ReactNode; lede?: ReactNode; kicker?: string }) {
  return (
    <section className="relative overflow-hidden bg-[var(--ejo-surface)] text-[var(--ejo-text)]">
      <div className="relative mx-auto max-w-[1480px] px-4 pb-14 pt-28 sm:px-6 lg:px-10 sm:pb-20 sm:pt-36">
        <div className="ejo-intro max-w-3xl">
          {/* Always rendered (empty when there is no kicker), so the entrance animation's order holds. */}
          <p className={`mb-4 text-sm font-semibold text-[var(--ejo-primary)] ${kicker ? '' : 'hidden'}`}>{kicker ?? ''}</p>
          <h1 className="text-[2.25rem] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-5xl">{title}</h1>
          <span aria-hidden className="mt-6 block h-1 w-16 rounded-full bg-[var(--ejo-primary)]" />
          {lede ? <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--ejo-text-muted)] sm:text-xl">{lede}</p> : null}
        </div>
      </div>
    </section>
  );
}

export function Section({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <section>
      <div className={`mx-auto px-4 py-16 sm:px-6 lg:px-10 sm:py-24 ${narrow ? 'max-w-3xl' : 'max-w-[1480px]'}`}>{children}</div>
    </section>
  );
}

export function Prose({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`max-w-2xl space-y-5 text-[1.0625rem] leading-[1.75] text-[var(--ejo-text)] [&_strong]:font-semibold ${className}`}>{children}</div>;
}
