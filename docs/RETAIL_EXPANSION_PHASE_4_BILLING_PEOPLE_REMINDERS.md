# Retail expansion phase 4: restaurant-style billing, staff performance, reminders (2026-09-28)

This phase clears the "Remaining" list in `RETAIL_EXPANSION_PHASE_3_RESTAURANT_STYLE.md` and restyles Billing after the restaurant POS (`../dimsonpuri/components/pos/admin-pos.jsx`). No sale, stock or journal logic changed; Billing still calls the same Retail quote, hold and checkout endpoints.

## Billing

| Restaurant POS | Retail Billing now |
| --- | --- |
| Full-height board: product grid left, 440–540 px cart right | Same split (420 / 500 px cart); sidebar opens on the icon rail on Billing and can be expanded for that visit |
| Header actions, search, collapsible category chips | Held (n), Scan, Shortcuts, New; barcode/SKU search; category chips filter the product search (`categoryId`) |
| Image cards with stock badge, "No stock" ribbon, offer badge | Image cards (`menu_items.image_url`, package icon fallback), green/amber/red stock badge, out-of-stock ribbon, SERIAL/BATCH tag, MRP strike-through |
| Cart cards with image, ± quantity, line total | Same; serial lines keep quantity 1; line discount, serials and price reason show on the card |
| Totals box, coloured action grid | Totals box (promotions, line/manual/loyalty discounts, VAT); Hold, Last receipt, Charge |
| Mobile cart button + bottom sheet | Same; the sheet is `invisible` when closed, so it leaves the tab order and accessibility tree |

Retail-only controls stay in the cart: customer search/create, AR and store-credit summary, loyalty redemption, coupon, manual discount, hold label. Keyboard shortcuts (F2–F10) are unchanged. Product stock badges now reload after checkout: `useCommerceSearch` accepts a `refreshKey`, which Billing already bumped but the hook ignored.

## Staff performance

`lib/payroll.js#getPerformance` read restaurant `orders`, `bills` and `wastage_log`. It now uses `getSalesByDimension(..., groupBy: 'staff')`, the same net-sales and return rules as Reports, keyed by `retail_sales.cashier_id`. Returns are credited to the original seller when they post. Attendance comes from the HRM `attendance` register (half day = 0.5). The page has a date range and role filter. It is linked under People, and cashiers see it only with `employee_performance.view`. Cost and profit are not shown.

## Finance dashboard

`lib/accounting-dashboard.js` computed gross profit with restaurant COGS `5010` only and inventory from `1200` only. It now includes Retail `5080` and `1210`. The page stays unlinked because Finance overview (`/admin/retail-finance`) covers it.

## Payment reminders

Ported from the restaurant's WhatsApp reminder page and driven by open Retail credit (`retail_sales.amount_due`), oldest first. Staff press WhatsApp and a pre-filled chat opens; they send it themselves. Each opened reminder is stored in `customer_payment_reminders` (migration `112`, SQLite guard in `lib/retail-reminders.js`) with the balance at that moment. The list shows the last reminder and count, and filters for over 30 days and not reminded in 7 days. A queue opens selected customers one by one. Access matches Receivables (`customer_ledger.access`). The ported `openWhatsapp` no longer passes `noopener` to `window.open`, which made the restaurant version report every successful open as a failure.

## Cashier stock lookup

`/cashier/retail-stock` is a read-only table of sellable stock (name, SKU/barcode, category, price, available) with in/low/out filters and paging. It uses the same search and permission (`menu.view`) as Billing's product board, so it reveals nothing new and no costs.

## Bundles

The Retail promotions engine already supported `bundle` offers (fixed price for a set of components) with UI on the Promotions page. Components remain separate sale lines, so stock, COGS, VAT and returns stay per item. A new unit test proves it: two items at Rs 100 + Rs 60 with a Rs 130 bundle sell for Rs 130, each item's stock drops by one, COGS is Rs 60, redemption is Rs 30 and the journal balances. The nav entry is now "Offers & bundles".

## Page styling

Retail list pages now use the restaurant page title (`text-2xl font-bold text-gray-900 sm:text-3xl`); detail pages use one step smaller. `WorkspaceHeader`, `.commerce-page` and `retail-money` headings follow the same sizes and padding. Timestamps on the dashboard, held sales and reminders use `formatNepalTime`, because SQLite stores UTC without a zone.

## Verification

- `npm run test:unit`: 365 passed. `tests/unit/retail-economic-behavior.test.js` adds staff-performance and finance-dashboard deltas to the sale/return reconciliation test, plus reminder and bundle tests.
- ESLint on changed files: clean. `next build --webpack`: compiled.
- Chrome against a fresh SQLite fixture: sidebar spec (3), surfaced pages (14 pages, no API errors), held-sale resume, and a new check covering:
  - Billing opens on the rail, two taps give quantity 2, category chips work, sale completes, and the stock badge drops 10 → 8.
  - On a 390 px phone, Charge stays hidden until the cart button opens the sheet, and the sale completes.
  - Staff performance lists the seller's net sales.
  - A reminder opens WhatsApp for `977<phone>` with "Rs 150.00 is due" and is recorded.
  - A cashier finds stock in Stock lookup.
- `tests/e2e/commerce-cashier.spec.js` and `tests/e2e/admin.spec.js` were updated for the cart list and mobile sheet but need their PostgreSQL fixture and were not run.

## Remaining

- Reminders are WhatsApp click-to-chat only. Automatic SMS/WhatsApp sending would need a provider account and consent records.
- Supplier payables have no reminder view. Payables already lists due invoices.
- Many Retail pages still use `slate-*` colours and their own card styles. Titles and tokens match the restaurant; full per-page restyles are not done.
- `formatNepalTime` shows Bikram Sambat dates when that calendar is selected, as elsewhere in the app.
