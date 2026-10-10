import { createOnlineOrder,confirmOrder,cancelOnlineOrder } from '@/lib/retail-online-orders.js';
import { transactionScope } from '@/lib/db/transaction-scope.js';
import { cleanPublicLines,quoteOnlineCart,onlineSettings,commerceError } from '@/lib/retail-storefront.js';
import { hashToken } from '@/lib/retail-public-security.js';
import { quoteFingerprint } from '@/lib/retail-public-price.js';
import { quoteRetailSale } from '@/lib/retail-sales.js';
import { orderDimensions } from '@/lib/retail-order-view.js';
import { describeOnlinePayment } from '@/lib/retail-online-payment.js';
export async function publicOrder(db,id,identity){
  if(!identity.ownerHash)throw commerceError('Open this order from the browser used at checkout, or sign in.',401);
  const order=await db.get(`SELECT id,order_number,status,payment_status,payment_method,fulfillment_type,customer_name,shipping_address,subtotal,discount_amount,tax_amount,delivery_charge,total,created_at,reservation_expires_at,retail_sale_id FROM retail_online_orders WHERE id=? AND owner_hash=?`,[Number(id)||-1,identity.ownerHash]);
  if(!order)throw commerceError('Order not found.',404);
  const expired=!order.retail_sale_id&&!['CANCELLED','DELIVERED'].includes(order.status)&&order.reservation_expires_at&&new Date(order.reservation_expires_at)<=new Date();
  if(expired)order.status='EXPIRED';
  const lines=await db.all('SELECT variant_id,quantity,unit_price,product_name_snapshot AS title,variant_name_snapshot AS variant_name FROM retail_online_order_lines WHERE retail_online_order_id=? ORDER BY id LIMIT 50',[order.id]);
  const events=await db.all('SELECT event,created_at FROM retail_online_events WHERE order_id=? ORDER BY id DESC LIMIT 50',[order.id]);
  const returns=order.retail_sale_id?await db.all("SELECT return_number,status,refund_total,created_at FROM retail_returns WHERE original_sale_id=? ORDER BY id DESC LIMIT 50",[order.retail_sale_id]):[];
  const refunded=returns.filter(r=>r.status==='POSTED').reduce((sum,r)=>sum+Number(r.refund_total),0);
  if(refunded>0)order.payment_status=refunded>=Number(order.total)?'REFUNDED':'PARTIALLY_REFUNDED';
  const settings=await db.get('SELECT payment_instructions,pickup_instructions FROM retail_online_settings WHERE id=1');
  return {...order,...orderDimensions(order),payment_intent:describeOnlinePayment(order,settings),pickup_instructions:settings?.pickup_instructions,retail_sale_id:undefined,lines,events,returns,can_cancel:!order.retail_sale_id&&!['CANCELLED','EXPIRED'].includes(order.status),return_help:order.retail_sale_id?'Contact the store with this order number. Staff will use your original sale for returns or exchanges.':null};
}
export async function placePublicOrder(db,input,identity){
  if(!identity.ownerHash)throw commerceError('Please refresh checkout before placing an order.',401);
  const key=String(input.idempotency_key||'');if(!/^[a-zA-Z0-9-]{16,80}$/.test(key))throw commerceError('A checkout request key is required.');
  const clean={lines:cleanPublicLines(input.lines),fulfillment_type:input.fulfillment_type||'PICKUP',coupon_code:String(input.coupon_code||'').trim().slice(0,80),customer_name:String(input.customer_name||'').trim(),customer_phone:String(input.customer_phone||'').trim(),shipping_address:String(input.shipping_address||'').trim(),delivery_notes:String(input.delivery_notes||'').trim(),payment_method:input.payment_method||'cash'};
  if(clean.customer_name.length<2||clean.customer_name.length>100||!/^\+?[0-9 ()-]{7,24}$/.test(clean.customer_phone)||clean.shipping_address.length>500||clean.delivery_notes.length>500)throw commerceError('Enter a valid name, phone and delivery details.');
  if(clean.fulfillment_type==='DELIVERY'&&clean.shipping_address.length<10)throw commerceError('Enter the complete delivery address.');
  const requestHash=hashToken(JSON.stringify(clean)),idempotencyKey='public:'+hashToken(identity.ownerHash+':'+key);
  return db.transaction(async raw=>{
    const tx=transactionScope(raw);await tx.get('SELECT pg_advisory_xact_lock(hashtext(?))',[idempotencyKey]);
    const prior=await tx.get('SELECT id,request_hash FROM retail_online_orders WHERE idempotency_key=?',[idempotencyKey]);
    if(prior){if(prior.request_hash!==requestHash)throw commerceError('This checkout key was already used for a different order.',409);return publicOrder(tx,prior.id,identity);}
    // Serializes a guest/account's limit even when concurrent requests use different keys.
    await tx.get('SELECT pg_advisory_xact_lock(hashtext(?))',[identity.ownerHash]);
    const open=await tx.get("SELECT COUNT(*) AS count FROM retail_online_orders WHERE owner_hash=? AND retail_sale_id IS NULL AND status NOT IN ('CANCELLED','DELIVERED') AND reservation_expires_at>CURRENT_TIMESTAMP",[identity.ownerHash]);
    if(Number(open.count)>=3)throw commerceError('You already have three active orders. Complete or cancel one first.',429);
    const settings=await onlineSettings(tx),quote=await quoteOnlineCart(tx,clean,identity);
    if(!identity.customerId&&!Number(settings.guest_enabled))throw commerceError('Please sign in to place an order.',401);
    if(input.quote_token!==quote.quote_token)throw commerceError('Prices or charges have changed. Review the updated quote and place your order again.',409);
    if(!quote.payment_methods.includes(clean.payment_method))throw commerceError('Choose an available payment method.');
    if(quote.conflicts.length)throw commerceError('This item is no longer available.',409);
    const order=await createOnlineOrder(tx,{source:'WEBSITE',customerId:identity.customerId,customerName:clean.customer_name,customerPhone:clean.customer_phone,
      fulfillmentType:clean.fulfillment_type,shippingAddress:clean.shipping_address,deliveryNotes:clean.delivery_notes,deliveryCharge:quote.delivery_charge,locationId:quote.location_id,
      paymentMethod:clean.payment_method,lines:clean.lines,couponCode:clean.coupon_code,idempotencyKey,ownerHash:identity.ownerHash,requestHash,
      expiresAt:new Date(Date.now()+Math.min(1440,Math.max(15,Number(settings.reservation_minutes)))*60000).toISOString()});
    if(quoteFingerprint(JSON.parse(order.quote_json))!==quote.quote_token)throw commerceError('Prices changed while placing the order. Review a new quote.',409);
    await confirmOrder(tx,order.id);
    return publicOrder(tx,order.id,identity);
  });
}
export async function cancelPublicOrder(db,id,identity){
  return db.transaction(async raw=>{const tx=transactionScope(raw);await publicOrder(tx,id,identity);await cancelOnlineOrder(tx,id,{reason:'Customer cancelled online'});return publicOrder(tx,id,identity);});
}

