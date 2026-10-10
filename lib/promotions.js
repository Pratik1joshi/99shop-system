import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js'
import { ensureColumn } from '@/lib/db/schema-helpers.js'

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100
// 'retail_pos' is the till; 'website' is the online store.
const validChannels = new Set(['retail_pos', 'website'])

function jsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

// Brand has no id column on products (free-text), so brand targets are
// matched by promotion_targets.target_value (text) instead of target_id.
export function normalizePromotion(row, targets = []) {
  const scope = ['order', 'category', 'item', 'brand', 'variant'].includes(String(row.scope || ''))
    ? String(row.scope)
    : 'order'
  const targetIds = targets
    .filter((target) => Number(target.promotion_id) === Number(row.id))
    .filter((target) => !target.target_type || target.target_type === scope || scope === 'order')
    .map((target) => Number(target.target_id))
    .filter((id) => Number.isInteger(id) && id > 0)
  const targetValues = targets
    .filter((target) => Number(target.promotion_id) === Number(row.id))
    .filter((target) => target.target_type === scope)
    .map((target) => target.target_value)
    .filter(Boolean)
  const bundleComponentIds = targets
    .filter((target) => Number(target.promotion_id) === Number(row.id) && target.target_type === 'bundle_component')
    .map((target) => Number(target.target_id))
    .filter((id) => Number.isInteger(id) && id > 0)
  return {
    ...row,
    id: Number(row.id),
    scope,
    discount_value: Number(row.discount_value || 0),
    offer_type: row.offer_type || 'discount',
    buy_quantity: Math.max(1, Number(row.buy_quantity || 1)),
    reward_quantity: Math.max(1, Number(row.reward_quantity || 1)),
    reward_discount_percent: Math.max(0, Math.min(100, Number(row.reward_discount_percent ?? 100))),
    minimum_order_amount: Number(row.minimum_order_amount || 0),
    maximum_discount_amount: row.maximum_discount_amount == null || row.maximum_discount_amount === '' ? null : Number(row.maximum_discount_amount),
    auto_apply: Boolean(Number(row.auto_apply)),
    is_active: Boolean(Number(row.is_active)),
    daily_start_time: row.daily_start_time || null,
    daily_end_time: row.daily_end_time || null,
    usage_limit: row.usage_limit == null ? null : Number(row.usage_limit),
    per_customer_limit: row.per_customer_limit == null ? null : Number(row.per_customer_limit),
    stackable: Boolean(Number(row.stackable)),
    priority: Number(row.priority || 0),
    quantity_price_amount: row.quantity_price_amount == null || row.quantity_price_amount === '' ? null : Number(row.quantity_price_amount),
    image_url: row.image_url || null,
    website_featured: Boolean(Number(row.website_featured)),
    days_of_week: jsonArray(row.days_of_week),
    channels: jsonArray(row.channels, ['retail_pos', 'website']).filter((channel) => validChannels.has(channel)),
    target_ids: targetIds,
    target_values: targetValues,
    bundle_component_ids: bundleComponentIds,
  }
}

