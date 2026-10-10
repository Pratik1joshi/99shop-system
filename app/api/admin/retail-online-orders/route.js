import { staffOrderView } from '@/lib/retail-order-view.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { createOnlineOrder, listOnlineOrders } from '@/lib/retail-online-orders.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_online_orders.view' });
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const db = Database.getInstance();
    const orders = await listOnlineOrders(db, { query:searchParams.get('q'),page:searchParams.get('page'),status: searchParams.get('status') || null, source: searchParams.get('source') || null });
    return NextResponse.json({ retail_online_orders: orders.map(staffOrderView) });
  } catch (error) {
    return handleRouteError(error, 'Could not load online orders.');
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_online_orders.create' });
    if (auth.error) return auth.error;
    const data = await request.json();
    const db = Database.getInstance();
    const order = await createOnlineOrder(db, {
      source: data.source, customerId: data.customer_id, customerName: data.customer_name,
      customerPhone: data.customer_phone, customerEmail: data.customer_email,
      fulfillmentType: data.fulfillment_type, shippingAddress: data.shipping_address,
      deliveryPhone: data.delivery_phone, deliveryNotes: data.delivery_notes, deliveryCharge: data.delivery_charge,
      locationId: data.location_id, paymentMethod: data.payment_method, notes: data.notes,
      lines: data.lines, idempotencyKey: data.idempotency_key, createdBy: auth.user.id,
    });
    return NextResponse.json({ message: 'Online order created', retail_online_order: staffOrderView(order) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Failed to create online order');
  }
}
