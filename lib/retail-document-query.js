import { nepalWallClockTimestamp } from '@/lib/report-dates.js';
/** Canonical document projections. SQL identifiers below are code-owned, never request input. */
const N = 'NULL';
const definitions = [
  { type:'sale', label:'Sale', table:'retail_sales', permission:'retail_sale.view', number:'sale_number', amount:'grand_total', actor:'cashier_id', customer:'customer_id', day:'business_day_id', status:'status', lines:['retail_sale_lines','retail_sale_id'], href:r=>`/admin/retail-sales-history/${r.id}` },
  { type:'return', label:'Return', table:'retail_returns', permission:'retail_sale.view', number:'return_number', amount:'refund_total', actor:'cashier_id', customer:'customer_id', day:'business_day_id', status:'status', method:'refund_method', lines:['retail_return_lines','retail_return_id'], href:r=>`/admin/retail-sales-history/${r.parent_id}`, parent:'original_sale_id' },
  { type:'exchange', label:'Exchange', table:'retail_exchanges', permission:'retail_sale.view', number:'exchange_number', amount:'difference_amount', actor:'created_by', method:'settlement_method', parent:'new_sale_id', href:r=>`/admin/retail-sales-history/${r.parent_id}` },
  { type:'collection', label:'Customer Collection', table:'retail_credit_collections', permission:'customer_ledger.access', number:'collection_number', reference:'payment_reference', amount:'amount', actor:'created_by', customer:'customer_id', day:'business_day_id', method:'method', href:r=>`/admin/retail-receivables?collection=${r.id}` },
  { type:'store_credit', label:'Store Credit', table:'store_credit_transactions', permission:'customer_ledger.access', amount:'amount', actor:'created_by', customer:'customer_id', status:'type', href:r=>`/admin/retail-customers/${r.customer_id}?timeline_source=store_credit&timeline_id=${r.id}` },
  { type:'purchase_order', label:'Purchase Order', table:'purchase_orders', permission:['retail_purchasing.po.create','retail_purchasing.po.approve'], number:'po_number', actor:'created_by', supplier:'supplier_id', status:'status', lines:['purchase_order_lines','purchase_order_id'], href:r=>`/admin/retail-purchase-orders?po=${r.id}` },
  { type:'goods_receipt', label:'Goods Receipt', table:'goods_receipts', permission:'retail_purchasing.grn.receive', number:'grn_number', reference:'invoice_number', actor:'received_by', supplier:'supplier_id', status:'status', method:'payment_method', lines:['goods_receipt_lines','goods_receipt_id'], href:()=>'/admin/retail-goods-receipts' },
  { type:'purchase_return', label:'Purchase Return', table:'purchase_returns', permission:'retail_purchasing.return.create', number:'return_number', actor:'created_by', supplier:'supplier_id', status:'status', method:'refund_method', lines:['purchase_return_lines','purchase_return_id'], href:()=>'/admin/retail-purchase-returns' },
  { type:'adjustment', label:'Stock Adjustment', table:'retail_inventory_adjustments', permission:'retail_inventory.view', number:'adjustment_number', actor:'created_by', status:'type', variant:'variant_id', amount:'total_value', costPermission:'retail_inventory.view_cost', href:()=>'/admin/retail-inventory-ops' },
  { type:'count', label:'Stock Count', table:'retail_stock_counts', permission:'retail_inventory.view', number:'count_number', actor:'created_by', status:'status', lines:['retail_stock_count_lines','retail_stock_count_id'], href:r=>`/admin/retail-stock-counts/${r.id}` },
  { type:'transfer', label:'Transfer', table:'retail_transfers', permission:'retail_inventory.view', number:'transfer_number', actor:'requested_by', status:'status', lines:['retail_transfer_lines','retail_transfer_id'], href:r=>`/admin/retail-transfers/${r.id}` },
  { type:'expense', label:'Expense', table:'expenses', permission:'expenses.manage', reference:'description', amount:'amount', actor:'logged_by', day:'business_day_id', status:'status', method:'payment_method', href:r=>`/admin/expenses?expense=${r.id}` },
  ...[['supplier_payment','Supplier Payment','supplier_ledger.access'],['cash_movement','Cash Movement','cash_drawer.manage'],['bank_movement','Bank Transaction','bank.access'],['journal','Journal Entry','general_ledger.view']].map(([type,label,permission])=>({type,label,permission,table:'journal_entries',reference:'memo',actor:'created_by',where:type==='journal'?'1=1':`d.source_type='${type}'`,href:r=>`/admin/retail-journals/${r.id}`})),
];
const canRead = (d,can) => (Array.isArray(d.permission) ? d.permission : [d.permission]).some(can);
const bounded = (v, fallback, max) => Math.min(max,Math.max(1,parseInt(v,10)||fallback));
const like = value => `%${String(value).toLowerCase().replace(/[\\%_]/g,'\\$&')}%`;
const text = value => String(value||'').trim().slice(0,120);

