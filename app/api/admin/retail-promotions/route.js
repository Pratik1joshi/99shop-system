import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { ensureRetailPromotionSchema } from '@/lib/retail-promotions.js';
import { normalizePromotion } from '@/lib/promotions.js';

const SCOPES = ['order', 'category', 'item', 'brand', 'variant'];
const OFFER_TYPES = ['discount', 'buy_x_get_y', 'quantity_price', 'quantity_discount', 'bundle'];
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

function clean(data) {
  const name = String(data.name || '').trim().slice(0, 120);
  if (!name) throw bad('Offer name is required.');
  const code = String(data.code || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 40) || null;
  const offerType = OFFER_TYPES.includes(data.offer_type) ? data.offer_type : 'discount';
  const scope = SCOPES.includes(data.scope) ? data.scope : 'order';
  const discountType = data.discount_type === 'fixed' ? 'fixed' : 'percent';
  const positiveInt = (v, fallback = 1) => Math.max(1, Math.min(999, parseInt(v, 10) || fallback));
  const nullableLimit = (v) => (v === '' || v == null ? null : positiveInt(v));

  const targetIds = [...new Set((Array.isArray(data.target_ids) ? data.target_ids : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const targetValues = [...new Set((Array.isArray(data.target_values) ? data.target_values : []).map((v) => String(v).trim()).filter(Boolean))];
  const bundleComponentIds = [...new Set((Array.isArray(data.bundle_component_ids) ? data.bundle_component_ids : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];

  if (offerType === 'bundle') {
    if (bundleComponentIds.length < 2) throw bad('A bundle needs at least two component products.');
    if (!(Number(data.quantity_price_amount) > 0)) throw bad('Enter the bundle price.');
  } else if (offerType === 'quantity_price') {
    if (!(Number(data.quantity_price_amount) > 0)) throw bad('Enter the group price.');
  } else if (offerType === 'buy_x_get_y' || offerType === 'quantity_discount') {
    if (scope === 'order') throw bad('Buy/get and quantity offers must target a category, brand, product or variant.');
  } else {
    if (!(Number(data.discount_value) > 0) || (discountType === 'percent' && Number(data.discount_value) > 100)) throw bad('Enter a valid discount value.');
  }
  if (scope === 'brand' && !targetValues.length) throw bad('Choose at least one brand.');
  if (['category', 'item', 'variant'].includes(scope) && !targetIds.length) throw bad('Choose at least one target.');

  return {
    name, code, description: String(data.description || '').trim().slice(0, 300), offerType, discountType, scope,
    discountValue: offerType === 'bundle' || offerType === 'quantity_price' ? 0 : Number(data.discount_value) || 0,
    quantityPriceAmount: (offerType === 'bundle' || offerType === 'quantity_price') ? Number(data.quantity_price_amount) : null,
    buyQuantity: positiveInt(data.buy_quantity), rewardQuantity: positiveInt(data.reward_quantity),
    rewardDiscountPercent: Math.max(1, Math.min(100, Number(data.reward_discount_percent) || 100)),
    minimum: Math.max(0, Number(data.minimum_order_amount) || 0),
    maximum: data.maximum_discount_amount === '' || data.maximum_discount_amount == null ? null : Math.max(0, Number(data.maximum_discount_amount) || 0),
    days: (Array.isArray(data.days_of_week) ? data.days_of_week : []).filter((v) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].includes(v)),
    targetIds, targetValues, bundleComponentIds,
    startsAt: data.starts_at || null, endsAt: data.ends_at || null,
    dailyStartTime: data.daily_start_time || null, dailyEndTime: data.daily_end_time || null,
    usageLimit: nullableLimit(data.usage_limit), perCustomerLimit: nullableLimit(data.per_customer_limit),
    stackable: Boolean(data.stackable), priority: Math.max(0, Math.min(100, parseInt(data.priority, 10) || 0)),
    autoApply: code ? false : Boolean(data.auto_apply), active: data.is_active !== false,
  };
}

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_pos.use' });
    if (auth.error) return auth.error;
    const db = Database.getInstance();
    await ensureRetailPromotionSchema(db);
    const rows = await db.all(`SELECT * FROM promotions WHERE channels LIKE '%retail_pos%' ORDER BY is_active DESC, created_at DESC`);
    const ids = rows.map((r) => r.id);
    const targets = ids.length ? await db.all(`SELECT * FROM promotion_targets WHERE promotion_id IN (${ids.map(() => '?').join(',')})`, ids) : [];
    const usage = ids.length
      ? await db.all(`SELECT promotion_id, COUNT(*) AS uses, COALESCE(SUM(discount_amount),0) AS saved FROM promotion_redemptions WHERE promotion_id IN (${ids.map(() => '?').join(',')}) GROUP BY promotion_id`, ids)
      : [];
    const usageMap = new Map(usage.map((r) => [Number(r.promotion_id), r]));
    const categories = await db.all(`SELECT id, name FROM menu_categories WHERE is_active = 1 ORDER BY name`);
    return NextResponse.json({
      promotions: rows.map((row) => ({ ...normalizePromotion(row, targets), uses: Number(usageMap.get(row.id)?.uses || 0), saved: Number(usageMap.get(row.id)?.saved || 0) })),
      categories,
    });
  } catch (error) {
    return handleRouteError(error, 'Could not load promotions.');
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'promotions.manage' });
    if (auth.error) return auth.error;
    const data = clean(await request.json());
    const db = Database.getInstance();
    await ensureRetailPromotionSchema(db);
    const id = await db.transaction(async (tx) => {
      const inserted = await tx.run(
        `INSERT INTO promotions
           (name, code, description, offer_type, discount_type, discount_value, scope, buy_quantity, reward_quantity,
            reward_discount_percent, quantity_price_amount, minimum_order_amount, maximum_discount_amount, starts_at, ends_at,
            daily_start_time, daily_end_time, days_of_week, channels, usage_limit, per_customer_limit, stackable, priority,
            auto_apply, is_active, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.name, data.code, data.description || null, data.offerType, data.discountType, data.discountValue, data.scope,
          data.buyQuantity, data.rewardQuantity, data.rewardDiscountPercent, data.quantityPriceAmount, data.minimum, data.maximum,
          data.startsAt, data.endsAt, data.dailyStartTime, data.dailyEndTime, JSON.stringify(data.days), JSON.stringify(['retail_pos']),
          data.usageLimit, data.perCustomerLimit, data.stackable ? 1 : 0, data.priority, data.autoApply ? 1 : 0, data.active ? 1 : 0, auth.user.id]
      );
      const promotionId = inserted.lastInsertRowid;
      if (data.scope === 'brand') {
        let seq = 1;
        for (const value of data.targetValues) {
          await tx.run(`INSERT INTO promotion_targets (promotion_id, target_type, target_id, target_value) VALUES (?, 'brand', ?, ?)`, [promotionId, seq++, value]);
        }
      } else {
        for (const targetId of data.targetIds) {
          await tx.run(`INSERT INTO promotion_targets (promotion_id, target_type, target_id) VALUES (?, ?, ?)`, [promotionId, data.scope, targetId]);
        }
      }
      for (const componentId of data.bundleComponentIds) {
        await tx.run(`INSERT INTO promotion_targets (promotion_id, target_type, target_id) VALUES (?, 'bundle_component', ?)`, [promotionId, componentId]);
      }
      return promotionId;
    });
    return NextResponse.json({ message: 'Promotion created', id }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Could not create the promotion');
  }
}
