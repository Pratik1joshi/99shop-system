# Shop 99 Retail ERP Audit

Date: 2026-09-21  
Scope: application structure, navigation, billing, catalog, purchasing, inventory, HRM, accounting, permissions, tests, and production readiness.

## Executive summary

The project is not a failed rewrite. It contains a strong accounting/business-day core and a substantial retail engine, but two generations of the product were exposed at the same time. Restaurant orders, bills, stock, purchases, reports, and permissions remained active beside new retail sales, inventory balances, goods receipts, returns, transfers, and analytics. The result looked like one ERP while behaving like two partially connected ERPs.

The highest-impact defect was deeper than duplicate navigation: 10 of the 11 current Shop 99 products had no variant/SKU row, while retail billing, purchasing, and inventory require a variant ID. Most of the real catalog therefore could not appear in retail Billing or enter retail stock.

This repair establishes retail as the canonical operator experience. Legacy tables and APIs are retained temporarily for historical data and accounting compatibility; they are no longer presented as parallel day-to-day workflows.

## System map

| Area | Restaurant-era path | Retail-era path | Decision |
| --- | --- | --- | --- |
| Checkout | `orders`, `bills`, `/admin/pos` | `retail_sales`, `/admin/retail-pos` | Canonical `/admin/billing`; old URLs redirect |
| Purchases | `purchases` + `purchase_items` + `inventory_items` | purchase orders + goods receipts + `inventory_balances` | Canonical retail Purchases screen |
| Stock | legacy quantity/stock movements | location-aware perpetual inventory | Retail inventory is operational source of truth |
| Returns | bill corrections/cancellations | retail returns and exchanges | Retail returns for new sales |
| Promotions | restaurant promotions | priority/coupon retail promotions | Retail promotions in navigation |
| Analytics | order-based reports | retail sales/inventory analytics | Retail Insights is primary |
| People | employees/payroll plus separate HRM setup pages | same shared data | One “People & Payroll” navigation area |
| Accounting | shared journals and business days | retail sales/COGS and receipts post into the same ledger | Keep shared core |

## Findings and disposition

| Severity | Finding | Impact | Disposition |
| --- | --- | --- | --- |
| Critical | Variantless products were incompatible with every retail transaction | Most current products could not be billed or received | Fixed: automatic stable `Standard` SKU, migration 084, and product-create/update safeguards |
| Critical | Two POS implementations were visible and used different transaction tables | Operators could choose the wrong sale engine; reports diverged | Fixed: one Billing route and compatibility redirects |
| High | Two purchase engines updated different stock ledgers | Receiving through the wrong screen created stock in the wrong system | Fixed in operator UI: one retail Purchases entry; legacy route redirects |
| High | Retail code had no dedicated unit tests | A green suite covered the old engine but not the new one | Started: consolidation/SKU tests added; domain tests remain required |
| High | Variant editing deleted and recreated SKU rows | Existing retail foreign keys/history could break | Partially fixed: a standard SKU updates in place; collapsing multiple variants is rejected |
| High | Retail purchasing UI omitted serial entry, invoice metadata, payment choice, manual product lookup, and receipt history | Valid backend workflows were unreachable or failed at post time | Fixed in Purchases screen |
| High | Old sales reports remain order-table based | They can omit retail sales and give misleading totals | Hidden from primary admin navigation; retail Insights is canonical |
| Medium | Sidebar exposed over 50 mixed-generation destinations with seven bright color bands | High cognitive load and weak information scent | Improved: cohesive neutral palette, retail labels, duplicate flows removed |
| Medium | HRM had no single conceptual home; Staff, attendance, payroll, departments, designations, holidays, and performance were scattered | Users perceived HRM as multiple unrelated tools | Improved: grouped as People & Payroll; a dedicated people dashboard is still recommended |
| Medium | The retail checkout used a fixed 420px cart beside the catalog | It overflowed or became impractical on smaller devices | Fixed: stacked mobile layout and full-width cart |
| Medium | `/admin/dashboard` is still largely inherited and mixes legacy operational metrics | Some tiles may not reflect retail sales directly | New-sale actions now open Billing; retail-first dashboard rewrite remains |
| Medium | 138 admin API route files and 58 admin modules create a broad maintenance surface | Duplication and permission drift are likely | Reduce only after data migration and compatibility window; do not delete blindly |
| Low | Text contains mojibake in comments and some rendered strings | Visible copy can look corrupted | Cleanup remains; it does not affect data integrity |
| Build | Production build failed while scanning `C:\Users\ADMIN\AppData\Local\Temp\WinGet` | Build could not complete in the sandbox default temp environment | Environment issue; retry with a workspace-scoped `TEMP`/`TMP` |

