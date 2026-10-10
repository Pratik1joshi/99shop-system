import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '../../lib/db/index.js';
import { ensureStandardVariant } from '../../lib/product-variants.js';
import { resolveRetailPrices } from '../../lib/retail-pricing.js';
import { savePriceList,saveCustomerGroup,assignCustomerGroup } from '../../lib/retail-price-management.js';
import { quoteRetailSale,holdSale,checkoutSale } from '../../lib/retail-sales.js';
import { saveMarginPolicy,checkRetailMargins } from '../../lib/retail-margin-policy.js';
import { ensureAccountingSchema } from '../../lib/accounting.js';
import { openBusinessDay } from '../../lib/business-days.js';
import { getNepaliDateString } from '../../lib/time-utils.js';
import { getDefaultLocation } from '../../lib/retail-inventory.js';
import { createGoodsReceipt,postGoodsReceipt } from '../../lib/retail-purchasing.js';
import { createReturn,postReturn } from '../../lib/retail-returns.js';
import { runRetailReconciliation } from '../../lib/retail-reconciliation.js';
import { previewMassPrices,applyMassPrices } from '../../lib/retail-mass-pricing.js';
const db=Database.getInstance();
test.after(()=>db.close());
test('Canonical pricing precedence and safe POS economics',async t=>{
  await ensureAccountingSchema(db);
  const day=await openBusinessDay(db,{business_date:getNepaliDateString(),opening_cash:0},{id:1,role:'admin',full_name:'Pricing test'});
  const category=(await db.run("INSERT INTO product_categories(name) VALUES ('Price tests')")).lastInsertRowid;
  const product=(await db.run("INSERT INTO products(name,category_id,base_price,is_available) VALUES ('Lip price',?,100,1)",[category])).lastInsertRowid;
  const [variant]=await ensureStandardVariant(db,product,{price:100});
  const location=await getDefaultLocation(db),supplier=(await db.run("INSERT INTO suppliers(name,normalized_name) VALUES ('Pricing supplier','pricing supplier')")).lastInsertRowid;
  const receipt=await createGoodsReceipt(db,{supplierId:supplier,locationId:location.id,paymentMethod:'credit',invoiceNumber:'PRICING-RECEIPT',lines:[{variantId:variant.id,quantityReceived:10,unitCost:70}]});
  await postGoodsReceipt(db,receipt.id,{postedBy:1,businessDayId:day.id});
  await db.run('UPDATE product_variants SET wholesale_price=80,wholesale_min_quantity=3 WHERE id=?',[variant.id]);
  const customer=(await db.run("INSERT INTO customers(name,phone) VALUES ('Wholesale test','9800009911')")).lastInsertRowid;
  const group=await saveCustomerGroup(db,{name:'Trade',code:'TRADE',pricing_mode:'wholesale',reason:'Wholesale test'},1);
  await assignCustomerGroup(db,{customer_id:customer,group_id:group.id,reason:'Verified trader'},1);
  const lines=[{variant_id:variant.id,quantity:1,unit_price:0.01}];
  const price=async (context={},rows=lines)=>(await resolveRetailPrices(db,rows,context))[0];
  await t.test('Client price ignored, wholesale quantity aggregates across split lines',async()=>{
    assert.equal((await price()).unit_price,100);
    assert.equal((await price({customerId:customer})).unit_price,100);
    assert.equal((await price({customerId:customer},[...lines,{...lines[0],quantity:2}])).unit_price,80);
    assert.equal(Number((await holdSale(db,{lines,cashierId:1})).lines[0].unit_price),100);
  });
  let general;
  await t.test('Scheduled product rule and SKU quantity tier resolve deterministically',async()=>{
    general=await savePriceList(db,{name:'Autumn',code:'AUTUMN',priority:10,starts_at:'2099-10-01T00:00:00Z',ends_at:'2099-11-01T00:00:00Z',reason:'October pricing',items:[
      {product_id:product,fixed_price:95},{variant_id:variant.id,fixed_price:90},{variant_id:variant.id,min_quantity:5,fixed_price:85},
    ]},1);
    assert.equal((await price({at:'2099-09-30T23:59:59Z'})).unit_price,100);
    assert.equal((await price({at:'2099-10-01T00:00:00Z'})).unit_price,90);
    assert.equal((await price({at:'2099-10-15'},[{...lines[0],quantity:5}])).unit_price,85);
    assert.equal((await price({at:'2099-11-01T00:00:00Z'})).unit_price,100);
  });
  await t.test('Channel and customer restrictions, percentages, priority, inactive lists',async()=>{
    const list=await savePriceList(db,{name:'Trade online',code:'TRADE-ONLINE',customer_group_id:group.id,channel:'online',priority:20,reason:'Trade online policy',items:[{variant_id:variant.id,adjustment_percent:-10}]},1);
    assert.equal((await price({customerId:customer,channel:'online',at:'2099-10-15'},[{...lines[0],quantity:3}])).unit_price,72);
    assert.equal((await price({customerId:customer,at:'2099-10-15'})).unit_price,90);
    assert.equal((await price({channel:'online',at:'2099-10-15'})).unit_price,90);
    await savePriceList(db,{...list,name:'Trade online',code:'TRADE-ONLINE',active:false,reason:'End trade offer',items:[{variant_id:variant.id,fixed_price:1}]},1);
    assert.equal((await price({channel:'online',at:'2099-10-15'})).unit_price,90);
  });
  await t.test('Validation failures preserve prior rules and audit history',async()=>{
    const before=await db.all('SELECT * FROM retail_price_list_items WHERE price_list_id=?',[general.id]);
    await assert.rejects(savePriceList(db,{id:general.id,name:'Invalid',code:'AUTUMN',reason:'Bad rule',items:[{variant_id:999999999,fixed_price:1}]},1));
    assert.deepEqual(await db.all('SELECT * FROM retail_price_list_items WHERE price_list_id=?',[general.id]),before);
    await assert.rejects(savePriceList(db,{name:'Invalid',code:'BAD',reason:'Bad rule',items:[{variant_id:variant.id,fixed_price:1,adjustment_percent:2}]},1));
    const audit=await db.all('SELECT * FROM retail_price_audit ORDER BY id');
    assert.equal(audit.length,5);
    assert.equal(audit[4].action,'PRICE_LIST');
    assert.ok(JSON.parse(audit[4].before_json).items.length);
  });
  await t.test('POS per-line override preserves other resolved customer prices',async()=>{
    const quote=await quoteRetailSale(db,{customer_id:customer,lines:[{...lines[0],quantity:2,price_overridden:false},{...lines[0],quantity:1,unit_price:70,price_overridden:true}]},{allowPriceOverride:true});
    assert.equal(quote.pricing[0].unit_price,80);
    assert.equal(quote.pricing[1].unit_price,70);
    assert.equal(quote.subtotal,230);
    const safe=await quoteRetailSale(db,{customer_id:customer,lines:[{...lines[0],quantity:3,unit_price:1,price_overridden:true}]},{allowPriceOverride:false});
    assert.equal(safe.subtotal,240);
    assert.ok(!JSON.stringify(safe.pricing).includes('cost'));
  });
  await t.test('Margin protection includes final discounts without exposing cost',async()=>{
    await saveMarginPolicy(db,{mode:'manager',minimum_percent:20,reason:'Protect contribution'},1);
    const line={variant_id:variant.id,quantity:1,net_amount:100};
    assert.deepEqual(await checkRetailMargins(db,[line]),[]);
    await assert.rejects(checkRetailMargins(db,[line],{discount:20,enforce:true}),/Manager price authorization/);
    const warnings=await checkRetailMargins(db,[line],{discount:20,managerAuthorized:true,enforce:true});
    assert.equal(warnings.length,1);assert.equal(warnings[0].requires_manager,false);
    assert.ok(!JSON.stringify(warnings).includes('70'));
    await saveMarginPolicy(db,{mode:'off',minimum_percent:0,reason:'Restore test policy'},1);
  });
  await t.test('Wholesale checkout and original-value return survive later price changes',async()=>{
    const saleLines=[{variant_id:variant.id,quantity:3}];
    const held=await holdSale(db,{lines:saleLines,customerId:customer,cashierId:1});
    // Resuming a held sale retains its server-owned customer context.
    const sale=await checkoutSale(db,held.id,{lines:saleLines,cashierId:1,payments:[{method:'cash',amount:Number(held.grand_total),cash_tendered:Number(held.grand_total)}],idempotencyKey:'WHOLESALE-SALE'});
    assert.equal(Number(sale.lines[0].unit_price),80);
    await db.run('UPDATE product_variants SET price=150,wholesale_price=120 WHERE id=?',[variant.id]);
    const returned=await createReturn(db,{originalSaleId:sale.id,cashierId:1,lines:[{originalSaleLineId:sale.lines[0].id,quantity:3,condition:'UNOPENED',disposition:'RETURN_TO_SELLABLE'}]});
    await postReturn(db,returned.id,{postedBy:1,refundMethod:'cash',idempotencyKey:'WHOLESALE-RETURN'});
    assert.equal(Number((await db.get('SELECT carrying_value FROM inventory_costs WHERE variant_id=?',[variant.id])).carrying_value),700);
    assert.equal((await runRetailReconciliation(db)).reconciled,true);
  });
  await t.test('Cross-product mass prices preview changes, hide margins and replay safely',async()=>{
    const other=(await db.run("INSERT INTO products(name,category_id,base_price,is_available) VALUES ('Second price product',?,200,1)",[category])).lastInsertRowid;
    const [second]=await ensureStandardVariant(db,other,{price:200});
    const preview=await previewMassPrices(db,{category_id:category,mode:'percent',amount:5,round_to:0.5,reason:'Five percent category review'},1);
    assert.equal(preview.rows.length,2);assert.equal(preview.rows[0].price,157.5);assert.equal(preview.rows[1].price,210);
    assert.ok(!('before_margin' in preview.rows[0]));
    const result=await applyMassPrices(db,{job_id:preview.id},1);assert.equal(result.count,2);assert.deepEqual(await applyMassPrices(db,{job_id:preview.id},1),result);
    const stale=await previewMassPrices(db,{ids:[second.id],mode:'fixed',amount:250,reason:'Stale price'},1);
    await db.run('UPDATE product_variants SET price=211 WHERE id=?',[second.id]);
    await assert.rejects(applyMassPrices(db,{job_id:stale.id},1),/changed after preview/);
    assert.equal((await runRetailReconciliation(db)).reconciled,true);
  });
});
