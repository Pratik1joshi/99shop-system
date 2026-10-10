/** Synthetic scale fixture: isolated from browser economics and never production. */
import pg from 'pg';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const url = new URL(process.env.TEST_DATABASE_URL || '');
if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw new Error('Isolated localhost TEST_DATABASE_URL required.');
fs.mkdirSync('.commerce-tmp/phase1g', { recursive: true });
const admin = new pg.Client({ connectionString: url.href });
await admin.connect();
const name = `phase1g_perf_${Date.now()}_${process.pid}`;
const target = new URL(url); target.pathname = `/${name}`;
let db;
const report = { fixture: { skus: 25000, movements: 1000000, customers: 25000, sales: 100000, loyalty_events: 100000, customer_audit_events: 100000 }, samples: 7, results: [] };
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  process.env.DATABASE_URL = target.href;
  const migrated = spawnSync(process.execPath,['scripts/migrate.mjs'],{env:process.env,stdio:'inherit'});
  if (migrated.status !== 0) throw new Error('Performance database migration failed.');
  const { default: Database } = await import('../lib/db/index.js');
  db = Database.getInstance();
  await db.run("INSERT INTO product_categories(name) VALUES ('Performance')");
  await db.run("INSERT INTO products(name,base_price,is_available,category_id) SELECT 'Performance product '||n,100,1,(SELECT id FROM product_categories LIMIT 1) FROM generate_series(1,25000) n");
  await db.run("INSERT INTO product_variants(product_id,variant_name,price,is_default,sku,barcode,tracking_mode) SELECT id,'Standard',100,1,'PERF-'||id,'PERF-BAR-'||id,'none' FROM products");
  const location = (await db.get("SELECT id FROM inventory_locations WHERE is_sellable=1 ORDER BY id LIMIT 1")).id;
  await db.run(`INSERT INTO inventory_movements(variant_id,location_id,movement_type,quantity,balance_after,unit_cost,total_cost,reference_type,reference_id)
    SELECT 1+(n-1)%25000,?,'OPENING_STOCK',1,1+(n-1)/25000,40,40,'performance',n FROM generate_series(1,1000000) n`,[location]);
  await db.run(`INSERT INTO inventory_balances(variant_id,location_id,quantity_on_hand) SELECT id,?,40 FROM product_variants`,[location]);
  await db.run("INSERT INTO customers(name,phone) SELECT 'Performance customer '||n,'98'||lpad(n::text,8,'0') FROM generate_series(1,25000) n");
  await db.run(`INSERT INTO retail_sales(sale_number,customer_id,status,subtotal,grand_total,amount_paid,cogs_total,completed_at)
    SELECT 'PERF-SALE-'||n,1+(n-1)%25000,'COMPLETED',100,100,100,40,CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu' FROM generate_series(1,100000) n`);
  await db.run("INSERT INTO loyalty_transactions(customer_id,type,points,balance_after,source_type,source_id) SELECT 1,'EARN',1,n,'retail_sale',n FROM generate_series(1,100000) n");
  await db.run("INSERT INTO customer_master_audit(customer_id,action,before_json,after_json,reason) SELECT 1,'UPDATED','{}','{}','Scale query fixture '||n FROM generate_series(1,100000) n");
  await db.run('ANALYZE');
  const { queryRetailMovements } = await import('../lib/retail-movement-query.js');
  const { queryRetailStock } = await import('../lib/retail-stock-query.js');
  const { searchCommerce } = await import('../lib/commerce-search.js');
  const { getCustomerTimeline } = await import('../lib/retail-customer-timeline.js');
  const { queryRetailDocuments } = await import('../lib/retail-document-query.js');
  const { queryBusinessAudit } = await import('../lib/business-audit-query.js');
  const measure = async (name, run) => {
    const samples=[];
    for(let i=0;i<7;i++) { const start=performance.now(); await run(); samples.push(Math.round((performance.now()-start)*100)/100); }
    report.results.push({ name, samples_ms:samples, median_ms:[...samples].sort((a,b)=>a-b)[3] });
  };
  await measure('movement_first_page',()=>queryRetailMovements(db,{pageSize:40}));
  await measure('movement_sku_search',()=>queryRetailMovements(db,{query:'PERF-5000',pageSize:40}));
  await measure('stock_search',()=>queryRetailStock(db,{query:'PERF-5000',pageSize:40}));
  await measure('exact_barcode',()=>searchCommerce(db,{query:'PERF-BAR-5000',group:'products',can:()=>true}));
  await measure('customer_timeline_100k_events',()=>getCustomerTimeline(db,1));
  await measure('transaction_explorer_first_page',()=>queryRetailDocuments(db,{},()=>true));
  await measure('transaction_explorer_exact_sale',()=>queryRetailDocuments(db,{q:'PERF-SALE-50000'},()=>true));
  await measure('audit_first_page_100k',()=>queryBusinessAudit(db,{}, {owner:true}));
  await measure('audit_search_100k',()=>queryBusinessAudit(db,{q:'fixture 50000'}, {owner:true}));
  fs.writeFileSync('.commerce-tmp/phase1g/performance.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {
  if(db) await db.close();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}
