# Findings — offers / website

## Flow audit (good enough)
- **Offers & discounts** = one `promotions` system (`/admin/promotions`). Discount %/fixed, buy-X-get-Y, schedule, days, **daily time window = happy hour**, channels, auto-apply vs coupon.
- Engine: `lib/promotions.js` → POS pay, billing, public orders, QR. Unit tests cover calc/limits.
- **Combos** separate (`/admin/combos`), already have `image_url` on `menu_items`, show on menu with COMBO badge. Stock expands components.
- **Gap:** no public listing on home; promotions have **no image column**; category/item pick = native `<select multiple>` + Ctrl.

## UX issue
`app/admin/promotions/page.jsx` line ~85 — Hold Ctrl to multi-select.

## Website
Insert offers strip after hero in `app/(public)/page.jsx` when ≥1 active website promo or combo.
