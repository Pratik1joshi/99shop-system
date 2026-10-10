import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getVoidStatus, verifyApprover, voidSale } from '@/lib/retail-void.js';
import { logger } from '@/lib/logger.js';

/** Can this sale be quick-voided right now, and how would it be refunded? */
export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'retail_sale.view' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    return NextResponse.json(await getVoidStatus(Database.getInstance(), id), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return handleRouteError(error, 'Could not check this sale.');
  }
}

/** Void = full return in one step, approved by a manager or owner PIN. */
export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'retail_pos.use' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const db = Database.getInstance();
    const approver = await verifyApprover(db, body.approver_username, body.approver_pin);
    const result = await voidSale(db, id, { cashierId: auth.user.id, approverId: approver.id, reason: body.reason });
    logger.info('retail_sale_voided', { sale_id: Number(id), by: auth.user.id, approved_by: approver.id });
    return NextResponse.json({ message: 'Sale voided', approved_by: approver.name, ...result });
  } catch (error) {
    return handleRouteError(error, 'Could not void the sale.');
  }
}
