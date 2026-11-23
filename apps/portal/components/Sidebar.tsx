'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ModuleStatusBadge } from '@ejo/ui';
import type { NavItem } from '@/lib/authz/navigation';
import { Wordmark } from './Wordmark';
import { PoweredByEjo } from './PoweredByEjo';
import { Icon, MODULE_ICON } from './ui/Icon';
import { useNotifications } from './NotificationProvider';
import { isApproval } from '@/lib/approvals';

/** The menu's sections. A module not listed here goes under "Operations". */
const GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Overview', keys: ['dashboard', 'approvals', 'notifications', 'reminders', 'analytics'] },
  { title: 'Operations', keys: [] },
  { title: 'Administration', keys: ['organisation', 'structure', 'branches', 'users', 'roles', 'permissions', 'audit-logs', 'recycle-bin', 'settings'] },
];

function grouped(items: NavItem[]) {
  const placed = new Set(GROUPS.flatMap((g) => g.keys));
  return GROUPS.map((g) => ({
    title: g.title,
    items: g.keys.length ? g.keys.map((k) => items.find((i) => i.key === k)).filter((i): i is NavItem => Boolean(i)) : items.filter((i) => !placed.has(i.key)),
  })).filter((g) => g.items.length > 0);
}

/**
 * Renders the modules THIS person may open (worked out on the server from
 * their roles — lib/authz/navigation.ts); every page still checks again.
 * Grouped, with icons; on desktops it can fold to icons only (remembered on
 * this browser), on phones and tablets it is the slide-in drawer.
 */
export function Sidebar({
  items,
  organisationName,
  collapsed = false,
  onToggleCollapse,
  onNavigate,
  variant = 'desktop',
}: {
  items: NavItem[];
  organisationName: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  variant?: 'desktop' | 'drawer';
}) {
  const pathname = usePathname();
  // Decisions waiting on this person — the same live list as the bell.
  const { summary } = useNotifications();
  const waiting = summary.actions.filter(isApproval).length;
  // Support tickets waiting on the team (from the same live list: lib/actions/my-work.ts).
  const support = summary.actions.filter((a) => a.id.startsWith('support-')).length;
  const mini = collapsed && variant === 'desktop';
  const linkBase = 'group relative flex items-center rounded-[var(--ejo-radius-md)] text-sm font-medium transition-colors';

  return (
    <aside aria-label="Sidebar" className={`flex h-full flex-col bg-[var(--ejo-secondary)] text-white transition-[width] duration-200 ${mini ? 'w-[76px]' : 'w-72 lg:w-64'}`}>
      <div className={`flex h-16 shrink-0 items-center border-b border-white/10 ${mini ? 'justify-center px-2' : 'justify-between gap-2 px-4'}`}>
        {mini ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-1 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- the workshop's emblem, as published */}
            <img src="/brand/emblem.png" alt={organisationName} width={32} height={32} className="h-full w-full object-contain" />
          </span>
        ) : (
          <div className="min-w-0"><Wordmark name={organisationName} tone="onDark" /></div>
        )}
        {variant === 'drawer' ? (
          <button type="button" onClick={onNavigate} aria-label="Close menu" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
            <Icon name="close" size={18} />
          </button>
        ) : null}
      </div>

      <nav aria-label="Main" className={`ejo-scroll flex-1 overflow-y-auto overscroll-contain py-3 ${mini ? 'px-2' : 'px-3'}`}>
        {grouped(items).map((g) => (
          <div key={g.title} className="mb-3">
            {mini ? <div className="mx-3 mb-2 mt-1 h-px bg-white/15 first:hidden" aria-hidden="true" /> : (
              <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">{g.title}</p>
            )}
            <div className="space-y-0.5">
              {g.items.map((mod) => {
                // Customers stays unhighlighted inside its Support inbox (which has its own entry).
                const active = (pathname === mod.href || pathname.startsWith(`${mod.href}/`)) && !(mod.key === 'crm' && pathname.startsWith('/crm/support'));
                return (
                  <Link
                    key={mod.key}
                    href={mod.href}
                    onClick={onNavigate}
                    title={mini ? mod.name : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={`${linkBase} ${mini ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2'} ${
                      active
                        ? 'bg-white/15 text-white'
                        : 'text-white/75 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {active ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-[var(--brand-red)]" aria-hidden="true" /> : null}
                    <span className={`flex shrink-0 items-center justify-center transition-transform group-hover:scale-110 ${active ? 'text-white' : ''}`}>
                      <Icon name={MODULE_ICON[mod.key] ?? 'grid'} size={mini ? 20 : 18} />
                    </span>
                    <span className={mini ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{mod.name}</span>
                    {mod.key === 'approvals' && waiting > 0 ? (
                      <span className={mini ? 'absolute right-2 top-1 h-2 w-2 rounded-full bg-[var(--ejo-warning)]' : 'shrink-0 rounded-full bg-[var(--brand-red)] px-2 py-px text-[11px] font-semibold text-white'}>{mini ? null : waiting}</span>
                    ) : null}
                    {mod.key === 'support-inbox' && support > 0 ? (
                      <span className={mini ? 'absolute right-2 top-1 h-2 w-2 rounded-full bg-[var(--ejo-info)]' : 'shrink-0 rounded-full bg-white/20 px-2 py-px text-[11px] font-semibold text-white'}>{mini ? null : support}</span>
                    ) : null}
                    {!mini && mod.status !== 'LIVE' ? <ModuleStatusBadge status={mod.status as never} /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

      </nav>

      <div className={`shrink-0 border-t border-white/10 ${mini ? 'flex flex-col items-center gap-2 px-2 py-3' : 'flex items-center justify-between gap-2 px-4 py-3'}`}>
        {mini ? null : <PoweredByEjo tone="onDark" />}
        {variant === 'desktop' && onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}
            title={collapsed ? 'Expand the menu' : 'Collapse the menu'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <span className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}><Icon name="chevron-left" size={16} /></span>
          </button>
        ) : null}
      </div>
    </aside>
  );
}
