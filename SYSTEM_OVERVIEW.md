# 99 Shop by Shahana — system overview

Full-stack retail POS + accounting system. Next.js (App Router) + PostgreSQL.
Every accounting number is derived from a single double-entry journal; no
stored balances. Role-based access (admin / cashier) plus a public storefront
that reads the live catalogue.

The codebase started as the 99 Shop POS; the dine-in workflow (tables,
waiters, kitchen tickets, reservations, QR table ordering) has been removed and
`lib/deployment.js` records the profile. Sections describing those modules are
gone from this document.

Stack: Next.js 16 (webpack), custom `server.js` (cPanel/Node), PostgreSQL
(SQLite fallback for local dev), PIN/token auth, thermal print system.

---

## 1. Authentication & Roles
- **Purpose:** PIN-based login, session tokens, role gating.
- **Features:** staff picker login, per-request `requireAuth`/`verifyAuth`, change-credentials, rate-limited login.
- **Pages:** `/login`, Settings → Account.
- **APIs:** `/api/users/active`, `/api/auth/change-credentials`, `AuthService.verifySession` used by every protected route.
- **Tables:** `users` (roles: admin/cashier), `sessions`, `devices`, `rate_limits`.
- **Integration:** every `/api/admin/*` route.

## 2. Products & Categories
- **Purpose:** the product catalogue, shared by the till and the storefront.
- **Features:** product CRUD, variants, barcodes (scanned, typed or generated), availability, images, master categories (Accessories / Cosmetics / Other).
- **Pages:** `/admin/products`, `/admin/products/labels`, `/admin/categories`, `/cashier/products`, public `/` and `/shop/[slug]`.
- **APIs:** `/api/admin/products`, `/api/shop99/menu`, `/api/shop99/menu/categories`, `/api/uploads/menu`.
- **Tables:** `menu_items` (+`barcode`, `stock_usage`), `menu_categories` (+`food_group`, holding the master category), `menu_item_variants`.
- **Integration:** sales, inventory links, billing prices, storefront (`lib/storefront.js`).

## 3. Sales
- **Purpose:** the sale lifecycle from cart to paid bill.
- **Features:** barcode scan or search into a local cart, commit on checkout, stock deduction, cashier attribution, cancel with a reason.
- **Pages:** `/admin/pos`, `/cashier/pos`, `/admin/orders`, `/admin/orders/[id]`.
- **APIs:** `/api/admin/pos/orders`, `/api/admin/pos/orders/[id]`, `/api/admin/pos/orders/[id]/items`, `/api/admin/pos/orders/[id]/pay`, `/api/admin/orders`, `/api/admin/billing`.
- **Tables:** `orders`, `order_items`. Legacy `kots` / `kot_items` rows remain readable but nothing writes new tickets.
- **Integration:** billing (sale journal), inventory (deduction/restore) — all through `OrderRepository`.

## 4. Billing & Payments
- **Purpose:** turn an order into a paid bill; thermal receipt.
- **Features:** VAT + service + discount, split payments, cash/card/QR/eSewa/Khalti/credit, change, shared 58/80mm thermal print, payment QR display.
- **Pages:** `/cashier`, `/cashier/bill/[id]`, `/cashier/billing`, `/admin/bills`.
- **APIs:** `/api/admin/billing`, `/api/admin/pos/orders/[id]/pay`, `/api/admin/bills`, `/api/shop99/payments`.
- **Tables:** `bills` (+`void_reason`,`voided_at`,`refunded_amount`), `bill_payments`, `bill_corrections`.
- **Integration:** **posts the sale journal atomically**; accounting corrections (void/refund); customers.

## 5. Inventory, Categories & Units
- **Purpose:** raw-material stock with a movement ledger.
- **Features:** items, categories (managed), unit conversions (custom pack sizes), min-stock, moving-average cost, movements, adjustments, restock.
- **Pages:** `/admin/inventory`, `/admin/inventory/[id]`, `/admin/inventory-categories`, `/admin/unit-conversion`.
- **APIs:** `/api/admin/inventory`, `/api/admin/inventory/[id]`, `/api/admin/inventory/restock`, `/api/admin/inventory-categories`, `/api/admin/unit-conversions`, `/api/admin/stock-movements`.
- **Tables:** `inventory_items` (+`category_id`), `inventory_categories`, `unit_conversions`, `stock_movements`, `stock_items`.
- **Integration:** sales (deduction), purchases (receipt), wastage; units in `lib/units.js`.

