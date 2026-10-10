import { isPermissionAllowedSync } from '@/lib/permissions.js';

export function canViewCommerceCost(role) {
  return isPermissionAllowedSync(role, 'retail_sale.view_cost');
}

export function assertCostWriteAllowed(role, input) {
  if (canViewCommerceCost(role)) return;
  const hasCost = Object.prototype.hasOwnProperty.call(input, 'cost') ||
    (input.variants || []).some((variant) => Object.prototype.hasOwnProperty.call(variant, 'cost') || Object.prototype.hasOwnProperty.call(variant, 'unit_cost'));
  if (hasCost) throw Object.assign(new Error('Cost editing is not permitted for this role.'), { status: 403 });
}

export function commerceProductVisibility(product, role) {
  if (canViewCommerceCost(role)) return product;
  const result = { ...product };
  delete result.cost;
  result.variants = (result.variants || []).map((variant) => {
    const copy = { ...variant };
    delete copy.cost;
    delete copy.unit_cost;
    delete copy.purchase_cost;
    return copy;
  });
  return result;
}

export function commerceSaleVisibility(sale, role) {
  const result = { ...sale };
  if (role !== 'admin' && role !== 'manager' && role !== 'accountant') delete result.credit_override;
  if (!isPermissionAllowedSync(role, 'retail_sale.view_cost')) delete result.cogs_total;
  if (!isPermissionAllowedSync(role, 'retail_sale.view_profit')) delete result.gross_profit;
  if (result.lines) result.lines = result.lines.map((line) => {
    const copy = { ...line };
    if (!isPermissionAllowedSync(role, 'retail_sale.view_cost')) { delete copy.unit_cost; delete copy.total_cost; }
    return copy;
  });
  return result;
}

export function commerceReturnVisibility(ret, role) {
  if (!ret || canViewCommerceCost(role)) return ret;
  return { ...ret, lines: (ret.lines || []).map((line) => {
    const copy = { ...line };
    delete copy.unit_cogs;
    delete copy.total_cogs;
    return copy;
  }) };
}

export function commerceExchangeVisibility(exchange, role) {
  if (!exchange) return exchange;
  return { ...exchange, return: commerceReturnVisibility(exchange.return, role), newSale: commerceSaleVisibility(exchange.newSale, role) };
}

export async function assertHeldOwner(db, id, user) {
  if (user.role === 'admin') return;
  const sale = await db.get('SELECT status,cashier_id FROM retail_sales WHERE id=?', [id]);
  if (sale?.status === 'HELD' && Number(sale.cashier_id) !== Number(user.id)) {
    throw Object.assign(new Error('Only the owning cashier or an administrator can open or change this held sale.'), { status: 403 });
  }
}
