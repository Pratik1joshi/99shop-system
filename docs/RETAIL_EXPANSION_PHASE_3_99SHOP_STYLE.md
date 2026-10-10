# Retail expansion phase 3: 99 Shop look, retail navigation (2026-09-28)

The reference is the earlier admin app (99 Shop, in production). This phase makes Shop 99 look like it (font, palette, sidebar, dashboard) and surfaces 99 Shop modules that are domain-neutral and already present in Shop 99. 99 Shop workflows and pages that still read 99 Shop facts stay out of the Retail navigation.

## Style comparison

| Aspect | 99 Shop | Shop 99 before | Shop 99 now |
| --- | --- | --- | --- |
| Font | Geist via `next/font/google` in `app/layout.js` | Import removed; `--font-sans: 'Geist'` fell back to Segoe UI | Geist loaded the same way (browser check: `document.fonts` has Geist `loaded`) |
| Palette | gray-50 canvas, gray-900 actions, gray-200 borders, `rounded-lg/xl/2xl`, `shadow-sm` | `--erp-*` tokens in green `#16705a`, 4–8px radii, flat | `--erp-*` tokens remapped to the 99 Shop neutrals; `retail-money-*` greens replaced by the tokens |
| Sidebar | `components/admin/admin-layout.jsx`: white w-64 / w-20 rail, standalone rows with coloured icons, tinted `*-100` groups, uppercase `text-xs` headings, one open group, flat icon rail, 4px active stripe | Custom pastel CSS, group icons only, several open groups, group-only rail, plus a duplicate workspace tab bar | 99 Shop Tailwind markup in `components/erp/app-shell.jsx`; tab bar removed; custom nav CSS deleted |
| Dashboard | Greeting header, icon-chip KPI cards, attention and activity cards | Plain list | Same card language over `/api/admin/retail-overview` (no data change) |

Kept from Shop 99 on purpose: global header (register status, Ctrl K search, New menu), Radix mobile drawer (focus trap, Escape), permission filtering, links instead of buttons, signed-in user line in the footer.

## Feature comparison

| Area | 99 Shop | Shop 99 evidence | Decision |
| --- | --- | --- | --- |
| Finance: expenses, funding, savings, expense categories, cash exchange | Finance group | `lib/business-funding.js`, `lib/savings.js`, pages identical to the 99 Shop; journal-posting | Surfaced under Finance |
| Accounting: cash book, bank book | Accounting group | `/api/admin/ledger` over `journal_lines` | Surfaced under Accounting |
| Finance dashboard | Accounting group | `lib/accounting-dashboard.js` subtracts `5010` for gross profit; Retail COGS posts to `5080` | Hidden; Retail finance overview covers it |
| Corrections | Accounting group | `lib/bill-corrections.js` corrects 99 Shop bills | Hidden; Retail uses returns/reversals |
| HRM: staff, departments, designations, attendance, holidays, payroll | HRM group | `lib/hrm.js`, `lib/payroll.js` identical to the 99 Shop; payroll posts journals | Surfaced as People |
| Staff performance | HRM group | `lib/payroll.js#getPerformance` reads `orders` / `bills` | Hidden until rebuilt on `retail_sales.cashier_id` |
| Promotions | Menu group | `/admin/retail-promotions` (canonical, used by checkout) existed but was not linked | Surfaced under Catalog |
| Inventory reports | Inventory group | `/admin/retail-inventory-reports` (valuation, ageing, expiry, reorder) not linked | Surfaced as Inventory / Stock reports |
| Inventory dashboard, wastage, unit conversion, inventory categories | Inventory group | Read 99 Shop `inventory_items`, `stock_movements`, `wastage_log` | Hidden. Cashier "Stock overview" pointed here and was removed |
| Suppliers | Inventory group | Cashier `/cashier/suppliers` re-exports the legacy page that totals 99 Shop `purchases` | Removed from cashier nav; admin Suppliers merged into Purchasing (no duplicate Payables link) |
| Previous-day activity | Reports | `lib/historical-activity.js` reads legacy `purchases` | Hidden |
| Reminders | Top level | No Retail due-date/communication model | Not built |
| Combos | Menu group | No Retail bundle stock/tax/return rules | Not built |
| Website CMS, printer | Top level | Present, not verified against the Retail storefront | Not surfaced |
| Tables, KOT, waiter calls, host desk, reservations, kitchen, recipes, delivery | Operations | 99 Shop-only | Excluded |

## Broken Retail flow fixed

The cashier landing (`app/cashier/dashboard/page.jsx`) listed 99 Shop `bills` and opened them in the legacy `/cashier/pos`. Retail never writes bills, so it was always empty or showed 99 Shop data. It now lists the cashier's held Retail sales (`/api/admin/retail-sales?status=HELD`), and each row opens `/cashier/billing?resume=<id>`. `components/pos/retail-pos.jsx` resumes that sale once and strips the parameter, so a reload after checkout cannot reopen it.

## Verification

- `npm run test:unit`: 363 passed. Two source tests were updated: one for the renamed Purchasing views, and one that already contradicted the phase 2 accordion.
- ESLint on changed files: clean. `next build --webpack` (isolated `NEXT_DIST_DIR`): compiled; CSS contains the Geist `@font-face`.
- Chrome against a fresh SQLite fixture (`DB_NAME=style-verify.db`, port 3031):
  - `tests/e2e/retail-sidebar.spec.js`: 3 passed (accordion, active row, persistent rail, mobile drawer, cashier filtering, specialist lacks Finance/Accounting/People/permissions).
  - Each newly linked admin page renders its heading with no 4xx/5xx API response and no page error: business funding, savings, cash exchange, expense categories, cash book, bank book, staff, departments, designations, attendance, holidays, payroll, promotions, stock reports.
  - Held sale created by the cashier appears on the cashier dashboard; clicking it restores the cart in Billing.
- Screenshots inspected: dashboard and payroll at 1366 px, cashier dashboard and drawer at 390 px.

## Owner decisions needed

- 99 Shop-era defaults give cashiers `payroll.view`, `savings.manage`, `cash_exchange.manage` and `general_ledger.view`. Those pages were already reachable by URL; they now also appear in the cashier sidebar. Turn them off in Staff permissions if cashiers should not see salaries or ledgers.

## Remaining

Most items below were done in `RETAIL_EXPANSION_PHASE_4_BILLING_PEOPLE_REMINDERS.md`.

- Rebuild staff performance on Retail sale attribution; fix or retire the finance dashboard's `5010` gross profit.
- Customer and supplier reminders tied to receivable and payable due dates (the 99 Shop has a WhatsApp reminder to adapt).
- A cashier Retail stock lookup (the legacy link was removed; admin Retail stock pages hard-code `/admin` links).
- Retail pages still mix `slate-*` Tailwind and `erp-*` classes; the tokens now match, but per-page headers and cards are not all restyled.
- Retail bundles, and Billing opening on the compact rail as the 99 Shop POS does, are not done.
