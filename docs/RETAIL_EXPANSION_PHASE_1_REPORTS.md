# Retail expansion: reference comparison and first slice

## Evidence and implementation order

The restaurant reference is `../dimsonpuri`. Its `components/admin/admin-layout.jsx` uses a 16 rem white sidebar (5 rem collapsed rail), 1 rem header padding, colored section bands, uppercase 12 px group labels, indented 40 px row links, 4 px active left border, hover tints, count badges, persistent group/scroll state, a footer logout area, and an off-canvas mobile panel. At the time of this first slice, Shop 99's `components/erp/app-shell.jsx` and `app/globals.css` used a 15 rem flat workspace list. The subsequent sidebar implementation and rendered verification are recorded in `RETAIL_EXPANSION_PHASE_2_RECONCILIATION_SIDEBAR.md`.

| Area | Shop 99 evidence | Current assessment | Next action |
| --- | --- | --- | --- |
| Sales/returns | `lib/retail-sales.js`, `lib/retail-returns.js`, `app/admin/retail-sales-history` | Canonical retail services and screens present; end-to-end accounting reconciliation not repeated in this slice | Trace a sale and return through movement, journal, dashboard and business day |
| Inventory/purchasing | `lib/retail-inventory.js`, `lib/retail-purchasing.js`, `app/admin/retail-stock-counts`, `app/admin/retail-goods-receipts` | Canonical movement and receipt paths present; operator exceptions need verification | Reconcile receipt/return, count and valuation |
| Customers/suppliers | `app/admin/retail-customers`, `app/admin/retail-suppliers`, `app/admin/retail-receivables`, `app/admin/accounts-payable` | Retail routes and balances present; reminder communication model not verified | Check due-date and allocation behavior before reminders |
| Finance/accounting | `app/admin/retail-finance`, `app/admin/retail-registers`, `app/admin/general-ledger`, `app/admin/financial-reports` | Shared ledger and controls present; status of each workflow is not established by route existence | Verify business-day cutoff and journal links |
| Reports/insights | `app/api/admin/reports/route.js`, `lib/retail-reporting.js`, `app/admin/reports/page.jsx` | API uses retail records but the screen retained restaurant labels, false filters and a cost/profit exposure | First slice below, then report reconciliation and pagination |
| People | `app/admin/employees`, `app/admin/hrm/*`, `app/admin/payroll` | Routes exist but retail attendance/payroll workflow and permission effects are unverified | Audit data and permissions before adding a People workspace |
| Restaurant-only | `../dimsonpuri/components/admin/admin-layout.jsx` and its route groups | KOT, tables, waiter calls, reservations and kitchen reports are reference-only | Exclude from Shop 99 navigation and data model |

The current data model supports stock locations, credit, online orders, Nepal calendar and VAT, and multiple role presets. The deployment's actual store count, fiscal settings and enabled sales channels still need configuration verification.

## First slice: retail report truth and visibility

- `/api/admin/reports` now removes COGS, profit and inventory/purchase values according to the specific retail capabilities before sending JSON. Hiding a column also removes its row key and headline card.
- The Reports screen uses the retail `sale_number`, opens its matching retail sale, and no longer sends users to restaurant bill details or the legacy comparison flow from that screen.
- Filter controls appear only on completed-sale views, the only retail reports whose queries currently apply them. A selected business day scopes sales by `business_day_id` without also imposing a calendar timestamp boundary, so overnight sales stay on their declared day.
- Sales summary cards are suppressed when a staff, tender, search or business-day filter is applied because the shared executive aggregate does not apply those filters. The table declares its 1,000-row cap and explains that per-sale checkout snapshots do not include later returns.
- Sales CSV export removes the screen's 1,000-row cap while retaining the selected retail sale filters and server-side visibility rules.
- Report names and descriptions now state what each retail adapter actually returns. Current stock is a present-time snapshot; cashier performance is sales attribution, not attendance or payroll.
- The expense report uses the effective expense date and excludes voided entries and source-linked stock/purchase costs, so operating expenses are not silently mixed with inventory costs.

## Remaining limitations

The report library still has legacy page structure and route identifiers. Sales, `orders`, and `finance` currently share one retail sales adapter; finance statements should come from the accounting workspace. Period totals and row snapshots need a representative sale/return reconciliation, and the table needs server pagination for large periods. Current outstanding payable is deliberately omitted from period receipt cards until it can carry its own cutoff. Other routes such as report comparison and previous-day reports have not been audited for retail ownership and should not be promoted as retail insights.
