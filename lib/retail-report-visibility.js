const COST_FIELDS = new Set(['cogs_total', 'cogs']);
const PROFIT_FIELDS = new Set(['gross_profit', 'grossProfit', 'marginPercent', 'profit']);

/** Remove sensitive columns and their row values before a report leaves the server. */
export function restrictRetailReport(report, tab, can) {
  const hidden = new Set();
  if (!can('retail_sale.view_cost')) {
    for (const key of COST_FIELDS) hidden.add(key);
  }
  if (!can('retail_sale.view_profit')) {
    for (const key of PROFIT_FIELDS) hidden.add(key);
  }
  if (tab === 'inventory' && !can('retail_inventory.view_cost')) {
    hidden.add('average_cost');
    hidden.add('value');
  }
  if (['purchases', 'suppliers'].includes(tab) && !can('retail_purchasing.view_cost')) {
    for (const key of ['total', 'value', 'averageCost', 'purchases', 'purchase_returns', 'payables']) hidden.add(key);
  }
  return {
    ...report,
    kpis: report.kpis?.filter((item) => !hidden.has(item.key)),
    tables: report.tables?.map((table) => ({
      ...table,
      columns: table.columns.filter((column) => !hidden.has(column.key)),
      rows: table.rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !hidden.has(key)))),
    })),
  };
}
