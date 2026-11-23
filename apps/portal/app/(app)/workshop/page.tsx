import { OrgTrail } from '@/components/OrgTrail';
import { allows } from '@/lib/authz/server';
import { PageHeader, NavCard, type IconName } from '@/components/ui';
import { moduleIsOn } from '@/lib/modules';

const allSections: { name: string; href: string; desc: string; icon: IconName }[] = [
  { name: 'Customers', href: '/workshop/customers', icon: 'users', desc: 'Customer records and vehicle ownership history.' },
  { name: 'Vehicles', href: '/workshop/vehicles', icon: 'car', desc: 'Vehicle registry, chassis/VIN, and service history.' },
  { name: 'Job Cards', href: '/workshop/job-cards', icon: 'clipboard', desc: 'Repairs and routine services, open and past.' },
  { name: 'Bookings', href: '/workshop/appointments', icon: 'calendar', desc: 'Customers who booked a day and time: confirm them, and open the Job Card when the vehicle arrives.' },
  { name: 'Vehicles In Custody', href: '/workshop/custody', icon: 'garage', desc: 'Vehicles in the workshop, grouped by what needs attention.' },
  { name: 'Refunds', href: '/workshop/refunds', icon: 'refund', desc: 'Refunds paid to customers, with printable receipts.' },
  { name: 'Service Tracker', href: '/workshop/service-tracker', icon: 'gauge', desc: 'Next service due for each vehicle after it leaves, and reminders sent.' },
  { name: 'Parts Requests', href: '/workshop/parts-requests', icon: 'package', desc: 'Parts requested from the Store, from approval to release.' },
];
// Parts requests need the Store: no tile while it is switched off.
const sections = allSections.filter((s) => s.href !== '/workshop/parts-requests' || moduleIsOn('inventory'));

/** Workshop landing page: links to each workshop area. */
export default async function WorkshopPage() {
  // Customers live in the Customers (CRM) hub for anyone who can open it; link there directly.
  const [canCrm, canBookings] = await Promise.all([allows('crm.view'), allows('workshop.appointment.view')]);
  const cards = sections
    .filter((s) => s.href !== '/workshop/appointments' || canBookings)
    .map((s) => (s.href === '/workshop/customers' && canCrm ? { ...s, href: '/crm' } : s));
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="wrench"
        eyebrow="Module"
        title="Workshop"
        description={<>Vehicles from check-in to collection: Job Cards, services, parts, refunds and aftercare. <span className="block text-xs"><OrgTrail /></span></>}
      />

      <div className="ejo-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((s) => (
          <NavCard key={s.href} href={s.href} icon={s.icon} title={s.name} description={s.desc} />
        ))}
      </div>
    </div>
  );
}
