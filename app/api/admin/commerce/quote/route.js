import { ensureRetailCommerceSchema } from '@/lib/retail-commerce-schema.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { AuthService } from '@/lib/auth/auth.js';
import { ensurePermissionCache } from '@/lib/permissions.js';
import { quoteRetailSale } from '@/lib/retail-sales.js';
export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'retail_pos.use' });
    if (auth.error) return auth.error;await ensureRetailCommerceSchema(Database.getInstance());
    const db = Database.getInstance();
    await ensurePermissionCache(db);
    const service = new AuthService();
    const data = await request.json();
    return NextResponse.json(await quoteRetailSale(db, data, {
      allowDiscount: service.hasPermission(auth.user.role, 'retail_sale.discount'),
      allowPriceOverride: !!data.allowPriceOverride && service.hasPermission(auth.user.role, 'retail_sale.price_override'),
    }));
  } catch (error) { return handleRouteError(error, 'Could not validate this cart.'); }
}
