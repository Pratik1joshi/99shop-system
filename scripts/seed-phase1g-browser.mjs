/** Add the missing serial prerequisite through canonical receiving, never direct stock edits. */
import Database from '../lib/db/index.js';
import {createGoodsReceipt,postGoodsReceipt} from '../lib/retail-purchasing.js';
import {getDefaultLocation} from '../lib/retail-inventory.js';
const url=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/phase1f_browser_\d+_\d+$/.test(url.pathname))throw new Error('Disposable local browser fixture required.');
const db=Database.getInstance();
try{
  const admin=await db.get("SELECT id FROM users WHERE username='admin'");
  const variant=await db.get("SELECT id FROM product_variants WHERE sku='E2E-SERIAL'");
  const supplier=await db.get("SELECT id FROM suppliers WHERE normalized_name='e2e supplier'");
  const day=await db.get("SELECT id FROM business_days WHERE status='open' ORDER BY id DESC LIMIT 1");
  const location=await getDefaultLocation(db);
  let receipt=await db.get("SELECT id,status FROM goods_receipts WHERE supplier_id=? AND invoice_number='PHASE1G-SERIAL-PREREQUISITE'",[supplier.id]);
  if(!receipt){
    const exists=await db.get("SELECT id FROM inventory_serials WHERE serial_number='E2E-SERIAL-001'");
    if(exists)throw new Error('Serial already exists: inspect its source; this script never resets serial state.');
    receipt=await createGoodsReceipt(db,{supplierId:supplier.id,locationId:location.id,invoiceNumber:'PHASE1G-SERIAL-PREREQUISITE',paymentMethod:'credit',receivedBy:admin.id,
      lines:[{variantId:variant.id,quantityReceived:2,unitCost:150,serialNumbers:['E2E-SERIAL-001','E2E-SERIAL-002']}]});
  }
  if(receipt.status!=='POSTED')await postGoodsReceipt(db,receipt.id,{postedBy:admin.id,businessDayId:day.id});
  console.log('Serial prerequisites received through canonical GRN; historical serial states unchanged.');
}finally{await db.close();}
