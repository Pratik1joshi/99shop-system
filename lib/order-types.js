/**
 * Canonical sale channel.
 *
 * A retail counter has one channel, so everything normalizes to `counter`
 * unless the row is explicitly a delivery. The stored values (`dine_in`,
 * `takeaway`, `counter`) still appear in historical rows, which is why they
 * are all folded together here rather than assumed away.
 */
export function normalizedOrderType(order = {}) {
  const raw =
    typeof order === 'string'
      ? order.toLowerCase().replace(/-/g, '_')
      : String(order.order_type ?? order.orderType ?? '').toLowerCase().replace(/-/g, '_');
  if (raw === 'delivery') return 'delivery';
  return 'counter';
}

export function orderTypeLabel(order = {}) {
  const type = normalizedOrderType(order);
  if (type === 'delivery') return 'Delivery';
  return 'Counter';
}

/** SQL equivalent used by reports so legacy dine_in/takeaway rows group as Counter. */
export function normalizedOrderTypeSql(alias = 'o') {
  return `CASE
    WHEN LOWER(COALESCE(${alias}.order_type, '')) = 'delivery' THEN 'delivery'
    ELSE 'counter'
  END`;
}
