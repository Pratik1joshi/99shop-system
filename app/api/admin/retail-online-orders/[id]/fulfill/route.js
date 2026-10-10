import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { fulfillOrder } from '@/lib/retail-online-orders.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_online_orders.fulfill' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const data = await request.json().catch(() => ({}));
    const db = Database.getInstance();
    const order=await db.get('SELECT payment_method FROM retail_online_orders WHERE id=?',[id]);
    if((data.payment_method||order?.payment_method)==='online'){const verifier=await requireAuth(request,{roles:['admin','cashier'],permission:'retail_online_orders.verify_payment'});if(verifier.error)return verifier.error;}
    const sale = await fulfillOrder(db, id, { cashierId: auth.user.id, paymentMethod: data.payment_method, paymentReference: data.payment_reference, paymentVerified: data.payment_verified===true, serials:data.serials||{} });
    return NextResponse.json({ message: 'Order fulfilled into a retail sale', retail_sale: {id:sale.id,sale_number:sale.sale_number,grand_total:sale.grand_total} });
  } catch (error) {
    return handleRouteError(error, 'Failed to fulfill order');
  }
}
