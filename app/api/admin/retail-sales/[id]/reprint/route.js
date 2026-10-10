import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'retail_sale.view' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const db = Database.getInstance();
    const sale = await db.get('SELECT id,status FROM retail_sales WHERE id=?', [Number(id)]);
    if (!sale) return NextResponse.json({ error: 'Sale not found.' }, { status: 404 });
    if (sale.status !== 'COMPLETED') return NextResponse.json({ error: 'Only completed sales can be reprinted.' }, { status: 409 });
    await db.run("INSERT INTO retail_sale_audit(retail_sale_id,event,actor_id) VALUES (?,'REPRINT_REQUESTED',?)", [sale.id, auth.user.id]);
    return NextResponse.json({ recorded: true });
  } catch (error) { return handleRouteError(error, 'Could not record receipt reprint.'); }
}
