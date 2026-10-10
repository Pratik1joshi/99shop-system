import fs from 'node:fs';
import Database from '../lib/db/index.js';
import {businessDayContext,openBusinessDay} from '../lib/business-days.js';
import {getDefaultLocation} from '../lib/retail-inventory.js';
import {createGoodsReceipt,postGoodsReceipt} from '../lib/retail-purchasing.js';
import {saveProductImage} from '../lib/uploads.js';
const url=new URL(process.env.DATABASE_URL||'');if(url.hostname!=='127.0.0.1'||!/^\/phase2b_browser_\d+_\d+$/.test(url.pathname))throw new Error('Disposable Phase 2B fixture required');
const db=Database.getInstance();
try{
  const actor=await db.get("SELECT * FROM users WHERE username='admin'"),context=await businessDayContext(db);
  if(context.isStale&&!context.staleAcknowledged)await openBusinessDay(db,{action:'continue_stale',confirm_continue_stale:true,reason:'Continue disposable browser acceptance across Nepal midnight'},actor);
  const day=await db.get("SELECT id FROM business_days WHERE status='open'"),loc=await getDefaultLocation(db),supplier=await db.get("SELECT id FROM suppliers WHERE normalized_name='e2e supplier'"),sku=await db.get("SELECT id FROM product_variants WHERE sku='E2E-STANDARD'");
  if(sku&&!await db.get("SELECT id FROM goods_receipts WHERE invoice_number='PHASE2B-REGRESSION'")){
    const receipt=await createGoodsReceipt(db,{supplierId:supplier.id,locationId:loc.id,paymentMethod:'credit',invoiceNumber:'PHASE2B-REGRESSION',lines:[{variantId:sku.id,quantityReceived:1000,unitCost:40}]});await postGoodsReceipt(db,receipt.id,{postedBy:actor.id,businessDayId:day.id});
  }
  if(!await db.get("SELECT id FROM customers WHERE phone='9800011999'"))await db.run("INSERT INTO customers(name,phone,credit_limit) VALUES ('Billing E2E','9800011999',10000)");
  const fixture=JSON.parse(fs.readFileSync('.commerce-tmp/phase2b/browser-fixture.json','utf8'));
  if(!await db.get('SELECT id FROM retail_product_media WHERE product_id=?',[fixture.product])){
    const bytes=fs.readFileSync('public/storefront/99-shop-by-shahana-logo.jpg'),image=await saveProductImage(new File([bytes],'fixture.jpg',{type:'image/jpeg'}));
    await db.run('INSERT INTO retail_product_media(product_id,url,alt,is_primary) VALUES (?,?,?,1)',[fixture.product,image,'Browser test image']);
  }
  if(Number((await db.get('SELECT COUNT(*) AS n FROM retail_product_media WHERE product_id=?',[fixture.product])).n)<2)await db.run("INSERT INTO retail_product_media(product_id,url,alt,is_primary) SELECT product_id,url,'Second browser test image',0 FROM retail_product_media WHERE product_id=? LIMIT 1",[fixture.product]);
}finally{await db.close();}
