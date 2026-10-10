import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { ensurePayrollSchema, getPerformance } from '@/lib/payroll.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'employee_performance.view' });
    if (auth.error) return auth.error;
    const params = new URL(request.url).searchParams;
    const from = params.get('from') || null;
    const to = params.get('to') || null;
    if ((from && !DATE.test(from)) || (to && !DATE.test(to)) || (from && to && from > to)) {
      return NextResponse.json({ error: 'Use a valid date range (YYYY-MM-DD, from on or before to).' }, { status: 400 });
    }
    const db = Database.getInstance();
    await ensurePayrollSchema(db);
    return NextResponse.json({ from, to, performance: await getPerformance(db, { from, to }) });
  } catch (error) {
    return handleRouteError(error, 'Failed to load employee performance');
  }
}
