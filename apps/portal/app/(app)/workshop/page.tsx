import { OrgTrail } from '@/components/OrgTrail';
import { allows } from '@/lib/authz/server';
import { PageHeader, NavCard, type IconName } from '@/components/ui';
import { featureOn, moduleIsOn } from '@/lib/modules';
import { separateVehicleServiceOn } from '@/lib/service-entry';

const allSections: { name: string; href: string; desc: string; icon: IconName }[] = [
  { name: 'Customers', href: '/workshop/customers', icon: 'users', desc: 'Customer records and vehicle ownership history.' },
  { name: 'Vehicles', href: '/workshop/vehicles', icon: 'car', desc: 'Vehicle registry, chassis/VIN, and service history.' },
  // With the separate Vehicle Service off, services are opened as a Job Card with Service ticked.
  { name: 'Job Cards', href: '/workshop/job-cards', icon: 'clipboard', desc: separateVehicleServiceOn() ? 'Repair jobs, open and past.' : 'Repairs and routine services, open and past.' },
  { name: 'Vehicle Service', href: '/workshop/vehicle-service', icon: 'droplet', desc: 'Routine maintenance and minor requests. Repairs are escalated to a Job Card.' },
  { name: 'Vehicles In Custody — Job Card', href: '/workshop/custody', icon: 'garage', desc: 'Vehicles in the workshop under a Job Card, grouped by what needs attention.' },
  { name: 'Vehicles In Custody — Vehicle Service', href: '/workshop/vehicle-service-custody', icon: 'key', desc: 'Vehicles in for service, awaiting collection, or due and overdue for their next service.' },
  { name: 'Refunds', href: '/workshop/refunds', icon: 'refund', desc: 'Refunds paid to customers, with printable receipts.' },
  { name: 'Service Tracker', href: '/workshop/service-tracker', icon: 'gauge', desc: 'Next service due for each vehicle after it leaves, and reminders sent.' },
  { name: 'Parts Requests', href: '/workshop/parts-requests', icon: 'package', desc: 'Parts requested from the Store, from approval to release.' },
  { name: 'External Procurement', href: '/workshop/external-procurement', icon: 'cart', desc: 'Cash advance requests for externally-sourced parts and jobs.' },
];
const sections = allSections.filter(
  // Parts requests need the Store; external procurement needs its approvals. Off in this edition: no tile.
  (s) => (s.href !== '/workshop/parts-requests' || moduleIsOn('inventory')) && (s.href !== '/workshop/external-procurement' || featureOn('externalProcurement'))
    // No separate Vehicle Service in this edition: no tile for it or its custody list (old records stay reachable by link and search).
    && ((s.href !== '/workshop/vehicle-service' && s.href !== '/workshop/vehicle-service-custody') || separateVehicleServiceOn()),
);

/** Workshop landing page: links to each workshop area. */
export default async function WorkshopPage() {
  // Customers live in the Customers (CRM) hub for anyone who can open it; link there directly.
  const canCrm = await allows('crm.view');
  const cards = sections.map((s) => (s.href === '/workshop/customers' && canCrm ? { ...s, href: '/crm' } : s));
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
