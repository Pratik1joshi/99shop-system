# 99 Shop by Shahana — system overview

Retail ERP for a cosmetics and accessories shop in Surkhet: counter billing,
online store, catalog, stock, purchasing, customers, finance, accounting,
reports and staff. Next.js 16 (App Router) with PostgreSQL in production and
SQLite for local development. Every accounting figure is derived from one
double-entry journal; no balance is stored.

Staff roles: admin, cashier, inventory staff, purchasing staff, accountant
and manager. Admins configure what each role can do at `/admin/permissions`.

---

## Sell
- **Billing** `/admin/billing`, `/cashier/billing` — scan or search, cart, discounts, offers, split payment (cash, online, credit, store credit), held sales, receipt print and WhatsApp receipt.
- **Sales** `/admin/retail-sales-history` — completed sales, reprint, void and return.
- **Returns** `/admin/retail-returns` — customer returns, refunds and exchanges.
- **Online orders** `/admin/retail-online-orders` — storefront orders: confirm, verify payment, fulfil.
- **Transactions** `/admin/retail-transactions` — every sales and stock document in one search.
- Libraries: `lib/retail-sales.js`, `lib/retail-returns.js`, `lib/retail-void.js`, `lib/retail-exchanges.js`, `lib/retail-online-orders.js`.

## Catalog
- **Products** `/admin/products` — products, variants (SKUs), barcodes, images; add by camera scan, USB scanner or by hand.
- **Categories & brands** `/admin/products/setup`; **Special prices** `/admin/products/pricing`; **Offers & bundles** `/admin/retail-promotions`.
- Tables: `products`, `product_variants`, `product_categories`, `product_barcodes`, price lists, promotions.

## Inventory
- **Stock**, **Movements**, **Counts**, **Transfers**, **Tracking** (batches and serials), **Adjustments** (damage, expiry, shrinkage, tester, sample, internal use), **Replenishment** and **Stock reports** under `/admin/retail-inventory*`, `/admin/retail-stock-counts`, `/admin/retail-transfers`, `/admin/retail-replenishment`.
- Moving-average cost per variant; tables `inventory_locations`, `inventory_batches`, `inventory_balances`, `inventory_movements`, `inventory_costs`.

## Purchasing
- **Suppliers** `/admin/retail-suppliers`, **Purchase orders** `/admin/retail-purchase-orders`, **Purchases** (goods receipts) `/admin/retail-goods-receipts`, **Purchase returns** `/admin/retail-purchase-returns`, **Payables** `/admin/accounts-payable`.
- A goods receipt debits Retail Inventory (1210) and credits cash, bank or Accounts Payable; supplier payments settle the oldest open invoice first.

## Customers
- **Customers** `/admin/retail-customers`, **Receivables** `/admin/retail-receivables`, **Payment reminders** `/admin/retail-reminders`, **Loyalty rules** `/admin/retail-loyalty`, **After-sales** (warranty, repairs, RMA) `/admin/retail-after-sales`.

## Finance
- **Registers & cash** `/admin/retail-registers` — business-day open and close with counted cash and note counts.
- **Expenses**, **Expense categories**, **Business funding**, **Savings & deposits**, **Cash exchange**, **Cash variance review**, **Finance overview**.

## Accounting
- **Chart of accounts**, **General ledger**, **Cash book**, **Bank book**, **Banking**, **Bank reconciliation**, **Statements** (P&L, balance sheet, trial balance), **Retail reconciliation**.
- Each sale, return, goods receipt, supplier payment, expense, payroll payment and cash movement posts one balanced journal (`lib/accounting.js`). Sales credit 4010 and VAT 2020; cost of goods debits 5080 against Retail Inventory 1210.

## Insights
- **Reports** `/admin/reports` — sales, finance, expenses, purchases, products, categories, inventory, customers, staff, suppliers, returns.
- **Retail analytics**, **Operations intelligence** (demand and replenishment evidence) and the **Daily summary** `/admin/summary-report`.

## People
- **Staff**, **Departments**, **Designations**, **Attendance**, **Holidays**, **Payroll** and **Staff performance** under `/admin/employees`, `/admin/hrm/*`, `/admin/payroll`, `/admin/employee-performance`.

## Website and administration
- **Website** `/admin/website` — every word on the storefront (hero, order steps, About, footer, shop identity), stored in `site_content`.
- **Online store** `/admin/products/storefront`, **Audit** `/admin/retail-audit`, **Staff permissions** `/admin/permissions`, **Settings** `/admin/settings` (shop identity, tax, receipts, payment QR), **Printer** `/admin/printer` (receipt and statement templates).

## Storefront
- Public site in `app/(store)`: home, `/shop/<category>`, `/products/<slug>`, `/categories`, `/about`, `/contact`, and the online shop under `/store`. It reads the live catalog, so a product added in the back office appears on the next request.

## Platform
- `server.js` — production entrypoint for cPanel/Node.
- `middleware.js` — security headers and canonical redirects.
- `lib/db/` — PostgreSQL in production, SQLite (`shop99.db`) for local development.
- `migrations/` — ordered SQL, applied by `npm run db:migrate`; the schema source of truth.
- Uploads go to `UPLOADS_DIR` and are served through `/api/media`.
