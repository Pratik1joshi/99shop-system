    # AADHAR Restaurant POS/ERP Product Audit

    Audit date: 2026-09-03  
    Method: static repository inspection only. No application server, migration, seed, database query, or write-capable test was run. No environment/secret file or operational database was inspected.

    ## Evidence standard and status definitions

    This report treats routes and screens as evidence only when they connect to meaningful API/service and persistence logic. A screen or schema table alone does not prove a production-ready workflow.

    - **Fully implemented and usable (code-evidenced):** UI/API, persistence, validation, and the principal workflow are present. This is not a live-environment certification.
    - **Implemented but incomplete:** substantial working code exists, but an important workflow, integration, control, or report is missing or inconsistent.
    - **Experimental or hidden:** code exists, but the current launch documentation or deployment profile keeps it outside the qualified operating model.
    - **Planned only:** explicitly described as future work and not implemented end to end.
    - **Unsupported by evidence:** neither working code nor a credible committed implementation was found.

    Primary evidence includes `package.json`, `server.js`, `middleware.js`, `lib/deployment.js`, `lib/auth/auth.js`, `lib/api-guard.js`, `lib/permissions.js`, `lib/business-days.js`, `lib/kot-service.js`, `lib/split-payments.js`, `lib/accounting.js`, `lib/stock.js`, `lib/inventory-ledger.js`, `lib/purchases.js`, `lib/leads.js`, `lib/online-orders.js`, `lib/reports.js`, the `app/` route tree, migrations `001` through `058`, and current repository documentation. `README.md` and parts of `SYSTEM_OVERVIEW.md` are stale in places; current code and the more recent PRD/TRD/hosting-readiness documents take precedence.

    ## 1. Product summary

    ### Framework and architecture

    AADHAR's repository is a full-stack restaurant application built with Next.js 16 App Router and React 19. Pages and API route handlers live in one Node.js deployment. Business logic is split into services under `lib/`, with repository/database adapters below that. The production entry point is the custom `server.js`; the documented target is a cPanel/VPS-style Node.js 22 process serving the web UI and API over HTTPS.

    The data path is broadly:

    `Browser UI -> Next.js page/API route -> service/repository -> PostgreSQL`

    The UI uses Tailwind CSS and Radix-based components. Printing is HTML/CSS rendered into a browser print window, not a direct printer-driver or print-spool integration (`lib/pos-print.js`, `lib/print-receipt.js`). Uploaded menu and receipt media use a configurable persistent upload directory.

    ### Main user roles

    - **Admin:** unrestricted operational and management role, including configuration, permissions, forced close, corrections, and finance.
    - **Cashier:** configurable role with a permission-filtered navigation surface; normally focused on POS, bills, payments, selected reports, and optionally broader operations.
    - **Waiter:** table/order, reservation, waiter-request, and limited KOT workflows in the full-service profile.
    - **Kitchen:** KOT preparation/history plus limited inventory/recipe visibility in the full-service profile.
    - **Public customer:** public menu, website order/reservation, and token-gated table QR ordering; this is not a staff account.

    The role vocabulary is persisted in `users`; granular staff entitlements are stored in `role_permissions`, with changes in `permission_audit` (migration `034`, `lib/permissions.js`). Admin remains universal.

    ### Supported deployment model visible in the repository

    The supported production model is one centrally hosted Node.js application with one PostgreSQL database and a persistent uploads directory. SQLite exists as a local-development fallback; production rejects the SQLite fallback when `NODE_ENV=production` and expects `DATABASE_URL` (`docs/TRD.md`, `docs/HOSTING_READINESS_2026-08-13.md`, `lib/db/`).

    Two feature profiles exist in `lib/deployment.js`:

    - `FULL_SERVICE` (code default): admin, cashier, waiter, kitchen, tables, KOT, and reservations.
    - `COUNTER_READY_SERVE`: admin-led, counter/ready-to-serve operation; staff-role pages are redirected.

    However, the current PRD and roadmap call the launch model **single-admin counter** and say waiter, kitchen, and cashier surfaces must be requalified before re-enablement (`docs/PRD.md:5-16`, `docs/FUTURE_ROADMAP.md:24`). Marketing should describe the deployed customer configuration, not infer full-service readiness from the code default.

    There is no evidence of a managed SaaS control plane, automatic horizontal scaling, serverless deployment, or multi-tenant isolation.

    ### Organization and branch configuration

    The repository is single-restaurant/single-site. Business identity, tax fields, contact details, receipt labels, reservation settings, delivery pricing, and operational toggles are global `system_settings`. Floors and sections organize tables within that site.

    No organization, tenant, or `branch_id` domain model was found. Legacy shop/distribution endpoints return HTTP 410 through `goneLegacy()` (`lib/api-guard.js:104`). Multi-branch tenancy and consolidated reporting are explicitly future work (`docs/PRD.md:42`, `docs/FUTURE_ROADMAP.md:32`).

    ### Authentication and permissions

    Passwords are bcrypt-hashed. Login creates a database-backed session with a 24-hour expiry; each request verifies the live session row and active user (`lib/auth/auth.js:38-126`). Cookie sessions are `HttpOnly`, `SameSite=Strict`, and `Secure` in production. Cookie-authenticated mutations use a double-submit CSRF token (`lib/csrf.js`). The SPA also receives a bearer token and stores it in browser `localStorage`; bearer requests bypass CSRF because the browser does not attach them automatically.

    Newer APIs use the shared `requireAuth()` guard for roles and dynamic permissions. Several older `/api/restaurant/*` and reservation endpoints implement their own bearer-only checks and static permission rules. This creates inconsistent authorization behavior and is a reason not to call the product broadly “secure” without remediation and testing.

    ### Database support

    - **Production:** PostgreSQL 14+ is the documented and enforced target.
    - **Development:** SQLite fallback and unit-test fixtures.
    - **Schema evolution:** ordered PostgreSQL migrations `001`-`058`; `scripts/migrate.mjs` sorts them, records versions, takes a PostgreSQL advisory lock, and wraps every migration in `BEGIN/COMMIT` with rollback on failure (`scripts/migrate.mjs:50-93`).

    There are no down migrations. Corrective forward migrations are the documented policy. However, many request-time services still call `ensureColumn()`, which can execute `ALTER TABLE` if a column is absent (`lib/db/schema-helpers.js:32-42`). That weakens the claim that all production schema change is migration-only.

    ### Backup and recovery

    No in-product backup, point-in-time recovery, restore UI, or verified automated backup monitor was found. The hosting documentation gives an operator procedure to back up PostgreSQL and persistent uploads and recommends nightly retention and restore drills. The readiness checklist still marks scheduled/monitored backups and a completed restore drill as pending (`docs/HOSTING_READINESS_2026-08-13.md:43,110,158`).

    Accurate wording: **“The deployment runbook documents database and upload backup/restore procedures.”** Do not claim automatic or verified backup/recovery.

    ## 2. Complete module inventory

    The “roles” column reflects code permissions, not necessarily roles enabled in the current single-admin launch.

    | Module | Status | Routes / APIs | Workflow, controls, and permissions | Main persisted entities | Factual website wording | Limits / qualification |
    |---|---|---|---|---|---|---|
    | Dashboard | **Fully implemented and usable (code-evidenced)** | `/admin/dashboard`, `/cashier/dashboard`; `/api/admin/dashboard`, `/api/admin/analytics` | Admin or `dashboard.view`; date-aware sales/orders/ticket/table/KOT/reservation/stock/change summaries and activity. | Orders, bills, payments, tables, KOTs, reservations, inventory, audit rows | “A daily operations dashboard brings sales, orders, tables, kitchen activity and exceptions together.” | Refresh/poll based, not push real-time. Some profitability views estimate food cost when recipes are incomplete (`lib/reports.js:2036`). |
    | POS and billing | **Fully implemented and usable (code-evidenced)** | `/admin/pos`, `/cashier/pos`; `/api/admin/pos/*`; `/admin/billing` redirects to POS | Open table or tableless order, add/edit items, issue KOT, proforma, discount/promotion, then settle. Requires open business day/store session for new activity; server owns prices; completed checkout is transactional and idempotent. Admin/cashier or granular POS permissions. | Orders, order_items, bills, bill_payments, allocations, document_counters, audit | “Browser-based restaurant POS for table, takeaway and delivery orders with KOT, billing and split settlement.” | Live runtime was not exercised. The older cashier billing screen remains in the tree and should not be presented as the canonical POS. |
    | Tables and floors | **Fully implemented and usable (code-evidenced)** | `/admin/tables`, `/admin/table-management`, POS floor board; table/floor/type/QR APIs | Create/deactivate tables; capacity, floor/section/type/status; multiple independent parties per table; QR token; drag a party/order to another table. Admin or table-management permissions. | tables, table_floors, table_types, orders | “Manage floors, table capacity, occupancy and separate parties from one floor board.” | Coordinates exist, but no evidence of a mature free-form venue layout editor. Deletion is restricted/deactivation preferred where history exists. |
    | Dine-in | **Fully implemented and usable (code-evidenced)** | POS plus `/waiter/*` in full-service mode | Seat/open a party, attach order to table, send incremental KOTs, track table state, bill and release table. | tables, orders, order_items, KOTs, bills | “Run dine-in tabs from seating through kitchen tickets and final payment.” | Staff-separated waiter/kitchen operation is currently outside the documented single-admin launch; admin POS remains the qualified path. |
    | Takeaway | **Fully implemented and usable (code-evidenced)** | POS; order and billing APIs | Tableless takeaway order, item entry, channel-specific document numbering, KOT, bill and payment. | orders, order_items, KOTs, bills | “Create and settle dedicated takeaway orders without assigning a table.” | No separate collection-display/customer-notification system was found. |
    | Delivery | **Implemented but incomplete** | POS, `/admin/delivery`, `/cashier/delivery`; delivery-executive APIs; `lib/delivery-pricing.js` | Tableless delivery order with address/landmark; fixed, distance-band, or per-km fee; optional maximum distance; assign an executive and track status. | orders, delivery_executives, bills, settings | “Record delivery details, calculate configured delivery charges and assign an in-house delivery executive.” | No GPS tracking, route optimization, proof of delivery, external courier, SMS, or payment-gateway integration. Distance is entered/selected, not map-verified. |
    | Online ordering | **Fully implemented and usable (code-evidenced)** | public `/menu`; `/api/public/orders`; `/admin/orders/online`, `/cashier/online-orders` | Public customer submits server-priced menu order; staff accepts, marks ready, completes or cancels/refunds. Stock is consumed once at completion and a bill/payment journal is produced. Rate/validation controls are present. | orders, order_items, bills, payments, promotion_redemptions | “Accept website orders into an operations queue and complete them through the same billing records.” | Queue refresh is polling. No card/payment gateway, push notification, or external marketplace integration. |
    | Table QR ordering | **Fully implemented and usable (code-evidenced)** | `/order/[token]`; `/api/public/order/[token]`; table QR APIs | Per-table token opens active menu; customer adds items/name/note/coupon and appends to the table’s live order; status and waiter-call polling. Server validates active table/items, caps line/quantity counts, uses server price, and rate-limits submissions. | tables.qr_token, orders, order_items, waiter_requests | “Guests can scan a table QR code to add validated menu items and request service.” | QR submission does **not** automatically issue a KOT; staff must review/send it. Token possession grants table-order access, so QR cards must be controlled/regenerated when needed. |
    | Waiter workflow | **Experimental or hidden** | `/waiter`, `/waiter/new-order`, `/waiter/order/[id]`, `/waiter/kots`, `/waiter/bills`, `/waiter/requests`, `/waiter/reservations` | Table/order handling, incremental items, KOT history, reservations and service requests. Waiter has narrower cancellation rules. | users, orders, order_items, KOTs, reservations, waiter_requests | Do not market as generally available. If a deployment is requalified: “Optional role-specific waiter workspace.” | Current PRD calls this a future staff role; middleware redirects it in the single-admin profile. Older APIs use inconsistent bearer/permission patterns. |
    | KOT and kitchen | **Implemented but incomplete** | `/admin/kot`, `/admin/kitchen-analytics`; `/kitchen*` hidden by profile; `/api/admin/pos/orders/[id]/kot`, `/api/admin/pos/kots/*`, `/api/restaurant/kots*` | KOT snapshots only unsent quantity; new/additional/cancellation tickets; idempotent issue; reprint count; active cancellation requires reason. Prepared cancellation keeps stock consumed; pre-prep cancellation restores it. Payment closes active KOTs. | kots, kot_items, order_items.sent_quantity, stock_movements, pos_audit_log | “Issue incremental kitchen tickets, reprint exact ticket snapshots, and record controlled cancellations.” | Dedicated kitchen screen is not qualified in the current launch. It polls every eight seconds. Older KOT APIs accept any value in a status list rather than enforcing a strict transition graph. |
    | Reservations and waitlist | **Implemented but incomplete** | `/admin/leads`, cashier/waiter reservation pages; public and admin reservation APIs | Web/host booking, confirm, arrive/check in, table assignment/change, seat into order, no-show/cancel/complete; lead-time, capacity/conflict, alternatives, hold/grace/dining/cleaning timers; optional deposit flags. | reservations, customers, tables, orders | “Manage reservations from request and confirmation through arrival, seating and completion, with table-conflict checks.” | “Waitlist” is a board interpretation of arrived/unassigned reservations, not a dedicated waitlist entity/queue. Deposit is recorded as flags/amount; no online deposit collection or accounting workflow is evidenced. Some admin reservation endpoints use older admin-only bearer auth. |
    | Customers | **Fully implemented and usable (code-evidenced)** | `/admin/customers`, `/admin/customers/[id]`, cashier equivalents; customer/profile APIs | Search/create/update; normalized phone; VIP/blacklist; sales/visit profile; credit settings and ledger. Delete is permission-restricted. | customers, orders, bills, customer_ledger | “Keep customer profiles, visit history, credit position and service flags together.” | Customer linkage is optional, so walk-in sales will not enrich profiles. Avoid screenshots with actual identities/contact details. |
    | Customer credit | **Fully implemented and usable (code-evidenced)** | `/admin/accounts-receivable`, customer profile; credit-payment APIs | Allocate part/all of invoice to credit for identified, non-blacklisted customer; due date/note; AR ledger; ageing/statement; later cash/QR collection allocated to oldest balances; permissioned write-off with reason and journal. | customer_ledger, bill_payment_allocations, bills, customers, journal entries/lines | “Track customer credit sales, outstanding balances, ageing, collections and controlled write-offs.” | Credit limit is advisory by design and can be exceeded (`lib/payment-allocations.js`). No automated reminder/collection integration. |
    | Split payments | **Fully implemented and usable (code-evidenced)** | POS payment modal and pay APIs | Exact invoice total split across cash, QR and customer credit; rejects negative/under/over allocation; cash tender/change; QR provider required; credit identity/role/blacklist checks. | bill_payments, bill_payment_allocations, customer_ledger | “Settle one bill with a combination of cash, QR and approved customer credit.” | Current validator supports only cash, QR and credit. It marks QR as verified from staff submission; it does not verify with a bank/wallet gateway. Do not claim direct card, eSewa, Khalti, or bank integration. |
    | Refund, void, reopen and reversal | **Fully implemented and usable (code-evidenced)** | `/admin/bills`, `/admin/corrections`; bill/correction/reopen APIs | Reason- and permission-controlled order/item/KOT cancellation, bill void, full/partial refund, credit write-off, correction reversal, and closed-bill reopen/revision. Compensating journals and audit records preserve history; optional stock restoration follows preparation state/rules. | bills, bill_corrections, bill_revisions, bill_audit, pos_audit_log, journals, stock_movements | “Correct mistakes with reasoned void, refund, reopen and reversal records instead of erasing transaction history.” | Financial/stock restoration depends on correction type and operator choices. Normal journal posting can replace a same-source journal internally, so “immutable ledger” is too strong. |
    | Menu, categories, promotions, combos and recipes | **Fully implemented and usable (code-evidenced)** | `/admin/products`, `/admin/categories`, `/admin/promotions`, `/admin/combos`, `/admin/recipes`; related APIs | Menu CRUD/availability/variants/media; promotion rules by order/category/item and POS/web/QR channel; coupons, schedules and usage limits; combos with at least two non-combo components; recipe BOM/sub-recipes/yield/cost. | menu_categories, menu_items, variants, promotions/targets/redemptions, combos/items, recipes/items | “Manage menu items, variants, recipes, combo packs and channel-aware offers from one catalog.” | Recipe/inventory linkage requires setup. Ambiguous/unlinked item names intentionally deduct nothing and return warnings. Recipe completeness determines whether margin is exact or estimated. |
    | Inventory and units | **Fully implemented and usable (code-evidenced)** | `/admin/inventory`, item detail/dashboard, categories, unit conversion, stock import; cashier equivalents | Item/category CRUD/archive, min level, quantity/cost, restock/adjust/count with reasons, movement ledger, low-stock/value/movement views, static physical conversions and owner-defined pack conversions. | inventory_items, inventory_categories, unit_conversions, stock_movements | “Maintain ingredient stock, units, stock counts, adjustments and a traceable movement ledger.” | No FIFO/lot costing was evidenced. Batch/expiry columns are not enough to claim full lot/expiry control. Stock blocking applies to configured visible/linked stock; unlinked recipes/items can continue with warnings. |
    | Purchases and suppliers | **Fully implemented and usable (code-evidenced)** | `/admin/purchases`, import, suppliers/profile, AP; cashier equivalents; purchase/supplier APIs | Draft/partial/received purchase, line receipt, invoice/tax/shipping/discount, attachment, cash/bank/credit, stock increase, linked expense/journal, edit by reverse/reapply, void, CSV preview/commit; supplier payable and FIFO payment. | suppliers, purchases, purchase_items, expenses, stock_movements, journals | “Receive supplier deliveries into stock and connect purchase cost, payment method and payable history.” | This is receiving/AP, not a purchase-order approval/procurement workflow. Voiding stock does not reconstruct earlier moving-average cost layers. The general supplier report still contains legacy free-text assumptions and omits AP detail available elsewhere. |
    | Wastage | **Fully implemented and usable (code-evidenced)** | `/admin/wastage`, `/cashier/wastage`; wastage API/modals | Record raw-material or recipe wastage, reason, employee/shift/photo context; deduct stock; value loss; post non-cash wastage expense/journal; void restores exact movements and voids linked expense. | wastage_log, stock_movements, expenses, journals | “Record kitchen wastage with reason, stock impact and valued accounting loss.” | Photo is optional; no approval workflow. Route-level role/permission handling should be rechecked because some wastage access is broader than the navigation permission suggests. |
    | Expenses | **Fully implemented and usable (code-evidenced)** | `/admin/expenses`, categories; cashier equivalents; expense APIs | Categorized expenses with date, notes, receipt, payment method/status and actor; accounting linkage; purchase/wastage source links; void/correction handling. | expenses, expense_categories, journals | “Log operating expenses with categories, receipts, payment source and ledger impact.” | Upload persistence depends on host setup. Expense approval/budget workflows were not evidenced. |
    | Cash drawer | **Fully implemented and usable (code-evidenced)** | `/admin/cash-drawer`, `/cashier/cash-drawer`; cash-drawer API | Multiple configured drawers; opening float/session; cash in/out with type/reason; expected cash from ledger; physical count, difference and note; close posts over/short through drawer-close logic; negative-balance guards. | cash_drawers, drawer_sessions, journals/lines | “Track opening float, cash movements, expected cash, physical count and drawer variance.” | The separate business-day close records variance but deliberately does not post a balancing variance journal (`lib/business-days.js:558`); procedures must define which close path is authoritative. |
    | Store sessions | **Fully implemented and usable (code-evidenced)** | `/admin/business-days`, cashier equivalent; business-day APIs | Multiple open/close sessions can belong to one business date, enabling reopen; each session records actor, count and snapshot. | business_days, business_day_sessions, drawer_sessions, business_day_audit | “Open, close and reopen store sessions within a controlled business date.” | Terminology overlaps drawer session and business day; training is needed. Reopening is not the same as reopening an individual bill. |
    | Business-day opening and closing | **Fully implemented and usable (code-evidenced)** | `/admin/business-days`, `/cashier/business-days`; `/api/admin/business-days*` | Nepal-date business day, opening cash/source reason, stale-day acknowledgement, closing summary, blockers, cash count/optional denominations, discrepancy note, admin force close, later session reopen. Normal close blocks open orders, active KOTs, unsettled/reopened bills, occupied linked tables, incompatible drawer sessions, and settled bills missing sale journals (`lib/business-days.js:728-734`). | business_days, business_day_sessions, business_day_audit and linked operational records | “Use a controlled Nepal-date opening and closing process that checks unresolved restaurant activity before normal close.” | Auto-close may assume counted cash equals expected cash when an otherwise clean stale session was never physically closed (`lib/business-days.js:923-979`). Force close carries reconciliation obligations. |
    | Accounting and ledgers | **Implemented but incomplete** | finance dashboard, chart of accounts, general ledger, cash/bank books, financial reports, corrections; accounting APIs/services | Double-entry journals require at least two lines and debits=credits; auto-posting for sales, VAT, payment/AR, expenses, purchases, wastage, payroll/advances, cash/bank/settlements and corrections; trial balance, P&L and balance sheet. | accounts, journal_entries, journal_lines, correction/payment/source tables | “Operational transactions automatically create balanced accounting entries for configured sales, tax, tender, receivables, expenses and payables.” | Normal sale posting credits revenue/tax and debits tender/AR (`lib/accounting.js:315-348`); stock deduction records quantity/cost movements but a separate normal-sale Dr COGS/Cr Inventory journal was not found. Some reports estimate food cost. Source journals may be deleted/recreated for idempotent reposting. Accounting setup and review remain required. |
    | Bank and settlements | **Implemented but incomplete** | `/admin/bank`, `/admin/settlements`, `/admin/bank-reconciliation`, bank book; cashier equivalents | Bank account CRUD, deposit/withdraw/transfer with balance checks; QR/digital clearing settlements and fees; statement/book balance reconciliation and line marking. | bank_accounts, payment_settlements, bank_reconciliations, journals/lines | “Record bank movements, digital-payment settlement batches and manual bank reconciliation.” | No automatic bank feed, payment-provider API, QR confirmation, or electronic transfer initiation. All reconciliation is operator-entered. |
    | HRM and payroll | **Implemented but incomplete** | staff, departments, designations, attendance, holidays, payroll, performance pages/APIs | Staff lifecycle/PIN, department/designation, daily attendance (present/absent/half-day/leave), holiday calendar, salary and advances/deductions, cash/bank payroll journals, activity-derived performance. | users, departments, designations, attendance, holidays, salary_payments, salary_advances, journals | “Maintain staff structure, daily attendance, holidays, salary records and advances alongside POS activity.” | Attendance is informational and explicitly does not drive payroll (`lib/hrm.js:2-6`). No biometric clock, roster, leave approval, overtime, statutory payroll/tax engine, or evidenced payslip workflow. Some payroll/report comments predate the attendance schema. |
    | Reporting and analytics | **Fully implemented and usable (code-evidenced)** | `/admin/reports`, analytics, summary, finance/financial reports; cashier subset | Date presets/custom ranges, business-day and applicable dimension filters, pagination and CSV; sales, finance, expenses, purchases, suppliers, orders, changes, inventory, employees, tables, reservations, menu and customers. | Read models across operational and accounting tables | “Analyze sales, orders, changes, stock, purchasing, customers, tables, staff, reservations and finance with exportable reports.” | No scheduled/email delivery. Report quality follows linkage/setup completeness. Menu margin can use an estimate. Supplier report logic is partly legacy. Cashier is intentionally restricted from finance tabs. |
    | Audit logs | **Implemented but incomplete** | changes report, bill/correction/business-day/permission timelines and source APIs | Captures POS actions, bill changes, correction reasons, business-day events, permission changes, stock movements and journal sources with actor/time where available. | pos_audit_log, bill_audit, bill_corrections/revisions, business_day_audit, permission_audit, stock_movements, journals | “Keep reasoned histories for key bill, KOT, stock, permission and business-day changes.” | There is no single complete audit-log console. Older endpoints and historical rows may lack consistent actor/context fields. Do not claim every action is audited. |
    | Settings, branding and printing | **Fully implemented and usable (code-evidenced)** | `/admin/settings`, `/admin/printer`, `/admin/cms`; settings/CMS/upload APIs | Global identity/contact/tax/service charge, delivery/reservation/QR/calendar settings; configurable bill/KOT/statement/table-QR labels and visibility; 58/80 mm and A4 statement/QR layouts; browser print and reprint marking. | system_settings, CMS/media rows, KOT/bill print metadata | “Configure restaurant identity, billing rules, operational timers and browser-printable bills, KOTs, statements and table QR cards.” | Browser print dialog only—no silent print, printer health, retry/spool, or vendor hardware integration. Persistent uploads must be configured. Repository defaults contain client-specific branding and samples. |
    | PAN/VAT | **Implemented but incomplete for compliance claims** | settings, billing, receipt, finance/reports | PAN/VAT numbers and configurable percentage; exclusive VAT calculation stored on bills and credited to a VAT/tax payable account; receipt fields are configurable. | system_settings, bills.tax/vat_amount/tax_percent, accounts/journals | “Supports configurable PAN/VAT details, VAT calculation, receipt display and tax-ledger reporting.” | Current final bill deliberately defaults to “NOT A TAX INVOICE” (`lib/pos-print.js:125,257`). No legal certification or IRD fiscal validation was found; therefore “VAT compliant” is unsupported. |
    | CBMS / IRD fiscal integration | **Unsupported by evidence** | None found | No submission, device, fiscal-number, IRD API, or acknowledgement workflow found. | None | Do not mention CBMS integration. | PAN/VAT fields are not CBMS. |

    ## 3. End-to-end workflows

    ### 3.1 Dine-in

    1. An authorized operator opens the current Nepal-date business day/store session and records opening cash.
    2. From `/admin/pos`, the operator selects an active table. If the table already has parties, they select one or create a separate party/tab.
    3. The server creates or loads the active dine-in order, links table and operator, and checks reservation holds where applicable.
    4. The operator adds available items/variants. Prices are resolved on the server; configured stock visibility can block unavailable linked stock.
    5. “Save & print KOT” snapshots only quantities not previously sent, numbers the ticket, consumes linked recipe/direct stock, and moves a pending order/table into preparation state.
    6. Later additions create an additional KOT rather than rewriting the earlier ticket.
    7. The operator may print a proforma, identify a customer, apply an eligible promotion, and choose exact cash/QR/credit allocations.
    8. Checkout writes the bill, payments/credit ledger, sale journal and audits within a transaction; active KOTs/order are completed and the table is released.

    ### 3.2 KOT lifecycle

    1. An open order accumulates unsent item quantities.
    2. KOT issue validates the order/items and idempotency key and persists an immutable item/name/variant/quantity snapshot.
    3. The KOT begins `pending`; kitchen/full-service endpoints can mark preparation/ready/completed and capture timing/preparer fields.
    4. Reprint uses the saved snapshot and increments reprint metadata.
    5. An active KOT can be cancelled only with a reason; a sent line cancellation produces a linked cancellation KOT.
    6. If cancelled before preparation, stock is restored. If already prepared, stock remains consumed and the cancellation is identified as wastage.
    7. Final payment completes active KOTs and removes them from the active board.

    Qualification: newer POS cancellation rules are strong, but older restaurant KOT status endpoints do not enforce every transition edge. The dedicated kitchen screen is hidden in the documented single-admin launch.

    ### 3.3 Table transfer and merge

    1. The floor board shows every active party/order under its table.
    2. The operator drags a party card to another active table.
    3. The order's `table_id` changes and both source and destination boards refresh; the independent party/bill remains intact.

    No code-evidenced operation merges two orders, item sets, KOT histories, or bills into one. Market **table/party transfer**, not **table merge**.

    ### 3.4 Takeaway and delivery

    1. The operator chooses takeaway or delivery instead of a table.
    2. For delivery, address/landmark and configured distance band or distance are captured; the server calculates the delivery fee and enforces a configured maximum distance.
    3. Items are added and an incremental channel-labelled KOT can be issued.
    4. An in-house delivery executive can be assigned from the roster.
    5. The order is billed and settled with the same cash/QR/credit controls as dine-in.
    6. Staff manually maintain delivery/order status. No courier or mapping provider is called.

    ### 3.5 Online and table-QR customer orders

    1. A website customer selects public menu items, or a table guest opens `/order/[token]` from that table's QR card.
    2. The server checks item/table activity, derives authoritative prices, enforces request limits, and evaluates applicable channel promotions.
    3. A website submission creates a pending online order for the staff queue. Staff accept, prepare/ready and complete it; completion creates bill/payment/journal and consumes stock once.
    4. A table-QR submission creates or appends to the table's active order and exposes polling status to the guest.
    5. Staff review the table additions and explicitly issue the KOT; the QR action does not print/send one automatically.
    6. The guest may create one active service/bill/water request for the table; staff acknowledge, complete or cancel it.

    ### 3.6 Reservation

    1. A guest submits the public form or staff create a Host Desk booking; minimum lead time and basic fields are checked.
    2. Staff confirm the booking and optionally assign a table and deposit-required/paid markers.
    3. Capacity and overlap checks use configured dining/cleaning windows; conflicts return alternatives unless an authorized override is used.
    4. On arrival, staff mark the reservation arrived/checked in.
    5. Seating checks table conflicts and required-deposit marker, creates a linked dine-in order, and updates the table/reservation.
    6. Paying the linked order completes the reservation; staff can instead cancel/no-show with reason.

    There is no separate first-class waitlist or deposit-payment transaction.

    ### 3.7 Final bill and payment

    1. The server reloads the order and settings and calculates subtotal, promotion/discount, service charge, VAT and delivery fee.
    2. The order must have items and, for a normal new checkout, no unsent KOT quantity. Reopened bills follow a controlled delta path.
    3. The client supplies a checkout idempotency key; a retry returns the prior result rather than duplicating the sale.
    4. Cash, QR and credit allocations must total the bill exactly. Cash tender must cover its portion; QR needs a provider; credit needs an identified non-blacklisted customer and authorized role.
    5. A transaction creates/updates bill, payment allocations, customer ledger if needed, balanced revenue/tax/tender/AR journal, order/KOT/table status and audit rows.
    6. The browser prints the configured customer bill; it is not identified as a tax invoice by default.

    ### 3.8 Customer credit and collection

    1. Staff identify a customer and allocate some or all of a new bill to credit with an optional due date/note.
    2. The system records an outstanding allocation, customer-ledger debit and Accounts Receivable debit in the sale journal.
    3. AR pages show statement/ageing and bill balance.
    4. Later collection accepts cash or QR, applies it oldest-balance-first, records a customer-ledger credit and posts Dr Cash/Digital Clearing, Cr Accounts Receivable.
    5. A permitted write-off requires a reason and posts a discount/write-off expense against receivable.

    The configured customer credit limit warns/informs but is not a hard cap.

    ### 3.9 Refund, void and reopen

    1. Authorized staff select a bill/order/item/KOT and provide the required reason.
    2. The service rejects invalid states, duplicate cancellation, excess refund, or correction against missing history.
    3. A void/full or partial refund creates a correction/audit row and a compensating journal rather than deleting the historical bill.
    4. Stock is restored only where the selected correction and preparation state allow it; prepared food may remain consumed.
    5. Reopening saves a bill revision/snapshot, returns the order to editable status, then settlement posts a supplemental payment/credit or refund delta.
    6. A correction reversal creates the inverse operational/accounting effect where supported.

    ### 3.10 Purchase, supplier payable and payment

    1. Staff choose/create a supplier and record delivery lines, quantities ordered/received, costs, invoice metadata, tax, discount, shipping and attachment.
    2. The system validates positive values and duplicate/reference constraints and records draft/partial/received state.
    3. Received quantities create stock movements and update moving-average cost.
    4. Cash/bank purchase posts the corresponding payment source; credit purchase posts a supplier payable and AP history.
    5. Later supplier payment is allocated to oldest payable items and posts Dr Accounts Payable, Cr cash/bank.
    6. Edit reverses prior linked stock/accounting then reapplies; void reverses stock and linked expense/journal. Draft/voided records have stricter deletion rules.

    ### 3.11 Inventory consumption and wastage

    1. Menu variants may link directly to inventory, or recipes define ingredient quantities in consumption units.
    2. On KOT/online completion paths, the system expands combo/recipe requirements and converts units.
    3. Exact linked ingredients receive `order_deduction` stock movements with quantity, unit cost and balance-after data.
    4. Ambiguous or missing links produce warnings and no guessed deduction.
    5. Wastage explicitly selects a raw item or recipe, quantity and reason; stock is deducted and valued.
    6. Wastage posts a non-cash loss journal against inventory; authorized void restores the recorded movements and reverses the linked financial effect.

    ### 3.12 Business-day opening, close and reopen

    1. Staff select/open a Nepal business date and record opening cash; a difference from prior close needs a source reason.
    2. New operational activity is attached to the open business day/session. A stale day must be acknowledged with confirmation/reason or advanced to the next date.
    3. The close summary calculates sales/channels/payments/changes/expenses/orders/KOTs/items/tables and expected cash.
    4. Normal close is rejected while operational/accounting blockers remain.
    5. Staff enter physical cash; optional denomination counts must equal it. A discrepancy requires a closing note.
    6. Admin may force close with a reason; unresolved work and reconciliation obligations remain visible.
    7. Reopening creates another store session for the same business date, preserving the previous session snapshot rather than overwriting it.

    ### 3.13 Cash reconciliation

    1. Cash ledger lines are associated with the current drawer where applicable.
    2. Expected cash is derived from opening float plus posted cash movements.
    3. Staff count physical cash and optionally enter denomination counts.
    4. The system calculates difference and requires an explanation when non-zero.
    5. Closing through cash-drawer logic posts over/short. Closing through business-day logic records the difference and snapshot without silently posting a variance journal.
    6. Bank reconciliation separately compares entered statement balance to book balance and marks selected journal lines reconciled.

    ### 3.14 Accounting effect of a sale

    1. Checkout separates VAT from net sales revenue.
    2. It debits Cash, Digital Clearing, or Accounts Receivable for each cash/QR/credit allocation.
    3. It credits Sales Revenue for the net-of-tax amount and VAT/Tax Payable for tax.
    4. Later customer collection debits cash/digital clearing and credits Accounts Receivable; later digital settlement moves clearing to bank and records fees where entered.
    5. Refund/void creates compensating journal entries.
    6. Inventory quantities/costed movements are reduced through the recipe/direct-stock path, but a distinct normal-sale Dr COGS/Cr Inventory journal was not found. Therefore the safe claim is automated sales/tax/tender/receivable accounting, not fully automated perpetual-inventory accounting.

    ## 4. Differentiating capabilities

    1. **Business-day close with blockers.** The close cannot quietly proceed while active orders/KOTs, unsettled or reopened bills, occupied linked tables, conflicting drawer sessions, or settled bills without sale journals remain. This addresses incomplete shifts and missing revenue/accounting hand-offs.
    2. **Reasoned corrections instead of deletion.** Bill revisions, voids, refunds, sent-item cancellations and correction reversals preserve source history and actors. This addresses dispute resolution and discourages unaudited erasure.
    3. **Incremental and cancellation KOTs.** Only unsent quantity is issued; later additions and cancellations become their own linked ticket snapshots. This reduces duplicate kitchen production and leaves an interpretable trail.
    4. **Preparation-aware stock restoration.** A cancelled unprepared item can return stock; a prepared item remains consumed as loss/wastage. This avoids falsely increasing sellable stock after food has already been made.
    5. **Recipe-aware inventory with ambiguity refusal.** Recipes, combos, variants and unit conversion drive deductions, but ambiguous names are not guessed. This reduces silent mis-posting while making missing master-data setup visible.
    6. **Customer and supplier subledgers.** Credit sales, collections, write-offs, credit purchases and supplier payments connect operational documents to AR/AP histories. This addresses informal notebook credit and forgotten dues.
    7. **Exact split tender controls.** Cash/QR/credit parts must equal the bill in cents, with cash-tender/change and credit identity checks. This addresses checkout mismatch and incomplete tender records.
    8. **Drawer and business-day snapshots.** Expected cash, counted cash, denomination optionality, difference note and multiple reopen sessions preserve the sequence of custody. This addresses end-of-shift accountability.
    9. **Nepal-date accounting boundaries.** Business dates and journal defaults use Asia/Kathmandu rather than UTC, including the +05:45 offset (`lib/accounting.js:235-245`, `lib/business-days.js`). This reduces overnight transaction misclassification in Nepal operations.
    10. **Configurable PAN/VAT display and posting.** The application can calculate configured VAT, store tax components, print PAN/VAT identifiers and credit a VAT payable ledger. This addresses local record structure, while stopping short of proving statutory compliance or CBMS integration.

    ## 5. Product-screen evidence and screenshot guidance

    No screenshots were captured. The repository contains a local database and brand-specific seed/default material, but there is no evidence that the database is a safe synthetic demo. Starting the app can create/alter compatibility schema and sessions. Capturing without an isolated, seeded demo would risk exposing customer, staff, supplier, contact, or financial data and would violate this audit's read-only constraint.

    | Screen | What it can demonstrate | Synthetic demo data needed? | Must hide / sanitize |
    |---|---|---|---|
    | Dashboard `/admin/dashboard` | Daily overview, exceptions, table/KOT/reservation/stock context | Yes—otherwise cards/charts may be empty | Revenue/cash figures, customer/reservation names, staff activity, real dates |
    | POS `/admin/pos` | Floor/table board, menu, multi-party tabs, KOT and split payment flow | Yes | Prices/real menu if confidential, customer name/phone, live order numbers, QR/payment references |
    | Tables `/admin/table-management` and POS board | Floors, capacity, occupancy, parties and transfer | Yes for convincing occupied states | Table QR tokens, reservation/customer identity |
    | KOT `/admin/kot` | Incremental ticket history, state, cancellation/reprint metadata | Yes | Staff names, order/table numbers linked to live service, notes that may contain personal data |
    | Business days `/admin/business-days` | Opening/closing controls, blocker list, sessions and reconciliation | Yes | All cash/sales totals, notes, staff identity, actual business dates |
    | Cash drawer `/admin/cash-drawer` | Opening float, cash movements, expected-versus-counted close | Yes | Every monetary value, drawer/user name, reasons/notes that reveal incidents |
    | Inventory `/admin/inventory/dashboard` and `/admin/inventory` | Low stock, value, movement ledger, recipe linkage | Yes | Supplier identity, actual quantities/costs/valuation, receipt references |
    | Purchases `/admin/purchases` | Delivery receipt, partial receipt, payment/payable linkage | Yes | Supplier/contact, invoices, attachments, unit cost/tax/total, staff identity |
    | Accounting finance/GL pages | Balanced entries, books, reconciliation, statements | Yes | All account balances, journals, external references, bank names/numbers |
    | Reports `/admin/reports` | Cross-functional filters, charts, detail tables and CSV | Yes | All financials, customer/supplier/staff names, operational trends if sensitive |
    | Permissions `/admin/permissions` | Role matrix and permission-change history | Minimal synthetic staff roles | Usernames/names, internal access design if publishing it creates security risk; show only a curated role matrix |

    Recommended capture method: clone into an isolated demo environment, use a fresh disposable database with invented people/suppliers/orders and deliberately rounded non-production values, use generic AADHAR branding, disable external contact links, then reset the demo after each session. Never reuse the bundled/local database without first establishing its provenance.

    ## 6. Marketing claim validation

    | Proposed claim | Repository evidence | Verdict | Required qualification | Safe wording |
    |---|---|---|---|---|
    | “Complete restaurant POS and ERP” | Broad POS, stock, purchase, finance, HRM and reporting modules exist | **Implemented but incomplete** | Full-service staff rollout, payroll, provider integrations and COGS accounting have limits | “Restaurant POS with connected inventory, purchasing, customer/supplier ledgers, expenses and accounting tools.” |
    | “Works offline” | No service worker, IndexedDB order queue, sync/conflict protocol or offline-first workflow; roadmap explicitly plans it | **Unsupported by evidence / planned only** | None | Do not claim. |
    | “Cloud-based” | Browser app deployable to hosted Node/PostgreSQL over HTTPS | **Implemented but incomplete as a claim** | Means centrally hosted/browser-accessed; not proven managed SaaS, multi-tenant, serverless or automatically scaled | “Deployable as a browser-accessed Node.js and PostgreSQL application.” |
    | “Multi-branch” | No branch/tenant domain; roadmap lists branch tenancy | **Unsupported by evidence / planned only** | Floors/sections are not branches | Do not claim. |
    | “Role-based access” | Admin/cashier/waiter/kitchen roles, dynamic permission table and UI/API enforcement | **Fully implemented; consistency caveat** | Current launch is single-admin; legacy endpoints need authorization consolidation | “Includes configurable staff roles and permissions for qualified deployment profiles.” |
    | “Real-time dashboard / kitchen” | Screens poll on intervals (for example kitchen every 8 seconds, KOT every 15 seconds, online orders every 30 seconds); no WebSocket/SSE | **Unsupported as real-time** | “Near-live” also needs an explicit polling interval and healthy connection | “Operational screens refresh automatically at regular intervals.” |
    | “Automatic accounting” | Transactions post balanced sales/tax/tender/AR, expenses, purchases, wastage, payroll and correction journals | **Implemented but incomplete** | Correct setup/review required; normal sale COGS/inventory journal not evidenced; some repair/backfill paths exist | “Key sales, payment, receivable, payable and expense events create balanced accounting entries.” |
    | “VAT compliant” | Configurable VAT/PAN fields, tax calculation/storage/reporting and VAT payable posting; final bill says not a tax invoice | **Unsupported by evidence** | Requires legal review, fiscal invoice requirements and deployment-specific validation | “Supports configurable PAN/VAT details and VAT calculation/reporting.” |
    | “CBMS integrated” | No CBMS/IRD API, fiscal device, submission or acknowledgement implementation found | **Unsupported by evidence** | None | Do not claim. |
    | “Integrated QR payments” | QR allocation/provider/reference fields and displayed QR images; staff submission sets verified | **Implemented but incomplete** | No wallet/bank confirmation or settlement API | “Records QR payments and tracks their provider/reference for manual settlement.” |
    | “Secure” | bcrypt, DB sessions, secure cookie options, CSRF, security headers, role permissions, rate limits | **Implemented but incomplete as a claim** | No audit/certification; bearer token in localStorage; inconsistent older guards; `handleRouteError()` currently includes raw `debugMessage` and `debugStack` in responses (`lib/api-guard.js:95-96`) | “Includes password hashing, expiring server-validated sessions, access controls and CSRF protection for cookie requests.” |
    | “Every action is audited” | Several focused audit/history tables | **Unsupported by evidence** | Coverage is important but not universal | “Records audit history for key POS, bill, permission, stock and business-day changes.” |
    | “Immutable records” | KOT snapshots and correction/reversal histories preserve originals in main workflows | **Implemented but incomplete** | `postJournal()` deletes/recreates an existing same-source journal for idempotent replacement (`lib/accounting.js:207-231`) | “Uses saved ticket snapshots and reasoned correction/reversal records for key workflows.” |
    | “Automatic backups” / “your data is always backed up” | Runbook for PostgreSQL/uploads; scheduling and restore drill still unchecked | **Unsupported by evidence** | Hosting operator must configure, monitor and test it | “Backup and restore procedures are documented for the deployment operator.” |
    | “Thermal printer integration” | 58/80 mm print layouts and browser print windows | **Implemented but incomplete** | No direct hardware protocol, silent printing, queue/retry or health monitoring | “Browser-printable 58 mm and 80 mm bills and KOTs.” |
    | “Full delivery management” | Delivery details, pricing and executive assignment | **Implemented but incomplete** | No GPS, maps, courier integration or proof of delivery | “Supports in-house delivery records, configurable fees and executive assignment.” |
    | “Online reservations and waitlist” | Reservation lifecycle, conflicts, arrivals and an unassigned-arrival board | **Implemented but incomplete** | No first-class waitlist queue; no online deposit payment | “Online reservations with confirmation, conflict checks, arrival and seating workflow.” |
    | “Inventory updates automatically” | Recipe/direct stock movements on KOT/online completion; warnings for missing/ambiguous links | **Fully implemented with setup dependency** | Only configured, linked items are reliable; no guessed deductions | “Configured recipes and direct stock links create traceable inventory movements during fulfillment.” |
    | “24/7 support” | No support organization, SLA, ticket system or contract evidence | **Unsupported by evidence** | Requires a real service commitment outside code | Do not claim unless contractually established. |
    | “Suitable for every business” | Data model and workflows are restaurant-specific | **Unsupported by evidence** | Product targets restaurants and current deployment is single-site | “Built for single-site restaurant counter and dine-in operations.” |

    ## 7. Technical trust assessment

    | Control | Assessment | Evidence and caution |
    |---|---|---|
    | Authentication | **Implemented** | bcrypt password verification; active-user, live database session validation; 24-hour expiry; logout deletes session (`lib/auth/auth.js`). Token bytes are not trusted without the session row. |
    | Role and permission control | **Implemented but inconsistent** | Dynamic permission catalog/cache, admin override, role-filtered navigation and shared guards. Older restaurant/reservation endpoints use bespoke bearer/static checks, so enforcement should be consolidated and regression-tested. |
    | CSRF/session cookies | **Implemented** | `HttpOnly`, `SameSite=Strict`, production `Secure`; double-submit CSRF for cookie mutations (`lib/csrf.js`). SPA bearer tokens in `localStorage` bypass CSRF by design and raise the impact of any XSS. |
    | Input/business validation | **Strong in core POS** | Server prices, quantity/line caps, exact cent allocation, business-day gates, KOT unsent quantity, table/reservation conflicts, balanced journals and reason requirements. Older routes and broad compatibility helpers are less uniform. |
    | Rate limiting | **Partially implemented** | Database-backed/public request limiting is visible, including QR order limits. No evidence of edge/WAF-wide enforcement for every route. |
    | Auditability | **Implemented but fragmented** | Dedicated POS, bill, permission and business-day histories plus stock/journal source records. No universal audit log or proven total mutation coverage. |
    | Finality/immutability | **Partial** | KOT snapshots and revisions/corrections preserve business history. Same-source journals can be replaced for idempotency, and some master/operational records are editable/voidable. Do not claim immutable books. |
    | Transaction integrity/idempotency | **Strong in principal workflows** | POS checkout, KOT issue, online completion, purchases and many corrections use database transactions and idempotency keys. Older legacy routes are not uniformly structured. |
    | Database migrations | **Implemented, forward-only** | Ordered, versioned, advisory-locked transaction runner; no down migrations. Numerous runtime `ensureColumn()` calls can still alter schema during requests, contrary to a strict migration-only posture. |
    | Error handling | **Needs remediation** | Shared handler logs server details and chooses a sanitized client message, but then includes raw `debugMessage` and `debugStack` in the JSON response for all errors (`lib/api-guard.js:91-97`). This can expose internal paths/queries and must be removed in production. Some routes also use custom error responses. |
    | Security headers | **Implemented** | Middleware applies frame denial, no-sniff, referrer policy, CSP and production HSTS. CSP permits `unsafe-inline` and `unsafe-eval`, reducing XSS hardening. No security certification was found. |
    | Database least privilege | **Documented, not verified** | Hosting guide asks for a dedicated non-superuser app user. Staging grants were explicitly pending verification. Runtime schema alteration also pushes toward broader privileges unless migrations are completed separately. |
    | Backup/recovery | **Documented, not verified** | PostgreSQL plus persistent upload runbook exists; automation/monitoring/restore drill were pending. |
    | Print reliability | **Partial** | Snapshot KOTs, reprint marks and print-specific layouts reduce content drift. Browser print provides no confirmation that a device printed, no retry queue and no hardware health. Hosting checklist still requires physical printer tests. |
    | Nepal time/calendar | **Implemented thoughtfully** | Asia/Kathmandu connection/default and explicit Nepal-date helpers avoid UTC day-boundary errors; business dates and journals are linked. A configurable calendar system exists. Historical code/comments indicate this area evolved, so boundary regression tests remain important. |
    | Automated tests | **Meaningful unit coverage, narrow browser coverage** | 34 files exist under `tests/unit`, including business days, payments, KOT, stock linking, permissions, printing, reports and timezone. Only two E2E specs exist (`public.spec.js`, `admin.spec.js`), and the latest readiness record says browser E2E was not run because Chromium was unavailable. Tests were not run in this audit because fixtures/startup may write to a database. |

    ## 8. Risks and limitations

    ### Release and correctness risks

    - The current launch documentation is single-admin counter, while the code default is `FULL_SERVICE`. A wrong environment value can expose unqualified cashier/waiter/kitchen surfaces.
    - Several older `/api/restaurant/*` and reservation APIs bypass the shared auth/CSRF/permission guard. This produces inconsistent role rules and cookie support.
    - `handleRouteError()` returns raw error messages and stacks in API JSON even after computing a sanitized message. This is a production information-disclosure risk.
    - Request-time `ensureColumn()` can mutate schema. Production should rely on pre-deploy migrations and treat absent schema as a deployment failure, not silently alter it during traffic.
    - Sale accounting does not clearly create a normal Dr COGS/Cr Inventory journal, while some comments/docs imply it does. Inventory quantity/cost movement and financial COGS must not be conflated.
    - The supplier report contains legacy assumptions that suppliers are free text and omits payable/due detail, even though newer supplier/AP entities exist. Marketing screenshots should use the dedicated supplier ledger, not imply every report is reconciled to it.
    - Dashboard/report “profit” or margin can use a fixed cost ratio where recipes are incomplete. It is an estimate, not audited profitability.
    - Business-day close and cash-drawer close handle variance differently. Operators need one documented close procedure to prevent unexplained ledger-versus-snapshot differences.
    - Auto-close can infer counted cash equals expected cash for a stale, otherwise clean open session. This is not a substitute for a physical count.

    ### Incomplete or hidden capabilities

    - Waiter, kitchen and cashier role workspaces are present but explicitly not qualified for the current single-admin launch.
    - Dedicated waitlist, reservation deposit payment/accounting, payment-gateway verification, bank feeds, courier/GPS integrations and fiscal/CBMS integration are absent.
    - HRM attendance does not calculate payroll; statutory payroll, leave approval, overtime, rosters, payslips and biometric attendance are not evidenced.
    - Inventory has no proven FIFO/lot costing or complete batch/expiry workflow. Recipe/master-data linking is required for reliable automatic deductions.
    - Printing relies on the browser dialog and provides no silent/hardware-confirmed print workflow.
    - No offline transaction queue/synchronization exists. Connectivity loss interrupts central operation.
    - Multi-branch tenancy and consolidated branch reporting are planned only.

    ### Deployment and operational risks

    - Production assumes one Node server, one PostgreSQL database and persistent local-style uploads. Shared release filesystems, container replacement and horizontal scaling require additional media architecture.
    - The PostgreSQL pool is conservatively small by default; capacity/load behavior was not evidenced. There is no production load test or autoscaling design in the repository.
    - The latest readiness note recorded lint failures, unrun browser E2E, pending staging PostgreSQL/grant verification, pending persistent-upload validation, pending backup restore drill, and previously reported dependency vulnerabilities. That note predates migrations after `043`, so it is evidence of unresolved process items, not a current dependency scan result.
    - No monitoring/alerting implementation for application errors, latency, database pool, disk/uploads, backup completion or reconciliation exceptions was found; the roadmap lists it as future work.
    - Backups are operator-run/deployment-runbook responsibilities and are not verified by product code.

    ### Client-specific hard-coding and portability

    - The repository repeatedly embeds an existing restaurant brand, location/contact defaults, menu/sample content, print-preview names and brand-specific schema bridge migrations. Those specifics are not repeated here to avoid exposing client-associated information.
    - `lib/db/index.js`, `lib/pos-print.js`, public CMS defaults, printer previews, deployment seeds and migrations `054`-`056` contain brand-specific behavior/data.
    - Before marketing or deploying as AADHAR, extract tenant-neutral defaults, replace hard-coded identity and demo records, review migration names/data, and prove a clean install without the prior brand.

    ### Data/privacy risks for marketing

    - Dashboard, reports, bills, ledgers, KOT notes, reservations, staff, suppliers, purchases, bank and cash pages can contain personal, commercial and financial data.
    - Table QR tokens are credentials for a public table session and must not be legible in public screenshots.
    - Receipt images and uploaded files can contain names, invoice numbers and account data.
    - Only synthetic screenshots from an isolated database should be published.

    ### Claims that must wait

    - Offline/offline-first operation.
    - Multi-branch or multi-tenant operation.
    - Real-time push updates.
    - CBMS/IRD fiscal integration or “VAT compliant.”
    - Automatic/guaranteed backup and point-in-time recovery.
    - Payment-gateway verified QR/card/wallet processing.
    - GPS delivery tracking or third-party marketplace integration.
    - Fully automated perpetual accounting/COGS.
    - Fully qualified waiter/kitchen/cashier role rollout.
    - Enterprise-grade, bank-grade, tamper-proof, immutable, or certified security.
    - 24/7 support or any SLA not separately contracted and staffed.

    ## 9. Website-ready source material

    ### Top ten defensible capabilities

    1. Restaurant POS for dine-in, takeaway and delivery orders.
    2. Floor/table board with multiple independent parties and party transfer.
    3. Incremental KOTs, saved print snapshots, reprint records and cancellation KOTs.
    4. Cash/QR/customer-credit split settlement with exact-total validation.
    5. Customer credit ledger, ageing, collection and controlled write-off.
    6. Recipe/direct-link inventory deductions with traceable stock movements.
    7. Purchase receiving, supplier payable tracking and supplier payment allocation.
    8. Wastage records connected to stock value and accounting loss.
    9. Nepal-date business-day opening/closing with unresolved-work blockers and cash reconciliation.
    10. Balanced journal posting plus general ledger, cash/bank books and financial statements for supported transaction types.

    ### Top five differentiators

    1. **Close-control discipline:** unresolved restaurant activity blocks normal business-day close.
    2. **Kitchen change trail:** additions and cancellations become explicit tickets rather than overwriting the original KOT.
    3. **Prepared-versus-unprepared correction:** stock restoration follows what happened in the kitchen.
    4. **Operational-to-ledger linkage:** sales, receivables, payables, expenses and wastage share source-linked accounting records.
    5. **Nepal operating context:** Kathmandu business dates, PAN/VAT fields, configurable VAT and local cash/QR practices, without claiming statutory certification.

    ### Top five owner problems addressed

    1. “I cannot tell what is still open at closing time.” -> blocker-driven business-day close and closing snapshot.
    2. “Cash is short and nobody can explain why.” -> expected/physical cash comparison, denomination option, actor and required discrepancy notes.
    3. “Kitchen changes disappear or cause duplicate food.” -> incremental/cancellation KOT snapshots and preparation-aware stock handling.
    4. “Customer and supplier credit lives in notebooks.” -> AR/AP ledgers, ageing, collections/payments and linked journals.
    5. “My stock and expenses do not reflect what was sold or wasted.” -> recipe/direct stock movements, purchase receiving and valued wastage.

    ### Recommended factual demo sequence

    1. Start in an isolated synthetic environment on **Opening & Closing**; open a Nepal-date store session with a simple opening float.
    2. Show the **POS floor board**, select a table and create a second independent party.
    3. Add linked recipe items and issue the first **KOT**; add another item and show the additional KOT.
    4. Use a second synthetic party to demonstrate **drag-and-drop table transfer**. Do not call it merge.
    5. Cancel one sent item as “not prepared” and show cancellation KOT plus restored stock; optionally contrast a prepared cancellation that stays as wastage.
    6. Settle the order with a synthetic cash + QR + credit split and show exact-total/change controls.
    7. Open the synthetic customer's **credit ledger**, collect part of the balance and show the AR movement.
    8. Receive a synthetic credit purchase, show the stock movement and supplier payable, then record a partial supplier payment.
    9. Show the **General Ledger** source links and balanced sale/collection/purchase entries, carefully avoiding a claim of automatic sale COGS.
    10. Return to **Business Day**, show a blocker from a deliberately open order, resolve it, enter counted cash, and close with a clean snapshot.

    ### Terminology actually used in the product

    - POS
    - KOT / kitchen ticket; new, additional and cancellation KOT
    - Dine-in, takeaway, delivery, online order
    - Table, floor, section, table type, party/tab
    - Host Desk, reservation, arrived/check-in, seated, no-show
    - Waiter Call / service request
    - Bill, proforma, payment allocation, cash tendered, change
    - Credit sale, customer ledger, Accounts Receivable, collection, write-off
    - Supplier Ledger, Accounts Payable, purchase receipt/delivery
    - Inventory item, recipe, raw material, stock movement, stock count, adjustment, wastage
    - Opening & Closing, business day, store session, drawer session, force close, closing snapshot
    - Chart of Accounts, journal, General Ledger, Cash Book, Bank Book, settlement, reconciliation, correction
    - PAN, VAT, service charge, “NOT A TAX INVOICE”

    Avoid introducing unsupported terms such as branch, tenant, omnichannel, real-time, fiscalized, CBMS, automatic bank sync, cloud backup, or offline sync.

    ### Concise factual product description

    AADHAR is a browser-based, single-site restaurant POS and operations system built on Node.js, Next.js and PostgreSQL. It connects dine-in, takeaway, delivery and website/table-QR orders with incremental kitchen tickets, cash/QR/customer-credit billing, customer and supplier ledgers, recipe-linked stock movements, purchasing, wastage, expenses, business-day cash control, and source-linked accounting reports. Its current documented launch profile is an admin-led counter deployment; staff-specific waiter, kitchen and cashier workspaces require deployment-specific requalification. It supports configurable PAN/VAT details and VAT calculation but does not evidence CBMS integration, certified tax-invoice compliance, offline operation, multi-branch tenancy, payment-gateway verification, or automatic backups.