## UI review

| Before | After | Why |
| --- | --- | --- |
| “POS” and “Retail POS” were both primary actions | One “Billing” action | Operators should never choose a transaction engine |
| “Purchases” and “Goods Receipts” represented different ledgers | One “Purchases” screen backed by goods receipts | Business language first; accounting effects stay atomic |
| Every navigation group used a different saturated tint | Neutral groups with one emerald active state | Hierarchy is clearer and the interface feels like one product |
| Retail Billing assumed a wide desktop | Catalog and cart stack on small screens | Usable at a counter, tablet, or phone without horizontal clipping |
| Purchase receiving required a barcode | Barcode plus name/SKU search | Missing or damaged labels no longer block receiving |
| Serial-tracked receipt lines had no serial input | One-per-line/comma serial entry with derived quantity | Matches backend validation and avoids posting failures |
| Generic “Admin Panel” chrome | “Shop 99 ERP” / “Shop 99 · Billing” | Clear product identity and workspace context |

## Changes completed in this repair

1. Added canonical admin and cashier Billing pages sharing the same retail component and business-day gate.
2. Redirected both old POS URLs to Billing to preserve bookmarks without exposing two choices.
3. Redirected old admin Purchases to the retail receiving workflow.
4. Made product-to-SKU compatibility deterministic and protected stable retail history IDs.
5. Backfilled the local development database from 1/11 to 11/11 sellable products; migration 084 performs the production backfill.
6. Expanded Purchases with supplier invoice metadata, payment method, product search, serial capture, and recent receipt history.
7. Simplified navigation labels, removed duplicate restaurant operations from the primary admin path, and made retail Insights canonical.
8. Improved responsive Billing layout and interaction feedback.
9. Added regression tests for canonical routes/navigation and SKU stability.
10. Restored the full Analytics, Summary, and Reports navigation after operator feedback.
11. Made Billing display the product catalog immediately, with search narrowing the visible items.
12. Added dashboard shortcuts for Billing, Purchases, Products, Stock Count, Customers, Staff, Analytics, and Reports.
13. Retired waiter/kitchen access roles without deleting employee or payroll history; migration 085 deactivates and converts them to the supported staff role.

## Remaining work before production cutover

### Must complete

- Add transaction-level tests for retail checkout: inventory issue, COGS journal, split payments, idempotency, hold/resume, discount authority, and rollback.
- Add tests for retail receipts: moving-average cost, AP/cash journal, batch/serial rules, over-receipt, duplicate invoices, and rollback.
- Reconcile retail inventory valuation to account 1210 on a production snapshot.
- Reconcile retail revenue/COGS/cash to business-day close and the finance dashboard.
- Rewrite the main dashboard from retail tables or label every legacy-only metric explicitly.
- Run the full PostgreSQL migration plan and integration suite against a restored production-like backup.

### Next product slice

- Build a purchase-order list/editor in the Purchases workspace; backend APIs exist but the operator flow is incomplete.
- Add a People dashboard with today’s attendance, pending payroll, advances, and staff actions.
- Add role presets (Owner, Manager, Cashier, Stock Clerk, Accountant) over the raw permission matrix.
- Create a settings-driven store/location selector if multi-location operation is actually required; otherwise hide transfer/location complexity.
- Archive restaurant-only routes after a measured historical-data migration and signed reconciliation, not before.

## Acceptance criteria for “retail ERP ready”

- A newly created simple product is immediately searchable and scannable in Billing.
- Receiving a purchase changes the same stock balance that Billing consumes.
- A completed sale reduces location stock and posts revenue, payment, inventory, and COGS exactly once.
- Returns reverse the correct sale lines and tender/store-credit amounts exactly once.
- Business-day close reconciles retail cash and non-cash payments without consulting restaurant orders.
- Owner, cashier, stock clerk, and accountant each see only their required workflows.
- Dashboard, Insights, inventory valuation, general ledger, AP, and AR agree for the same cutoff.
- Retail unit, integration, and end-to-end suites pass on SQLite and PostgreSQL.
