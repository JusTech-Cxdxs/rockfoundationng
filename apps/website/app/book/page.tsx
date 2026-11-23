import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@ejo/database';
import { BOOKABLE_JOB_TYPES, JOB_TYPE_WORDS, isBookableJobType } from '@ejo/utils/appointments';
import { siteOrganisation } from '@/lib/enyo/settings';
import { currentCustomer } from '@/lib/customer-portal/session';
import { bookingDays } from '@/lib/booking';
import { BookingForm } from '@/components/BookingForm';
import { PageIntro, Section } from '@/components/site/Page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Book a visit', description: 'Book a service, repair, diagnostics, spraying or car wash at the workshop: choose a day and a time, and we confirm it.' };

const WHAT: Record<string, string> = {
  SERVICE: 'Oil, filters and the routine checks.',
  REPAIR: 'A fault or damage to put right.',
  SERVICE_AND_REPAIR: 'A routine service plus a repair.',
  DIAGNOSTICS: 'A computer test to find the fault.',
  SPRAYING: 'Paint work in our spray booth.',
  CAR_WASH: 'A wash, inside and out.',
};

/** Book a workshop visit: what it is for, then a day with a place left, a time and the details. Front desk confirms. */
export default async function BookPage({ searchParams }: { searchParams: Promise<{ visit?: string }> }) {
  const sp = await searchParams;
  const org = await siteOrganisation().catch(() => null);
  const jobType = isBookableJobType(sp.visit) ? sp.visit : null;
  const me = await currentCustomer().catch(() => null);
  const mine = me && org && me.organisationId === org.id ? me : null;
  const [avail, vehicles] = org && jobType ? await Promise.all([
    bookingDays(org.id, jobType),
    mine ? prisma.customerVehicle.findMany({ where: { customerId: mine.id }, orderBy: { createdAt: 'asc' }, take: 50, select: { id: true, make: true, model: true, year: true, plateNumber: true } }) : [],
  ]) : [null, []];
  return (
    <main>
      <PageIntro kicker="Book a visit" title={jobType ? `Book: ${JOB_TYPE_WORDS[jobType]}` : 'When would you like to come in?'} lede={jobType ? 'Choose a day with a place left and a time. Front desk confirms your booking by phone or WhatsApp.' : 'Choose what the visit is for. You will then see the days with places left.'} />
      <Section narrow>
        {!org ? <p className="text-[var(--ejo-text-muted)]">Booking is not available just now. Please call us.</p> : !jobType ? (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="booking-visits">
            {BOOKABLE_JOB_TYPES.map((t) => (
              <li key={t}>
                <Link href={`/book?visit=${t}`} className="block rounded-2xl border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 hover:border-[var(--ejo-primary)]">
                  <span className="block text-lg font-semibold text-[var(--ejo-text)]">{JOB_TYPE_WORDS[t]}</span>
                  <span className="mt-1 block text-sm text-[var(--ejo-text-muted)]">{WHAT[t]}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : avail && avail.settings.capacity[jobType] > 0 ? (
          <>
            <Link href="/book" className="mb-6 inline-block text-sm font-medium text-[var(--ejo-primary)]">← Choose another kind of visit</Link>
            <BookingForm
              jobType={jobType}
              days={avail.days}
              slots={avail.settings.slots}
              signedIn={mine ? { name: mine.fullName } : null}
              vehicles={vehicles.map((v) => ({ id: v.id, label: [v.year, v.make, v.model].filter(Boolean).join(' ') + (v.plateNumber ? ` (${v.plateNumber})` : '') }))}
            />
          </>
        ) : <p className="text-[var(--ejo-text-muted)]">This kind of visit is not booked online. Please call us and we will fit you in.</p>}
      </Section>
    </main>
  );
}
