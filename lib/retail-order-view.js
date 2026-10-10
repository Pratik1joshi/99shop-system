/** The legacy workflow status is kept for compatibility; dimensions stay independent. */
export function orderDimensions(order) {
  const expired=!order.retail_sale_id&&order.status!=='CANCELLED'&&order.reservation_expires_at&&new Date(order.reservation_expires_at)<=new Date();
  const status=expired?'EXPIRED':order.status;
  return {status,channel:'ONLINE',order_status:status==='DELIVERED'?'COMPLETED':['PENDING','CANCELLED','EXPIRED'].includes(status)?status:'CONFIRMED',
    fulfillment_status:({PENDING:'UNFULFILLED',CONFIRMED:'UNFULFILLED',PROCESSING:'PREPARING',READY:order.fulfillment_type==='PICKUP'?'READY_FOR_PICKUP':'READY_FOR_DELIVERY',SHIPPED:'OUT_FOR_DELIVERY',DELIVERED:'FULFILLED'})[status]||'UNFULFILLED'};
}
export function staffOrderView(order) {
  const {owner_hash,request_hash,idempotency_key,quote_json,...safe}=order;
  return {...safe,...orderDimensions(order)};
}
