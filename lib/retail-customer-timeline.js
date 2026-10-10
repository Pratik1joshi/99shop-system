import { ensureCustomerMasterAudit } from '@/lib/customer-master-audit.js';
import {ensureAfterSalesSchema} from '@/lib/retail-after-sales-schema.js';
/** Read-time union of canonical events. No copied balances or per-source caps. */
export async function getCustomerTimeline(db, customerId, { page = 1, pageSize = 30, includeApprovals = false, includeMaster = false, includeWarranty=false, sourceType = '', sourceId = '', channel = '' } = {}) {
  const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 30));
  const number = Math.min(100000, Math.max(1, parseInt(page, 10) || 1));
  const sources = [
    `SELECT 'sale' AS source_type,s.id,s.completed_at AS occurred_at,s.sale_number AS reference,
      CASE WHEN EXISTS (SELECT 1 FROM retail_sale_payments p WHERE p.retail_sale_id=s.id AND p.method='credit') THEN 'Credit Sale' WHEN s.channel='online' THEN 'Online Sale' ELSE 'Sale' END AS event,
      s.grand_total AS amount,CAST(NULL AS NUMERIC) AS points,CAST(NULL AS TEXT) AS reason,s.id AS sale_id
      FROM retail_sales s WHERE s.customer_id=? AND s.status='COMPLETED'`,
    `SELECT 'online_order',id,created_at,order_number,'Online Order',total,NULL,status,retail_sale_id FROM retail_online_orders WHERE customer_id=?`,
    `SELECT 'return',id,posted_at,return_number,'Return',refund_total,NULL,reason,original_sale_id
      FROM retail_returns WHERE customer_id=? AND status='POSTED'`,
    `SELECT 'exchange',e.id,e.created_at,e.exchange_number,'Exchange',e.difference_amount,NULL,NULL,e.new_sale_id
      FROM retail_exchanges e JOIN retail_returns r ON r.id=e.return_id WHERE r.customer_id=?`,
    `SELECT 'collection',id,created_at,collection_number,'Collection',amount,NULL,NULL,NULL
      FROM retail_credit_collections WHERE customer_id=?`,
    `SELECT 'writeoff',id,created_at,external_ref,'Write-off',amount,NULL,reason,retail_sale_id
      FROM retail_credit_writeoffs WHERE customer_id=?`,
    `SELECT 'store_credit',id,created_at,CAST(id AS TEXT),
      CASE type WHEN 'ISSUE' THEN 'Store Credit Issue' WHEN 'REDEEM' THEN 'Store Credit Redemption' WHEN 'ADJUSTMENT' THEN 'Store Credit Correction' ELSE 'Store Credit ' || type END,
      amount,NULL,reason,CASE WHEN source_type='retail_sale' THEN source_id ELSE NULL END
      FROM store_credit_transactions WHERE customer_id=?`,
    `SELECT 'loyalty',id,created_at,CAST(id AS TEXT),
      CASE type WHEN 'EARN' THEN 'Loyalty Earn' WHEN 'REDEEM' THEN 'Loyalty Redemption' WHEN 'REVERSAL' THEN 'Loyalty Reversal' WHEN 'ADJUSTMENT' THEN 'Manual Loyalty Adjustment' ELSE 'Loyalty ' || type END,
      NULL,points,reason,CASE WHEN source_type='retail_sale' THEN source_id ELSE NULL END
      FROM loyalty_transactions WHERE customer_id=?`,
  ];
  if (includeApprovals) sources.push(`SELECT 'credit_override',id,approved_at,CAST(id AS TEXT),'Credit Override',credit_amount,NULL,reason,retail_sale_id FROM retail_credit_overrides WHERE customer_id=?`);
  if (includeMaster) {
    await ensureCustomerMasterAudit(db);
    sources.push(`SELECT 'customer_master',id,created_at,CAST(id AS TEXT),'Customer Master ' || action,NULL,NULL,reason,NULL FROM customer_master_audit WHERE customer_id=?`);
  }
  if(includeWarranty){await ensureAfterSalesSchema(db);sources.push(`SELECT 'warranty',id,created_at,claim_number,'Warranty ' || COALESCE(resolution,status),NULL,NULL,issue,sale_id FROM warranty_claims WHERE customer_id=?`);}
  const union = sources.join(' UNION ALL ');
  const args = sources.map(() => customerId);
  let where = '';
  if (sourceType && sourceId) { where = 'WHERE source_type=? AND id=?'; args.push(String(sourceType).slice(0,40), Number(sourceId) || -1); }
  if(['online','retail_pos'].includes(channel)){where+=(where?' AND ':'WHERE ')+"(sale_id IN (SELECT id FROM retail_sales WHERE channel=?) OR (source_type='online_order' AND ?='online'))";args.push(channel,channel);}
  const rows = await db.all(`SELECT * FROM (${union}) events ${where} ORDER BY occurred_at DESC,source_type,id DESC LIMIT ? OFFSET ?`, [...args, size + 1, (number - 1) * size]);
  return { events: rows.slice(0, size).map((row) => ({ ...row,
    key: `${row.source_type}:${row.id}`, amount: row.amount == null ? null : Number(row.amount), points: row.points == null ? null : Number(row.points),
    href: row.source_type === 'warranty' ? `/admin/retail-after-sales?claim=${row.id}` : row.source_type === 'online_order' ? `/admin/retail-online-orders/${row.id}` : row.source_type === 'customer_master' ? `/admin/retail-audit?entity=customer&id=${row.id}` : row.sale_id ? `/admin/retail-sales-history/${row.sale_id}` : row.source_type === 'collection' ? `/admin/retail-receivables?collection=${row.id}` : `/admin/retail-customers/${customerId}?timeline_source=${row.source_type}&timeline_id=${row.id}`,
  })), pagination: { page: number, page_size: size, has_more: rows.length > size },
  scope: 'Recorded Retail events, newest first; timestamps use Nepal time. Customer master changes before audit recording are unavailable.' };
}
