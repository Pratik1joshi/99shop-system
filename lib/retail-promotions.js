/**
 * Retail promotions — a thin adapter over the Restaurant's existing engine
 * (lib/promotions.js: schema, scheduling, per-line allocation, usage limits)
 * rather than a second engine. Retail-only additions live in lib/promotions.js
 * itself (brand/variant scope, quantity_price/quantity_discount/bundle offer
 * types, `retail_pos` channel, priority column) — this file only adapts the
 * retail cart shape into the engine's generic `items` shape and adds the
 * stacking policy retail needs (the shared evaluatePromotion() stays
 * single-best-only for restaurant callers, untouched, to avoid any behavior
 * change there).
 *
 * ── STACKING POLICY (deterministic, not implementation-order-dependent) ───
 * Every eligible promotion is evaluated independently against the ORIGINAL
 * cart (never against another promotion's already-discounted price — that
 * would make the result depend on which order they happen to be evaluated
 * in). Then:
 *   - A matched coupon that is NOT `stackable` wins alone — every other
 *     promotion is dropped, coupon or not (spec: "coupon cannot accidentally
 *     stack ... unless explicitly allowed").
 *   - Otherwise, all `stackable=true` eligible promotions combine (each
 *     line's combined discount capped at that line's own subtotal, so
 *     stacking can never take a line negative).
 *   - All `stackable=false` (exclusive) eligible promotions compete for a
 *     single winner: highest `priority`, ties broken by highest discount,
 *     ties broken by lowest id.
 *   - Whichever total is larger — the stacked-combo or the best exclusive
 *     single — is what applies. A tie prefers the single exclusive offer
 *     (one named line on the receipt beats an unreadable pile of small ones).
 *
 * ── MARGIN PROTECTION ──────────────────────────────────────────────────────
 * A promotion may not discount a line below the variant's current moving-
 * average cost unless the caller passes allowBelowCost (gated behind the
 * existing 'retail_sale.price_override' permission at the route layer — no
 * new permission invented for this).
 */

import {
  ensurePromotionSchema, normalizePromotion, allocatePromotionLines, lineMatchesPromotion,
} from '@/lib/promotions.js';
import { isPromotionScheduledNow } from '@/lib/promotion-display.js';
import { getMovingAverageCost } from '@/lib/retail-inventory.js';
import { ensureProductCatalogSchema } from '@/lib/product-catalog.js';
import { ensureColumn } from '@/lib/db/schema-helpers.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export async function ensureRetailPromotionSchema(db) {
  await ensurePromotionSchema(db);
  // buildPromotionItems() reads menu_items.brand unconditionally on every
  // checkout (even when no promotion exists) — never assume some other code
  // path already ensured it.
  await ensureProductCatalogSchema(db);
  // Separate from `order_id`/`bill_id` (restaurant FKs) — a retail sale's id
  // space is unrelated to those tables; keeping it its own column avoids ever
  // mixing them up in a report.
  await ensureColumn(db, 'promotion_redemptions', 'retail_sale_id', 'INTEGER');
}

/** Retail cart line -> the engine's generic item shape (product/category/brand/variant + price). */
export async function buildPromotionItems(db, lines = []) {
  const items = [];
  const ids=[...new Set(lines.map(l=>Number(l.variantId??l.variant_id)).filter(Boolean))];
  const rows=ids.length?await db.all(`SELECT v.id AS variant_id,v.menu_item_id,v.price,mi.category_id,mi.brand FROM menu_item_variants v JOIN menu_items mi ON mi.id=v.menu_item_id WHERE v.id IN (${ids.map(()=>'?').join(',')})`,ids):[];
  const byId=new Map(rows.map(row=>[Number(row.variant_id),row]));
  for (const l of lines) {
    const variantId = Number(l.variantId ?? l.variant_id);
    const quantity = Number(l.quantity) || 0;
    if (!variantId || quantity <= 0) continue;
    const row=byId.get(variantId);
    if (!row) continue;
    // Promotions always price against the catalog price, never a cashier's
    // price-override — a promo on an overridden line would otherwise reward
    // (or double-punish) whatever the override happened to be.
    const unitPrice = Number(l.unitPrice ?? l.unit_price ?? row.price ?? 0);
    items.push({
      menu_item_id: row.menu_item_id, category_id: row.category_id, brand: row.brand, variant_id: variantId,
      price: unitPrice, quantity, subtotal: round2(unitPrice * quantity),
    });
  }
  return items;
}

