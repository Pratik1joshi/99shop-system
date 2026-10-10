import { NextResponse } from 'next/server';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { permission: 'warranty.configure' });
    if (auth.error) return auth.error;
    return NextResponse.json({ error: 'Configure future coverage in After-Sales warranty policies. Historical sale coverage is immutable.', href: '/admin/retail-after-sales' }, { status: 409 });
  } catch (error) {
    return handleRouteError(error, 'Could not update warranty.');
  }
}
