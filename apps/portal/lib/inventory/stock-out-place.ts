/**
 * Where stock that left without a parts request went, for the traces on the
 * goods receipt and part pages: the counter sale (and its buyer) or the stock
 * count. Pure.
 */
export type StockOutRef = {
  kind: string;
  counterSaleLine?: { counterSale: { id: string; number: string; buyerName: string; customerId: string | null } } | null;
  stockCountLine?: { stockCount: { id: string; number: string } } | null;
};

export function stockOutPlace(o: StockOutRef): { id: string; number: string; label: string; customerName: string | null; customerId: string | null; href: string } {
  const sale = o.counterSaleLine?.counterSale;
  if (sale) return { id: sale.id, number: sale.number, label: 'Counter sale', customerName: sale.buyerName, customerId: sale.customerId, href: `/inventory/counter-sales/${sale.id}` };
  const count = o.stockCountLine?.stockCount;
  if (count) return { id: count.id, number: count.number, label: 'Stock count (short)', customerName: null, customerId: null, href: `/inventory/stock-counts/${count.id}` };
  return { id: '', number: '—', label: o.kind === 'COUNTER_SALE' ? 'Counter sale' : 'Stock count', customerName: null, customerId: null, href: '/inventory' };
}
