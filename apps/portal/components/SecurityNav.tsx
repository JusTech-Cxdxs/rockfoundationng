import { SubNav } from '@/components/ui/SubNav';
import type { IconName } from '@/components/ui/Icon';

/** The gate's tabs. Every page behind them needs security.view (the page guards say the same). */
const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: '/security', label: 'Gate dashboard', icon: 'dashboard' },
  { href: '/security/vehicles-inside', label: 'In the compound', icon: 'garage' },
  { href: '/security/vehicles', label: 'Vehicles leaving', icon: 'car' },
  { href: '/security/vehicles/exits', label: 'Gate passes', icon: 'history' },
];

export function SecurityNav({ active }: { active: string }) {
  return <SubNav tabs={TABS} active={active} label="Gate" />;
}
