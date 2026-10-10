/** Offline payment intent contract. Confirmation is exclusively the authorized Retail posting workflow. */
export function describeOnlinePayment(order,settings={}){
  const manual=order.payment_method==='online';
  return {provider:manual?'MANUAL_BANK':'CASH',currency:'NPR',amount:Number(order.total),order_reference:order.order_number,
    status:order.payment_status,automatic_confirmation:false,automatic_refund:false,
    instructions:manual?(settings.payment_instructions||'Contact the store for bank or QR instructions. Payment requires staff verification.'):
      order.fulfillment_type==='DELIVERY'?'Pay when your delivery is collected.':'Pay when you collect your order.',
    next_step:order.status==='CANCELLED'&&manual?'Contact the store if you transferred money. A bank-payment review is required; no automatic refund was issued.':
      order.status==='EXPIRED'?'The stock hold expired. Contact the store before making a payment.':
      order.retail_sale_id?'Your sale has posted. Contact the store for a return or refund.':manual?'The store must verify your transfer before fulfillment.':'Wait for the store to prepare your order.'};
}
