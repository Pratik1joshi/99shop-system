import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getStockCountVariance } from '@/lib/retail-stock-counts.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';

// Blind count: the counter sees product/variant but not expected system
// quantity — only someone with the approve permission (the reviewer) can see
// expected/reconciledExpected/variance while the count is still open.
function withBlindMasking(count) {
  if (!count.blind || count.status !== 'COUNTING') return count;
  return {
    ...count,
    lines: count.lines.map((l) => ({ ...l, expected_quantity: null, reconciledExpected: null, variance: null, valueVariance: null,
      value_variance: null, expectedSerials: [], missingSerials: [], serials: (l.serials || []).filter((row) => Number(row.counted)).map((row) => ({ serial_number: row.serial_number, counted: 1 })) })),
  };
}

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const db = Database.getInstance();
    const count = await getStockCountVariance(db, id);
    return NextResponse.json({ retail_stock_count: redactRetailCost(withBlindMasking(count), auth.user.role) });
  } catch (error) {
    return handleRouteError(error, 'Could not load stock count.');
  }
}
