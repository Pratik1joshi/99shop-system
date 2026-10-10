import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getExpiredStock, getExpiringStock } from '@/lib/retail-inventory.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'expiring'; // 'expiring' | 'expired'
    const days = Number(searchParams.get('days')) || 30;
    const locationId = searchParams.get('location_id') || null;
    const db = Database.getInstance();
    const rows = mode === 'expired'
      ? await getExpiredStock(db, { locationId })
      : await getExpiringStock(db, days, { locationId });
    return NextResponse.json({ mode, days, rows });
  } catch (error) {
    return handleRouteError(error, 'Could not load expiry report.');
  }
}
