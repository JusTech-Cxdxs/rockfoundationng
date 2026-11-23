import { allows, guardAnyPage } from '@/lib/authz/server';
import { AREAS } from '@/lib/authz/page-areas';
import { OrgTrail } from '@/components/OrgTrail';
import { PageHeader, NavCard, type IconName } from '@/components/ui';

const sections: { name: string; href: string; desc: string; icon: IconName }[] = [
  { name: 'Parts Catalog', href: '/inventory/parts', icon: 'package', desc: 'Parts the Store stocks, with tracking type, unit and stock on hand.' },
  { name: 'Counter sales', href: '/inventory/counter-sales', icon: 'cart', desc: 'Parts sold over the counter without a Job Card, with the receipt.' },
  { name: 'Stock counts', href: '/inventory/stock-counts', icon: 'clipboard', desc: 'Count the shelf against the system; the Owner approves any difference.' },
  { name: 'Parts store report', href: '/inventory/reports', icon: 'chart', desc: 'Parts sold on jobs and over the counter, what is running low and what has not moved.' },
  { name: 'Goods Receipts', href: '/inventory/goods-receipts', icon: 'receipt', desc: 'Deliveries received into the Store.' },
  { name: 'Suppliers', href: '/inventory/suppliers', icon: 'truck', desc: 'The organisation\'s suppliers, with how often each delivers.' },
  { name: 'Part Categories & Types', href: '/inventory/part-types', icon: 'layers', desc: 'The categories and types technicians choose from on an estimate.' },
  { name: 'Estimate Matching', href: '/inventory/estimate-matching', icon: 'match', desc: 'Store Part lines waiting to be matched to a catalogue part and priced.' },
  { name: 'Inventory Analytics', href: '/inventory/analytics', icon: 'chart', desc: 'Stock health, suggested reorder points and safety stock, demand, ABC/XYZ, turnover and profitability.' },
  { name: 'Pricing Command Center', href: '/inventory/pricing', icon: 'tag', desc: 'Delivery costs checked against each part\'s target margin, with alerts and price updates.' },
];

/** Inventory landing page: links to each Store area the viewer may open. */
export default async function InventoryPage() {
  await guardAnyPage(['store.view'], '/inventory');
  // Show only what this person may open (the same rule the pages enforce).
  // The same rules as lib/authz/page-areas.ts: each card only for those who may open it.
  const visible = (await Promise.all(sections.map(async (s) => {
    const area = AREAS.find((a) => a.url === s.href);
    return !area || (await Promise.all(area.needs.map((k) => allows(k)))).some(Boolean) ? s : null;
  }))).filter((s): s is (typeof sections)[number] => s !== null);
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="boxes"
        eyebrow="Module · Store"
        title="Inventory"
        description={<>The store: what is on the shelf, what came in, what it costs and what to reorder. <span className="block text-xs"><OrgTrail area="Store" /></span></>}
      />

      <div className="ejo-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((s) => (
          <NavCard key={s.href} href={s.href} icon={s.icon} title={s.name} description={s.desc} />
        ))}
      </div>
    </div>
  );
}
