/** Online orders orchestrate canonical quote, reservations and sale posting in one transaction. */
import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { ensureColumn } from '@/lib/db/schema-helpers.js';
import { getDefaultLocation } from '@/lib/retail-inventory.js';
import { ensureRetailReservationSchema, createReservation, releaseReservations, consumeReservations, listReservationsForSource } from '@/lib/retail-reservations.js';
import { transactionScope } from '@/lib/db/transaction-scope.js';
import { lockRetailStock } from '@/lib/retail-stock-lock.js';
import { holdSale, checkoutSale, getRetailSale, quoteRetailSale } from '@/lib/retail-sales.js';
import { ensureDocumentNumberSchema, nextDocumentNumber } from '@/lib/document-numbers.js';
import { quoteFingerprint } from '@/lib/retail-public-price.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export const ORDER_SOURCES = ['WEBSITE', 'MANUAL_ONLINE'];
export const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
export const PAYMENT_STATUSES = ['UNPAID', 'PENDING', 'PARTIAL', 'PAID', 'REFUNDED'];
const TERMINAL_STATUSES = new Set(['DELIVERED', 'CANCELLED']);

export async function ensureRetailOnlineOrderSchema(db) {
  await ensureRetailReservationSchema(db);
  await ensureDocumentNumberSchema(db);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_online_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE,
    source TEXT NOT NULL DEFAULT 'MANUAL_ONLINE',
    customer_id INTEGER,
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    fulfillment_type TEXT NOT NULL DEFAULT 'PICKUP',
    shipping_address TEXT,
    delivery_phone TEXT,
    delivery_notes TEXT,
    delivery_charge NUMERIC(14,2) NOT NULL DEFAULT 0,
    location_id INTEGER,
    status TEXT NOT NULL DEFAULT 'PENDING',
    payment_status TEXT NOT NULL DEFAULT 'UNPAID',
    payment_method TEXT,
    payment_reference TEXT,
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes TEXT,
    retail_sale_id INTEGER,
    idempotency_key TEXT UNIQUE,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    fulfilled_at TIMESTAMP
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_online_order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retail_online_order_id INTEGER NOT NULL,
    variant_id INTEGER NOT NULL,
    quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(14,2) NOT NULL,
    product_name_snapshot TEXT,
    variant_name_snapshot TEXT
  )`);
  // Never expose cost/COGS through a public catalog/order endpoint — see
  // spec §38. No cost column exists on this table by design.
  await ensureColumn(db, 'retail_online_orders', 'cancel_reason', 'TEXT');
  for(const name of ['owner_hash','request_hash','quote_json','coupon_code'])await ensureColumn(db,'retail_online_orders',name,'TEXT');
  await ensureColumn(db,'retail_online_orders','reservation_expires_at','TIMESTAMP');
}

async function loadOrder(db, id) {
  const order = await db.get(
    `SELECT o.*, rs.sale_number AS retail_sale_number FROM retail_online_orders o LEFT JOIN retail_sales rs ON rs.id = o.retail_sale_id WHERE o.id = ?`,
    [id]
  );
  if (!order) throw bad('Online order not found.', 404);
  const lines = await db.all(
    `SELECT ol.*, v.variant_name,v.tracking_mode FROM retail_online_order_lines ol LEFT JOIN menu_item_variants v ON v.id = ol.variant_id WHERE ol.retail_online_order_id = ? ORDER BY ol.id`,
    [id]
  );
  const reservations = await listReservationsForSource(db, 'retail_online_order', id);
  const events=db.driver==='postgres'?await db.all('SELECT id,event,detail,created_at FROM retail_online_events WHERE order_id=? ORDER BY id DESC LIMIT 100',[id]):[];
  return { ...order, lines, reservations,events };
}

export async function getOnlineOrder(db, id) {
  await ensureRetailOnlineOrderSchema(db);
  return loadOrder(db, id);
}

export async function listOnlineOrders(db, { status = null, source = null, query='', page=1, limit = 50 } = {}) {
  await ensureRetailOnlineOrderSchema(db);
  const clauses = [];
  const params = [];
  if(status==='EXPIRED')clauses.push("retail_sale_id IS NULL AND status NOT IN ('CANCELLED','DELIVERED') AND reservation_expires_at<=CURRENT_TIMESTAMP");
  else if (status) { clauses.push('status = ?'); params.push(status); }
  if (source) { clauses.push('source = ?'); params.push(source); }
  if(query){clauses.push("(lower(order_number) LIKE ? ESCAPE '\\' OR lower(COALESCE(customer_name,'')) LIKE ? ESCAPE '\\' OR customer_phone LIKE ? ESCAPE '\\')");const q='%'+String(query).trim().slice(0,100).toLowerCase().replace(/[\\%_]/g,'\\$&')+'%';params.push(q,q,q);}
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const size=Math.min(100,Math.max(1,Math.trunc(Number(limit))||50));params.push(size,(Math.min(10000,Math.max(1,Math.trunc(Number(page))||1))-1)*size);
  return db.all(`SELECT * FROM retail_online_orders ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, params);
}

