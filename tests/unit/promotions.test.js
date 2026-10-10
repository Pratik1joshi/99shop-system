import test from 'node:test'
import assert from 'node:assert/strict'

import { allocatePromotionLines, normalizePromotion } from '../../lib/promotions.js'
import { promotionMenuBadgeLabel } from '../../lib/promotion-display.js'

const promotionDiscount = (promotion, lines) => allocatePromotionLines(promotion, lines).discount

const items = [
  { menu_item_id: 1, category_id: 10, quantity: 2, price: 200, subtotal: 400 },
  { menu_item_id: 2, category_id: 20, quantity: 1, price: 300, subtotal: 300 },
]

test('offer labels show percent and rupee discounts', () => {
  assert.equal(promotionMenuBadgeLabel({ discount_type: 'percent', discount_value: 10 }), '10% off')
  assert.equal(promotionMenuBadgeLabel({ discount_type: 'fixed', discount_value: 75 }), 'Rs 75 off')
})

test('item/category offers with no targets never discount the whole sale', () => {
  assert.equal(promotionDiscount({ scope: 'item', discount_type: 'percent', discount_value: 50, target_ids: [] }, items, 700), 0)
  assert.equal(promotionDiscount({ scope: 'category', discount_type: 'fixed', discount_value: 500, target_ids: [] }, items, 700), 0)
})

test('category offer ignores items outside the selected categories', () => {
  const discount = promotionDiscount({ scope: 'category', discount_type: 'percent', discount_value: 10, target_ids: [10] }, items, 700)
  // Only the 400 in category 10 — not the full 700
  assert.equal(discount, 40)
})

test('order percentage offer respects its maximum discount', () => {
  const discount = promotionDiscount({ scope: 'order', discount_type: 'percent', discount_value: 20, maximum_discount_amount: 100, target_ids: [] }, items, 700)
  assert.equal(discount, 100)
})

test('category offer discounts only targeted product value', () => {
  const discount = promotionDiscount({ scope: 'category', discount_type: 'percent', discount_value: 25, maximum_discount_amount: null, target_ids: [10] }, items, 700)
  assert.equal(discount, 100)
})

test('fixed item offer cannot exceed the eligible item subtotal', () => {
  const discount = promotionDiscount({ scope: 'item', discount_type: 'fixed', discount_value: 500, maximum_discount_amount: null, target_ids: [2] }, items, 700)
  assert.equal(discount, 300)
})

test('buy two get one free discounts the cheapest qualifying units', () => {
  const discount = promotionDiscount({
    offer_type: 'buy_x_get_y', scope: 'category', target_ids: [10],
    buy_quantity: 2, reward_quantity: 1, reward_discount_percent: 100,
  }, [
    { menu_item_id: 1, category_id: 10, quantity: 2, price: 200, subtotal: 400 },
    { menu_item_id: 3, category_id: 10, quantity: 1, price: 150, subtotal: 150 },
  ], 550)
  assert.equal(discount, 150)
})

test('database promotion JSON fields are normalized', () => {
  const result = normalizePromotion({ id: 4, channels: '["website"]', days_of_week: '["fri"]', auto_apply: 1, is_active: 1 }, [{ promotion_id: 4, target_id: 9 }])
  assert.deepEqual(result.channels, ['website'])
  assert.deepEqual(result.days_of_week, ['fri'])
  assert.deepEqual(result.target_ids, [9])
  assert.equal(result.auto_apply, true)
})
