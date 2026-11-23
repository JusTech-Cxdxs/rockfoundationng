import { guardAnyPage } from '@/lib/authz/server';
import { listCountableParts } from '@/lib/actions/stock-counts';
import { StockCountForm } from '@/components/StockCountForm';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { OrgTrail } from '@/components/OrgTrail';
import { EmptyState, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** The count sheet for the Store Keeper (or Front Desk while that role is off). */
export default async function NewStockCountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await guardAnyPage(['store.stock.count'], '/inventory/stock-counts/new');
  const { error } = await searchParams;
  const parts = await listCountableParts();
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader icon="clipboard" back={{ href: '/inventory/stock-counts', label: 'Back to Stock counts' }} title="Count the stock" description={<>Write what is on the shelf for the parts you count; leave the rest blank. Serial-tracked parts are checked unit by unit on their own page. <OrgTrail area="Store" /></>} />
      {error ? <div className="mb-6"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {parts.length === 0 ? <EmptyState icon="boxes" title="No parts to count yet." /> : <StockCountForm parts={parts} />}
    </div>
  );
}
