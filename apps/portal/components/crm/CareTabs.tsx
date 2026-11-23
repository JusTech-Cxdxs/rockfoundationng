import { SubNav } from '@/components/ui';

/** The Customers area's tabs: the customer list and the customer-care desks. */
export function CareTabs({ active }: { active: '/crm' | '/crm/callbacks' | '/crm/complaints' | '/crm/ratings' }) {
  return (
    <SubNav
      label="Customer care"
      active={active}
      tabs={[
        { href: '/crm', label: 'Customers', icon: 'users' },
        { href: '/crm/callbacks', label: 'Callbacks', icon: 'phone' },
        { href: '/crm/complaints', label: 'Complaints', icon: 'alert' },
        { href: '/crm/ratings', label: 'Ratings', icon: 'star' },
      ]}
    />
  );
}
