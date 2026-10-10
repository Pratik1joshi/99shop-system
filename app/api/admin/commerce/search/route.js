import { ensureRetailCommerceSchema } from '@/lib/retail-commerce-schema.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { AuthService } from '@/lib/auth/auth.js';
import { ensurePermissionCache } from '@/lib/permissions.js';
import { searchCommerce } from '@/lib/commerce-search.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], anyPermissions: [
      'menu.view', 'retail_inventory.view', 'retail_purchasing.grn.receive', 'customers.access',
      'retail_sale.view', 'suppliers.view',
    ] });
    if (auth.error) return auth.error;await ensureRetailCommerceSchema(Database.getInstance());
    const db = Database.getInstance();
    await ensurePermissionCache(db);
    const service = new AuthService();
    const params = new URL(request.url).searchParams;
    const data = await searchCommerce(db, { query: params.get('q'), group: params.get('group'), page: params.get('page'), limit: params.get('limit'),
      active: params.get('active') !== 'all', categoryId: params.get('categoryId'), brand: params.get('brand'), tracking: params.get('tracking'), stockStatus: params.get('stockStatus'), sort: params.get('sort'), productId: params.get('productId'), locationId: params.get('locationId'),
      prefix: auth.user.role === 'cashier' ? '/cashier' : '/admin', can: (key) => service.hasPermission(auth.user.role, key) });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return handleRouteError(error, 'Could not search commerce.'); }
}