## 6. Purchases & Suppliers
- **Purpose:** goods-received + supplier records + payables.
- **Features:** receive delivery, purchase lines, cash/bank/**credit** (→ AP), supplier merge, spend history.
- **Pages:** `/admin/purchases`, `/admin/purchases/import`, `/admin/suppliers`.
- **APIs:** `/api/admin/purchases`, `/api/admin/suppliers`, `/api/admin/accounts-payable`.
- **Tables:** `purchases`, `purchase_items`, `suppliers`, `journal_lines.supplier_id` (AP sub-ledger).
- **Integration:** inventory (stock in), accounting (COGS/Cash or AP journal), expenses (linked).

## 7. Wastage
- **Purpose:** log + analyze inventory/prepared-food loss.
- **Features:** log a write-off, history/filter/analytics, reasons, employee/shift, photo; deducts stock + books a non-cash inventory loss journal.
- **Pages:** `/admin/wastage`; modal on the inventory and cashier screens.
- **APIs:** `/api/admin/wastage`.
- **Tables:** `wastage_log`.
- **Integration:** inventory, accounting (Dr Wastage / Cr Inventory), expenses.

## 8. Employees, Payroll & Performance
- **Purpose:** staff records, salary payments, performance.
- **Features:** employee CRUD + PIN, salary/hire-date/position, per-employee payroll drawer + payment history, performance metrics (orders/sales/bills/wastage).
- **Pages:** `/admin/employees`, `/admin/employee-performance`.
- **APIs:** `/api/admin/employees`, `/api/admin/payroll`, `/api/admin/employee-performance`.
- **Tables:** `users` (+`salary`,`hire_date`,`position`), `salary_payments`.
- **Integration:** accounting (Dr Payroll / Cr Cash|Bank on payment), orders/bills (attribution).

## 9. Expenses & Categories
- **Purpose:** operating expenses + managed categories.
- **Features:** log/edit/delete, categories, receipts, payment method; auto-posts a journal; purchase/wastage expenses linked.
- **Pages:** `/admin/expenses`, `/admin/expense-categories`.
- **APIs:** `/api/admin/expenses`, `/api/admin/expense-categories`.
- **Tables:** `expenses`, `expense_categories`.
- **Integration:** accounting (Dr expense / Cr Cash|Bank|AP), purchases, wastage.

## 10. Operational Reports
- **Purpose:** sales/ops reporting.
- **Pages:** `/admin/reports`, `/admin/dashboard`.
- **APIs:** `/api/admin/reports/*`, `/api/admin/dashboard`.
- **Tables:** derived from `orders`,`bills`,`bill_payments`.
- **Integration:** billing, orders.

## 11. Accounting (double-entry engine)
- **Purpose:** the financial backbone — every event posts one balanced journal.
- **Modules & pages:**
  - Chart of Accounts `/admin/chart-of-accounts`
  - General Ledger + Journal `/admin/general-ledger`
  - Cash Book `/admin/cash-book`, Bank Book `/admin/bank-book`
  - Cash Drawer (open/close/reconcile) `/admin/cash-drawer`
  - Bank (deposit/withdraw/transfer) `/admin/bank`
  - Payment Settlement `/admin/settlements`, Cash Exchange `/admin/cash-exchange`
  - Financial Reports (P&L, Balance Sheet, Trial Balance) `/admin/financial-reports`
  - Corrections (refund/void/reverse) `/admin/corrections`
  - Accounts Payable + ageing `/admin/accounts-payable`
  - Finance Dashboard `/admin/finance-dashboard`
  - Bank Reconciliation `/admin/bank-reconciliation`
- **APIs:** `/api/admin/accounts`, `/ledger`, `/cash-drawer`, `/bank`, `/settlements`, `/cash-exchange`, `/financial-reports`, `/corrections`, `/accounts-payable`, `/finance-dashboard`, `/bank-reconciliation`.
- **Tables:** `accounts`, `journal_entries` (+`external_ref` idempotency), `journal_lines` (+`drawer_id`,`bank_account_id`,`supplier_id`,`reconciled`), `cash_drawers`, `drawer_sessions`, `bank_accounts`, `payment_settlements`, `bank_reconciliations`.
- **Core libs:** `accounting.js` (postJournal engine + seed), `accounting-cash.js`, `accounting-reports.js`, `accounting-corrections.js`, `accounting-suppliers.js`, `accounting-dashboard.js`, `accounting-reconcile.js`, `bill-corrections.js`.
- **Integration:** posted automatically from sales, purchases, expenses, wastage, payroll, cash/bank ops. No stored balances — everything derives from `journal_lines`.

## 12. Settings (Configuration Center)
- **Purpose:** business/tax/receipt/ordering config.
- **Features:** tabbed — Business, Billing & Tax, Reservations, Receipt (58/80mm + footer), Ordering (QR toggle), Payments & QR, shortcuts, Account.
- **Pages:** `/admin/settings`.
- **APIs:** `/api/admin/settings`.
- **Tables:** `system_settings` (key/value).
- **Integration:** billing (VAT/service), receipts (name/VAT/PAN/footer/paper size), reservation engine, QR ordering gate.

## 13. Platform / Infrastructure
- **server.js** — cPanel Node entrypoint (PORT/HOSTNAME, graceful shutdown).
- **middleware.js** — security headers (nosniff, frame-deny, HSTS, permissions-policy) + landing rewrite.
- **lib/db/** — dual backend (Postgres prod / SQLite dev), pooled Postgres, `?`→`$n` adapter.
- **Uploads** — `/api/uploads/*` → `UPLOADS_DIR`, served via `/api/media`.
- **Migrations** — `migrations/001…023` (incremental) + `deploy/production_schema.sql` + `deploy/production_seed.sql` (fresh install).
- **Tests** — `scripts/check-accounting.mjs`, `scripts/check-unit-conversions.mjs`.
