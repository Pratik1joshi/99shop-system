import { commerceSaleVisibility, assertHeldOwner } from '@/lib/commerce-visibility.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getRetailSale, updateHeldSale } from '@/lib/retail-sales.js';

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager', 'accountant'], permission: 'retail_sale.view' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const db = Database.getInstance();
    await assertHeldOwner(db, id, auth.user);
    const sale = await getRetailSale(db, id);
    if (!sale) return NextResponse.json({ error: 'Sale not found.' }, { status: 404 });
    const reprints = await db.get('SELECT COUNT(*) AS count FROM retail_sale_audit WHERE retail_sale_id=?', [sale.id]);
    sale.reprint_count = Number(reprints?.count || 0);
    return NextResponse.json({ retail_sale: commerceSaleVisibility(sale, auth.user.role) });
  } catch (error) {
    return handleRouteError(error, 'Could not load sale.');
  }
}

export async function PUT(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'retail_pos.use' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const data = await request.json();
    if (data.allowPriceOverride) {
      const overrideAuth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'retail_sale.price_override' });
      if (overrideAuth.error) return overrideAuth.error;
    }

    const db = Database.getInstance();
    await assertHeldOwner(db, id, auth.user);
    const sale = await updateHeldSale(db, id, data);
    return NextResponse.json({ message: 'Sale updated', retail_sale: commerceSaleVisibility(sale, auth.user.role) });
  } catch (error) {
    return handleRouteError(error, 'Failed to update sale');
  }
}