async function getEligibleRetailPromotions(db, { items, couponCode = '', phone = '', now = new Date(), channel = 'retail_pos' }) {
  const code = String(couponCode || '').trim().toUpperCase();
  const rows = code
    ? await db.all(`SELECT * FROM promotions WHERE is_active = 1 AND UPPER(COALESCE(code,'')) = ?`, [code])
    : await db.all(`SELECT * FROM promotions WHERE is_active = 1 AND auto_apply = 1`);
  if (code && !rows.length) throw bad('This coupon code is not valid.', 404);
  if (!rows.length) return [];
  const ids = rows.map((r) => Number(r.id));
  const placeholders = ids.map(() => '?').join(',');
  const targets = await db.all(`SELECT * FROM promotion_targets WHERE promotion_id IN (${placeholders})`, ids);
  const usage = await db.all(
    `SELECT promotion_id, COUNT(*) AS uses FROM promotion_redemptions WHERE promotion_id IN (${placeholders}) GROUP BY promotion_id`,
    ids
  );
  const usageMap = new Map(usage.map((r) => [Number(r.promotion_id), Number(r.uses || 0)]));
  const normalizedPhone = String(phone || '').replace(/\s+/g, '');
  const customerUsage = normalizedPhone
    ? await db.all(
        `SELECT promotion_id, COUNT(*) AS uses FROM promotion_redemptions WHERE promotion_id IN (${placeholders}) AND customer_phone = ? GROUP BY promotion_id`,
        [...ids, normalizedPhone]
      )
    : [];
  const customerUsageMap = new Map(customerUsage.map((r) => [Number(r.promotion_id), Number(r.uses || 0)]));
  const subtotal = round2(items.reduce((s, i) => s + i.subtotal, 0));

  return rows
    .map((row) => normalizePromotion(row, targets))
    .filter((p) => p.channels.includes(channel==='online'?'website':channel))
    .filter((p) => p.scope === 'order' || p.offer_type === 'bundle'
      || (p.scope === 'brand' ? p.target_values.length > 0 : p.target_ids.length > 0))
    .filter((p) => isPromotionScheduledNow(p, now) && subtotal >= p.minimum_order_amount)
    .filter((p) => p.usage_limit == null || (usageMap.get(p.id) || 0) < p.usage_limit)
    .filter((p) => channel!=='online'||normalizedPhone||p.per_customer_limit==null)
    .filter((p) => !normalizedPhone || p.per_customer_limit == null || (customerUsageMap.get(p.id) || 0) < p.per_customer_limit)
    .map((p) => ({ promotion: p, ...allocatePromotionLines(p, items) }))
    .filter((r) => r.discount > 0);
}

/** Clamp each line's combined discount so unit price never drops below moving-average cost. */
async function applyMarginFloor(db, items, combinedLineDiscount, allowBelowCost) {
  if (allowBelowCost) return combinedLineDiscount;
  const clamped = new Map();
  for (const [index, discount] of combinedLineDiscount) {
    const item = items[index];
    if (!item) { clamped.set(index, discount); continue; }
    const { averageCost } = await getMovingAverageCost(db, item.variant_id);
    const floorTotal = round2(averageCost * item.quantity);
    const maxDiscount = Math.max(0, round2(item.subtotal - floorTotal));
    clamped.set(index, Math.min(discount, maxDiscount));
  }
  return clamped;
}

/**
 * @returns {{ appliedPromotions: Array, totalDiscount: number, lineDiscounts: Map<number, number> }}
 *   lineDiscounts keys by index into the `items` array this was called with.
 */
