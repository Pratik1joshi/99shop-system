/**
 * Shared offer badge helpers for the till and website product grids.
 * Schedule checks are safe for client + server (Nepal time).
 */

export function promotionBadgeLabel(promo) {
  if (!promo) return null
  if (promo.offer_type === 'buy_x_get_y') {
    return `Buy ${promo.buy_quantity} get ${promo.reward_quantity}`
  }
  if (promo.discount_type === 'percent') return `${promo.discount_value}% off`
  return `Rs ${promo.discount_value} off`
}

/** First matching auto offer for a product (order → item → category). */
export function findPromotionForProduct(promotions, product) {
  const productId = Number(product?.id || product?.product_id || product?.item_id || 0)
  const categoryId = Number(product?.category_id || 0)
  for (const promo of promotions || []) {
    const scope = promo.scope || 'order'
    const targets = (promo.target_ids || []).map(Number)
    if (scope === 'order') return promo
    if (scope === 'item' && targets.includes(productId)) return promo
    if (scope === 'category' && targets.includes(categoryId)) return promo
  }
  return null
}

/** Normalize "7:00", "07:00:00", "12:00 PM" → "HH:MM" (24h). */
export function normalizeClockTime(value) {
  if (value == null || value === '') return null
  const raw = String(value).trim()
  const ampm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i)
  if (!ampm) return null
  let hour = Number(ampm[1])
  const minute = ampm[2]
  const meridiem = (ampm[3] || '').toLowerCase()
  if (meridiem === 'pm' && hour < 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null
  return `${String(hour).padStart(2, '0')}:${minute}`
}

export function nepalClockNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  let hour = parts.find((part) => part.type === 'hour')?.value || '00'
  const minute = parts.find((part) => part.type === 'minute')?.value || '00'
  if (hour === '24') hour = '00'
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
}

/**
 * True when the offer is inside its date range, weekday list, and daily window.
 * Daily end is exclusive ("until 12:00" ends at 12:00 sharp).
 */
export function isPromotionScheduledNow(promotion, now = new Date()) {
  if (!promotion) return false
  if (promotion.starts_at && now < new Date(promotion.starts_at)) return false
  if (promotion.ends_at && now > new Date(promotion.ends_at)) return false
  const days = promotion.days_of_week || []
  if (days.length) {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kathmandu',
      weekday: 'short',
    })
      .format(now)
      .toLowerCase()
    if (!days.includes(weekday)) return false
  }
  if (promotion.daily_start_time || promotion.daily_end_time) {
    const current = nepalClockNow(now)
    const start = normalizeClockTime(promotion.daily_start_time) || '00:00'
    const end = normalizeClockTime(promotion.daily_end_time) || '23:59'
    // Exclusive end so "ends 12:00" is off at noon, not for the whole 12:00 minute.
    const inWindow =
      start <= end ? current >= start && current < end : current >= start || current < end
    if (!inWindow) return false
  }
  return true
}
