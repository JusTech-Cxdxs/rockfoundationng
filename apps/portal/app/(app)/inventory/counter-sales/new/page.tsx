import { prisma } from '@ejo/database';
import { guardAnyPage, myOrganisationId } from '@/lib/authz/server';
import { CounterSaleForm } from '@/components/CounterSaleForm';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { OrgTrail } from '@/components/OrgTrail';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** A new counter sale: the buyer, the parts at their selling price, VAT and the payment. */
export default async function NewCounterSalePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await guardAnyPage(['store.counter.sell'], '/inventory/counter-sales/new');
  const { error } = await searchParams;
  const organisationId = await myOrganisationId();
  const org = organisationId ? await prisma.organisation.findUnique({ where: { id: organisationId }, select: { vatEnabled: true, vatRate: true } }) : null;
  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
      <PageHeader icon="cart" back={{ href: '/inventory/counter-sales', label: 'Back to Counter sales' }} title="New counter sale" description={<>Sell parts without a Job Card. The stock comes off the shelf when you record it. <OrgTrail area="Store" /></>} />
      {error ? <div className="mb-6"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <CounterSaleForm vat={org ? { vatEnabled: org.vatEnabled, vatRate: Number(org.vatRate) } : null} />
    </div>
  );
}
