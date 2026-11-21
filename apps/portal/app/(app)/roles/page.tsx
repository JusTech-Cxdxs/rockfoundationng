import { guardPage } from '@/lib/authz/server';
import { listOptionalRoles, listRolesForEditor } from '@/lib/actions/roles';
import { setOptionalRoleFormAction } from '@/lib/actions/roles-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { APPROVAL_PERMISSIONS, ROLE_DESCRIPTIONS } from '@/lib/authz/catalogue';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { Icon, PageHeader, StatusChip } from '@/components/ui';
import { pluralize } from '@/lib/utils/pluralize';
import { permissionShown } from '@/lib/edition';

export const metadata = { title: 'Roles' };

/** Where each role belongs, so the list reads like the workshop. */
const GROUPS: { title: string; slugs: string[] }[] = [
  { title: 'Always on', slugs: ['owner', 'front-desk'] },
  { title: 'Optional (switched on below)', slugs: ['workshop-supervisor', 'technician', 'store-keeper', 'accounts', 'security'] },
];

/**
 * Roles, read first: every role grouped by where it works, what it is for,
 * how many people hold it and how much it can do. Each opens its own page,
 * where its permissions are listed and changed on purpose.
 */
export default async function RolesPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  await guardPage('admin.roles.manage', '/roles');
  const { error, status } = await searchParams;
  const [roles, optional] = await Promise.all([listRolesForEditor(), listOptionalRoles()]);
  const placed = new Set(GROUPS.flatMap((g) => g.slugs));
  const groups = [...GROUPS.map((g) => ({ title: g.title, roles: g.slugs.map((s) => roles.find((r) => r.slug === s)).filter((r): r is (typeof roles)[number] => Boolean(r)) })),
    { title: 'Set up by your organisation', roles: roles.filter((r) => !placed.has(r.slug) && !r.isPlatform) },
    { title: 'Platform team', roles: roles.filter((r) => r.isPlatform) }].filter((g) => g.roles.length);
  const people = roles.reduce((n, r) => n + r.users, 0);
  const added = roles.reduce((n, r) => n + r.added.length, 0);

  return (
    <div className="w-full max-w-7xl p-4 sm:p-8">
      <PageHeader
        icon="shield"
        title="Roles"
        description="What each role is for, what it can do and what it can approve. Open a role to see everything it allows and who holds it, and to add permissions for your organisation. Every change is in the audit trail and emailed to the people who hold the role."
      />
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}
      {!error && status && status !== 'saved' ? <FormFeedbackBanner kind="success" message={status} /> : null}

      {optional.length ? (
        <section id="roles-in-use" aria-labelledby="roles-in-use-title" className="mb-8 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <h2 id="roles-in-use-title" className="text-base font-semibold text-[var(--ejo-text)]">Roles in use</h2>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
            The Owner and Front Desk are always on. Switch on the other roles when you have people for them. While a role is off, the people holding it get nothing from it, and Front Desk does its steps instead (the Owner can always do everything). A change takes effect within a minute and is kept in the audit trail.
          </p>
          <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {optional.map((r) => (
              <li key={r.slug} className="flex flex-col gap-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4" data-testid={`optional-role-${r.slug}`}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[var(--ejo-text)]">{r.label}</h3>
                  <StatusChip tone={r.on ? 'success' : 'neutral'} label={r.on ? 'On' : 'Off'} />
                </div>
                <p className="text-sm text-[var(--ejo-text-muted)]">{ROLE_DESCRIPTIONS[r.slug]}</p>
                <p className="text-xs text-[var(--ejo-text-muted)]">{pluralize(r.holders, 'person holds', 'people hold')} this role.</p>
                <form action={setOptionalRoleFormAction} className="mt-auto">
                  <input type="hidden" name="slug" value={r.slug} />
                  <input type="hidden" name="on" value={r.on ? 'false' : 'true'} />
                  <SubmitButton
                    label={r.on ? `Switch ${r.label.replace(/ \/.*$/, '')} off` : `Switch ${r.label.replace(/ \/.*$/, '')} on`}
                    pendingLabel="Saving…"
                    className={`min-h-11 w-full rounded-[var(--ejo-radius-md)] px-4 text-sm font-semibold ${r.on ? 'border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]' : 'bg-[var(--ejo-primary)] text-white hover:bg-[var(--ejo-primary-dark)]'}`}
                  />
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Roles', value: roles.filter((r) => !r.isPlatform).length },
          { label: 'Role assignments', value: people },
          { label: 'Permissions added here', value: added },
          { label: 'Approval steps covered', value: APPROVAL_PERMISSIONS.filter((k) => permissionShown(k)).length },
        ].map((s) => (
          <div key={s.label} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 py-3">
            <dd className="text-2xl font-bold tabular-nums text-[var(--ejo-text)]">{s.value}</dd>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--ejo-text-muted)]">{s.label}</dt>
          </div>
        ))}
      </dl>

      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`}>
            <h2 id={`g-${g.title}`} className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{g.title}</h2>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {g.roles.map((r) => {
                const approves = r.defaults.filter((k) => APPROVAL_PERMISSIONS.includes(k)).length;
                const does = r.defaults.length - approves;
                return (
                  <li key={r.id}>
                    <LoadingLink href={`/roles/${r.id}`} className="flex h-full flex-col rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 transition hover:border-[var(--ejo-primary)]/50 hover:shadow-md" aria-label={`${r.name}: open`}>
                      <section className="flex h-full flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-[var(--ejo-text)]">{r.name}</h3>
                          <StatusChip tone={r.users ? 'brand' : 'neutral'} label={pluralize(r.users, 'person', 'people')} />
                        </div>
                        <p className="mt-2 line-clamp-3 text-sm text-[var(--ejo-text-muted)]">{r.isPlatform ? 'The platform owner and their support staff. Holds every permission; organisations cannot grant or change it.' : ROLE_DESCRIPTIONS[r.slug] ?? 'A role your organisation set up.'}</p>
                        <p className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-3 text-xs text-[var(--ejo-text-muted)]">
                          {r.isPlatform ? <span>Everything</span> : <>
                            <span>{does} can do</span>
                            <span>{approves ? `${approves} can approve` : 'approves nothing'}</span>
                            {r.added.length ? <span className="font-medium text-[var(--ejo-primary)]">+{r.added.length} added here</span> : null}
                          </>}
                          <span className="ml-auto inline-flex items-center gap-1 font-medium text-[var(--ejo-primary)]">Open<Icon name="arrow-right" size={12} /></span>
                        </p>
                      </section>
                    </LoadingLink>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
