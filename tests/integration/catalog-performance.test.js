import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from '../../lib/db/index.js';
import { resolveRetailPrices } from '../../lib/retail-pricing.js';
import { searchCommerce } from '../../lib/commerce-search.js';
const db=Database.getInstance();test.after(()=>db.close());
test('25,000-SKU catalog uses bounded lookup and batch price resolution',async()=>{
  const category=(await db.run("INSERT INTO product_categories(name) VALUES ('Scale catalog')")).lastInsertRowid;
  await db.run("INSERT INTO products(name,category_id,base_price,is_available) SELECT 'Scale product '||g,?,100,1 FROM generate_series(1,1000) g",[category]);
  await db.run("INSERT INTO product_variants(product_id,variant_name,sku,price,price_modifier,is_default) SELECT p.id,'Variant '||g,'SCALE-'||p.id||'-'||g,100,0,CASE WHEN g=1 THEN 1 ELSE 0 END FROM products p CROSS JOIN generate_series(1,25) g WHERE p.category_id=?",[category]);
  // Fresh bulk-loaded fixtures need planner statistics, as production autovacuum provides.
  await db.run('ANALYZE products');await db.run('ANALYZE product_variants');await db.run('ANALYZE product_categories');
  const ids=(await db.all('SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.category_id=? ORDER BY v.id LIMIT 200',[category])).map(row=>Number(row.id));
  let queries=0;const measured={driver:'postgres',all:async(...args)=>{queries++;return db.all(...args);},get:async(...args)=>{queries++;return db.get(...args);}};
  const start=performance.now(),prices=await resolveRetailPrices(measured,ids.map(id=>({variant_id:id,quantity:3}))),pricingMs=performance.now()-start;
  assert.equal(prices.length,200);assert.equal(queries,2);assert.ok(prices.every(row=>row.unit_price===100));
  const timings=[];const searchDb={driver:db.driver,...Object.fromEntries(['all','get','run'].map(key=>[key,async(...args)=>{const t=performance.now();const value=await db[key](...args);timings.push({sql:args[0].slice(0,160),ms:Math.round(performance.now()-t)});return value;}]))};
  const lookupStart=performance.now(),search=await searchCommerce(searchDb,{query:'Scale product',group:'products',limit:40,can:()=>true}),lookupMs=performance.now()-lookupStart;
  assert.equal(search.groups[0].results.length,40);assert.equal(search.groups[0].has_more,true);
  const warmStart=performance.now();await searchCommerce(db,{query:'Scale product',group:'products',limit:40,can:()=>true});const warmMs=performance.now()-warmStart;
  const result={slow_queries:timings.filter(q=>q.ms>100),warm_search_ms:Math.round(warmMs),catalog_skus:25000,quote_lines:200,pricing_queries:queries,pricing_ms:Math.round(pricingMs),search_limit:40,search_ms:Math.round(lookupMs)};
  fs.mkdirSync('.commerce-tmp/phase2a',{recursive:true});fs.writeFileSync('.commerce-tmp/phase2a/performance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
});
