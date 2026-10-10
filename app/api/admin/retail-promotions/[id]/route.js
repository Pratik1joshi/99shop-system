import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { ensureRetailPromotionSchema } from '@/lib/retail-promotions.js';

export async function PATCH(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'promotions.manage' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const data = await request.json();
    const db = Database.getInstance();
    await ensureRetailPromotionSchema(db);
    if (typeof data.is_active === 'boolean') {
      await db.run(`UPDATE promotions SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [data.is_active ? 1 : 0, id]);
    }
    const row = await db.get(`SELECT * FROM promotions WHERE id = ?`, [id]);
    return NextResponse.json({ message: 'Promotion updated', promotion: row });
  } catch (error) {
    return handleRouteError(error, 'Could not update the promotion');
  }
}

export async function DELETE(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'promotions.manage' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const db = Database.getInstance();
    await ensureRetailPromotionSchema(db);
    const used = await db.get(`SELECT COUNT(*) AS n FROM promotion_redemptions WHERE promotion_id = ?`, [id]);
    if (Number(used?.n) > 0) {
      // Redeemed at least once — deactivate instead of deleting so the
      // redemption/reporting history keeps a valid promotion row to join to.
      await db.run(`UPDATE promotions SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
      return NextResponse.json({ message: 'Promotion has redemption history — deactivated instead of deleted.' });
    }
    await db.run(`DELETE FROM promotions WHERE id = ?`, [id]);
    return NextResponse.json({ message: 'Promotion deleted' });
  } catch (error) {
    return handleRouteError(error, 'Could not delete the promotion');
  }
}
