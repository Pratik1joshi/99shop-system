import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import Database from '../lib/db/index.js';
import {ensureAccountingSchema} from '../lib/accounting.js';
import {openBusinessDay} from '../lib/business-days.js';
import {getNepaliDateString} from '../lib/time-utils.js';
import {ensureStandardVariant} from '../lib/product-variants.js';
import {getDefaultLocation} from '../lib/retail-inventory.js';
import {createGoodsReceipt,postGoodsReceipt} from '../lib/retail-purchasing.js';
import {holdSale,checkoutSale} from '../lib/retail-sales.js';
import {saveWarrantyPolicy} from '../lib/retail-warranty.js';
const target=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(target.hostname)||!target.pathname.startsWith('/phase2d_browser_'))throw new Error('Use only a disposable Phase 2D browser database');
const db=Database.getInstance();
try{
  await ensureAccountingSchema(db);const day=await openBusinessDay(db,{business_date:getNepaliDateString(),opening_cash:0},{id:1,role:'admin',full_name:'Browser verifier'}),location=await getDefaultLocation(db);
  await db.run("UPDATE users SET must_change_password=0 WHERE username='admin'");
  const supplier=(await db.run("INSERT INTO suppliers(name,normalized_name) VALUES ('After-sales supplier','after-sales supplier')")).lastInsertRowid;
  const category=(await db.run("INSERT INTO product_categories(name) VALUES ('After-sales acceptance')")).lastInsertRowid;
  const product=(await db.run("INSERT INTO products(name,category_id,base_price,is_available) VALUES ('Warranty acceptance dryer',?,300,1)",[category])).lastInsertRowid;
  const [sku]=await ensureStandardVariant(db,product,{price:300,stockUnit:'pcs'});await db.run("UPDATE product_variants SET tracking_mode='serial',sku='WARRANTY-DRYER',reorder_point=5,reorder_quantity=10 WHERE id=?",[sku.id]);
  const serials=Array.from({length:12},(_,i)=>'BROWSER-WARRANTY-'+i);
  const receipt=await createGoodsReceipt(db,{supplierId:supplier,locationId:location.id,paymentMethod:'credit',invoiceNumber:'BROWSER-2D',lines:[{variantId:sku.id,quantityReceived:12,unitCost:100,serialNumbers:serials}]});await postGoodsReceipt(db,receipt.id,{postedBy:1,businessDayId:day.id});
  await saveWarrantyPolicy(db,{name:'Motor coverage',scope:'BUSINESS',duration:12,duration_unit:'MONTHS',coverage:'Motor defect coverage',proof_required:true,replacement_rule:'ORIGINAL_EXPIRY'},1);
  const fixture={sku:sku.id,supplier,receipt:receipt.id,customers:{}};
  for(const [index,project] of ['desktop','tablet','mobile'].entries()){
    const customer=(await db.run('INSERT INTO customers(name,phone) VALUES (?,?)',[`Service ${project}`,'98011122'+index+'0'])).lastInsertRowid;
    await db.run('INSERT INTO retail_customer_accounts(customer_id,username,password_hash) VALUES (?,?,?)',[customer,'service_'+project,await bcrypt.hash('WarrantyBrowser123',12)]);
    for(const n of [index*2,index*2+1]){const lines=[{variant_id:sku.id,quantity:1,serial_numbers:[serials[n]]}],held=await holdSale(db,{lines,customerId:customer,cashierId:1});await checkoutSale(db,held.id,{lines,customerId:customer,cashierId:1,payments:[{method:'cash',amount:300,cash_tendered:300}],idempotencyKey:'browser-sale-'+n});}
    fixture.customers[project]={customer,staff_serial:serials[index*2],customer_serial:serials[index*2+1],replacement_serial:serials[index+6]};
  }
  await db.run("UPDATE retail_online_settings SET enabled=1 WHERE id=1");
  await db.run("INSERT INTO users(username,password_hash,full_name,role,is_active,must_change_password) VALUES ('warranty_cashier',?,'Warranty cashier','cashier',1,0)",[await bcrypt.hash('CashierTestOnly123',12)]);
  fs.writeFileSync('.commerce-tmp/phase2d/browser-fixture.json',JSON.stringify(fixture,null,2));
}finally{await db.close();}
