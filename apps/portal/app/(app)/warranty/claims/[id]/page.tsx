import { redirect } from 'next/navigation';
import { guardAnyPage } from '@/lib/authz/server';

/** One supplier claim (SC-number, from the search or an audit link): opens the claims list on that claim. */
export default async function SupplierClaimPage({ params }: { params: Promise<{ id: string }> }) {
  await guardAnyPage(['workshop.warranty.claims', 'workshop.warranty.report'], '/warranty/claims');
  const { id } = await params;
  redirect(/^[a-z0-9]{20,40}$/.test(id) ? `/warranty/claims?show=all&id=${id}` : '/warranty/claims');
}
