import { ensureRetailCommerceSchema } from '@/lib/retail-commerce-schema.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getStoreCreditBalance } from '@/lib/retail-store-credit.js';
export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'customers.access' });
    if (auth.error) return auth.error;await ensureRetailCommerceSchema(Database.getInstance());
    const id = Number(new URL(request.url).searchParams.get('id'));
    const db = Database.getInstance();
    const customer = await db.get('SELECT id,name,phone,current_credit,credit_limit,is_blacklisted,store_credit_balance FROM customers WHERE id=?', [id]);
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    const receivable = await db.get("SELECT COALESCE(SUM(amount_due),0) AS due FROM retail_sales WHERE customer_id=? AND status='COMPLETED'", [id]);
    customer.current_credit = Number(receivable.due);
    customer.store_credit_balance = await getStoreCreditBalance(db, id);
    return NextResponse.json({ customer }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return handleRouteError(error, 'Could not load checkout customer.'); }
}
