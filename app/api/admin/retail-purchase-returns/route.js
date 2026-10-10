import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { createPurchaseReturn, ensureRetailPurchasingSchema, getPurchaseReturn } from '@/lib/retail-purchasing.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.return.create' });
    if (auth.error) return auth.error;

    const db = Database.getInstance();
    await ensureRetailPurchasingSchema(db);
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (id) {
      const ret = await getPurchaseReturn(db, id);
      if (!ret) return NextResponse.json({ error: 'Purchase return not found.' }, { status: 404 });
      return NextResponse.json({ purchase_return: redactRetailCost(ret, auth.user.role, 'retail_purchasing.view_cost') });
    }
    const rows = await db.all(
      `SELECT pr.*, s.name AS supplier_name
       FROM purchase_returns pr
       LEFT JOIN suppliers s ON s.id = pr.supplier_id
       ORDER BY pr.id DESC LIMIT 200`
    );
    return NextResponse.json({ purchase_returns: redactRetailCost(rows, auth.user.role, 'retail_purchasing.view_cost') });
  } catch (error) {
    return handleRouteError(error, 'Could not load purchase returns.');
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.return.create' });
    if (auth.error) return auth.error;

    const data = await request.json();
    const db = Database.getInstance();
    const costAuth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.view_cost' });
    if (costAuth.error) data.lines = (data.lines || []).map((line) => {
      const safe = { ...line };
      delete safe.unit_cost;
      delete safe.unitCost;
      return safe;
    });
    const ret = await createPurchaseReturn(db, { ...data, createdBy: auth.user.id });
    return NextResponse.json({ message: 'Purchase return created', purchase_return: redactRetailCost(ret, auth.user.role, 'retail_purchasing.view_cost') }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Failed to create purchase return');
  }
}
