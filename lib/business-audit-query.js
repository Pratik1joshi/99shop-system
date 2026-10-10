import { ensureCustomerMasterAudit } from '@/lib/customer-master-audit.js';
import { nepalWallClockTimestamp } from '@/lib/report-dates.js';
import { ensureAfterSalesSchema } from '@/lib/retail-after-sales-schema.js';
import { ensureLoyaltySettingsAudit } from '@/lib/retail-loyalty.js';

/** Only persisted evidence. Missing snapshots stay unavailable, never reconstructed. */
export async function queryBusinessAudit(db, filters={}, {owner=false}={}) {
  await ensureCustomerMasterAudit(db);
  const sources=[
    `SELECT 'customer' AS entity,id,customer_id AS entity_id,action,actor_id,CAST(created_at AS TEXT) AS occurred_at,CAST(customer_id AS TEXT) AS reference,reason,before_json,after_json FROM customer_master_audit`,
    `SELECT 'register',id,business_day_id,action,actor_id,CAST(created_at AS TEXT),CAST(business_day_id AS TEXT),reason,previous_value,new_value FROM business_day_audit`,
    `SELECT 'expense',id,expense_id,action,performed_by,CAST(created_at AS TEXT),CAST(expense_id AS TEXT),reason,before_json,after_json FROM expense_change_audit`,
    `SELECT 'sale',id,retail_sale_id,event,actor_id,CAST(created_at AS TEXT),CAST(retail_sale_id AS TEXT),NULL,NULL,NULL FROM retail_sale_audit`,
    `SELECT 'return',id,original_sale_id,'Return posted',cashier_id,CAST(posted_at AS TEXT),return_number,reason,NULL,NULL FROM retail_returns WHERE status='POSTED'`,
    `SELECT 'exchange',id,new_sale_id,'Exchange',created_by,CAST(created_at AS TEXT),exchange_number,NULL,NULL,NULL FROM retail_exchanges`,
    `SELECT 'store_credit',id,customer_id,type,created_by,CAST(created_at AS TEXT),CAST(id AS TEXT),reason,NULL,NULL FROM store_credit_transactions WHERE type='ADJUSTMENT'`,
    `SELECT 'loyalty',id,customer_id,type,created_by,CAST(created_at AS TEXT),CAST(id AS TEXT),reason,NULL,NULL FROM loyalty_transactions WHERE type='ADJUSTMENT'`,
    `SELECT 'collection',id,id,'Customer collection',created_by,CAST(created_at AS TEXT),collection_number,NULL,NULL,NULL FROM retail_credit_collections`,
    `SELECT 'writeoff',id,retail_sale_id,'Write-off',created_by,CAST(created_at AS TEXT),external_ref,reason,NULL,NULL FROM retail_credit_writeoffs`,
    `SELECT 'adjustment',id,id,type,created_by,CAST(created_at AS TEXT),adjustment_number,reason,NULL,NULL FROM retail_inventory_adjustments`,
    `SELECT 'purchase_order',id,id,'PO created',created_by,CAST(created_at AS TEXT),po_number,NULL,NULL,NULL FROM purchase_orders`,
    `SELECT 'purchase_order_approval',id,id,'PO approved',approved_by,CAST(approved_at AS TEXT),po_number,NULL,NULL,NULL FROM purchase_orders WHERE approved_at IS NOT NULL`,
    `SELECT 'goods_receipt',id,id,'Goods receipt posted',received_by,CAST(posted_at AS TEXT),grn_number,NULL,NULL,NULL FROM goods_receipts WHERE posted_at IS NOT NULL`,
    `SELECT 'purchase_return',id,id,'Purchase return posted',created_by,CAST(posted_at AS TEXT),return_number,reason,NULL,NULL FROM purchase_returns WHERE posted_at IS NOT NULL`,
    `SELECT 'stock_count',id,id,'Stock count posted',approved_by,CAST(posted_at AS TEXT),count_number,NULL,NULL,NULL FROM retail_stock_counts WHERE posted_at IS NOT NULL`,
    `SELECT 'transfer_dispatched',id,id,'Transfer dispatched',dispatched_by,CAST(dispatched_at AS TEXT),transfer_number,reason,NULL,NULL FROM retail_transfers WHERE dispatched_at IS NOT NULL`,
    `SELECT 'transfer_received',id,id,'Transfer received',received_by,CAST(received_at AS TEXT),transfer_number,reason,NULL,NULL FROM retail_transfers WHERE received_at IS NOT NULL`,
    `SELECT 'discount',id,id,'Recorded sale discount',cashier_id,CAST(completed_at AS TEXT),sale_number,discount_reason,NULL,CAST(discount_amount AS TEXT) FROM retail_sales WHERE status='COMPLETED' AND discount_amount>0`,
  ];
  if(owner) {
    await ensureLoyaltySettingsAudit(db);
    sources.push(`SELECT 'permission',id,NULL,'Permission changed',actor_id,CAST(created_at AS TEXT),role || ': ' || permission_key,NULL,CAST(previous_value AS TEXT),CAST(new_value AS TEXT) FROM permission_audit`,
    `SELECT 'loyalty_settings',id,NULL,'Loyalty settings changed',actor_id,CAST(changed_at AS TEXT),'Loyalty rules',NULL,old_value,new_value FROM retail_loyalty_settings_audit`,
    `SELECT 'journal',id,id,source_type,created_by,CAST(created_at AS TEXT),CAST(id AS TEXT),memo,NULL,NULL FROM journal_entries WHERE source_type IN ('manual','reversal','cash_movement','bank_movement','supplier_payment')`);
  }
  const where=['1=1'],args=[];
  if(owner){
    await ensureAfterSalesSchema(db);
    sources.push(`SELECT 'warranty',id,claim_id,kind,actor_id,CAST(created_at AS TEXT),CAST(claim_id AS TEXT),internal_note,NULL,evidence FROM warranty_events`,
      `SELECT 'forecast_policy',id,variant_id,'Forecast policy changed',actor_id,CAST(created_at AS TEXT),CAST(variant_id AS TEXT),NULL,before_config,after_config FROM operations_policy_audit`,
      `SELECT 'replenishment_decision',id,po_id,action,actor_id,CAST(created_at AS TEXT),CAST(snapshot_id AS TEXT),reason,NULL,NULL FROM operations_decisions`);
  }
  for(const key of ['entity','action','actor_id','id']) if(filters[key]) {where.push(`e.${key}=?`);args.push(String(filters[key]).slice(0,100));}
  if(filters.q) {where.push("(lower(COALESCE(e.reference,'')) LIKE ? OR lower(e.action) LIKE ? OR lower(COALESCE(e.reason,'')) LIKE ? OR lower(COALESCE(u.full_name,'')) LIKE ?)");args.push(...Array(4).fill(`%${String(filters.q).toLowerCase().slice(0,100).replace(/[\\%_]/g,'')}%`));}
  for(const [key,op,suffix] of [['from','>=',' 00:00:00'],['to','<=',' 23:59:59.999999']]) if(/^\d{4}-\d{2}-\d{2}$/.test(filters[key]||'')){where.push(`e.occurred_at${op}?`);args.push(filters[key]+suffix);}
  const page=Math.min(100000,Math.max(1,parseInt(filters.page,10)||1)),size=30;
  const rows=await db.all(`SELECT e.*,u.full_name AS actor FROM (${sources.join(' UNION ALL ')}) e LEFT JOIN users u ON u.id=e.actor_id WHERE ${where.join(' AND ')} ORDER BY e.occurred_at DESC,e.entity,e.id DESC LIMIT ? OFFSET ?`,[...args,size+1,(page-1)*size]);
  const snapshot=(raw,entity)=>{
    if(raw==null) return null;
    let result;try{result=JSON.parse(raw);}catch{return null;}
    // Register snapshots contain expected cash and accounting totals. They are owner-only.
    if(!owner&&entity==='register') return null;
    if(!owner&&entity==='customer'&&result&&typeof result==='object') {delete result.notes;}
    return result;
  };
  const href=r=>({customer:`/admin/retail-customers/${r.entity_id}`,sale:`/admin/retail-sales-history/${r.entity_id}`,discount:`/admin/retail-sales-history/${r.entity_id}`,return:`/admin/retail-sales-history/${r.entity_id}`,exchange:`/admin/retail-sales-history/${r.entity_id}`,writeoff:`/admin/retail-sales-history/${r.entity_id}`,collection:`/admin/retail-receivables?collection=${r.entity_id}`,expense:`/admin/expenses?expense=${r.entity_id}`,register:r.action==='cash_variance_review'?'/admin/retail-cash-variances':'/admin/retail-registers',purchase_order:`/admin/retail-purchase-orders?po=${r.entity_id}`,purchase_order_approval:`/admin/retail-purchase-orders?po=${r.entity_id}`,goods_receipt:'/admin/retail-goods-receipts',purchase_return:'/admin/retail-purchase-returns',stock_count:`/admin/retail-stock-counts/${r.entity_id}`,transfer_dispatched:`/admin/retail-transfers/${r.entity_id}`,transfer_received:`/admin/retail-transfers/${r.entity_id}`,journal:`/admin/retail-journals/${r.entity_id}`,adjustment:'/admin/retail-inventory-ops',store_credit:`/admin/retail-customers/${r.entity_id}`,loyalty:`/admin/retail-customers/${r.entity_id}`})[r.entity]||null;
  return {events:rows.slice(0,size).map(({before_json,after_json,...row})=>({...row,occurred_at:db.driver==='postgres'?nepalWallClockTimestamp(row.occurred_at):row.occurred_at,key:`${row.entity}:${row.id}`,before:snapshot(before_json,row.entity),after:snapshot(after_json,row.entity),href:href(row)})),pagination:{page,has_more:rows.length>size},scope:'Recorded evidence only. Before/after and approvals are shown only when recorded. Earlier customer master history is unavailable.'};
}
