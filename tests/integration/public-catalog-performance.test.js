import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from '../../lib/db/index.js';
import {publicCatalog,publicProduct,quoteOnlineCart} from '../../lib/retail-storefront.js';
import {listOnlineOrders} from '../../lib/retail-online-orders.js';
const db=Database.getInstance();test.after(()=>db.close());
test('25,000 public SKUs: bounded catalog, search, filters, detail and cart pricing',async()=>{
  await db.run('UPDATE retail_online_settings SET enabled=1 WHERE id=1');
  const category=(await db.run("INSERT INTO menu_categories(name,online_enabled) VALUES ('Scale beauty',1)")).lastInsertRowid;
  await db.run("INSERT INTO menu_items(name,brand,category_id,base_price,is_available,online_enabled,online_slug) SELECT 'Public product '||g,'Scale',?,100,1,1,'public-product-'||g FROM generate_series(1,1000) g",[category]);
  await db.run("INSERT INTO menu_item_variants(menu_item_id,variant_name,sku,price,price_modifier,is_default) SELECT p.id,'Shade '||g,'PUBLIC-'||p.id||'-'||g,100,0,CASE WHEN g=1 THEN 1 ELSE 0 END FROM menu_items p CROSS JOIN generate_series(1,25) g WHERE p.category_id=?",[category]);
  const attribute=(await db.run("INSERT INTO product_attributes(name,online_filter) VALUES ('Finish',1)")).lastInsertRowid;
  const value=(await db.run("INSERT INTO product_attribute_values(attribute_id,value) VALUES (?,'Matte')",[attribute])).lastInsertRowid;
  await db.run('INSERT INTO variant_attribute_values(variant_id,attribute_id,attribute_value_id) SELECT id,?,? FROM menu_item_variants WHERE sku LIKE ?',[attribute,value,'PUBLIC-%']);
  for(const table of ['menu_items','menu_item_variants','menu_categories','variant_attribute_values','product_attribute_values'])await db.run('ANALYZE '+table);
  const timings={},measure=async(name,work)=>{const start=performance.now();const result=await work();timings[name]=Math.round(performance.now()-start);return result;};
  for(const [name,filters] of Object.entries({catalog:{},search:{query:'Public product'},category:{category},brand:{brand:'Scale'},attribute:{attributes:String(value)},price_range:{min_price:80,max_price:110,sort:'price_asc'}})){
    const catalog=await measure(name,()=>publicCatalog(db,filters));assert.equal(catalog.products.length,24);assert.equal(catalog.has_more,true);assert.ok(catalog.facets.length<=240);
  }
  const product=await measure('detail',()=>publicProduct(db,'public-product-1'));assert.equal(product.variants.length,25);
  const quote=await measure('cart_quote',()=>quoteOnlineCart(db,{lines:product.variants.map(v=>({variant_id:v.id,quantity:1}))}));assert.equal(quote.lines.length,25);assert.equal(quote.total,2500);
  await db.run("INSERT INTO retail_online_orders(order_number,source,status,owner_hash,customer_name,total) SELECT 'PERF-'||g,'WEBSITE','CANCELLED','scale-owner','Scale shopper',100 FROM generate_series(1,2000) g");
  await db.run('ANALYZE retail_online_orders');
  assert.equal((await measure('order_queue',()=>listOnlineOrders(db))).length,50);
  const history=await measure('customer_history',()=>db.all('SELECT id,order_number,total FROM retail_online_orders WHERE owner_hash=? ORDER BY id DESC LIMIT 50',['scale-owner']));assert.equal(history.length,50);
  const large=(await db.run("INSERT INTO menu_items(name,category_id,base_price,is_available,online_enabled,online_slug) VALUES ('High variant product',?,100,1,1,'high-variant-product')",[category])).lastInsertRowid;
  await db.run("INSERT INTO menu_item_variants(menu_item_id,variant_name,sku,price) SELECT ?,'Option '||g,'LARGE-'||g,100 FROM generate_series(1,1000) g",[large]);
  const first=await measure('large_product_first_page',()=>publicProduct(db,'high-variant-product')),last=await measure('large_product_last_page',()=>publicProduct(db,'high-variant-product',{page:10}));
  assert.equal(first.variants.length,100);assert.equal(first.has_more,true);assert.equal(last.variants.length,100);assert.equal(last.has_more,false);assert.notEqual(first.variants[0].id,last.variants[0].id);
  const plan=await db.all("EXPLAIN (ANALYZE,FORMAT JSON) SELECT p.id,v.id FROM menu_items p JOIN menu_item_variants v ON v.id=(SELECT sv.id FROM menu_item_variants sv WHERE sv.menu_item_id=p.id AND sv.merchandising_active=1 ORDER BY sv.is_default DESC,sv.id LIMIT 1) WHERE COALESCE(p.online_category_id,p.category_id)=? AND p.online_enabled=1 AND p.is_available=1 ORDER BY p.featured DESC,p.online_sort,p.id DESC LIMIT 25",[category]);
  fs.mkdirSync('.commerce-tmp/phase2b',{recursive:true});fs.writeFileSync('.commerce-tmp/phase2b/performance-plan.json',JSON.stringify(plan,null,2));
  fs.writeFileSync('.commerce-tmp/phase2b/performance.json',JSON.stringify({skus:26000,products:1001,high_variant_skus:1000,local_ms:timings,history_fixture:'2,000 synthetic cancelled orders; no economic postings',note:'Representative local timings, not a production SLA'},null,2));
});
