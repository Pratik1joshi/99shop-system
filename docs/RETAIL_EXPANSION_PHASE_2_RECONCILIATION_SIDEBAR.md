# Retail expansion phase 2: sale/return reconciliation and sidebar

## Representative transaction

`tests/unit/retail-economic-behavior.test.js` now checks a fresh SKU in an isolated SQLite database. It starts with five units at Rs 50 carrying cost each, completes a two-unit cash sale at Rs 120 each, and posts a one-unit sellable return with a Rs 120 cash refund. The test follows the real `holdSale` / `checkoutSale` and `createReturn` / `postReturn` services.

| Source and projection | Verified result |
| --- | --- |
| `retail_sales`, `retail_returns` | Completed sale Rs 240; posted return Rs 120; return retry creates no second effect |
| `inventory_movements` | One `SALE` movement of -2 units / Rs 100 cost; one `CUSTOMER_RETURN` movement of +1 unit / Rs 50 cost; available stock 4 |
| `journal_entries` / `journal_lines` | Sale: Cr 4010 revenue Rs 240, Dr 5080 COGS Rs 100, Cr 1210 inventory Rs 100. Return: Dr 4011 returns Rs 120, Cr 5080 COGS Rs 50, Dr 1210 inventory Rs 50. Each source journal balances. |
| `getExecutiveDashboard` | Gross sales +Rs 240; returned revenue +Rs 120; net sales +Rs 120; net COGS +Rs 50; gross profit +Rs 70 |
| `buildRetailReport` | The sale row retains its Rs 100 historical COGS snapshot; unfiltered net sales and profit cards equal the dashboard period totals |
| `businessDaySummary` | One completed retail sale and one posted return; retail net sales increase Rs 120 |

The test compares before/after values to isolate this transaction from other fixture activity. It also confirms the return replay is idempotent. The case has no VAT or discount, so it does not settle VAT rounding or overnight period boundaries. It verifies the SQLite service path; production PostgreSQL data still needs a read-only reconciliation run before declaring deployment-wide agreement.

## Sidebar translation

Superseded by `RETAIL_EXPANSION_PHASE_3_99SHOP_STYLE.md`, which moves the shell to the 99 Shop markup and merges Suppliers into Purchasing.

The style reference is the earlier admin app's `components/admin/admin-layout.jsx`. Shop 99 now uses its 16 rem expanded panel, 5 rem icon rail, lightly tinted expandable groups, uppercase group headings, indented view links, 4 px active stripe, compact footer, and a scrollable mobile drawer. The implementation is in `components/erp/app-shell.jsx` and `app/globals.css`. Desktop expansion, group choices and scroll position persist locally. Radix handles mobile focus trapping and Escape; links close the drawer. Keyboard users can expand groups with Enter, and the global focus-visible outline remains in place.

The 99 Shop reference's visual grouping was adapted to Shop 99's existing retail workspaces. Its tables, kitchen, waiter, reservation and 99 Shop-report navigation were not added. The permission-filtered admin/cashier/specialist workspace arrays remain the source of destinations. Expanded groups reveal the same permitted views as the local workspace bar; the compact rail opens each group's first permitted view.

When two workspaces intentionally link to the same retail page, such as Purchasing and Suppliers linking to Payables, both groups indicate the current route. This keeps the active page visible whichever task path the operator used.

`tests/e2e/retail-sidebar.spec.js` passed in installed Chrome against an isolated local SQLite fixture at 1366 px and 390 px. It checks active links (including shared Payables), persistent collapse, keyboard expansion, long scrolling, mobile close/navigation, cashier link filtering, and an inventory specialist's lack of Finance and Control links. Desktop and mobile screenshots were inspected in `.tmp/retail-sidebar-desktop.png` and `.tmp/retail-sidebar-mobile.png`; the Next.js development indicator overlapped the lower logout area in development only.

## Remaining work

Reconcile discount/VAT and overnight sale/return cases, then run the read-only retail reconciliation on the target PostgreSQL deployment. The broader report library still has legacy route identifiers and a 1,000-row on-screen sales cap. People and other retail workspaces remain separate phases; route presence alone is not workflow verification.