export async function ensurePromotionSchema(db) {
  await ensureSqliteTable(db, `
    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT, description TEXT,
      discount_type TEXT NOT NULL, discount_value REAL NOT NULL, scope TEXT NOT NULL,
      minimum_order_amount REAL DEFAULT 0, maximum_discount_amount REAL,
      starts_at DATETIME, ends_at DATETIME, days_of_week TEXT DEFAULT '[]',
      channels TEXT DEFAULT '["pos","website","qr"]', auto_apply INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1, created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await ensureSqliteTable(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_code_unique ON promotions(UPPER(code)) WHERE code IS NOT NULL AND code <> ''`)
  await ensureSqliteTable(db, `
    CREATE TABLE IF NOT EXISTS promotion_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, promotion_id INTEGER NOT NULL, target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL, UNIQUE(promotion_id, target_type, target_id),
      FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE
    )
  `)
  // target_id stays NOT NULL/integer (UNIQUE(promotion_id, target_type,
  // target_id)) — brand targets (products.brand is free-text, no id) don't have a real
  // id to put there, so the caller assigns a synthetic per-promotion
  // sequence number (1, 2, 3…) just to keep rows distinct, and the actual
  // brand string lives in target_value, which is what matching reads.
  await ensureColumn(db, 'promotion_targets', 'target_value', 'TEXT')
  await ensureSqliteTable(db, `
    CREATE TABLE IF NOT EXISTS promotion_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, promotion_id INTEGER NOT NULL,
      promotion_name TEXT NOT NULL, promotion_code TEXT, channel TEXT NOT NULL,
      discount_amount REAL NOT NULL, customer_phone TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await ensureColumn(db, 'promotions', 'offer_type', "TEXT DEFAULT 'discount'")
  await ensureColumn(db, 'promotions', 'buy_quantity', 'INTEGER DEFAULT 1')
  await ensureColumn(db, 'promotions', 'reward_quantity', 'INTEGER DEFAULT 1')
  await ensureColumn(db, 'promotions', 'reward_discount_percent', 'REAL DEFAULT 100')
  await ensureColumn(db, 'promotions', 'daily_start_time', 'TEXT')
  await ensureColumn(db, 'promotions', 'daily_end_time', 'TEXT')
  await ensureColumn(db, 'promotions', 'usage_limit', 'INTEGER')
  await ensureColumn(db, 'promotions', 'per_customer_limit', 'INTEGER')
  await ensureColumn(db, 'promotions', 'stackable', 'INTEGER DEFAULT 0')
  await ensureColumn(db, 'promotions', 'image_url', 'TEXT')
  await ensureColumn(db, 'promotions', 'website_featured', 'INTEGER DEFAULT 0')
  // See lib/retail-promotions.js for the stacking policy that reads
  // `priority`, and QUANTITY_PRICE/BUNDLE's use of `quantity_price_amount`
  // as the fixed group/bundle price.
  await ensureColumn(db, 'promotions', 'priority', 'INTEGER DEFAULT 0')
  await ensureColumn(db, 'promotions', 'quantity_price_amount', 'REAL')
}

/** True when this cart line is inside the offer's item/category/brand/variant target list. */
export function lineMatchesPromotion(promotion, item) {
  const scope = promotion?.scope || 'order'
  if (scope === 'order') return true
  if (scope === 'brand') {
    const values = new Set((promotion?.target_values || []).map((v) => String(v).toLowerCase()))
    if (!values.size) return false
    const brand = String(item?.brand || '').toLowerCase()
    return brand.length > 0 && values.has(brand)
  }
  if (scope === 'variant') {
    const targets = new Set((promotion?.target_ids || []).map(Number).filter((id) => id > 0))
    if (!targets.size) return false
    const variantId = Number(item?.variant_id ?? 0)
    return variantId > 0 && targets.has(variantId)
  }
  const targets = new Set((promotion?.target_ids || []).map(Number).filter((id) => id > 0))
  if (!targets.size) return false
  const productId = Number(item?.product_id ?? item?.item_id ?? 0)
  const categoryId = Number(item?.category_id ?? 0)
  if (scope === 'item') return productId > 0 && targets.has(productId)
  if (scope === 'category') return categoryId > 0 && targets.has(categoryId)
  return false
}

/**
 * Spread an offer across only the lines it targets.
 * Item/category offers with no targets (misconfigured) give Rs 0 — never the whole bill.
 */
/**
 * BUNDLE doesn't fit the single-scope/target-list model above — it needs
 * every listed component present together. One "complete set" = one unit of
 * each bundle_component_ids entry; discount = (sum of one-unit-each prices -
 * quantity_price_amount) per complete set, capped at how many complete sets
 * the cart actually contains (min across components of floor(qty present)).
 */
function allocateBundlePromotion(promotion, items = []) {
  const componentIds = new Set((promotion?.bundle_component_ids || []).map(Number).filter((id) => id > 0))
  const lines = (items || []).map((item, index) => ({
    index,
    product_id: Number(item.product_id ?? item.item_id ?? 0) || null,
    variant_id: Number(item.variant_id ?? 0) || null,
    category_id: Number(item.category_id ?? 0) || null,
    quantity: Number(item.quantity || 0),
    price: Number(item.price || 0),
    subtotal: round2(Number(item.subtotal ?? Number(item.price || 0) * Number(item.quantity || 0))),
    eligible: false,
    line_discount: 0,
  }))
  if (!componentIds.size) return { discount: 0, eligibleSubtotal: 0, lines }

  // The cheapest line matching each required component id (bundle targets a
  // product/variant once each — the caller is expected to list each
  // component exactly once in bundle_component_ids).
  const perComponentLine = new Map()
  for (const id of componentIds) {
    const candidates = lines.filter((l) => (l.product_id === id || l.variant_id === id) && l.quantity > 0)
    if (!candidates.length) { perComponentLine.set(id, null); continue }
    perComponentLine.set(id, candidates.reduce((a, b) => (a.price <= b.price ? a : b)))
  }
  if ([...perComponentLine.values()].some((l) => !l)) return { discount: 0, eligibleSubtotal: 0, lines } // missing a required component

  const completeSets = Math.min(...[...perComponentLine.values()].map((l) => Math.floor(l.quantity)))
  if (completeSets <= 0) return { discount: 0, eligibleSubtotal: 0, lines }

  const bundlePrice = Number(promotion.quantity_price_amount || 0)
  let eligibleSubtotal = 0
  for (const line of perComponentLine.values()) {
    line.eligible = true
    eligibleSubtotal = round2(eligibleSubtotal + line.price * completeSets)
  }
  const discount = round2(Math.max(0, Math.min(eligibleSubtotal, eligibleSubtotal - bundlePrice * completeSets)))
  let remaining = discount
  const eligibleLines = [...perComponentLine.values()]
  eligibleLines.forEach((line, idx) => {
    const setValue = round2(line.price * completeSets)
    const share = idx === eligibleLines.length - 1 ? remaining : round2(discount * (setValue / eligibleSubtotal))
    line.line_discount = Math.min(setValue, Math.max(0, share))
    remaining = round2(remaining - line.line_discount)
  })
  return { discount, eligibleSubtotal, lines }
}

export function allocatePromotionLines(promotion, items = []) {
  if (promotion?.offer_type === 'bundle') return allocateBundlePromotion(promotion, items)
  const scope = promotion?.scope || 'order'
  const targets = new Set((promotion?.target_ids || []).map(Number).filter((id) => id > 0))
  const hasTargets = scope === 'brand' ? (promotion?.target_values || []).length > 0 : targets.size > 0
  if (scope !== 'order' && !hasTargets) {
    return { discount: 0, eligibleSubtotal: 0, lines: (items || []).map((item, index) => ({
      index,
      product_id: Number(item.product_id ?? item.item_id ?? 0) || null,
      category_id: Number(item.category_id ?? 0) || null,
      quantity: Number(item.quantity || 0),
      subtotal: round2(Number(item.subtotal ?? Number(item.price || 0) * Number(item.quantity || 0))),
      eligible: false,
      line_discount: 0,
    })) }
  }

  const lines = (items || []).map((item, index) => {
    const subtotal = round2(Number(item.subtotal ?? Number(item.price || 0) * Number(item.quantity || 0)))
    const eligible = lineMatchesPromotion(promotion, item)
    return {
      index,
      product_id: Number(item.product_id ?? item.item_id ?? 0) || null,
      category_id: Number(item.category_id ?? 0) || null,
      order_item_id: item.order_item_id != null ? Number(item.order_item_id) : null,
      quantity: Number(item.quantity || 0),
      price: Number(item.price || 0),
      subtotal,
      eligible,
      line_discount: 0,
    }
  })

  const eligibleSubtotal = round2(lines.filter((line) => line.eligible).reduce((sum, line) => sum + line.subtotal, 0))
  if (eligibleSubtotal <= 0) return { discount: 0, eligibleSubtotal: 0, lines }

  let discount = 0
  if (promotion.offer_type === 'buy_x_get_y') {
    const eligible = lines
      .filter((line) => line.eligible)
      .map((line) => ({ quantity: Math.max(0, line.quantity), price: Math.max(0, line.price), index: line.index }))
      .filter((line) => line.quantity > 0)
    const totalQuantity = eligible.reduce((sum, line) => sum + line.quantity, 0)
    const buy = Math.max(1, Number(promotion.buy_quantity || 1))
    const reward = Math.max(1, Number(promotion.reward_quantity || 1))
    let rewardUnits = Math.floor(totalQuantity / (buy + reward)) * reward
    let rewardValue = 0
    const unitDiscount = new Map()
    for (const line of eligible.sort((a, b) => a.price - b.price)) {
      if (rewardUnits <= 0) break
      const used = Math.min(rewardUnits, line.quantity)
      const value = used * line.price * Number(promotion.reward_discount_percent ?? 100) / 100
      rewardValue += value
      unitDiscount.set(line.index, (unitDiscount.get(line.index) || 0) + value)
      rewardUnits -= used
    }
    discount = round2(Math.min(eligibleSubtotal, rewardValue))
    for (const line of lines) {
      if (unitDiscount.has(line.index)) line.line_discount = round2(unitDiscount.get(line.index))
    }
  } else if (promotion.offer_type === 'quantity_price') {
    // "3 for Rs 999" — every complete group of `buy_quantity` eligible units
    // (cheapest units first) is repriced to quantity_price_amount total.
    const eligible = lines
      .filter((line) => line.eligible)
      .flatMap((line) => Array.from({ length: Math.floor(line.quantity) }, () => ({ price: line.price, index: line.index })))
      .sort((a, b) => a.price - b.price)
    const groupSize = Math.max(1, Number(promotion.buy_quantity || 1))
    const groups = Math.floor(eligible.length / groupSize)
    const groupPrice = Number(promotion.quantity_price_amount || 0)
    const unitDiscount = new Map()
    let rewardValue = 0
    for (let g = 0; g < groups; g++) {
      const units = eligible.slice(g * groupSize, (g + 1) * groupSize)
      const groupSubtotal = units.reduce((s, u) => s + u.price, 0)
      const groupDiscount = Math.max(0, groupSubtotal - groupPrice)
      rewardValue += groupDiscount
      for (const u of units) unitDiscount.set(u.index, (unitDiscount.get(u.index) || 0) + (groupSubtotal > 0 ? groupDiscount * (u.price / groupSubtotal) : 0))
    }
    discount = round2(Math.min(eligibleSubtotal, rewardValue))
    for (const line of lines) {
      if (unitDiscount.has(line.index)) line.line_discount = round2(unitDiscount.get(line.index))
    }
  } else if (promotion.offer_type === 'quantity_discount') {
    // "Buy 5+, get 15% off" — a percent discount that only activates once
    // total eligible quantity reaches buy_quantity; below that, Rs 0.
    const eligible = lines.filter((line) => line.eligible)
    const totalQuantity = eligible.reduce((sum, line) => sum + line.quantity, 0)
    const threshold = Math.max(1, Number(promotion.buy_quantity || 1))
    if (totalQuantity >= threshold) {
      discount = round2(Math.min(eligibleSubtotal, eligibleSubtotal * Number(promotion.discount_value || 0) / 100))
      let remaining = discount
      eligible.forEach((line, idx) => {
        const share = idx === eligible.length - 1 ? remaining : round2(discount * (line.subtotal / eligibleSubtotal))
        line.line_discount = Math.min(line.subtotal, Math.max(0, share))
        remaining = round2(remaining - line.line_discount)
      })
    }
  } else {
    discount = promotion.discount_type === 'percent'
      ? eligibleSubtotal * Number(promotion.discount_value || 0) / 100
      : Number(promotion.discount_value || 0)
    if (promotion.maximum_discount_amount != null) discount = Math.min(discount, Number(promotion.maximum_discount_amount))
    discount = round2(Math.min(eligibleSubtotal, Math.max(0, discount)))
    // Spread proportionally across eligible lines so POS can show per-item savings.
    let remaining = discount
    const eligible = lines.filter((line) => line.eligible && line.subtotal > 0)
    eligible.forEach((line, idx) => {
      const share = idx === eligible.length - 1
        ? remaining
        : round2(discount * (line.subtotal / eligibleSubtotal))
      line.line_discount = Math.min(line.subtotal, Math.max(0, share))
      remaining = round2(remaining - line.line_discount)
    })
  }

  return { discount, eligibleSubtotal, lines }
}
