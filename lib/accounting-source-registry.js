/** Shared identity/display metadata. Routes exist only where exact documents open. */
export const ACCOUNTING_SOURCES = Object.freeze({
  warranty_economic: { label: 'Warranty expense', table: 'warranty_economics' },
  retail_sale: { label: 'Retail Sale', table: 'retail_sales', route: (id) => `/admin/retail-sales-history/${id}` },
  retail_return: { label: 'Retail Return', table: 'retail_returns' },
  retail_credit_collection: { label: 'Customer Collection', table: 'retail_credit_collections', route: (id) => `/admin/retail-receivables?collection=${id}` },
  retail_credit_writeoff: { label: 'Customer Write-off', table: 'retail_credit_writeoffs' },
  store_credit_issue: { label: 'Store Credit Issue' },
  store_credit_adjustment: { label: 'Store Credit Correction', table: 'store_credit_transactions' },
  goods_receipt: { label: 'Goods Receipt', table: 'goods_receipts' },
  purchase_return: { label: 'Purchase Return', table: 'purchase_returns' },
  supplier_payment: { label: 'Supplier Payment' },
  expense: { label: 'Expense', table: 'expenses', route: (id) => `/admin/expenses?expense=${id}` },
  cash_movement: { label: 'Cash Movement' },
  bank_movement: { label: 'Bank Movement' },
  settlement: { label: 'Settlement' },
  payment_method_correction: { label: 'Payment Method Correction' },
  retail_inventory_adjustment: { label: 'Inventory Adjustment', table: 'retail_inventory_adjustments' },
  retail_stock_count: { label: 'Stock Count', table: 'retail_stock_counts', route: (id) => `/admin/retail-stock-counts/${id}` },
  drawer_open: { label: 'Register Opening', table: 'drawer_sessions' },
  drawer: { label: 'Register Movement', table: 'drawer_sessions' },
  manual: { label: 'Manual Journal' },
  reversal: { label: 'Journal Reversal', table: 'journal_entries', route: (id) => `/admin/retail-journals/${id}` },
});

export function accountingSource(record) {
  const type = record.source_type || 'manual';
  const definition = Object.hasOwn(ACCOUNTING_SOURCES, type) ? ACCOUNTING_SOURCES[type] : null;
  const id = Number(record.source_id);
  const journal = Number(record.journal_id || record.id);
  const validId = Number.isSafeInteger(id) && id > 0;
  return { type, label: definition?.label || type.replaceAll('_', ' '), id: validId ? id : null,
    href: validId && definition?.route ? definition.route(id) : Number.isSafeInteger(journal) && journal > 0 ? `/admin/retail-journals/${journal}` : null };
}
