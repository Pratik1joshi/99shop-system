import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'menu.view' });
    if (auth.error) return auth.error;
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Choose a product.' }, { status: 400 });
    const db = Database.getInstance();
    const movements = await db.all(`SELECT m.id,m.variant_id,m.movement_type,m.quantity,m.reference_type,m.reference_id,m.created_at
      FROM inventory_movements m JOIN menu_item_variants v ON v.id=m.variant_id
      WHERE v.menu_item_id=? ORDER BY m.id DESC LIMIT 30`, [id]);
    const sales = await db.all(`SELECT l.id,s.id AS sale_id,s.sale_number,s.completed_at,l.quantity,l.net_amount
      FROM retail_sale_lines l JOIN retail_sales s ON s.id=l.retail_sale_id JOIN menu_item_variants v ON v.id=l.variant_id
      WHERE v.menu_item_id=? AND s.status='COMPLETED' ORDER BY s.id DESC LIMIT 30`, [id]);
    return NextResponse.json({ movements, sales });
  } catch (error) { return handleRouteError(error, 'Could not load product history.'); }
}
