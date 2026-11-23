import type { ReactNode } from 'react';
import { portalConfig } from '@/lib/site-config';
import { Wordmark } from './Wordmark';
import { ThemeToggle } from './ThemeToggle';
import { PoweredByEjo } from './PoweredByEjo';

interface AuthShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

const ic = (d: ReactNode) => d;
/** What the platform does for the workshop: each person sees only what their role allows. */
const MODULES: { title: string; text: string; icon: ReactNode }[] = [
  { title: 'Front desk & workshop', text: 'Check-in, one job card for service and repair, estimates, approvals, quality check, hand-over.', icon: ic(<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z" />) },
  { title: 'Customer care', text: 'Customers and fleets, complaints, follow-ups, ratings and service reminders.', icon: ic(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>) },
  { title: 'WhatsApp first', text: 'Every message and document ready to send on WhatsApp, with email alongside.', icon: ic(<><path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z" /><path d="M9 10c.5 2 2 3.5 4 4" /></>) },
  { title: 'Parts store', text: 'Parts, stock, issue to job cards and counter sales; every part on the vehicle’s history.', icon: ic(<><path d="M21 8 12 3 3 8v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" /></>) },
  { title: 'Money & QuickBooks', text: 'Invoices, payments, credit and statements, ready for QuickBooks.', icon: ic(<><rect x="2" y="6" width="20" height="13" rx="2" /><circle cx="12" cy="12.5" r="2.5" /><path d="M6 6V4h12v2" /></>) },
  { title: 'Customer portal', text: 'Customers and fleet companies follow their vehicles, approve estimates and see invoices.', icon: ic(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>) },
  { title: 'Gate', text: 'Vehicles in and out of the compound, gate passes with a QR code.', icon: ic(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>) },
  { title: 'Enyo, the assistant', text: 'Answers from your own records, vehicle histories in a sentence, messages drafted.', icon: ic(<><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>) },
];

const ROLES = ['GMD', 'Front desk', 'Service advisors', 'Technicians', 'Store', 'Accounts', 'Security'];

/** What is true of every account, kept true to what the platform enforces. */
const PROMISES = ['Access follows your role', 'Nobody approves their own request', 'Every action on the audit trail', 'Sessions end when access ends'];

/**
 * The shared frame of every sign-in page (sign in, forgot password, set a new
 * password): the organisation's wordmark and what the platform does on the
 * brand panel, the form on a calm card, Light / Dark / System in the corner,
 * and the "Powered by EJO · JusTech" signature. CSS-only motion.
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const year = new Date().getFullYear();
  return (
    <main className="flex min-h-screen bg-[var(--ejo-bg)]">
      {/* Brand panel — large screens */}
      <section className="relative hidden w-[46%] flex-col justify-between gap-8 overflow-hidden bg-[var(--ejo-secondary)] p-10 text-white lg:flex xl:p-14" aria-label={portalConfig.organisationName}>
        <div className="ejo-media-placeholder absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
        <div className="ejo-rise relative flex items-center justify-between gap-4">
          <Wordmark name={portalConfig.organisationName} size="lg" tone="onDark" />
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/70">Staff portal</span>
        </div>

        <div className="ejo-rise relative max-w-xl" style={{ animationDelay: '80ms' }}>
          {portalConfig.tagline ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/75"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--brand-red)] align-middle" aria-hidden="true" />{portalConfig.tagline}</p> : null}
          <h2 className="mt-3 text-[1.9rem] font-bold leading-tight xl:text-[2.2rem]">Front desk, customer care and the workshop, <span className="text-[#ff8a8d]">in one place</span>.</h2>
          <ul className="mt-7 grid grid-cols-2 gap-x-5 gap-y-4">
            {MODULES.map((h) => (
              <li key={h.title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ejo-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{h.icon}</svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{h.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-white/60">{h.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-7 [@media(max-height:820px)]:hidden">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Built for</p>
            <p className="mt-2 flex flex-wrap gap-1.5">{ROLES.map((r) => <span key={r} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/75">{r}</span>)}</p>
          </div>
          <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-white/60">
            {PROMISES.map((p) => <li key={p} className="flex items-center gap-1.5"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ejo-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>{p}</li>)}
          </ul>
        </div>

        <div className="ejo-rise relative flex items-end justify-between gap-6" style={{ animationDelay: '160ms' }}>
          <PoweredByEjo tone="onDark" size="lg" />
          <p className="text-xs text-white/60">© {year} {portalConfig.organisationName}</p>
        </div>
      </section>

      {/* Form panel */}
      <section className="relative flex w-full flex-col lg:w-[54%]">
        <div className="flex items-center justify-between px-6 pt-6 sm:px-10">
          <div className="lg:hidden"><Wordmark name={portalConfig.organisationName} /></div>
          <div className="ml-auto"><ThemeToggle /></div>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="ejo-rise w-full max-w-[400px]">
            <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--ejo-text)]">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-sm leading-relaxed text-[var(--ejo-text-muted)]">{subtitle}</p> : null}
            <div className="mt-8">{children}</div>
            {footer ? <div className="mt-6">{footer}</div> : null}
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 px-6 pb-8 text-center sm:px-10">
          <p className="flex items-center gap-1.5 text-xs text-[var(--ejo-text-muted)]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            Staff only · access follows your role · every action is recorded
          </p>
          <div className="lg:hidden"><PoweredByEjo /></div>
        </div>
      </section>
    </main>
  );
}