export async function evaluateRetailPromotions(db, { lines = [], couponCode = '', customerId = null, now = new Date(), channel = 'retail_pos', allowBelowCost = false } = {}) {
  await ensureRetailPromotionSchema(db);
  const items = await buildPromotionItems(db, lines);
  if (!items.length) return { appliedPromotions: [], totalDiscount: 0, lineDiscounts: new Map(), items };

  let phone = '';
  if (customerId) {
    const customer = await db.get(`SELECT phone FROM customers WHERE id = ?`, [customerId]);
    phone = customer?.phone || '';
  }

  const eligible = await getEligibleRetailPromotions(db, { items, couponCode, phone, now, channel });
  if (!eligible.length) return { appliedPromotions: [], totalDiscount: 0, lineDiscounts: new Map(), items, phone };

  const couponMatch = couponCode ? eligible.find((r) => r.promotion.code && r.promotion.code.toUpperCase() === couponCode.trim().toUpperCase()) : null;

  let chosen;
  if (couponMatch && !couponMatch.promotion.stackable) {
    chosen = [couponMatch];
  } else {
    const stackable = eligible.filter((r) => r.promotion.stackable);
    const exclusive = eligible.filter((r) => !r.promotion.stackable);
    const bestExclusive = exclusive.length
      ? exclusive.slice().sort((a, b) => (b.promotion.priority - a.promotion.priority) || (b.discount - a.discount) || (a.promotion.id - b.promotion.id))[0]
      : null;
    const stackedTotal = round2(stackable.reduce((s, r) => s + r.discount, 0));
    const exclusiveTotal = bestExclusive ? bestExclusive.discount : 0;
    chosen = stackedTotal > exclusiveTotal ? stackable : (bestExclusive ? [bestExclusive] : []);
  }
  if (!chosen.length) return { appliedPromotions: [], totalDiscount: 0, lineDiscounts: new Map(), items, phone };

  const combined = new Map();
  for (const result of chosen) {
    for (const line of result.lines) {
      if (!(line.line_discount > 0)) continue;
      combined.set(line.index, round2((combined.get(line.index) || 0) + line.line_discount));
    }
  }
  const lineDiscounts = await applyMarginFloor(db, items, combined, allowBelowCost);
  const totalDiscount = round2([...lineDiscounts.values()].reduce((s, v) => s + v, 0));

  return {
    appliedPromotions: chosen.map((r) => ({
      id: r.promotion.id, name: r.promotion.name, code: r.promotion.code, offerType: r.promotion.offer_type,
      discount: round2(r.lines.reduce((s, l) => s + Math.min(l.line_discount, lineDiscounts.get(l.index) ?? l.line_discount), 0)),
    })),
    totalDiscount,
    lineDiscounts,
    items,
    phone,
  };
}

/** Re-checks limits inside the checkout transaction — preview-time checks can't stop a concurrent last-use race. */
export async function recordRetailPromotionRedemptions(db, { appliedPromotions = [], retailSaleId, customerPhone = null, channel = 'retail_pos' }) {
  for (const promo of appliedPromotions) {
    if (!(promo.discount > 0)) continue;
    const existing = await db.get(`SELECT id FROM promotion_redemptions WHERE promotion_id = ? AND retail_sale_id = ? LIMIT 1`, [promo.id, retailSaleId]);
    if (existing) continue;
    const lock = db.driver === 'postgres' ? ' FOR UPDATE' : '';
    const rule = await db.get(`SELECT usage_limit, per_customer_limit FROM promotions WHERE id = ?${lock}`, [promo.id]);
    if (rule?.usage_limit != null) {
      const total = await db.get(`SELECT COUNT(*) AS uses FROM promotion_redemptions WHERE promotion_id = ?`, [promo.id]);
      if (Number(total?.uses || 0) >= Number(rule.usage_limit)) {
        throw bad(`"${promo.name}" has reached its total usage limit.`, 409);
      }
    }
    const phone = String(customerPhone || '').replace(/\s+/g, '');
    if (phone && rule?.per_customer_limit != null) {
      const used = await db.get(`SELECT COUNT(*) AS uses FROM promotion_redemptions WHERE promotion_id = ? AND customer_phone = ?`, [promo.id, phone]);
      if (Number(used?.uses || 0) >= Number(rule.per_customer_limit)) {
        throw bad(`This customer has already used "${promo.name}" the maximum number of times.`, 409);
      }
    }
    await db.run(
      `INSERT INTO promotion_redemptions (promotion_id, retail_sale_id, promotion_name, promotion_code, channel, discount_amount, customer_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [promo.id, retailSaleId, promo.name, promo.code || null, channel, promo.discount, phone || null]
    );
  }
}

export { lineMatchesPromotion };
