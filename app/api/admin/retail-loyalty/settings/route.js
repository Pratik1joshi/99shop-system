import { NextResponse } from 'next/server';
import Database from '@/lib/db/index.js';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getLoyaltySettings, ensureLoyaltySettingsAudit } from '@/lib/retail-loyalty.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin'] });
    if (auth.error) return auth.error;
    const db = Database.getInstance();
    return NextResponse.json({ settings: await getLoyaltySettings(db) });
  } catch (error) { return handleRouteError(error, 'Could not load loyalty rules.'); }
}

export async function PUT(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin'] });
    if (auth.error) return auth.error;
    const input = await request.json();
    const earn = Number(input.earnRateAmount);
    const points = Number(input.pointsPerCurrency);
    const max = Number(input.redeemMaxPercent);
    if (!Number.isFinite(earn) || earn <= 0 || earn > 1000000 ||
      !Number.isFinite(points) || points <= 0 || points > 1000000 ||
      !Number.isFinite(max) || max <= 0 || max > 100)
      return NextResponse.json({ error: 'Enter a positive earn rate, positive redemption conversion and a maximum from 1 to 100%.' }, { status: 400 });
    const db = Database.getInstance();
    await ensureLoyaltySettingsAudit(db);
    const before = await getLoyaltySettings(db);
    const next = { earnRateAmount: earn, pointsPerCurrency: points, redeemMaxPercent: max, enabled: input.enabled === true };
    await db.transaction(async (tx) => {
      for (const [key, value] of Object.entries({
        loyalty_earn_rate_amount: earn, loyalty_points_per_currency: points,
        loyalty_redeem_max_percent: max, loyalty_enabled: next.enabled ? 1 : 0,
      })) await tx.run(`INSERT INTO system_settings (setting_key,setting_value) VALUES (?,?)
        ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=CURRENT_TIMESTAMP`, [key, String(value)]);
      await tx.run(`INSERT INTO retail_loyalty_settings_audit (old_value,new_value,actor_id) VALUES (?,?,?)`,
        [JSON.stringify(before), JSON.stringify(next), auth.user.id]);
    });
    return NextResponse.json({ settings: await getLoyaltySettings(db) });
  } catch (error) { return handleRouteError(error, 'Could not save loyalty rules.'); }
}
