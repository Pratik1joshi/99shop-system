/** Canonical, idempotent prerequisites for independently runnable browser suites. */
import Database from '../lib/db/index.js';
import { openBusinessDay } from '../lib/business-days.js';
import { getNepaliDateString } from '../lib/time-utils.js';
import { createGoodsReceipt, postGoodsReceipt } from '../lib/retail-purchasing.js';
import { getDefaultLocation } from '../lib/retail-inventory.js';

const url = new URL(process.env.DATABASE_URL || '');
if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || !/^\/phase1f_browser_\d+_\d+$/.test(url.pathname)) throw new Error('Only a disposable Phase 1F browser database may be seeded.');
const db = Database.getInstance();
try {
  const admin = await db.get("SELECT id,role,full_name FROM users WHERE username='admin'");
  let day = await db.get("SELECT * FROM business_days WHERE status='open' ORDER BY id DESC LIMIT 1");
  if (!day) day = await openBusinessDay(db, { business_date: getNepaliDateString(), opening_cash: 0 }, admin);
  if (!await db.get("SELECT id FROM customers WHERE phone='9800011999'")) await db.run("INSERT INTO customers(name,phone,credit_limit) VALUES ('Billing E2E','9800011999',10000)");
  const supplier = await db.get("SELECT id FROM suppliers WHERE normalized_name='e2e supplier'");
  const variant = await db.get("SELECT id FROM menu_item_variants WHERE sku='E2E-STANDARD'");
  const location = await getDefaultLocation(db);
  let receipt = await db.get("SELECT id,status FROM goods_receipts WHERE supplier_id=? AND invoice_number='PHASE1F-BROWSER-OPENING'", [supplier.id]);
  if (!receipt) receipt = await createGoodsReceipt(db, { supplierId: supplier.id, locationId: location.id, invoiceNumber: 'PHASE1F-BROWSER-OPENING', paymentMethod: 'credit', receivedBy: admin.id,
    lines: [{ variantId: variant.id, quantityReceived: 1000, unitCost: 40 }] });
  if (receipt.status !== 'POSTED') await postGoodsReceipt(db, receipt.id, { postedBy: admin.id, businessDayId: day.id });
  console.log('Browser prerequisites: open business day, identified customer, 1,000 units through a posted GRN.');
} finally { await db.close(); }
