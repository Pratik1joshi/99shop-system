import fs from 'node:fs';
import Database from '../lib/db/index.js';
import {ensureStandardVariant} from '../lib/menu-variants.js';
import {setVariantAttributes,ensureAttribute} from '../lib/product-catalog.js';
import {getDefaultLocation} from '../lib/retail-inventory.js';
import {createGoodsReceipt,postGoodsReceipt} from '../lib/retail-purchasing.js';
import {openBusinessDay} from '../lib/business-days.js';
import {getNepaliDateString} from '../lib/time-utils.js';
import {createCustomerInvite} from '../lib/retail-public-security.js';
const url=new URL(process.env.DATABASE_URL||'');if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/phase2b_browser_\d+_\d+$/.test(url.pathname))throw new Error('Only disposable Phase 2B browser fixture');
const db=Database.getInstance();
try{
  await db.run("UPDATE users SET must_change_password=0 WHERE username='admin'");
  await db.run("UPDATE retail_online_settings SET enabled=1,delivery_enabled=1,delivery_fee=25,manual_payment_enabled=1,store_name='The Everyday Edit' WHERE id=1");
  const admin=await db.get("SELECT * FROM users WHERE username='admin'"),day=await openBusinessDay(db,{business_date:getNepaliDateString(),opening_cash:10000},admin),loc=await getDefaultLocation(db);
  const category=(await db.run("INSERT INTO menu_categories(name,online_enabled) VALUES ('Beauty essentials',1)")).lastInsertRowid;
  const product=(await db.run("INSERT INTO menu_items(name,brand,category_id,base_price,is_available,online_enabled,online_slug,online_description) VALUES ('Velvet lip colour','Everyday',?,100,1,1,'velvet-lip-colour','A soft everyday lip colour. Choose your shade and finish.')",[category])).lastInsertRowid;
  const [variant]=await ensureStandardVariant(db,product,{price:100});
  await db.run("UPDATE menu_item_variants SET sku='WEB-RUBY',variant_name='Ruby Matte',mrp=120 WHERE id=?",[variant.id]);
  const second=(await db.run("INSERT INTO menu_item_variants(menu_item_id,variant_name,sku,price,price_modifier) VALUES (?,'Rose Gloss','WEB-ROSE',120,0)",[product])).lastInsertRowid;
  await setVariantAttributes(db,variant.id,{Shade:'Ruby',Finish:'Matte'});await setVariantAttributes(db,second,{Shade:'Rose',Finish:'Gloss'});
  for(const name of ['Shade','Finish']){const a=await ensureAttribute(db,name);await db.run('UPDATE product_attributes SET online_filter=1 WHERE id=?',[a.id]);}
  await db.run("UPDATE product_attribute_values SET swatch='#a8394a' WHERE value='Ruby'");await db.run("UPDATE product_attribute_values SET swatch='#c7828b' WHERE value='Rose'");
  const supplier=(await db.run("INSERT INTO suppliers(name,normalized_name) VALUES ('Browser supplier','browser supplier')")).lastInsertRowid;
  const receipt=await createGoodsReceipt(db,{supplierId:supplier,locationId:loc.id,paymentMethod:'credit',invoiceNumber:'WEB-OPENING',lines:[{variantId:variant.id,quantityReceived:200,unitCost:40},{variantId:second,quantityReceived:200,unitCost:50}]});await postGoodsReceipt(db,receipt.id,{postedBy:admin.id,businessDayId:day.id});
  const customer=(await db.run("INSERT INTO customers(name,phone) VALUES ('Verified browser shopper','9807654321')")).lastInsertRowid;
  const invite=await createCustomerInvite(db,customer,admin.id);
  fs.writeFileSync('.commerce-tmp/phase2b/browser-fixture.json',JSON.stringify({product,variant:variant.id,second,customer,activation_code:invite.activation_code}));
}finally{await db.close();}
