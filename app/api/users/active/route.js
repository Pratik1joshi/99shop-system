import { NextResponse } from 'next/server';
import Database from '@/lib/db/index.js';
import { handleRouteError } from '@/lib/api-guard.js';
import { checkRateLimit, clientIp } from '@/lib/rate-limit.js';
import { ENABLED_ROLES } from '@/lib/deployment.js';

/** Active staff for the login picker (no password hashes). */
export async function GET(request) {
  try {
    const limited = await checkRateLimit({ key: `active-users:${clientIp(request)}`, limit: 30, windowSeconds: 60 });
    if (!limited.ok) return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } });
    const db = Database.getInstance();
    const users = await db.all(`
      SELECT username, full_name AS display_name
      FROM users
      WHERE COALESCE(is_active, 1) = 1
        AND role IN (${ENABLED_ROLES.map(() => '?').join(',')})
      ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'cashier' THEN 2 ELSE 3 END, full_name
    `, ENABLED_ROLES);
    return NextResponse.json({ users: users || [] }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    return handleRouteError(error, 'Could not load users.');
  }
}
