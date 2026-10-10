import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getMovementAnalysis, getDeadStock } from '@/lib/retail-inventory-reports.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view_cost' });
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'slow'; // 'slow' | 'dead'
    const days = Number(searchParams.get('days')) || (mode === 'dead' ? 90 : 30);
    const locationId = searchParams.get('location_id') || null;
    const db = Database.getInstance();
    const rows = mode === 'dead'
      ? await getDeadStock(db, { days, locationId })
      : (await getMovementAnalysis(db, { days, locationId })).filter((r) => r.isSlowMoving);
    return NextResponse.json({ mode, days, rows });
  } catch (error) {
    return handleRouteError(error, 'Could not load movement analysis.');
  }
}
