# Retail Sell, stock and report access — 2026-09-28

## Completed slice

- Stock rows now offer a permission-gated **Adjust** action. The drawer collects a signed quantity, reason, batch or serial identity when required, then asks for a second review before posting through `/api/admin/retail-inventory-adjustments`. The service records a source-linked inventory movement and journal. The stock list refreshes after posting. A retry of the same unchanged form retains its idempotency key.
- Billing quote responses include structured `stock_conflicts` with product identity, quantity requested and available stock. Billing shows these names and quantities, and disables out-of-stock product tiles. Charge remains disabled while any quote conflict exists.
- Retail checkout uses the 99 Shop payment panel's visual cues: a focused modal, emerald header, clear total, large tender choices, cash received, split allocations, remaining amount and change. It still posts through the canonical Retail sale checkout service.
- The sale detail read initializes Retail sale tables before querying the receipt audit table. Report sale rows now open the same sale detail within Reports.
- Reports exposes its existing twelve Retail report types in a permission-filtered library and points to separate Retail analytics, inventory reports, financial statements and daily summary where authorized. These are Retail data sources; 99 Shop orders and bills are not included.
- `Button asChild` now renders a Radix Slot, so the transaction explorer's source link is an anchor rather than a button carrying an unknown DOM prop.
- Fresh SQLite catalog initialization now adds `menu_items.is_combo` before backfilling standard SKU variants.

## Boundaries and definitions

- A manual positive adjustment uses moving average cost unless an authorized cost override is supplied by the existing service. A negative adjustment writes off historical stock cost. Inventory balance is a projection of movements, not an editable field.
- Held sales do not reserve stock. Checkout rechecks stock and can still fail after a quote if another cashier sells the last unit.
- The twelve report tabs are Sales, Sales & Tax, Expenses, Receipts, Suppliers, Completed Sales, Returns, Current Stock, Cashiers, Products, Categories and Customers. Additional accounting and inventory report workspaces have their own permissions and definitions. Attendance, payroll and 99 Shop kitchen metrics are not fabricated as Retail reports.
- The 99 Shop reference has fourteen tabs. Shop 99 translates its Menu tab to Products, Employees to Cashiers, Orders to Completed Sales, Changes to Returns, and Purchases to posted goods receipts. Tables and Reservations have no Retail equivalent. Shop 99's separate Retail analytics, inventory reports and financial statements contain further views without copying 99 Shop data sources.

## Verification

- `tests/unit/retail-economic-behavior.test.js` covers a representative sale and physical return across stock, journals, report and business day. This slice adds a stock conflict identity assertion and a sale detail schema initialization assertion.
- Focused ESLint, the economic tests and a Next production build were run with `TEMP`, `TMP` and `NEXT_DIST_DIR` under this workspace to avoid a Windows system temp permission error.
- Chrome verification passed against an isolated SQLite database and local dev server: product creation, reviewed stock adjustment, report library, cash checkout, sale detail from Sales and sale detail opened directly from the report. The payment action was checked in viewport at 1366px desktop and 390px mobile widths. Screenshots are in `.tmp/retail-checkout-payment.png`, `.tmp/retail-checkout-payment-mobile.png` and `.tmp/retail-reports-library.png`.

## Remaining

- The catalog still has 99 Shop-era compatibility names and demo seed products; operator navigation remains Retail. Report breadth beyond canonical Retail facts requires new source workflows and definitions before additional tabs can be enabled.
- An out-of-stock batch tracked SKU needs a receiving workflow to establish a new batch identity. The inline adjustment can select only a batch already present at that location; serial tracked adjustments require exact identities.
