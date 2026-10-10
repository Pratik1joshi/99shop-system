// Synthetic analytics scale test. The entire fixture is rolled back; it is not accounting evidence.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import Database from '../lib/db/index.js';
import {skuOperations} from '../lib/retail-operations.js';
const url=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/phase2d_browser_'))throw new Error('Use only the disposable Phase 2D browser database');
const db=Database.getInstance(),fixture=JSON.parse(fs.readFileSync('.commerce-tmp/phase2d/browser-fixture.json','utf8'));let evidence;
try{await db.transaction(async tx=>{
  await tx.run(`INSERT INTO menu_item_variants(menu_item_id,variant_name,sku,price) SELECT (SELECT menu_item_id FROM menu_item_variants WHERE id=?),'Scale '||n,'P2D-SCALE-'||n,100 FROM generate_series(1,25000) n RETURNING id`,[fixture.sku]);
  await tx.run(`INSERT INTO retail_sales(sale_number,status,completed_at) SELECT 'SCALE2D-'||n,'COMPLETED',CURRENT_DATE - ((n%90)+1)*INTERVAL '1 day' FROM generate_series(1,100000) n RETURNING id`);
  await tx.run(`INSERT INTO retail_sale_lines(retail_sale_id,variant_id,product_name_snapshot,quantity,unit_price,net_amount,total_cost) SELECT id,?,'Synthetic demand',1,100,100,50 FROM retail_sales WHERE sale_number LIKE 'SCALE2D-%' RETURNING id`,[fixture.sku]);
  await tx.run("UPDATE inventory_movements SET created_at=CURRENT_DATE-INTERVAL '180 days' WHERE variant_id=? AND movement_type='PURCHASE_RECEIPT'",[fixture.sku]);
  const started=performance.now(),result=await skuOperations(tx,fixture.sku),elapsed=performance.now()-started;
  assert.ok(result.forecast.expected>0);assert.ok(result.forecast.backtest);assert.equal(result.history.length,180);
  const repeated=await skuOperations(tx,fixture.sku);assert.equal(repeated.snapshot_id,result.snapshot_id);
  evidence={synthetic_skus:25000,synthetic_posted_sales:100000,history_days:180,elapsed_ms:Math.round(elapsed),snapshot_reproducible:true,method:result.forecast.method,backtest:result.forecast.backtest,fixture:'rolled back; no accounting assertion on synthetic rows'};
  throw new Error('ROLLBACK_SCALE_FIXTURE');
});}catch(e){if(e.message!=='ROLLBACK_SCALE_FIXTURE')throw e;}finally{await db.close();}
fs.writeFileSync('.commerce-tmp/phase2d/performance.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
