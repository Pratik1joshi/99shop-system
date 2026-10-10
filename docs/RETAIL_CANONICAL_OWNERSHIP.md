# Retail canonical ownership (Phase 0)

This deployment runs in `RETAIL` mode. A new retail transaction has one operational truth. 99 Shop-era tables remain intact for historical/99 Shop compatibility, but are not part of the active retail write or reporting path.

## Domain ownership

| Domain | Canonical owner | Rules |
| --- | --- | --- |
| Catalog | `menu_items`, `menu_item_variants`, product catalog tables | A variant is the sellable and stock-tracked unit. 99 Shop naming is retained for backward compatibility. |
| Pricing / promotions | variant price snapshots, `promotions`, `promotion_redemptions` | Checkout reloads canonical prices and re-evaluates promotions. Client totals are previews only. |
| Sales | `retail_sales`, `retail_sale_lines`, `retail_sale_payments` via `lib/retail-sales.js` | Billing, hold/resume, payment, idempotency, COGS snapshots and sale journal are one transaction. No retail write to `orders`, `bills` or `bill_payments`. |
| Inventory | `inventory_movements` via `lib/retail-inventory.js` | The immutable signed movement ledger is authoritative. `inventory_balances` is a transactionally maintained projection/cache, never an independent write target. Serial identity is in `inventory_serials`; batch identity is in `inventory_batches`. |
| Procurement | `purchase_orders`, `goods_receipts` and lines via `lib/retail-purchasing.js` | A posted GRN creates canonical receipt movements and accounting. Purchase returns use `purchase_returns` and canonical issue movements. |
| Returns | `retail_returns`, `retail_return_lines` via `lib/retail-returns.js` | Return disposition controls inventory restoration. Refund, revenue/VAT reversal, COGS reversal, store credit and journal effects post atomically. |
| Customer credit | customer-tagged journal lines on Accounts Receivable (`1300`) | Credit sale payments create AR. Tagged AR lines are the retail customer subledger for reconciliation. |
| Loyalty | `loyalty_transactions` | Points are not money or a payment method. Redemption becomes a sale discount. |
| Store credit | `store_credit_transactions` | Ledger is authoritative; `customers.store_credit_balance` is a locked projection. Liability is account `2030`. |
| Accounting | `journal_entries`, `journal_lines` | Every posted retail economic event creates a balanced, source-linked journal. Accounting is not inferred from UI totals. |
| Reporting | `lib/retail-analytics.js` and `lib/retail-reporting.js` | Dashboard, Retail Analytics and Main Reports share retail facts and historical sale COGS. |
| Payment reminders | `customer_payment_reminders` via `lib/retail-reminders.js` | Records that staff opened a WhatsApp reminder and the balance at that moment. Not proof of delivery and never an accounting fact; balances come from `retail_sales.amount_due`. |
| Audit | source documents, movement references, journal source links and business-day audit | Corrections append/reverse. Phase 0 reconciliation reports mismatches and never silently repairs them. |

## Financial definitions

- **Gross Sales:** sum of completed sale-line `unit_price × quantity`, excluding VAT and before discounts.
- **Net Sales:** Gross Sales minus line/header discounts minus returned revenue excluding returned VAT.
- **COGS:** sale-line `total_cost` snapshotted at checkout, minus COGS restored for physical returns. A `NO_STOCK_RETURN` does not reverse COGS.
- **Gross Profit:** Net Sales minus COGS.
- **Net Profit:** posted general-ledger income minus posted expenses for the reporting window. It is never substituted for Gross Profit.
- **VAT:** completed sale VAT minus posted return VAT reversals.
- **Payments:** allocation facts in `retail_sale_payments`; they are not sales revenue definitions.

## Inventory effects

Sales, returns, GRNs, purchase returns, adjustments, counts, transfers, damage, expiry, loss/shrinkage, tester, sample and internal-use operations call the retail inventory service. Online reservations affect *available to sell* but do not create a stock movement until fulfillment. Retail code must not update `inventory_balances` except inside that service and in the same transaction as its movement.

## Legacy compatibility boundary

`orders`, `order_items`, `bills`, `bill_payments`, `kots`, `shop99_tables`, `stock_movements` and 99 Shop role/workflow data are preserved. Their APIs and historical reporting code may remain available for old deployments/data, but Retail Billing does not call them and active retail dashboard/report routes do not combine them with retail facts. There is intentionally no `UNION` between legacy and retail transactions: an unlabeled union would double count and give unlike documents identical meaning.

Historical 99 Shop records are read-only from the retail experience. Migration `086_phase0_retail_foundation.sql` is additive: it hashes new sessions and persists selected serial identities on held retail sale lines. No legacy table or column is dropped.

## Deployment and reconciliation

Migrations under `migrations/` are the ordered source of truth for fresh and upgraded PostgreSQL databases. SQLite development retains guarded `ensure*Schema` support for local/test compatibility. Catalog, pricing and online-store tables from migrations 104–107 are mirrored for SQLite by `lib/retail-commerce-schema.js`. Runtime schema guards do not replace production migrations.

`runRetailReconciliation()` in `lib/retail-reconciliation.js` checks movement projection, inventory valuation/asset, retail sale journals, AR/AP tagged subledgers and store-credit ledger/projection/liability. The admin endpoint is read-only and returns explicit expected, actual and difference values. It never changes data.