/** Only the owner can accept changed economics. No stock, payment or journal effect. */
export async function repricePublicOrder(db,input,identity){
  return db.transaction(async raw=>{
    const tx=transactionScope(raw);
    await publicOrder(tx,input.id,identity);
    const order=await tx.get(`SELECT * FROM retail_online_orders WHERE id=?${raw.driver==='postgres'?' FOR UPDATE':''}`,[input.id]);
    if(order.retail_sale_id||order.status==='CANCELLED'||new Date(order.reservation_expires_at)<=new Date())throw commerceError('This order can no longer be requoted.',409);
    const lines=await tx.all('SELECT variant_id,quantity FROM retail_online_order_lines WHERE retail_online_order_id=? ORDER BY variant_id',[order.id]);
    const quote=await quoteRetailSale(tx,{lines,customer_id:order.customer_id,coupon_code:order.coupon_code},{channel:'online',deliveryFee:Number(order.delivery_charge)});
    const token=quoteFingerprint(quote);
    if(input.accept===true){
      if(input.quote_token!==token)throw commerceError('Prices changed again. Review the new total.',409);
      await tx.run('UPDATE retail_online_orders SET quote_json=?,subtotal=?,discount_amount=?,tax_amount=?,total=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[JSON.stringify(quote),quote.subtotal,quote.discount,quote.tax,quote.total,order.id]);
      for(const price of quote.pricing)await tx.run('UPDATE retail_online_order_lines SET unit_price=? WHERE retail_online_order_id=? AND variant_id=?',[price.unit_price,order.id,price.variant_id]);
      await tx.run('INSERT INTO retail_online_events(order_id,event) VALUES (?,?)',[order.id,'PRICE_ACCEPTED']);
    }
    return {previous_total:Number(order.total),total:quote.total,quote_token:token,accepted:input.accept===true};
  });
}
