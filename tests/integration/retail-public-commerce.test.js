import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Database from '../../lib/db/index.js';
import { ensureAccountingSchema } from '../../lib/accounting.js';
import { openBusinessDay } from '../../lib/business-days.js';
import { getNepaliDateString } from '../../lib/time-utils.js';
import { ensureStandardVariant } from '../../lib/product-variants.js';
import { getDefaultLocation } from '../../lib/retail-inventory.js';
import { createGoodsReceipt,postGoodsReceipt } from '../../lib/retail-purchasing.js';
import { publicCatalog,publicProduct,quoteOnlineCart,availableOnline } from '../../lib/retail-storefront.js';
import { placePublicOrder as submitPublicOrder,publicOrder,cancelPublicOrder,repricePublicOrder } from '../../lib/retail-public-orders.js';
import { ensureAttribute,ensureAttributeValue,setVariantAttributes } from '../../lib/product-catalog.js';
import { retailChannelReport } from '../../lib/retail-analytics.js';
import { publishOnlineProducts } from '../../lib/retail-online-publishing.js';
import { fulfillOrder,updateOnlineOrderStatus,cancelOnlineOrder } from '../../lib/retail-online-orders.js';
import { holdSale,checkoutSale } from '../../lib/retail-sales.js';
import { createReturn,postReturn } from '../../lib/retail-returns.js';
import { createCustomerInvite,customerSession,storeIdentity,rateLimitStore,assertStoreOrigin } from '../../lib/retail-public-security.js';
import { savePriceList,saveCustomerGroup,assignCustomerGroup } from '../../lib/retail-price-management.js';
import { runRetailReconciliation } from '../../lib/retail-reconciliation.js';
const placePublicOrder=async(db,input,identity)=>submitPublicOrder(db,{...input,quote_token:(await quoteOnlineCart(db,input,identity)).quote_token},identity);
const db=Database.getInstance();test.after(()=>db.close());
test('Public commerce shares pricing, inventory and canonical posting',async t=>{
  await ensureAccountingSchema(db);const day=await openBusinessDay(db,{business_date:getNepaliDateString(),opening_cash:10000},{id:1,role:'admin',full_name:'Online test'});
  await db.run("UPDATE retail_online_settings SET enabled=1,delivery_enabled=1,delivery_fee=25,manual_payment_enabled=1 WHERE id=1");
  const category=(await db.run("INSERT INTO product_categories(name,online_enabled) VALUES ('Public cosmetics',1)")).lastInsertRowid;
  const supplier=(await db.run("INSERT INTO suppliers(name,normalized_name) VALUES ('Online supplier','online supplier')")).lastInsertRowid;
  const loc=await getDefaultLocation(db);
  const make=async(name,qty=4,tracking=false)=>{const serial=tracking===true;const product=(await db.run('INSERT INTO products(name,category_id,base_price,is_available,online_enabled,online_slug) VALUES (?,?,100,1,1,?)',[name,category,randomUUID()])).lastInsertRowid;
    const [v]=await ensureStandardVariant(db,product,{price:100});if(serial||tracking==='batch')await db.run('UPDATE product_variants SET tracking_mode=? WHERE id=?',[serial?'serial':'batch',v.id]);
    const serialNumbers=serial?Array.from({length:qty},(_,i)=>`${name}-${i}`):undefined;
    const receipt=await createGoodsReceipt(db,{supplierId:supplier,locationId:loc.id,paymentMethod:'credit',invoiceNumber:randomUUID(),lines:[{variantId:v.id,quantityReceived:qty,unitCost:33.33,serialNumbers,...(tracking==='batch'?{batches:[{batchNumber:'WEB-LATE',expiryDate:'2099-12-31',quantity:qty}]}:{})}]});await postGoodsReceipt(db,receipt.id,{postedBy:1,businessDayId:day.id});return {id:v.id,product,serialNumbers};};
  const fixture=await make('Ruby matte',10),owner={ownerHash:'owner-a',customerId:null};
  const input=(id,extra={})=>({lines:[{variant_id:id,quantity:1,unit_price:0.01}],customer_name:'Guest Shopper',customer_phone:'9801234567',fulfillment_type:'PICKUP',payment_method:'cash',idempotency_key:randomUUID(),...extra});
  await t.test('Public projections exclude costs/suppliers and unpublished products',async()=>{
    const catalog=await publicCatalog(db);assert.equal(catalog.products.length,1);assert.ok(!/purchase_cost|supplier|average_cost|unit_cost|carrying_value/.test(JSON.stringify(catalog)));
    const product=await publicProduct(db,fixture.product);assert.equal(product.variants[0].available,10);assert.equal(product.variants[0].price.unit_price,100);
    await db.run('UPDATE products SET online_enabled=0 WHERE id=?',[fixture.product]);await assert.rejects(quoteOnlineCart(db,input(fixture.id)),/no longer available/);await db.run('UPDATE products SET online_enabled=1 WHERE id=?',[fixture.product]);
  });
  await t.test('Online lists resolve server-side, tampering and invalid quantities cannot alter economics',async()=>{
    const list=await savePriceList(db,{name:'Web price',code:'WEB-TEST',channel:'online',reason:'Online launch',items:[{variant_id:fixture.id,fixed_price:90}]},1);
    const q=await quoteOnlineCart(db,input(fixture.id));assert.equal(q.total,90);assert.equal(q.lines[0].price.unit_price,90);
    await assert.rejects(quoteOnlineCart(db,input(fixture.id,{lines:[{variant_id:fixture.id,quantity:NaN}]})),/quantity/);
    await db.run('UPDATE retail_price_lists SET active=0 WHERE id=?',[list.id]);
  });
  await t.test('Only configured generic facets filter exact SKU combinations and remain bounded',async()=>{
    const attr=await ensureAttribute(db,'Finish');const value=await ensureAttributeValue(db,attr.id,'Matte');
    await setVariantAttributes(db,fixture.id,{Finish:'Matte'});
    assert.equal((await publicCatalog(db,{attributes:String(value.id)})).products.length,0);
    await db.run('UPDATE product_attributes SET online_filter=1 WHERE id=?',[attr.id]);
    const filtered=await publicCatalog(db,{attributes:String(value.id),query:'matte'});assert.equal(filtered.products.length,1);assert.equal(filtered.facets[0].value,'Matte');
    await assert.rejects(publicCatalog(db,{attributes:'1,2,3,4,5,6,7'}),/six/);
    const p=await publicProduct(db,fixture.product),q=await quoteOnlineCart(db,input(fixture.id));
    assert.ok(!/price_rule_id|price_list_id|margin_warnings|base_price/.test(JSON.stringify({p,q})));
    assert.equal((await publicCatalog(db,{min_price:101})).products.length,0);
    assert.equal((await publicCatalog(db,{max_price:100,sort:'price_asc',availability:'in_stock'})).products.length,1);
  });
  await t.test('Bulk publication is explicit, audited and cannot publish archived products',async()=>{
    await publishOnlineProducts(db,{product_ids:[fixture.product],operation:'disable',reason:'Test hidden assortment'},1);
    await assert.rejects(publicProduct(db,fixture.product),/not found/);
    assert.equal((await publicProduct(db,fixture.product,{preview:true})).title,'Ruby matte');
    await db.run('UPDATE products SET is_available=0 WHERE id=?',[fixture.product]);
    await assert.rejects(publishOnlineProducts(db,{product_ids:[fixture.product],operation:'enable',reason:'Reject archive'},1),/Archived/);
    await db.run('UPDATE products SET is_available=1 WHERE id=?',[fixture.product]);
    await publishOnlineProducts(db,{product_ids:[fixture.product],operation:'enable',reason:'Publish deliberate selection'},1);
  });
  await t.test('Checkout requires acknowledgement of changed prices and ignores payment/customer authority',async()=>{
    const request=input(fixture.id,{paymentStatus:'PAID',payment_status:'PAID',customer_id:1,total:0.01});
    const quote=await quoteOnlineCart(db,request);
    await db.run('UPDATE product_variants SET price=105 WHERE id=?',[fixture.id]);
    await assert.rejects(submitPublicOrder(db,{...request,quote_token:quote.quote_token},owner),/changed/);
    assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM retail_online_orders')).n),0);
    const order=await placePublicOrder(db,request,owner);assert.equal(order.payment_status,'UNPAID');assert.equal(Number(order.total),105);
    assert.equal((await db.get('SELECT customer_id FROM retail_online_orders WHERE id=?',[order.id])).customer_id,null);
    await cancelPublicOrder(db,order.id,owner);await db.run('UPDATE product_variants SET price=100 WHERE id=?',[fixture.id]);
  });
  let order;
  await t.test('Place/retry reserves once, creates no sale/movement, and enforces ownership',async()=>{
    const request=input(fixture.id),before=await db.get('SELECT COUNT(*) AS n FROM inventory_movements');
    const results=await Promise.all([placePublicOrder(db,request,owner),placePublicOrder(db,request,owner)]);order=results[0];assert.equal(order.id,results[1].id);assert.equal(order.payment_status,'UNPAID');
    assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM inventory_movements')).n),Number(before.n));assert.equal((await availableOnline(db,[fixture.id],loc.id))[fixture.id],9);
    await assert.rejects(publicOrder(db,order.id,{ownerHash:'someone-else'}),/not found/);
    await assert.rejects(placePublicOrder(db,{...request,lines:[{variant_id:fixture.id,quantity:2}]},owner),/different order/);
  });
  await t.test('Verified fulfillment/replay creates exactly one sale, journal and inventory issue',async()=>{
    await assert.rejects(fulfillOrder(db,order.id,{cashierId:1}),/payment collection/);
    await updateOnlineOrderStatus(db,order.id,'PROCESSING');await updateOnlineOrderStatus(db,order.id,'READY');
    const sales=await Promise.all([fulfillOrder(db,order.id,{cashierId:1,paymentVerified:true}),fulfillOrder(db,order.id,{cashierId:1,paymentVerified:true})]);
    assert.equal(sales[0].id,sales[1].id);assert.equal(sales[0].channel,'online');assert.equal(Number(sales[0].grand_total),100);
    assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM journal_entries WHERE source_type='retail_sale' AND source_id=?",[sales[0].id])).n),1);
    assert.equal((await publicOrder(db,order.id,owner)).status,'DELIVERED');await assert.rejects(cancelOnlineOrder(db,order.id),/return workflow/);
    const ret=await createReturn(db,{originalSaleId:sales[0].id,cashierId:1,lines:[{originalSaleLineId:sales[0].lines[0].id,quantity:1,condition:'UNOPENED',disposition:'RETURN_TO_SELLABLE'}]});await postReturn(db,ret.id,{postedBy:1,refundMethod:'cash',idempotencyKey:'ONLINE-RETURN'});
    assert.equal(Number((await db.get('SELECT carrying_value FROM inventory_costs WHERE variant_id=?',[fixture.id])).carrying_value),333.3);
  });
  await t.test('Cancellation and expiry release ATS without physical movements',async()=>{
    const cancelled=await placePublicOrder(db,input(fixture.id),owner);await cancelPublicOrder(db,cancelled.id,owner);await cancelPublicOrder(db,cancelled.id,owner);assert.equal((await availableOnline(db,[fixture.id],loc.id))[fixture.id],10);
    const expired=await placePublicOrder(db,input(fixture.id),owner);await db.run("UPDATE inventory_reservations SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE source_type='retail_online_order' AND source_id=?",[expired.id]);await db.run("UPDATE retail_online_orders SET reservation_expires_at=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE id=?",[expired.id]);
    assert.equal((await availableOnline(db,[fixture.id],loc.id))[fixture.id],10);assert.equal((await publicOrder(db,expired.id,owner)).status,'EXPIRED');await assert.rejects(fulfillOrder(db,expired.id,{cashierId:1,paymentVerified:true}),/expired/);
  });
  await t.test('Two online customers racing for the last unit produce one reservation',async()=>{
    const v=await make('Last online',1);const results=await Promise.allSettled([placePublicOrder(db,input(v.id),{ownerHash:'race-a'}),placePublicOrder(db,input(v.id),{ownerHash:'race-b'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await availableOnline(db,[v.id],loc.id))[v.id],0);
  });
  await t.test('POS versus online last unit serializes at the shared stock lock',async()=>{
    const v=await make('Last POS',1),held=await holdSale(db,{lines:[{variant_id:v.id,quantity:1}],cashierId:1});
    const results=await Promise.allSettled([placePublicOrder(db,input(v.id),{ownerHash:'pos-race'}),checkoutSale(db,held.id,{cashierId:1,payments:[{method:'cash',amount:100,cash_tendered:100}]})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const balance=await db.get('SELECT quantity_on_hand FROM inventory_costs WHERE variant_id=?',[v.id]);assert.ok(Number(balance.quantity_on_hand)>=0);
  });
  await t.test('Two online buyers and POS race for one unit: exactly one succeeds',async()=>{
    const v=await make('Three-way last unit',1),held=await holdSale(db,{lines:[{variant_id:v.id,quantity:1}],cashierId:1});
    const results=await Promise.allSettled([placePublicOrder(db,input(v.id),{ownerHash:'triple-a'}),placePublicOrder(db,input(v.id),{ownerHash:'triple-b'}),checkoutSale(db,held.id,{cashierId:1,payments:[{method:'cash',amount:100,cash_tendered:100}]})]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await availableOnline(db,[v.id],loc.id))[v.id],0);
  });
  await t.test('Online batch fulfillment uses canonical FEFO; expired and non-sellable stock is excluded',async()=>{
    const v=await make('Online batch',2,'batch');
    const receipt=await createGoodsReceipt(db,{supplierId:supplier,locationId:loc.id,paymentMethod:'credit',invoiceNumber:randomUUID(),lines:[{variantId:v.id,quantityReceived:1,unitCost:35,batches:[{batchNumber:'WEB-EARLY',expiryDate:'2099-01-01',quantity:1}]}]});await postGoodsReceipt(db,receipt.id,{postedBy:1,businessDayId:day.id});
    const o=await placePublicOrder(db,input(v.id),{ownerHash:'batch-owner'}),sale=await fulfillOrder(db,o.id,{cashierId:1,paymentVerified:true});
    const allocated=await db.get('SELECT b.batch_number FROM retail_sale_line_batches a JOIN inventory_batches b ON b.id=a.batch_id WHERE a.retail_sale_line_id=?',[sale.lines[0].id]);assert.equal(allocated.batch_number,'WEB-EARLY');
    await db.run("UPDATE inventory_batches SET expiry_date='2000-01-01' WHERE variant_id=?",[v.id]);assert.equal((await availableOnline(db,[v.id],loc.id))[v.id],0);
    await assert.rejects(placePublicOrder(db,input(v.id),{ownerHash:'expired-batch'}),/no longer available/);
    await db.run("UPDATE inventory_batches SET expiry_date='2099-12-31' WHERE variant_id=?",[v.id]);await db.run('UPDATE inventory_locations SET is_sellable=0 WHERE id=?',[loc.id]);try{assert.equal((await availableOnline(db,[v.id],loc.id))[v.id],0);}finally{await db.run('UPDATE inventory_locations SET is_sellable=1 WHERE id=?',[loc.id]);}
  });
  await t.test('Serial reservation blocks POS and fulfillment selects one exact serial',async()=>{
    const v=await make('Serial online',1,true),o=await placePublicOrder(db,input(v.id),{ownerHash:'serial-owner'}),held=await holdSale(db,{lines:[{variant_id:v.id,quantity:1,serial_numbers:v.serialNumbers}],cashierId:1});
    await assert.rejects(checkoutSale(db,held.id,{cashierId:1,payments:[{method:'cash',amount:100,cash_tendered:100}]}),/available to sell/);
    await assert.rejects(fulfillOrder(db,o.id,{cashierId:1,paymentVerified:true}),/select exactly/);
    assert.equal((await availableOnline(db,[v.id],loc.id))[v.id],0);
    await fulfillOrder(db,o.id,{cashierId:1,paymentVerified:true,serials:{[v.id]:v.serialNumbers}});assert.equal((await db.get('SELECT status FROM inventory_serials WHERE serial_number=?',[v.serialNumbers[0]])).status,'SOLD');
  });
  await t.test('Delivery fee posts through canonical sale and manual payment requires evidence',async()=>{
    const o=await placePublicOrder(db,input(fixture.id,{fulfillment_type:'DELIVERY',shipping_address:'123 Kathmandu, Nepal',payment_method:'online'}),{ownerHash:'delivery-owner'});assert.equal(Number(o.total),125);
    await assert.rejects(fulfillOrder(db,o.id,{cashierId:1,paymentVerified:true,paymentMethod:'online'}),/reference/);
    const sale=await fulfillOrder(db,o.id,{cashierId:1,paymentVerified:true,paymentMethod:'online',paymentReference:'BANK-VERIFIED-123'});assert.equal(Number(sale.delivery_charge),25);assert.equal(Number(sale.grand_total),125);
  });
  await t.test('Changed price blocks fulfillment and rolls back sale/reservation changes',async()=>{
    const o=await placePublicOrder(db,input(fixture.id),{ownerHash:'changed-price'});await db.run('UPDATE product_variants SET price=110 WHERE id=?',[fixture.id]);await assert.rejects(fulfillOrder(db,o.id,{cashierId:1,paymentVerified:true}),/price changed/);assert.equal((await db.get('SELECT retail_sale_id FROM retail_online_orders WHERE id=?',[o.id])).retail_sale_id,null);await db.run('UPDATE product_variants SET price=100 WHERE id=?',[fixture.id]);await cancelPublicOrder(db,o.id,{ownerHash:'changed-price'});
  });
  await t.test('Only the order owner can accept a changed fulfillment price',async()=>{
    const identity={ownerHash:'reprice-owner'},o=await placePublicOrder(db,input(fixture.id),identity);
    await db.run('UPDATE product_variants SET price=101 WHERE id=?',[fixture.id]);
    await assert.rejects(repricePublicOrder(db,{id:o.id},{ownerHash:'intruder'}),/not found/);
    const quote=await repricePublicOrder(db,{id:o.id},identity);assert.equal(quote.previous_total,100);assert.equal(quote.total,101);
    await assert.rejects(repricePublicOrder(db,{id:o.id,accept:true,quote_token:'forged'},identity),/changed again/);
    await repricePublicOrder(db,{id:o.id,accept:true,quote_token:quote.quote_token},identity);
    const sale=await fulfillOrder(db,o.id,{cashierId:1,paymentVerified:true});assert.equal(Number(sale.grand_total),101);
    await db.run('UPDATE product_variants SET price=100 WHERE id=?',[fixture.id]);
  });
  await t.test('Cancellation racing fulfillment has one economic outcome and channel reporting agrees',async()=>{
    const o=await placePublicOrder(db,input(fixture.id),{ownerHash:'cancel-race'});
    const result=await Promise.allSettled([cancelOnlineOrder(db,o.id),fulfillOrder(db,o.id,{cashierId:1,paymentVerified:true})]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    const persisted=await db.get('SELECT status,retail_sale_id FROM retail_online_orders WHERE id=?',[o.id]);assert.equal(persisted.status==='DELIVERED',!!persisted.retail_sale_id);
    const report=await retailChannelReport(db),posted=await db.get("SELECT COUNT(*) AS n FROM retail_sales WHERE channel='online' AND status='COMPLETED'");assert.equal(report.channels.find(c=>c.channel==='online').sales,Number(posted.n));
  });
  await t.test('Staff activation binds canonical identity; codes cannot replay and logout tokens are opaque',async()=>{
    const customer=(await db.run("INSERT INTO customers(name,phone) VALUES ('Verified web customer','9807778888')")).lastInsertRowid;
    const invite=await createCustomerInvite(db,customer,1),credentials={action:'activate',activation_code:invite.activation_code,username:'verified.customer',password:'ValidPassword123!'};
    const token=await customerSession(db,credentials),identity=await storeIdentity(db,{cookies:{get:name=>name==='aadhar_customer'?{value:token}:null}});assert.equal(identity.customerId,customer);await assert.rejects(customerSession(db,credentials),/invalid or expired/);await assert.rejects(customerSession(db,{username:'verified.customer',password:'IncorrectPassword!'}),/incorrect/);
    const group=await saveCustomerGroup(db,{name:'Verified web wholesale',code:'WEB-WHOLESALE',pricing_mode:'wholesale',reason:'Verified account test'},1);
    await assignCustomerGroup(db,{customer_id:customer,group_id:group.id,reason:'Verified account test'},1);
    await savePriceList(db,{name:'Authenticated online trade',code:'AUTH-WEB-TRADE',customer_group_id:group.id,channel:'online',reason:'Verified account test',items:[{variant_id:fixture.id,fixed_price:80}]},1);
    assert.equal((await quoteOnlineCart(db,input(fixture.id),identity)).total,80);
    assert.equal((await publicProduct(db,fixture.product,{customerId:identity.customerId})).variants[0].price.unit_price,80);
    assert.equal((await quoteOnlineCart(db,input(fixture.id,{customer_id:customer,customer_group_id:group.id}),owner)).total,100);
    const o=await placePublicOrder(db,input(fixture.id),identity);assert.equal(Number(o.total),80);assert.equal((await db.get('SELECT customer_id FROM retail_online_orders WHERE id=?',[o.id])).customer_id,customer);await cancelPublicOrder(db,o.id,identity);
  });
  await t.test('Atomic rate limit, cross-origin rejection and final reconciliation',async()=>{
    const results=await Promise.allSettled(Array.from({length:8},()=>rateLimitStore(db,'concurrent-test',3)));assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
    assert.throws(()=>assertStoreOrigin({url:'https://store.example/api/store/orders',headers:new Headers({origin:'https://evil.example'})}),/origin/);
    const rec=await runRetailReconciliation(db);assert.equal(rec.reconciled,true,JSON.stringify(rec));
    const report=await retailChannelReport(db);
    const gl=await db.get("SELECT SUM(jl.credit-jl.debit) AS revenue FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE a.code IN ('4010','4011')");
    assert.ok(Math.abs(report.channels.reduce((sum,c)=>sum+c.net_revenue,0)-Number(gl.revenue))<0.005);
  });
});
