import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { requireCustomer } from '@/lib/customer-portal/session';
import { loadServices, nextServiceFor } from '@/lib/customer-portal/data';
import { DAY_MS, fmtDate, vehicleLabel } from '@/lib/customer-portal/format';
import { BackLink, Badge, Card, EmptyState, KeyValue, Notice, SectionTitle } from '@/components/customer/ui';
import { ServiceCard } from '@/components/customer/ServiceCard';
import { Icon } from '@/components/customer/Icon';
import Link from 'next/link';

export const metadata = { title: 'Vehicle' };

/** One vehicle — only if it belongs to the signed-in customer. */
export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireCustomer();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const v = await prisma.customerVehicle.findFirst({
    where: { id, customerId: me.id },
    select: { id: true, make: true, model: true, year: true, plateNumber: true, chassisNumber: true, engineType: true, mileage: true, vehicleType: true, createdAt: true },
  });
  if (!v) notFound();
  const [items, guaranteed, parts] = await Promise.all([
    loadServices(me.id),
    // The workshop's guarantee still running on this vehicle (the latest checked-out job that carries one).
    prisma.jobCard.findFirst({
      where: { vehicleId: v.id, customerId: me.id, checkedOutAt: { not: null }, OR: [{ warrantyUntil: { gt: new Date() } }, { warrantyUntilKm: { not: null } }] },
      orderBy: { checkedOutAt: 'desc' },
      select: { jobNumber: true, jobType: true, warrantyUntil: true, warrantyUntilKm: true },
    }),
    // Parts fitted: lines on estimates the customer was sent, charged to them (never the workshop's own costs).
    prisma.estimateLineItem.findMany({
      where: { type: { in: ['STORE_PART', 'EXTERNAL_PART'] }, billTo: 'CUSTOMER', estimate: { customerNotifiedAt: { not: null }, jobCard: { vehicleId: v.id, customerId: me.id, status: { not: 'CANCELLED' } } } },
      orderBy: { createdAt: 'desc' }, take: 40,
      select: { id: true, description: true, quantity: true, amount: true, warrantyMonths: true, estimate: { select: { jobCard: { select: { id: true, jobNumber: true, checkedOutAt: true, createdAt: true } } } } },
    }),
  ]);
  const guaranteeLive = guaranteed && ((guaranteed.warrantyUntil && guaranteed.warrantyUntil.getTime() > Date.now()) || (guaranteed.warrantyUntilKm && (v.mileage ?? 0) < guaranteed.warrantyUntilKm)) ? guaranteed : null;
  const history = items.filter((i) => i.vehicle.id === v.id);
  const next = nextServiceFor(v.id, items);
  const custody = history.find((i) => i.inCustody);
  const overdue = next?.date ? next.date.getTime() < Date.now() : false;
  const soon = next?.date ? !overdue && next.date.getTime() - Date.now() < 30 * DAY_MS : false;

  return (
    <div className="space-y-6">
      <BackLink href="/customer-portal/dashboard/vehicles">My vehicles</BackLink>
      <section className="ejo-roadmap-hero ejo-rise relative overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] p-5 sm:p-8">
        <div className="ejo-orb pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[var(--ejo-primary)]/15 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--ejo-bg)] text-[var(--ejo-primary)] shadow-sm ring-1 ring-[var(--ejo-border)] sm:h-14 sm:w-14"><Icon name="car" size={26} /></span>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-2xl font-bold tracking-tight text-[var(--ejo-text)] sm:text-3xl">{vehicleLabel(v)}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {v.plateNumber ? <p className="inline-flex whitespace-nowrap rounded-md border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-0.5 font-mono text-sm font-semibold tracking-wider text-[var(--ejo-text)]">{v.plateNumber}</p> : null}
              {custody ? <Badge tone="progress">With us now</Badge> : <Badge tone="neutral">With you</Badge>}
            </div>
          </div>
        </div>
        <dl className="relative mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KeyValue label="Mileage">{v.mileage ? `${v.mileage.toLocaleString('en-NG')} km` : '—'}</KeyValue>
          <KeyValue label="Type">{v.vehicleType === 'COMMERCIAL' ? 'Commercial' : v.vehicleType === 'PASSENGER' ? 'Passenger' : '—'}</KeyValue>
          <KeyValue label="VIN / chassis" className="col-span-2 sm:col-span-1"><span className="font-mono tracking-wide [overflow-wrap:anywhere]">{v.chassisNumber ?? '—'}</span></KeyValue>
          <KeyValue label="With us since">{fmtDate(v.createdAt)}</KeyValue>
        </dl>
      </section>

      {custody ? (
        <Notice tone="info" icon="parking"><strong>{custody.number}</strong> — {custody.info.label}. {custody.info.explain} <Link className="font-semibold text-[var(--ejo-primary)] underline" href={custody.href}>Follow it</Link></Notice>
      ) : null}

      <Card className="p-5">
        <SectionTitle icon="calendar" title="Next service" />
        {next ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-[var(--ejo-text)]">
              Due <strong>{next.date ? fmtDate(next.date) : '—'}</strong>{next.odometer ? <> or at <strong>{next.odometer.toLocaleString('en-NG')} km</strong></> : null}, whichever comes first.
            </p>
            {overdue ? <Badge tone="attention">Due now</Badge> : soon ? <Badge tone="info">Coming up</Badge> : null}
            <p className="w-full text-xs text-[var(--ejo-text-muted)]">Based on {next.from.number}. We’ll also remind you. <Link href="/book?visit=SERVICE" className="font-semibold text-[var(--ejo-primary)] underline">Book your service</Link></p>
          </div>
        ) : (
          <p className="text-sm text-[var(--ejo-text-muted)]">We’ll show the next service date after this vehicle’s first routine service with us.</p>
        )}
      </Card>

      {guaranteeLive ? (
        <Card className="p-5" data-testid="vehicle-guarantee">
          <SectionTitle icon="shield" title="Our guarantee on the work" />
          <p className="text-sm text-[var(--ejo-text)]">
            The work on <strong>{guaranteeLive.jobNumber}</strong> is guaranteed
            {guaranteeLive.warrantyUntil ? <> until <strong>{fmtDate(guaranteeLive.warrantyUntil)}</strong></> : null}
            {guaranteeLive.warrantyUntil && guaranteeLive.warrantyUntilKm ? ' or ' : guaranteeLive.warrantyUntilKm ? ' up to ' : ''}
            {guaranteeLive.warrantyUntilKm ? <><strong>{guaranteeLive.warrantyUntilKm.toLocaleString('en-NG')} km</strong></> : null}
            {guaranteeLive.warrantyUntil && guaranteeLive.warrantyUntilKm ? ', whichever comes first' : ''}. If anything we did is not right, bring the vehicle back and tell front desk it is a comeback.
          </p>
        </Card>
      ) : null}

      <Card className="p-5" data-testid="vehicle-parts">
        <SectionTitle icon="package" title="Parts fitted" />
        {parts.length ? (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {parts.map((p) => {
              const jc = p.estimate.jobCard;
              return (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
                  <span className="min-w-0 text-[var(--ejo-text)]">{p.quantity > 1 ? `${p.quantity} × ` : ''}{p.description}{p.warrantyMonths ? <span className="text-[var(--ejo-text-muted)]"> · {p.warrantyMonths}-month guarantee on the part</span> : null}</span>
                  <span className="text-xs text-[var(--ejo-text-muted)]">{jc ? <Link href={`/customer-portal/dashboard/services/jc/${jc.id}`} className="underline">{jc.jobNumber}</Link> : null}{jc ? ` · ${fmtDate(jc.checkedOutAt ?? jc.createdAt)}` : ''}{p.amount !== null ? ` · ₦${Number(p.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}` : ''}</span>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-[var(--ejo-text-muted)]">Parts fitted on this vehicle will be listed here once an estimate has been sent to you.</p>}
      </Card>

      <section>
        <SectionTitle icon="wrench" title="Service history" />
        {history.length ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{history.map((i, idx) => <ServiceCard key={i.id} item={i} delay={Math.min(idx, 8) * 40} />)}</div>
        ) : <EmptyState icon="wrench" title="No visits yet" text="This vehicle’s Job Cards and services will appear here." />}
      </section>
    </div>
  );
}
