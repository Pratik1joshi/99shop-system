/** Summary responses must not bypass the source API's field and blind-count policy. */
export function financeVisibility(data,{can,cashVisible}){
  const result={...data,control:{...data.control},attention:{...data.attention}};
  if(!cashVisible) result.control.cash=null;
  if(!can('bank.access')) result.control.bank=null;
  if(!can('retail_inventory.view_cost')) result.control.inventory=null;
  if(!can('general_ledger.view')) result.trial_balance=null;
  if(!can('supplier_ledger.access')) {result.control.accounts_payable=null;result.attention.outstanding_payable=null;}
  return result;
}

export function analyticsVisibility(data,{can,cashVisible}){
  const blocked=new Set();
  if(!can('retail_sale.view_cost'))['cogs','unit_cost','total_cost','unit_cogs','total_cogs','carrying_value','carrying_value_delta','baseline_value','cogsReversal'].forEach(k=>blocked.add(k));
  if(!can('retail_sale.view_profit'))['grossProfit','marginPercent','topByProfit','bottomByProfit','topByMargin'].forEach(k=>blocked.add(k));
  if(!can('retail_inventory.view_cost'))['inventoryValue','expiredValue'].forEach(k=>blocked.add(k));
  if(!can('financial_reports.access'))blocked.add('netProfit');
  if(!can('supplier_ledger.access'))blocked.add('supplierPayables');
  if(!can('customer_ledger.access'))['customerReceivables','storeCreditLiability'].forEach(k=>blocked.add(k));
  if(!cashVisible||!can('bank.access'))blocked.add('cashPosition');
  const visit=value=>Array.isArray(value)?value.map(visit):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!blocked.has(key)).map(([key,v])=>[key,visit(v)])):value;
  return visit(data);
}