export function documentTypes(can) { return definitions.filter(d=>canRead(d,can)).map(({type,label})=>({type,label})); }

export async function queryRetailDocuments(db, filters, can, {role='admin',userId=null}={}) {
  const page=bounded(filters.page,1,100000), size=bounded(filters.page_size,30,100);
  const args=[], sources=[];
  for (const d of definitions.filter(d=>canRead(d,can)&&(!filters.type||filters.type===d.type))) {
    const col = key => d[key] ? `d.${d[key]}` : N;
    const fields = { type:`'${d.type}'`,id:'d.id',number:d.number?col('number'):'CAST(d.id AS TEXT)', reference:col('reference'),occurred_at:'CAST(d.created_at AS TEXT)',
      status:col('status'), amount:d.costPermission&&!can(d.costPermission)?'CAST(NULL AS NUMERIC)':col('amount'),
      actor_id:col('actor'),customer_id:col('customer'),supplier_id:col('supplier'),business_day_id:col('day'),payment_method:col('method'),parent_id:col('parent') };
    const sourceArgs=[];
    const where=[d.where||'1=1'];
    if(d.type==='sale'&&role!=='admin') {where.push("(d.status<>'HELD' OR d.cashier_id=?)");sourceArgs.push(userId);}
    if(text(filters.payment_method)) {
      if(d.type==='sale') where.push('EXISTS (SELECT 1 FROM retail_sale_payments p WHERE p.retail_sale_id=d.id AND p.method=?)');
      else if(d.method) where.push(`d.${d.method}=?`);
      else continue;
      sourceArgs.push(text(filters.payment_method));
    }
    if(text(filters.serial)) {
      const serialTables={goods_receipt:['goods_receipt_line_serials','goods_receipt_line_id'],purchase_return:['purchase_return_line_serials','purchase_return_line_id'],transfer:['retail_transfer_line_serials','retail_transfer_line_id'],count:['retail_stock_count_line_serials','retail_stock_count_line_id']};
      if(d.type==='sale') {
        where.push("EXISTS (SELECT 1 FROM retail_sale_lines l WHERE l.retail_sale_id=d.id AND l.serial_numbers_json LIKE ? ESCAPE '\\')");
        sourceArgs.push(`%${JSON.stringify(text(filters.serial)).replace(/[\\%_]/g,'\\$&')}%`);
      } else if(serialTables[d.type]) {
        const [table,fk]=serialTables[d.type];
        where.push(`EXISTS (SELECT 1 FROM ${d.lines[0]} l JOIN ${table} sn ON sn.${fk}=l.id WHERE l.${d.lines[1]}=d.id AND sn.serial_number=?)`);
        sourceArgs.push(text(filters.serial));
      } else continue;
    }
    if(text(filters.batch)) {
      if(['sale','return'].includes(d.type)) {
        const prefix=d.type==='sale'?'retail_sale':'retail_return';
        where.push(`EXISTS (SELECT 1 FROM ${d.lines[0]} l JOIN ${prefix}_line_batches lb ON lb.${prefix}_line_id=l.id JOIN inventory_batches b ON b.id=lb.batch_id WHERE l.${d.lines[1]}=d.id AND b.batch_number=?)`);
      } else if(d.type==='goods_receipt') where.push('EXISTS (SELECT 1 FROM goods_receipt_lines l JOIN goods_receipt_line_batches b ON b.goods_receipt_line_id=l.id WHERE l.goods_receipt_id=d.id AND b.batch_number=?)');
      else if(['purchase_return','count','transfer'].includes(d.type)) where.push(`EXISTS (SELECT 1 FROM ${d.lines[0]} l JOIN inventory_batches b ON b.id=l.batch_id WHERE l.${d.lines[1]}=d.id AND b.batch_number=?)`);
      else if(d.type==='adjustment') where.push('EXISTS (SELECT 1 FROM inventory_batches b WHERE b.id=d.batch_id AND b.batch_number=?)');
      else continue;
      sourceArgs.push(text(filters.batch));
    }
    if (text(filters.product)) {
      const productMatch=`(lower(p.name) LIKE ? ESCAPE '\\' OR lower(v.sku) LIKE ? ESCAPE '\\' OR v.barcode=? OR EXISTS (SELECT 1 FROM product_barcodes pb WHERE (pb.variant_id=v.id OR pb.menu_item_id=p.id) AND pb.barcode=?))`;
      if(d.lines) where.push(`EXISTS (SELECT 1 FROM ${d.lines[0]} l JOIN menu_item_variants v ON v.id=l.variant_id JOIN menu_items p ON p.id=v.menu_item_id WHERE l.${d.lines[1]}=d.id AND ${productMatch})`);
      else if(d.variant) where.push(`EXISTS (SELECT 1 FROM menu_item_variants v JOIN menu_items p ON p.id=v.menu_item_id WHERE v.id=d.${d.variant} AND ${productMatch})`);
      else continue;
      sourceArgs.push(like(text(filters.product)),like(text(filters.product)),text(filters.product),text(filters.product));
    }
    args.push(...sourceArgs);
    sources.push(`SELECT ${Object.entries(fields).map(([k,v])=>`CAST(${v} AS ${k==='amount'?'NUMERIC':k==='id'||k.endsWith('_id')?'INTEGER':'TEXT'}) AS ${k}`).join(',')} FROM ${d.table} d WHERE ${where.join(' AND ')}`);
  }
  if(!sources.length) return {documents:[],pagination:{page,page_size:size,has_more:false},types:documentTypes(can)};
  const where=['1=1'];
  const q=text(filters.q);
  if(q) { where.push(`(lower(COALESCE(e.number,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(e.reference,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(c.name,'')) LIKE ? ESCAPE '\\' OR COALESCE(c.phone,'') LIKE ? ESCAPE '\\' OR lower(COALESCE(s.name,'')) LIKE ? ESCAPE '\\')`); args.push(...Array(5).fill(like(q))); }
  for(const key of ['id','status','actor_id','customer_id','supplier_id','business_day_id']) if(text(filters[key])) {
    if((key==='id'||key.endsWith('_id'))&&!/^[1-9]\d*$/.test(text(filters[key]))) throw Object.assign(new Error('Document, actor and business-day identifiers must be positive numbers.'),{status:400});
    where.push(`e.${key}=?`);args.push(text(filters[key]));
  }
  for(const [key,op] of [['min_amount','>='],['max_amount','<=']]) if(filters[key]!==undefined&&filters[key]!==''&&Number.isFinite(Number(filters[key]))) {where.push(`e.amount${op}?`);args.push(Number(filters[key]));}
  for(const [key,op,suffix] of [['from','>=',' 00:00:00'],['to','<=',' 23:59:59.999999']]) if(/^\d{4}-\d{2}-\d{2}$/.test(filters[key]||'')){where.push(`e.occurred_at${op}?`);args.push(filters[key]+suffix);}
  const rows=await db.all(`WITH documents AS (${sources.join(' UNION ALL ')}) SELECT e.*,c.name AS customer_name,c.phone AS customer_phone,s.name AS supplier_name,u.full_name AS actor
    FROM documents e LEFT JOIN customers c ON c.id=e.customer_id LEFT JOIN suppliers s ON s.id=e.supplier_id LEFT JOIN users u ON u.id=e.actor_id
    WHERE ${where.join(' AND ')} ORDER BY CASE WHEN e.number=? THEN 0 ELSE 1 END,e.occurred_at DESC,e.type,e.id DESC LIMIT ? OFFSET ?`,[...args,q,size+1,(page-1)*size]);
  return {documents:rows.slice(0,size).map(r=>{const d=definitions.find(d=>d.type===r.type);return {...r,occurred_at:db.driver==='postgres'?nepalWallClockTimestamp(r.occurred_at):r.occurred_at,key:`${r.type}:${r.id}`,label:d.label,href:d.href(r),amount:r.amount==null?null:Number(r.amount)};}),
    pagination:{page,page_size:size,has_more:rows.length>size},types:documentTypes(can),scope:'Recorded timestamp in Nepal time. Business-day filter includes only documents assigned to that day. Amount is blank where unavailable or restricted.'};
}
