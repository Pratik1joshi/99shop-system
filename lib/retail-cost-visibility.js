import { isPermissionAllowedSync } from '@/lib/permissions.js';

const COST_KEYS = new Set([
  'purchase_cost',
  'carrying_value','carrying_value_delta','baseline_value','total_cogs',
  'unit_cost','total_cost','average_cost','current_cost','inventory_value','inventory_unit_cost',
  'unit_cost_snapshot','unit_cogs','value_variance','valueVariance','inventory_value','inventoryValue',
  'lastPurchaseCost','last_purchase_cost','last_cost','total_value','line_total','net_amount',
]);
const PURCHASE_COST_KEYS = new Set(['total','subtotal','tax','discount','shipping','grand_total','invoice_total','order_total','amount','total_spend']);

export function redactRetailCost(value, role, capability = 'retail_inventory.view_cost') {
  if (isPermissionAllowedSync(role, capability)) return value;
  if (Array.isArray(value)) return value.map((item) => redactRetailCost(item, role, capability));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !COST_KEYS.has(key) && !(capability === 'retail_purchasing.view_cost' && PURCHASE_COST_KEYS.has(key)))
    .map(([key, item]) => [key, redactRetailCost(item, role, capability)]));
}