/** Creates a PENDING order. No stock effect — same as a HELD POS cart. */
export async function createOnlineOrder(db, data) {
  const lines = data.lines || [];
  if (!lines.length) throw bad('Add at least one item.');
  await ensureRetailOnlineOrderSchema(db);

  return db.transaction(async (tx) => {
    if (data.idempotencyKey) {
      if(tx.driver==='postgres')await tx.get('SELECT pg_advisory_xact_lock(hashtext(?))',[String(data.idempotencyKey)]);
      const existing = await tx.get(`SELECT id FROM retail_online_orders WHERE idempotency_key = ?`, [data.idempotencyKey]);
      if (existing) return loadOrder(tx, existing.id);
    }
    const locationId = data.locationId || (await getDefaultLocation(tx))?.id;
    const source = ORDER_SOURCES.includes(data.source) ? data.source : 'MANUAL_ONLINE';
    const fulfillmentType = data.fulfillmentType === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
    const orderNumber = await nextDocumentNumber(tx, { type: 'retail_online_order', prefix: 'WEB' });

    const quote=await quoteRetailSale(tx,{lines,customer_id:data.customerId,coupon_code:data.couponCode},{channel:'online',deliveryFee:Math.max(0,Number(data.deliveryCharge)||0)});
    let subtotal = 0;
    const resolvedLines = [];
    for (const l of lines) {
      const variant = await tx.get(
        `SELECT v.*, mi.name AS product_name FROM menu_item_variants v JOIN menu_items mi ON mi.id = v.menu_item_id WHERE v.id = ?`,
        [Number(l.variantId ?? l.variant_id)]
      );
      if (!variant) throw bad(`Variant ${l.variantId ?? l.variant_id} not found.`);
      const quantity = Number(l.quantity);
      if (!(quantity > 0)) throw bad('Every line needs a positive quantity.');
      const unitPrice = quote.pricing.find(p=>p.variant_id===Number(variant.id)).unit_price; // catalog price only — never trust a client-sent price for a public/online order
      resolvedLines.push({ variantId: variant.id, quantity, unitPrice, productName: variant.product_name, variantName: variant.variant_name });
      subtotal = round2(subtotal + unitPrice * quantity);
    }
    const deliveryCharge = Math.max(0, Number(data.deliveryCharge) || 0);
    subtotal=quote.subtotal;
    const total=quote.total;

    const result = await tx.run(
      `INSERT INTO retail_online_orders
         (order_number, source, customer_id, customer_name, customer_phone, customer_email, fulfillment_type,
          shipping_address, delivery_phone, delivery_notes, delivery_charge, location_id, status, payment_status,
          payment_method, subtotal, total, notes, idempotency_key, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'UNPAID', ?, ?, ?, ?, ?, ?)`,
      [orderNumber, source, data.customerId ?? null, data.customerName || null, data.customerPhone || null, data.customerEmail || null,
        fulfillmentType, data.shippingAddress || null, data.deliveryPhone || null, data.deliveryNotes || null, deliveryCharge,
        locationId, data.paymentMethod || null, subtotal, total, data.notes || null, data.idempotencyKey || null, data.createdBy ?? null]
    );
    const orderId = result.lastInsertRowid;
    if(data.paymentMethod==='online')await tx.run("UPDATE retail_online_orders SET payment_status='PENDING' WHERE id=?",[orderId]);
    await tx.run('UPDATE retail_online_orders SET discount_amount=?,tax_amount=?,quote_json=?,coupon_code=?,owner_hash=?,request_hash=?,reservation_expires_at=? WHERE id=?',[quote.discount,quote.tax,JSON.stringify(quote),data.couponCode||null,data.ownerHash||null,data.requestHash||null,data.expiresAt||new Date(Date.now()+120*60000).toISOString(),orderId]);
    for (const l of resolvedLines) {
      await tx.run(
        `INSERT INTO retail_online_order_lines (retail_online_order_id, variant_id, quantity, unit_price, product_name_snapshot, variant_name_snapshot)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, l.variantId, l.quantity, l.unitPrice, l.productName, l.variantName]
      );
    }
    if(tx.driver==='postgres'){
      await tx.run('INSERT INTO retail_online_events(order_id,event,actor_id) VALUES (?,?,?)',[orderId,'PLACED',data.createdBy??null]);
      if(data.paymentMethod==='online')await tx.run('INSERT INTO retail_online_events(order_id,event) VALUES (?,?)',[orderId,'PAYMENT_PENDING']);
    }
    return loadOrder(tx, orderId);
  });
}

/** PENDING -> CONFIRMED — reserves every line's stock atomically; rejects the whole order if any line can't be covered. */
export async function confirmOrder(db, id, { confirmedBy = null } = {}) {
  await ensureRetailOnlineOrderSchema(db);
  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const order = await tx.get(`SELECT * FROM retail_online_orders WHERE id = ?${lock}`, [id]);
    if (!order) throw bad('Online order not found.', 404);
    if (order.status === 'CONFIRMED') return loadOrder(tx, id); // idempotent replay
    if (order.status !== 'PENDING') throw bad(`Cannot confirm an order in status ${order.status}.`, 409);

    const lines = await tx.all(`SELECT * FROM retail_online_order_lines WHERE retail_online_order_id = ? ORDER BY variant_id`, [id]);
    await lockRetailStock(tx,lines.map(l=>l.variant_id),order.location_id);
    for (const line of lines) {
      await createReservation(tx, {
        variantId: line.variant_id, locationId: order.location_id, quantity: line.quantity,
        sourceType: 'retail_online_order', sourceId: id, createdBy: confirmedBy, expiresAt:order.reservation_expires_at,
      });
    }
    await tx.run(`UPDATE retail_online_orders SET status = 'CONFIRMED', confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    if(tx.driver==='postgres')await tx.run('INSERT INTO retail_online_events(order_id,event,actor_id) VALUES (?,?,?)',[id,'CONFIRMED',confirmedBy]);
    return loadOrder(tx, id);
  });
}

/** Any non-terminal status -> CANCELLED. Releases whatever reservation exists (no-op if none). */
export async function cancelOnlineOrder(db, id, { reason = null, cancelledBy = null } = {}) {
  await ensureRetailOnlineOrderSchema(db);
  return db.transaction(async (tx) => {
    const order = await tx.get(`SELECT * FROM retail_online_orders WHERE id = ?${tx.driver==='postgres'?' FOR UPDATE':''}`, [id]);
    if (!order) throw bad('Online order not found.', 404);
    if (order.status === 'CANCELLED') return loadOrder(tx, id);
    if(order.retail_sale_id)throw bad('This order was fulfilled. Use its canonical return workflow.',409);
    if (TERMINAL_STATUSES.has(order.status)) throw bad(`Cannot cancel a ${order.status} order.`, 409);
    await releaseReservations(tx, { sourceType: 'retail_online_order', sourceId: id });
    await tx.run(`UPDATE retail_online_orders SET status = 'CANCELLED', cancel_reason = ?, cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [reason, id]);
    if(tx.driver==='postgres')await tx.run('INSERT INTO retail_online_events(order_id,event,actor_id,detail) VALUES (?,?,?,?)',[id,'CANCELLED',cancelledBy,reason]);
    if(tx.driver==='postgres'&&order.payment_method==='online')await tx.run('INSERT INTO retail_online_events(order_id,event,actor_id,detail) VALUES (?,?,?,?)',[id,'PAYMENT_REVIEW_REQUIRED',cancelledBy,'Check for a bank transfer before closing the cancellation. No automated refund was issued.']);
    return loadOrder(tx, id);
  });
}

/** State transitions do not recognize revenue. */
export async function updateOnlineOrderStatus(db,id,status,{actorId=null}={}) {
  await ensureRetailOnlineOrderSchema(db);
  return db.transaction(async tx=>{
    const order=await tx.get(`SELECT * FROM retail_online_orders WHERE id=?${tx.driver==='postgres'?' FOR UPDATE':''}`,[id]);
    if(!order)throw bad('Online order not found.',404);
    if(order.status===status)return loadOrder(tx,id);
    const allowed={CONFIRMED:['PROCESSING'],PROCESSING:['READY'],READY:order.fulfillment_type==='DELIVERY'?['SHIPPED']:[]};
    if(!allowed[order.status]?.includes(status)||order.retail_sale_id)throw bad('Invalid order transition. Completion requires payment collection and fulfillment.',409);
    if(order.reservation_expires_at&&new Date(order.reservation_expires_at)<=new Date())throw bad('Reservation expired. Cancel and reorder.',409);
    await tx.run('UPDATE retail_online_orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[status,id]);
    if(tx.driver==='postgres')await tx.run('INSERT INTO retail_online_events(order_id,event,actor_id) VALUES (?,?,?)',[id,status,actorId]);
    return loadOrder(tx,id);
  });
}

export async function fulfillOrder(db,id,{cashierId=null,paymentMethod=null,paymentReference=null,paymentVerified=false,serials={}}={}) {
  await ensureRetailOnlineOrderSchema(db);
  return db.transaction(async raw=>{
    const tx=transactionScope(raw);
    const locked=await tx.get(`SELECT * FROM retail_online_orders WHERE id=?${tx.driver==='postgres'?' FOR UPDATE':''}`,[id]);
    if(!locked)throw bad('Online order not found.',404);
    if(locked.retail_sale_id)return getRetailSale(tx,locked.retail_sale_id);
    const order=await loadOrder(tx,id);
    if(!['CONFIRMED','PROCESSING','READY','SHIPPED'].includes(order.status))throw bad('Confirm the order before fulfillment.',409);
    if(order.reservation_expires_at&&new Date(order.reservation_expires_at)<=new Date())throw bad('Reservation expired. Cancel and reorder.',409);
    const method=paymentMethod||order.payment_method||'cash';
    if(!['cash','online'].includes(method))throw bad('Choose collected cash or a verified manual bank payment.');
    if(order.owner_hash&&!paymentVerified)throw bad('Confirm payment collection before fulfillment.');
    if(method==='online'&&!String(paymentReference||'').trim())throw bad('Verified bank payment reference is required.');
    await lockRetailStock(tx,order.lines.map(l=>l.variant_id),order.location_id);
    const lines=order.lines.map(l=>({variant_id:l.variant_id,quantity:l.quantity,serial_numbers:serials[l.variant_id]||[]}));
    const quote=await quoteRetailSale(tx,{lines,customer_id:order.customer_id,coupon_code:order.coupon_code},{channel:'online',deliveryFee:Number(order.delivery_charge)});
    if(round2(quote.total)!==round2(order.total)||(order.owner_hash&&quoteFingerprint(quote)!==quoteFingerprint(JSON.parse(order.quote_json))))throw bad('The order price changed. Customer approval of a new quote is required.',409);
    // Consumed inside the outer transaction: any failure restores the reservation.
    await consumeReservations(tx,{sourceType:'retail_online_order',sourceId:id});
    const held=await holdSale(tx,{locationId:order.location_id,customerId:order.customer_id,cashierId,channel:'online',lines,notes:'Online order '+order.order_number});
    const sale=await checkoutSale(tx,held.id,{channel:'online',deliveryFee:Number(order.delivery_charge),expectedTotal:Number(order.total),couponCode:order.coupon_code,
      lines,payments:[{method,amount:quote.total,reference:paymentReference||undefined,cash_tendered:method==='cash'?quote.total:undefined}],customerId:order.customer_id,cashierId,idempotencyKey:'online-order-'+id});
    await tx.run("UPDATE retail_online_orders SET retail_sale_id=?,status='DELIVERED',payment_status='PAID',payment_method=?,payment_reference=?,fulfilled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",[sale.id,method,paymentReference,id]);
    if(tx.driver==='postgres'){
      await tx.run('INSERT INTO retail_online_events(order_id,event,actor_id) VALUES (?,?,?)',[id,'PAYMENT_CONFIRMED',cashierId]);
      await tx.run('INSERT INTO retail_online_events(order_id,event,actor_id,detail) VALUES (?,?,?,?)',[id,'FULFILLED',cashierId,'Payment collected/verified; canonical sale '+sale.sale_number]);
    }
    return sale;
  });
}
