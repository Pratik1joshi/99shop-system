# Offers on website + UX

## Goal
Audit offers/combos/discounts, fix create-offer target selection UX, add promo images, show active offers/combos on public home (after hero) only when any exist.

## Phases
1. [done] Audit flow (promotions + combos + happy-hour schedule)
2. [done] Searchable multi-select for categories/items (no Ctrl)
3. [done] `image_url` on promotions + admin upload UI
4. [done] Public offers loader + home horizontal strip
5. [done] Verify / smoke (unit tests pass)

## Done when
- Create offer uses searchable checkbox-style picker
- Offers can have an image (like combos)
- Home shows Offers strip iff ≥1 active website promo or combo
- Existing checkout/POS promo logic unchanged
