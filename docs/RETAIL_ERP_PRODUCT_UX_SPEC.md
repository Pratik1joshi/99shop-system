# 99 Shop Retail ERP — Product & UX Master Specification

**Phase:** 1A — Product architecture and UX specification  
**Status:** Design authority for later implementation; no redesign is implemented by this document  
**Product promise:** **Complexity underneath. Simplicity on the surface.**

## 1. Scope and evidence

This specification is grounded in the current application, not an imagined greenfield ERP. The review covered the admin and cashier route trees, `AdminLayout` navigation, current dashboards and reports, retail Billing, Products, retail sales/returns, inventory operations/reports/counts/transfers, purchasing, customer and supplier profiles, receivables/payables, business-day and drawer controls, settings, permissions, the canonical ownership document, and Phase 0 retail services.

Phase 1 deliberately excludes multi-branch, manufacturing, marketplace expansion, AI forecasting, marketing automation, native mobile applications, advanced ecommerce, franchise management, international multi-currency, and warehouse robotics/wave picking.

## 2. Current UX diagnosis

The application has a capable retail domain underneath, but the interface still exposes implementation history. `AdminLayout` currently presents Dashboard, Billing, Analytics, Summary, a fourteen-link Reports group, Catalog, an eleven-link Sales & Stock group, Customers, two ledgers, Finance, a twelve-link Accounting group, a seven-link People & Payroll group, Website, Permissions, Printer, and Settings. The cashier surface can expose nearly the same breadth through permissions. Users must understand module names and data ownership to decide where to work.

| Before | After | Why |
| --- | --- | --- |
| More than fifty possible navigation destinations | Ten stable workspaces, with at most one active workspace sub-navigation | People think in jobs, not tables or service boundaries |
| Dashboard, Analytics, Summary, Reports, Finance Dashboard, and Financial Reports compete | Overview for action; Insights for analysis; Finance for accounting statements | Each destination answers a distinct class of question |
| Purchases opens direct receiving while PO APIs exist separately | One Purchasing workspace following PO → receipt → invoice/payable → payment/return | The interface should match the commercial lifecycle |
| Inventory Operations, Reports, Counts, Transfers, legacy Inventory, Wastage, and movement pages are separate | One Inventory control center with worklists and task-specific views | Stock is one operational truth with several actions |
| Product management is a 55 KB page with cards, table, and large form | Fast create followed by a structured product detail page | Simple products stay simple; advanced products remain possible |
| Retail Billing supports important flows but remains pointer-first | Persistent scanner/search, cart, and payment regions with a complete keyboard model | Checkout speed is the primary quality metric |
| Customer and supplier balances live in separate list pages and profile tabs | Customer/Supplier command centers with distinct balance cards and linked work | Users act on balances in context |
| Raw permission keys and only one managed staff role dominate configuration | Business-capability presets plus an advanced permission matrix | Permissions should describe work, not code |
| Static KPI cards coexist with operational warnings | Every actionable metric opens a filtered worklist with its definition and cutoff | Trust requires an explanation and a path to action |
| Frequent actions use page changes and modal chains | Inline work, drawers, and full pages chosen by explicit complexity rules | Context is preserved without trapping users in overlays |

### What is already strong

- Canonical retail sales, payments, holds, returns/exchanges, promotions, loyalty, store credit, AR tagging, COGS, and source-linked journals.
- Location-, batch-, and serial-aware inventory with immutable movements, available-to-sell logic, quarantine, transfers, counts, adjustments, expiry, and moving-average valuation.
- Purchase orders, approval, goods receipts, over-receipt controls, supplier returns, AP, supplier payments, and supplier histories.
- Business-day sessions, cash drawer activity, cash counts, closing blockers, reopen policy, and Nepal wall-clock behavior.
- Executive retail analytics, operational inventory reports, financial statements, reconciliation, audit records, and role/permission enforcement.

The redesign should expose these capabilities coherently. It should not duplicate them.

## 3. Product principles

1. **Operational first.** Default views show work to do, not configuration or decorative charts.
2. **One truth, many explanations.** A metric and its drill-down use the same canonical definition and cutoff.
3. **Fast path first.** Routine sale, receipt, count, payment, and lookup flows require the fewest decisions.
4. **Progressive disclosure.** Advanced fields appear only when tracking, tax, pricing, or permissions require them.
5. **Documents have lifecycles.** Status, owner, next action, exceptions, and history are always legible.
6. **Accounting follows operations.** Operational users see business consequences; accountants can inspect journals without duplicate entry.
7. **Keyboard is a first-class input.** High-frequency desktop actions never depend on pointer precision or animation.
8. **Scanning is an input mode, not a page.** A focused scanner field works across Billing, Receiving, Counts, Transfers, Returns, and Search.
9. **Exceptions remain recoverable.** Failed payment, incomplete exchange, short receipt, or variance returns to a stable draft.
10. **Calm density.** Compact tables, strong alignment, restrained color, and clear hierarchy replace giant cards and whitespace.
11. **Localization is a layer.** Nepal calendar, tax identity, receipt rules, and payment methods are configured without coupling core entities to one market.
12. **No silent magic.** Recommendations, totals, overrides, and approvals state their inputs and reasons.

## 4. User and role model

| Role | Default landing | Needs | Hidden by default |
| --- | --- | --- | --- |
| Owner / Administrator | Overview | Business health, attention, cash, profit, approvals, configuration | Low-level operational detail until drilled into |
| Manager | Overview | Exceptions, approvals, staff activity, stock/replenishment, sales control | Chart of accounts administration unless granted |
| Cashier | Sell / Billing | Scan, cart, customer, payment, hold/resume, receipt, return lookup | Costs, profit, stock valuation, purchasing, accounting |
| Inventory Staff | Inventory / Worklist | Receive handoff, counts, transfers, serial/batch lookup, adjustments | Customer financials and profit |
| Purchasing Staff | Purchasing / Worklist | Replenishment, PO, supplier, receiving status, returns | Cashier and accounting configuration |
| Accountant | Finance | AR/AP, registers, expenses, banking, reconciliation, GL/statements | Catalog editing and physical stock operations |
| Salesperson | Sell or Customers | Customer lookup, assisted sale, availability, permitted discount | Cost, margin, accounting, stock corrections |

Roles are presets over capabilities, not hard-coded UI forks. Navigation derives from effective capabilities. Sensitive actions may be visible but locked with “Manager approval required”; irrelevant work is hidden. Owner can inspect any workspace. Phase 1 implementation must first extend the current admin/cashier-oriented role model before exposing these presets.

## 5. Information and navigation architecture

The primary sidebar contains only:

1. Overview
2. Sell
3. Catalog
4. Inventory
5. Purchasing
6. Customers
7. Suppliers
8. Finance
9. Insights
10. Control

The sidebar is expanded at 240 px or collapsed to 64 px. It shows workspace icon, label, active state, and at most one meaningful attention count. It never contains nested report links. Selecting a workspace opens its last-used or role-default view. A horizontal workspace bar below the header exposes no more than 5–7 local views; overflow goes in “More,” not a third navigation level.

| Workspace | Local views | Direct primary action |
| --- | --- | --- |
| Overview | Today, Attention | Resolve highest-priority item |
| Sell | Billing, Sales, Returns & Exchanges, Held Sales | New sale |
| Catalog | Products, Categories, Brands, Price Lists, Labels | Add product |
| Inventory | Stock, Movements, Counts, Transfers, Tracking, Adjustments, Replenishment | Scan/lookup stock |
| Purchasing | Orders, Receipts, Invoices & Payables, Returns, Reorder | Create purchase order |
| Customers | Customers, Receivables | Add customer / collect credit |
| Suppliers | Suppliers, Payables | Add supplier / pay supplier |
| Finance | Registers & Cash, Expenses, Banking, Accounting, Reconciliation | Contextual: record expense or cash movement |
| Insights | Reports, Sales, Inventory, Customers, Purchases | Run/export current view |
| Control | Team & Roles, Audit, Settings | Add team member |

### Role-sensitive examples

- Cashier: Sell, Customers; optionally Overview. Returns appear inside Sell only when allowed.
- Inventory Staff: Inventory, Catalog read access, Purchasing receipts.
- Purchasing Staff: Purchasing, Suppliers, Inventory read/replenishment.
- Accountant: Finance, Customers/Receivables, Suppliers/Payables, Insights.
- Manager/Owner: all applicable workspaces, with Control limited to authorized users.

## 6. Global shell

### Header

Left to right: workspace title and optional breadcrumb; universal search trigger; business-day/register status; attention bell; quick-create button; user menu. The status control says `Day open · Register 1 · Rs … expected` only when the role may see expected cash. Closed or blocked states are prominent and actionable.

The user menu shows identity, active role, current register where relevant, Change PIN/password, Lock workspace, and Sign out. Role switching is not shown unless the account genuinely has more than one server-authorized role. Lock preserves the current draft locally without exposing it to the next operator; resuming requires authentication.

Breadcrumbs appear only for hierarchy (`Products / SKU-1042`, `Purchase Orders / PO-0041`), never to repeat the sidebar. Entity detail retains a clear Back action and preserves the originating filters.

### Quick create

`New` opens a permission-filtered menu: Sale, Product, Customer, Purchase Order, Goods Receipt, Stock Count, Transfer, Expense. The last three used actions appear first. No animation for keyboard invocation; pointer-open popovers may use a 150–180 ms origin-aware ease-out.

### Desktop and tablet

- Large desktop: sidebar, header, workspace bar, main canvas; detail drawer up to 520 px.
- Normal desktop: collapsed sidebar is allowed; dense two/three-region Billing remains viable.
- Tablet landscape: icon rail plus workspace; Billing uses catalog/cart split and bottom payment summary.
- Tablet portrait: workspace list and detail alternate; persistent action footer.
- Small mobile: simplified task views, cards for essential row fields, and drawers promoted to full-screen sheets. Advanced accounting and bulk configuration may be view-only or require desktop. No squeezed desktop grid.

## 7. Universal search and command architecture

Open with `Ctrl/Cmd+K`; `/` focuses workspace search when typing is not already in a field. The surface has two modes in one input:

- **Find:** product, SKU, exact barcode, serial, batch, customer/name/phone, supplier, sale/receipt, PO, GRN, supplier invoice, return, payment, transfer, adjustment, expense.
- **Do:** New sale, create PO, receive stock, count stock, transfer stock, add product/customer/supplier, record expense, collect credit, pay supplier, open/close register.

Exact barcode/serial/document matches appear first and may open directly after Enter when unambiguous. Fuzzy text results are grouped by entity with at most five initial results per group, identity on the first line, decisive context on the second, and status/amount/date aligned right. Arrow keys move, Enter opens, `Ctrl+Enter` opens a full page, Esc returns or closes. Recent entities and commands appear before typing. Search is server-backed, debounced for text, immediate for scanner terminators, paginated, permission-filtered, and never loads the whole catalog.

## 8. Major workspace specifications

### 8.1 Overview

| Field | Specification |
| --- | --- |
| Purpose | Owner/manager control center for today and urgent operational work |
| Primary user/question/action | Owner or manager; “What happened and what needs action?”; open the highest-impact worklist |
| Secondary actions | Change date/business-day scope, inspect metric definition, export daily summary |
| Information hierarchy | 1) day/register state, 2) Net Sales/Gross Profit/Cash/Digital/AR/AP/Inventory Value, 3) attention queue, 4) selling/not-selling and cash flow, 5) activity |
| Main components | WorkspaceHeader, Metric, AttentionCard, compact ranked lists, activity timeline |
| Data structure | Metrics carry value, comparison, cutoff, definition, source status, and drill target |
| Filters/search | Today by default; business day or calendar range; location only when supported |
| Empty/loading/error | Empty explains first sale/open-day action; skeleton preserves hierarchy; partial source failures label affected metrics instead of blanking the page |
| Attention states | Low/out stock, expiry, overdue AR/AP, failed reconciliation, cash variance, pending approval, transfer receipt, overdue PO, unusual discounts/returns |
| Drill-down | Every metric opens the exact filtered records producing it |
| Permissions/keyboard | Financial values capability-gated; `g o` opens Overview; number keys may select visible attention items |
| Layout | Desktop: six compact metrics then 2:1 attention/content; tablet stacks attention first; mobile shows status, four permitted metrics, attention list |
| Existing backend | Retail executive dashboard, retail reports, inventory worklists, AR/AP ageing, business-day summary, reconciliation |
| Current pages merged/replaced | Replace `/admin/dashboard`; merge intent from `/admin/analytics`, `/admin/summary-report`, `/admin/finance-dashboard`; deeper analysis moves to Insights/Finance |

Metric definitions follow `RETAIL_CANONICAL_OWNERSHIP.md`: Gross Sales before discounts/VAT; Net Sales after discounts and returned revenue; VAT net of return reversal; COGS net of physical return restoration; Gross Profit = Net Sales − COGS. Cash and Digital are settlement movements, not revenue.

### 8.2 Sell

| Field | Specification |
| --- | --- |
| Purpose | Complete sales and post-sale service quickly |
| Primary user/question/action | Cashier; “What is the customer buying and how are they paying?”; scan/add item |
| Secondary actions | Customer, quantity, controlled discount/override, hold, return lookup, reprint |
| Information hierarchy | Scanner/search → cart lines → total/payment; customer and exceptions remain visible without dominating |
| Main components | ScannerInput, product results, CartTable, CustomerPicker, payment panel, held-sale drawer, receipt preview |
| Data/filter/search | Exact barcode first; server product search; sales list supports number/date/customer/phone/tender/cashier/status |
| Empty/loading/error | Empty cart teaches scan/search and shortcuts; cached cart remains visible during product-search loading; failed checkout preserves draft and tender input |
| Attention | Restricted price, insufficient stock, serial required, credit limit, expiring selected batch, payment mismatch |
| Drill-down | Sale drawer → receipt, payments, returns, stock and journal explanation according to permission |
| Permissions/keyboard | Cashier fast path; manager approval for controlled actions; full model below |
| Layout | Desktop persistent product/search left (55–60%) and cart/payment right; tablet landscape 50/50; portrait toggles Products/Cart with total footer; mobile simplified assisted sale |
| Existing backend | Retail sales/holds, barcode lookup, stock/FEFO, serials, promotions, loyalty, store credit, AR, returns/exchanges, printing |
| Current pages merged/replaced | Replace current Billing UI while retaining service; merge retail sales history, held-sales overlay, returns entry; legacy `/admin/bills`, `/admin/orders` remain legacy-history only |

#### Billing keyboard contract

`F2` customer, `F3` product search, `F4` quantity, `F6` line discount, `Shift+F6` sale discount, `F7` price override when permitted, `F8` hold, `Ctrl+F8` held sales, `F9` pay, `F10` receipt/last sale, `Ctrl+R` return lookup, arrows select results/lines, Enter confirms, Delete removes selected line, `+/-` changes quantity, Esc closes the current transient surface then returns focus to scanner. Browser-conflicting bindings must be tested and remappable. Keyboard-triggered transitions are instant.

Payment opens as the right-region state, not a chain of dialogs. Tender method is selected by mnemonic/number, amount receives focus, cash offers exact total and sensible denomination buttons, change is large and unambiguous, and split rows always show allocated, remaining, and change separately. Permanently visible: cart, subtotal, discounts, VAT, total, customer/credit status, item count, selected register, and network/save state.

### 8.3 Catalog

| Field | Specification |
| --- | --- |
| Purpose | Maintain sellable identity, SKUs, barcodes, price, tracking, and purchasing defaults |
| Primary user/question/action | Owner/manager/catalog staff; “Can this item be sold, bought, and tracked correctly?”; add product |
| Secondary actions | Import, print labels, archive, duplicate, price change, inspect history |
| Information hierarchy | Product list → identity/status → SKU table → contextual sections: Pricing, Inventory, Purchasing, Tax, Media, History |
| Components/data | EntityTable with product, variant count, primary SKU/barcode, price range, stock state, tracking, status; Product page with editable FormSections and SKU grid |
| Filters/search | Server search by product/SKU/barcode/brand/category; active, tracking, stock state, supplier, missing data |
| States | Empty offers add/import; row skeletons; save errors stay at field/section with draft preserved; warnings for duplicate barcode or destructive tracking change |
| Drill-down | Product → SKU → stock by location, movements, sales, receipts, returns, price/audit history |
| Permissions/keyboard | View vs manage vs pricing/cost permissions; `n` new, `/` search, Enter open |
| Layout | Desktop list/detail page; tablet same with narrower SKU columns; mobile browse/quick price lookup, complex editing deferred to desktop |
| Existing backend | Products/variants, default SKU, multiple barcodes, attributes, inventory links, tracking modes, supplier/cost data, history sources |
| Current pages merged/replaced | Completely replace `/admin/products`; merge Categories and Labels as local views/actions; legacy inventory-item linkage is advanced compatibility, not primary language |

Quick Create asks only name, selling price, optional barcode, category, and initial stock choice. Save creates the Standard SKU. “Add variants” switches to advanced mode. The SKU table columns are Variant, SKU, Barcodes, Retail/MRP, Cost (permissioned), On hand/Available, Reorder rule, Tracking, Status, and row actions. Variant changes never delete referenced SKU identity.

### 8.4 Inventory

| Field | Specification |
| --- | --- |
| Purpose | Show what exists, where it is, what changed, and what needs intervention |
| Primary user/question/action | Inventory staff/manager; “Is stock accurate and actionable?”; scan or open attention worklist |
| Secondary actions | Count, transfer, adjust, quarantine/release, damage/expiry/shrinkage, trace serial/batch |
| Information hierarchy | Stock health summary → worklists → stock table → movement/tracking history |
| Table | Product/SKU, location, on hand, reserved, available, incoming, reorder point, status, value if allowed |
| Filters/search | Product/SKU/barcode/serial/batch; location, stock status, category, tracking, supplier, date/movement type |
| States | Empty distinguishes no catalog from no stock; incremental row skeleton; failed operation preserves draft/idempotency key |
| Attention | Low/out/overstock, expiring/expired, dead/slow, negative anomaly, discrepancy, quarantine, incoming/in transit |
| Drill-down | Quantity opens immutable movement ledger; serial/batch opens lifecycle and references |
| Permissions/keyboard | Cost hidden independently; risky adjustment/quarantine release/approval gated; scanner Enter increments in task modes |
| Layout | Desktop worklist + dense stock table; tablet task-optimized; mobile scanner lookup and count/transfer receiving only |
| Existing backend | Balances/movements, ATS, FEFO, serials, batches, quarantine, counts, transfers, adjustment types, reports |
| Current pages merged/replaced | Merge `/admin/inventory`, dashboard/movements, retail inventory ops/reports/counts/transfers, wastage; keep import as contextual action; legacy detail becomes compatibility-only |

### 8.5 Replenishment

Replenishment is an Inventory view and Purchasing handoff, not a separate top-level module. Each recommendation shows On hand, Reserved, Available, Incoming approved/open PO quantity, Reorder point, Recommended quantity, Preferred supplier, recent sales signal when already reliable, and a plain-language reason such as `Available 3 < reorder point 8; 0 incoming; suggested 12`. Users can select lines, change quantities/supplier, exclude lines with a reason, and create one or more draft POs grouped by supplier. No opaque score and no AI forecast.

### 8.6 Purchasing

| Field | Specification |
| --- | --- |
| Purpose | Manage the commercial lifecycle from need to settled supplier obligation |
| Primary user/question/action | Purchasing staff/manager; “What must be ordered, received, invoiced, returned, or paid?”; create PO |
| Secondary actions | Approve, receive, attach invoice reference, return, pay, cancel |
| Information hierarchy | Status worklist → document list → document detail with next action and timeline |
| Table | Number, supplier, ordered/received value, expected date, receipt progress, invoice/payable state, status, owner |
| Filters/search | Document/invoice, supplier, SKU/barcode, status, expected/received date, payable state |
| States | Empty offers PO or direct permitted receipt; document skeleton; posting errors preserve draft; duplicate invoice/over-receipt are explicit blockers |
| Attention | Awaiting approval, overdue PO, partial receipt, receipt discrepancy, uninvoiced receipt, overdue payable, pending return |
| Drill-down | PO → line receipt history → GRN → movements/batches/serials → journal/payable |
| Permissions/keyboard | Create, approve, receive, over-receive, see cost, return, pay are separate capabilities |
| Layout | Desktop list with 480–560 px detail drawer; complex PO/receipt uses page; tablet receiving prioritizes scan and line progress; mobile lookup/approval only |
| Existing backend | PO create/get/approve/cancel, GRN create/post, batches/serials, purchase returns, valuation, AP/payments |
| Current pages merged/replaced | Replace retail goods-receipts page with lifecycle workspace; merge supplier ledger payment context; legacy `/admin/purchases` stays redirect/legacy history only |

Statuses: Draft, Awaiting Approval (when policy requires), Approved, Partially Received, Received, Invoice Outstanding, Partially Paid, Closed, Cancelled. Operational and financial sub-statuses should coexist rather than forcing one overloaded status.

### 8.7 Customers

| Field | Specification |
| --- | --- |
| Purpose | Unified retail relationship and customer money view |
| Primary user/question/action | Cashier/manager/accountant; “What has this customer bought and what balances exist?”; start sale or collect credit |
| Secondary actions | Edit, return sale, issue/redeem permitted credit, adjust loyalty with reason, statement |
| Information hierarchy | Identity/contact → three distinct balances → commerce timeline → sales/returns/payments |
| Table/search | Name, phone, last purchase, lifetime spend, AR due, store credit, loyalty; server search by name/phone |
| States | Helpful first-customer empty state; section skeletons; partial ledger error isolated |
| Attention | Overdue/over-limit AR, unused store credit, expiring loyalty if policy exists |
| Drill-down | Timeline event opens sale, return, payment, store-credit or loyalty source |
| Permissions/keyboard | Cashiers see operational balance labels, not journals; write-off/manual adjustments require authority |
| Layout | Desktop command-center page; tablet stacked; mobile identity, balances, timeline and actions |
| Existing backend | Customer profiles, retail sales/returns, customer-tagged AR, collections/write-off, store credit, loyalty |
| Current pages merged/replaced | Improve customers list; replace current mixed 99 Shop-first detail timeline; merge Accounts Receivable as `Receivables` view while Finance retains control-account analysis |

AR, Store Credit, and Loyalty are never combined: AR says “Customer owes us,” Store Credit says “We owe customer purchasing value,” Loyalty says “Non-cash points.” Each has its own color-neutral label, unit, rules, and history.

### 8.8 Suppliers

| Field | Specification |
| --- | --- |
| Purpose | Supplier relationship, supply history, and payable command center |
| Primary user/question/action | Purchasing/accountant; “What are we buying and what do we owe?”; create PO or pay supplier |
| Secondary actions | Receive, return, edit contact, inspect ageing/product pricing/history |
| Hierarchy/components | Contact/status → payable and open-document summary → timeline → products, POs, receipts, invoices, returns, payments |
| Table/search | Supplier, contact, last receipt, open POs, outstanding, overdue, total spend; server search |
| States/attention | Empty offers add supplier; overdue payable and overdue PO; errors isolated by tab |
| Drill-down | Document drawer/page and source-linked ledger entries |
| Permissions/keyboard | Cost/payment fields capability-gated; payment confirmation shows source account and allocation |
| Layout | Desktop command-center detail; tablet stacked; mobile contact/balance/documents, not supplier master-data bulk editing |
| Existing backend | Suppliers, supplier profile, statements, ageing, open invoices, pay supplier, purchasing/returns |
| Current pages merged/replaced | Improve supplier list/detail; merge Supplier Ledger into Payables view and contextual profile actions |

### 8.9 Finance and Registers

| Field | Specification |
| --- | --- |
| Purpose | Explain and control money without duplicating operational entry |
| Primary user/question/action | Owner/accountant; “Where is money and does it reconcile?”; resolve exception or record permitted manual item |
| Secondary actions | Expense, cash movement, bank transaction, supplier/customer settlement, reconciliation, correction |
| Hierarchy | Owner layer: Cash, Bank, AR, AP, Expenses, Profit; Accountant layer: Accounts, Journal, GL, Trial Balance, P&L, Balance Sheet, Cash Flow |
| Data/search | Account/document/reference/person/date/amount; source-linked journals and control-account reconciliation |
| States | Empty describes upstream operations; statement skeletons; reconciliation differences never hidden |
| Attention | Cash variance, unreconciled bank lines, AR/AP overdue, control-account mismatch, failed retail reconciliation |
| Drill-down | Statement → account → journal → source document; reverse navigation from source to journal |
| Permissions/keyboard | Owner summaries separate from accountant depth; manual journals/corrections highly restricted |
| Layout | Desktop financial overview plus local views; tablet review/reconcile; mobile read-only summaries and approvals |
| Existing backend | Cash/drawer/business day, expenses, bank, reconciliation, AR/AP, accounting, statements, corrections |
| Current pages merged/replaced | Merge Finance Dashboard, Cash/Bank books, Bank, Reconciliation, Expenses, AR/AP control views, GL/COA/Financial Reports into one workspace; retain specialized views internally |

#### Register & cash model

One `Registers & Cash` view contains open register, opening cash, movements, expected cash (permission/time-policy aware), count, variance, close/reopen, blockers, and history. Opening/closing is a guided page; movement entry is a drawer; destructive/force-close is a confirmation dialog. Variance outside configured tolerance requires a reason and manager review. Business day and drawer/session are explained as related but distinct: the day owns reporting scope; the register owns physical cash custody.

### 8.10 Insights

| Field | Specification |
| --- | --- |
| Purpose | Answer business questions after operational worklists have been separated out |
| Primary user/question/action | Owner/manager/analyst; “Why did performance change?”; choose question and drill down |
| Secondary actions | Date scope, compare, segment, export, save view |
| Hierarchy | Curated questions → KPI definitions → restrained trend/rank visualization → supporting transaction table |
| Views | Reports, Sales, Inventory, Customers, Purchases; promotion effectiveness within Sales |
| Filters/search | Shared date/business-day scope, then domain filters; filter chips remain visible |
| States | No-data explanation; chart/table skeletons; stale/partial data warning with last successful cutoff |
| Attention | None duplicated from operations; links can return to operational worklists |
| Drill-down | Aggregate → grouped members → canonical transactions |
| Permissions/keyboard | Export and sensitive margin/customer fields independently gated |
| Layout | Desktop two-column analytical canvas; tablet one column; mobile summary/ranked lists only |
| Existing backend | Retail analytics/reporting, financial reports, comparison, CSV, canonical definitions |
| Current pages merged/replaced | Replace separate Analytics, Retail Analytics, Summary, Reports catalog/compare, inventory reports, previous-day activity with one question-led workspace; legacy 99 Shop reports marked legacy-only |

### 8.11 Control

| Field | Specification |
| --- | --- |
| Purpose | Safely administer people, permissions, audit, and configuration |
| Primary user/question/action | Owner/admin; “Who can do what, what changed, and how is the business configured?”; invite/add user or search setting |
| Secondary actions | Apply role preset, compare permission override, inspect audit, configure domain |
| Hierarchy | Team & Roles, Audit Log, Settings; printer belongs under Receipts & Printing |
| Search/data | Search people, capability, setting name/description, actor/entity/action/reference |
| States | Empty team/audit; per-section skeleton; unsaved-change guard and field-level validation |
| Attention | Default credentials, risky settings, disabled printing, permission escalation, failed integration |
| Drill-down | Audit event → before/after + actor/reason + source entity |
| Permissions/keyboard | Owner-only dangerous settings; capability labels first, raw keys only in Advanced |
| Layout | Desktop settings index plus detail; tablet one pane; mobile safe settings and audit viewing only |
| Existing backend | Employees, permission catalog/history, business settings, printers, audit/source records |
| Current pages merged/replaced | Replace Permissions UX and Settings organization; merge Printer, expense/inventory setup categories, units, bank/account setup as linked settings domains; People/Payroll remains out of Phase 1 ERP expansion unless required for access management |

## 9. Returns and exchanges

Entry paths: scan receipt, universal transaction search, or Sale detail → Return/Exchange. A single guided page uses five steps in one canvas: select items/quantities; reason and condition; inventory disposition; refund/store-credit/AR treatment; review and post. Cashiers see consequences in plain language: `2 units return to sellable stock`, `Rs 800 refunded to cash`, `120 loyalty points reversed`. Accounting details are available only in an explanation drawer.

Exchange adds a replacement cart beside the return credit. The user sees return credit, replacement total, and difference due/refundable. If replacement checkout fails, the exchange remains a recoverable draft; already-posted return effects are never silently repeated. Manager approval is required for no-receipt policy exceptions, non-resellable-to-sellable override, high-value return, or refund-method override.

## 10. Transaction explorer and audit

The Transaction Explorer is opened from global search or Insights and spans Sales, Returns, Payments, POs, GRNs, Supplier Returns, Adjustments, Transfers, and Expenses. Filters include document number, phone, supplier, SKU/barcode, serial, amount range, date/business day, cashier/actor, status, and payment method. Results use a shared document column model and open in a drawer; complex actions navigate to the source page.

Audit is business language, not logs. Each event shows actor, timestamp, action, reason, entity, previous value, new value, and related approval. Priority coverage: prices, discounts, overrides, returns, voids, adjustments, counts, cash variance, corrections, settings, and permissions. Entity timelines show contextual events; administrators get a global viewer.

## 11. Attention system

Every attention item has `type`, `severity`, `owner role`, `entity/reference`, `created/due time`, `plain-language reason`, `primary action`, `status`, and `resolution evidence`.

- Critical: financial/control failure or blocked operation; persistent until resolved.
- High: overdue or materially risky; appears in Overview and owning workspace.
- Medium: action soon; owning workspace by default.
- Informational: recent completion/status; notification center only and expires.

The bell groups by workstream and shows only new/changed items. Counts deduplicate the same underlying issue. Users can acknowledge informational items, assign work where ownership exists, and snooze only eligible non-critical items. A metric such as `12 Low Stock` opens those exact 12 records.

## 12. Design system

### Foundations

- Typography: a neutral UI sans; 12 px metadata, 13–14 px dense table/body, 16 px section title, 20–24 px workspace title, 28–32 px only for decisive financial totals. Tabular numerals for money and quantity.
- Spacing: 4 px base; tokens 4, 8, 12, 16, 24, 32, 40. Operational screens default to 12–16 px internal spacing.
- Radius: 4 px controls/table cells, 8 px popovers/cards, 12 px drawers/dialogs. Pills only for statuses/tags.
- Borders/elevation: 1 px neutral borders establish most hierarchy. Shadow only for floating surfaces; no card field of floating tiles.
- Surfaces: canvas, primary surface, inset/secondary surface, floating surface. Never encode workspace identity with unrelated bright tints.
- Color: one primary action color; neutral canvas; semantic red/amber/green/blue reserved for meaning. Status always includes text/icon, never color alone.

### Interaction states

Primary action is one per region. Secondary actions are outlined/text. Destructive actions are red only at decision point and require explicit scope. Focus uses a high-contrast 2 px ring plus offset. Selected rows have border/indicator and subtle fill. Disabled controls state why via adjacent help or tooltip. Loading preserves layout with skeletons; spinners belong only inside the initiating control. Errors stay near failed work and preserve input. Success confirms document number and next actions without celebratory delay.

Motion is restrained: keyboard actions are instant; tooltips/popovers 125–180 ms; drawers/dialogs 180–240 ms; ease-out on entry, faster exit; transform/opacity only; reduced-motion removes spatial movement. No bouncing ERP chrome, page-load choreography, glassmorphism, gradients, or decorative illustration.

## 13. Reusable component architecture

| Component | Purpose / use | Key states and rules | Accessibility |
| --- | --- | --- | --- |
| AppShell | Global sidebar/header/status | Role-filtered; preserves workspace state | landmarks, skip link, logical focus order |
| WorkspaceHeader | Title, scope, primary action | Compact/sticky where useful | one page `h1` |
| CommandBar/SearchCommand | Find and act globally | recent, grouped, exact match, loading, empty | combobox/listbox semantics |
| Metric | Defined, drillable number | normal, warning, unavailable, stale | button/link if actionable; full label |
| AttentionCard | Owned operational exception | severity, due, assigned, resolved | severity not color-only |
| EntityTable/DataTable | Consistent lists | server state, selection, totals, empty | semantic table and keyboard row navigation |
| SmartFilter | Composable filter chips | applied, invalid, saved view | labeled controls; removable chips |
| EntityPicker | Product/customer/supplier/account | recent, search, exact, create if allowed | combobox semantics |
| Money/Quantity | Formatting and alignment | negative, zero, unavailable, unit | machine-readable text remains announced |
| StatusBadge | Document/stock state | icon/text/semantic tone | never color alone |
| FormSection | Progressive form grouping | clean, dirty, error, restricted | fieldset/legend where applicable |
| SidePanel | Read/quick action detail | unsaved guard; one level only | focus trap, return focus |
| ActionDrawer | Medium task in context | draft, validating, posting, recoverable error | titled dialog semantics |
| ApprovalPanel | Explain restricted action | request, approved, rejected, expired | reason and approver announced |
| AuditTimeline | Human-readable changes | filters and before/after expansion | ordered list; accessible diff labels |
| TransactionTimeline | Commerce/document history | source-linked and drillable | chronological list |
| InlineAlert | Local information/problem | info/warn/error/success | `status` or `alert` appropriately |
| ConfirmAction | Destructive/irreversible decision | exact object/effect; typed reason when required | initial focus avoids destructive button |
| ScannerInput | Scan or type identifiers | armed, matched, ambiguous, invalid | live region for result; visible focus |
| ReceiptPreview | Print/reprint | original/reprint, printer unavailable | printable semantic structure |
| EmptyState | Explain absence and next action | first-use vs filtered-empty | concise heading and action |

## 14. Table standards

Server search, filters, sort, and cursor/page pagination are default for potentially large data. Saved views are appropriate for recurring operational queues, not every small lookup. Column visibility is offered only on broad analytical/master tables. Bulk action appears only after selection and must share one valid action across selected rows. First identity column may be sticky; numeric columns align right; status and actions stay narrow. Totals state whether they cover page or full filtered result. Enter opens the selected row, arrows move selection, Space toggles checkbox, and Shift+Space ranges where supported.

Use a simple table when rows are under roughly 50, columns under 6, no bulk action is needed, and data is already bounded (for example a sale’s payments). Do not turn document line items or short timelines into a configurable grid.

## 15. Page, drawer, modal, popover, and inline rules

- **Full page:** multi-section editing, multi-step documents, tasks likely to exceed two minutes, shareable/deep-linked state. Product, PO, receipt, count, return/exchange.
- **Drawer:** view detail, compare with list, quick bounded action, transaction explanation. Never open a drawer from a drawer; promote the second level to a page.
- **Modal/dialog:** confirmation, approval, a choice requiring full attention, or a very short form. Never use for browsing large lists.
- **Popover:** anchored choice/help, small filter, command menu. It closes on Esc/outside click and returns focus.
- **Inline edit:** one low-risk scalar with immediate validation. Price/cost, tracking mode, posted quantities, and financial classification do not silently inline-save.

## 16. Settings and Nepal localization

Settings search returns matching settings and their domain. Domains: Business; Sales; Taxes; Payments; Receipts & Printing; Inventory; Purchasing; Returns; Customers & Loyalty; Accounting; Users & Permissions; Security; Integrations; Localization. Dangerous settings show impact, affected workflows, authorization, and whether they apply prospectively.

The Nepal localization package concept owns BS display/conversion, Nepal wall clock, PAN/VAT labels and validation, IRD-oriented configuration, local tender labels/QR methods, receipt fields, and fiscal conventions. Core records store canonical dates, tax concepts, tenders, and identifiers through stable interfaces. Phase 1 does not add another country or multi-currency.

## 17. Accessibility and performance UX

- Visible focus always; no focus removal. Overlay focus is trapped and restored. Validation summary links to invalid fields.
- Semantic headings, forms, tables, buttons, and labels; status messages use appropriate live regions. Minimum WCAG AA contrast and 44 px touch targets in touch layouts.
- Scanner workflows never depend on sound alone; successful and failed scans have visual/live text feedback.
- Never load all products, customers, or transactions into the browser. Exact barcode lookup is a dedicated fast request. Text search is debounced/cancellable. Lists paginate; detail loads sections incrementally; expensive totals state scope/cutoff.
- Optimistic UI is limited to reversible low-risk changes. Financial posting, checkout, counts, transfers, and receipts show deterministic pending state and wait for server truth.

## 18. Required workflow specifications

| Workflow | Entry and steps / transitions | Keyboard and visible information | Validation / permission | Success and recovery |
| --- | --- | --- | --- | --- |
| Standard barcode sale | Sell → Billing; scan → line added → quantity repeat → F9 → tender → confirm | Scanner retains focus; cart, stock warning, totals, register visible | Open day/register, price/stock revalidated server-side | Receipt and New Sale; failure preserves cart/idempotency |
| Split payment | Pay → Split; choose/add tenders until remaining zero | Method shortcuts, Enter advances; allocated/remaining/change always visible | Exact cent allocation; credit/store credit require customer/capability | Receipt lists allocations; failed tender row is editable/retryable |
| Controlled discount | Select line or sale → F6/Shift+F6 → value/reason | Original, discount, resulting price/margin warning if allowed | Limit/capability; manager approval above threshold | Cart shows named adjustment and approver; denial leaves cart unchanged |
| Hold/resume | F8 names/holds; Ctrl+F8 opens queue; select resume | Held time, customer, item count, total, cashier | Prevent serial conflict; only permitted owner/manager can cancel others | Same cart/serials resume; stale stock prompts resolve, not silent substitution |
| Serial sale | Scan product → serial picker/scan → add exact unit → pay | Required count and chosen serial visible on line | Serial in stock/location and unique lock | Receipt contains serial; conflict returns to line with alternate search |
| Customer return | Receipt search/scan → select lines → reason/condition/disposition → refund review → post | Arrows/Space select; original price, prior returns, refundable amount visible | Returnable qty, refund authority, disposition permission | Return document/receipt; posting failure remains draft |
| Customer exchange | Return flow → Add replacement → settle difference | Credit, replacement total, difference visible together | All return and checkout validations | One linked exchange result; replacement failure remains recoverable |
| Create simple product | Catalog → Add Product → name/price/barcode/category → save | Logical Tab order; generated Standard SKU preview | Unique barcode, valid price | Product opens ready to sell; duplicate opens conflicting record |
| Create multi-variant product | Product → Add variants → attributes/grid → prices/barcodes/tracking → save | Grid keyboard navigation and paste where safe | Unique SKU/barcode, complete attribute combinations | Product detail/SKU table; partial validation remains per row |
| Receive stock directly | Purchasing → New Receipt → supplier/invoice → scan lines → tracking capture → review/post | Scan increments; ordered context absent is explicit | Duplicate invoice, serial count, batches/expiry, day, permission | Posted GRN, stock/AP/journal links; failed post preserves draft |
| Create PO | Purchasing → New PO → supplier → search/add lines → terms/date → submit | SKU search and line grid; totals/expected date visible | Supplier, positive qty/cost, approval policy | Draft or Awaiting Approval; failure preserves document |
| Receive against PO | PO → Receive → scan/enter delivered qty → capture differences/tracking → post | Remaining vs received visible per line | Over-receipt permission, serial/batch rules | PO progress and GRN; short receipt keeps remaining open |
| Purchase return | Receipt/supplier → Return to Supplier → lines/reason → post | Carrying value and supplier credit shown if allowed | Available stock/serial ownership; authority | Stock/AP/variance effects linked; failure preserves draft |
| Stock adjustment | Inventory → Adjust → scan SKU/location/batch → delta/reason → confirm | Current/projected qty visible | Reason and specialized permission; no unexplained negative result | Movement/reference shown; failure no movement |
| Stock count | Inventory → Counts → create scope/blind mode → count → review → approve/post | Scanner increments, Enter submit; expected hidden in blind mode | Completeness; separate approve permission | Variance movements and audit; posting conflict requests recount/reload |
| Transfer stock | Inventory → Transfers → source/destination → lines → draft → dispatch → receive | Available/source and in-transit status visible | Different locations, availability, serial/batch identity | Received location updated; short receipt requires discrepancy reason |
| Investigate low stock | Overview/Inventory attention → filtered worklist → open SKU rationale/history | On hand/reserved/available/incoming/reorder point visible | Read access | Resolve by PO, rule change, or documented dismissal |
| Replenish low stock | Worklist → select → review recommendation → supplier grouping → create PO | Batch selection and editable suggested qty | Explainable inputs, supplier/qty validation | Draft POs grouped by supplier; excluded lines remain visible |
| Pay supplier | Supplier/Payables → select open invoices → amount/account/method → confirm | Outstanding, allocation, remaining, cash/bank visible | Open balance, funding/account, permission | Payment and updated balance; failure keeps allocation draft |
| Collect customer credit | Customer/Receivables → open invoices → tender/allocation → confirm | Due, amount, remaining, receipt visible | No over-allocation unless policy; payment permission | Collection receipt without new revenue; failure keeps draft |
| Open register | Header status/Finance → opening cash → count/confirm | Denominations optional; business date/Nepal time visible | No conflicting session, business-day policy | Status changes globally; failure explains blocker |
| Close register | Status → review expected/movements → count → variance reason → close | Expected hidden until policy allows; blockers visible | Count, blocker resolution, variance approval | Closing summary/history; failure returns to exact blocker |
| Investigate cash variance | Overview/close → variance detail → movement/tender/source drill | Expected equation and counted amount visible | Manager/accountant visibility | Review note/resolution recorded; no silent journal correction |
| Search historical transaction | Ctrl+K or Explorer → identifier/filter → grouped results → drawer/page | Exact scans immediate; date/amount/status/source visible | Permission-filtered result and fields | Context retained on close; no-match suggests alternate identifiers |
| Owner reviews today | Overview → read metrics → attention → drill → return | `g o`, arrows through attention; cutoff/definitions visible | Owner financial permissions | Items resolved/assigned; partial data clearly marked |

## 19. Current → future page mapping

| Current route/page family | Decision | Future home |
| --- | --- | --- |
| `/admin/dashboard` | REPLACE | Overview |
| `/admin/billing`, `/cashier/billing` | REPLACE UI, KEEP service boundary | Sell / Billing |
| `/admin/retail-sales-history` and detail/return | IMPROVE + MERGE | Sell / Sales and Returns |
| Held sales inside retail POS | IMPROVE | Sell / Held Sales plus Billing drawer |
| `/admin/retail-returns` | IMPROVE | Sell / Returns & Exchanges |
| `/admin/products` | COMPLETE REPLACEMENT | Catalog / Products and Product detail |
| `/admin/categories`, product labels | MERGE | Catalog local views/actions |
| `/admin/promotions`, `/admin/retail-promotions` | MERGE; retail canonical | Catalog/Pricing or Insights/Promotion performance |
| `/admin/inventory`, dashboard, movements, detail | RETIRE FROM RETAIL NAV / LEGACY-ONLY where legacy-ledger based | Inventory canonical views |
| retail inventory ops/reports/counts/transfers | MERGE + IMPROVE | Inventory worklists and task pages |
| `/admin/wastage`, inventory categories, units, stock import | MOVE | Inventory actions or Control settings/import |
| retail goods receipts | COMPLETE REPLACEMENT of page, KEEP backend | Purchasing lifecycle |
| retail PO/GRN/purchase-return APIs without complete UI | SURFACE | Purchasing Orders/Receipts/Returns |
| `/admin/purchases` redirect and purchase import | REMAIN LEGACY-ONLY / contextual import | Purchasing, only after canonical import design |
| customers list/detail | IMPROVE | Customers |
| `/admin/accounts-receivable` | MERGE | Customers / Receivables; Finance control view |
| suppliers list/detail | IMPROVE | Suppliers |
| `/admin/accounts-payable` | MERGE | Suppliers / Payables; Finance control view |
| business days, cash drawer, cash counts, cash exchange | MERGE + IMPROVE | Finance / Registers & Cash |
| expenses, expense categories | IMPROVE; categories MOVE | Finance / Expenses; Control settings |
| bank, bank book, reconciliation, savings/funding | MERGE | Finance / Banking and Reconciliation |
| COA, GL, cash book, corrections, financial reports | MERGE; retain specialized depth | Finance / Accounting |
| Analytics, Retail Analytics, Summary, Reports, Compare, inventory reports | REPLACE/MERGE | Insights |
| previous-day activity | MOVE | Transaction Explorer / audit filters |
| `/admin/orders`, `/admin/bills`, legacy POS | REMAIN LEGACY-ONLY | Historical 99 Shop reader, absent from retail nav |
| online orders | RETIRE FROM PHASE 1 RETAIL NAV unless current deployment actively uses it | Later scoped channel workspace; no marketplace expansion |
| employees/HRM/payroll | SURFACE (owner direction 2026-09-28) | People: staff, departments, designations, attendance, holidays, payroll. Staff performance stays hidden until it is rebuilt on Retail sale attribution; the shared page still reads 99 Shop orders/bills |
| permissions | REPLACE UX | Control / Team & Roles |
| settings, printer | REPLACE/MERGE | Control / Settings |
| website CMS | RETIRE FROM RETAIL NAV | Separate legacy/website administration |

## 20. Hidden capabilities to surface

- Purchase-order create/approve/cancel and receive-against-PO belong in Purchasing.
- Over-receipt authority and serial/batch/expiry validation belong directly in Receiving.
- Available-to-sell reservations, FEFO suggestions, quarantine, in-transit, dead stock, ageing, and valuation reconciliation belong in Inventory explanations/worklists.
- Serial warranty/lifecycle and batch provenance belong in universal search and SKU detail.
- Replenishment suggestions belong in Inventory with Create Draft PO handoff.
- Customer AR collection/write-off, store-credit ledger, and loyalty ledger belong in distinct customer balance areas.
- Supplier ageing/open invoices/payment allocation belong in Supplier Payables.
- Retail reconciliation belongs in Finance/Reconciliation and Overview only when failing.
- Source-linked journals belong behind “Accounting effect” drill-down, not operational forms.
- Business-day blockers and session history belong in one Registers & Cash flow.

## 21. Implementation dependency map

`Design tokens + AppShell + role-capability navigation` → `Search/command contract + shared tables/drawers` → workspace migrations.

Domain dependencies:

- Overview depends on reconciled definitions, drill-down query contracts, and attention aggregation.
- Billing depends on server product search, shortcut/focus architecture, approval UX, and stable draft recovery.
- Catalog depends on product/SKU detail APIs that avoid all-record browser loading.
- Inventory depends on canonical stock query pagination and unified movement references.
- Replenishment depends on supplier preference/incoming PO visibility already available or explicitly confirmed.
- Purchasing depends on PO list/editor and GRN detail contracts over existing services.
- Customer/Supplier command centers depend on retail-first timelines rather than 99 Shop-only profile queries.
- Finance depends on source-link navigation and role presets; it does not wait for visual dashboard work.
- Global Transaction Explorer depends on normalized read models/search endpoints, not a new transactional database.
- Control role presets require backend support beyond the current cashier-only managed-role model.

## 22. Recommended implementation order

1. Freeze metric/entity/status vocabulary and interaction contracts from this document.
2. Establish tokens, AppShell, workspace navigation, header status, focus/shortcut system, and core components.
3. Build server-backed universal search and shared transaction/entity drawers.
4. Replace Billing and payment/hold/return entry because it is highest frequency.
5. Replace Products and SKU detail; then barcode labels/categories inside Catalog.
6. Consolidate Inventory, starting with Stock Overview, movements, counts, transfers, and attention worklists.
7. Build Replenishment → draft PO handoff, then the Purchasing lifecycle and scanner receiving.
8. Rework Customer/AR and Supplier/AP command centers.
9. Consolidate Registers & Cash, then broader Finance/accounting navigation.
10. Replace Overview only after its drill-downs and definitions point to canonical workspaces.
11. Consolidate Insights and Transaction Explorer.
12. Replace role/settings/audit experience in Control; remove old retail navigation entries only after route parity and acceptance tests.

Complete replacements: Dashboard, Products, retail Purchasing page, primary navigation/shell, Billing interaction surface, fragmented Insights entry points, Settings/Permissions organization. Improvement rather than replacement: customer and supplier lists/details, retail sales detail, counts/transfers task logic, financial statement renderers, and canonical backend services.

## 23. UX risks and guardrails

- **Surface consolidation can hide capability.** Mitigate with workspace search, contextual actions, and stable local views—not more sidebar links.
- **Drawers can become miniature pages.** Enforce the one-level/complexity rule.
- **Role presets can imply security before backend support exists.** UI ships only with server-enforced capabilities.
- **Brands and future price lists can become speculative CRUD.** Keep their IA slots dormant until an approved domain contract and real retailer workflow exist; Phase 1 does not create empty modules merely to fill the navigation model.
- **Dashboard trust can fail if scopes differ.** Every number carries cutoff/definition and uses canonical APIs.
- **Keyboard shortcuts can conflict with browsers/scanners/local layouts.** Test on real retail hardware and make mappings discoverable/remappable.
- **Dense tables can become unreadable on touch.** Provide task-specific tablet/mobile layouts instead of horizontal compression.
- **Legacy 99 Shop data may leak into retail totals.** Legacy reader is clearly labeled and never unioned into canonical retail facts.
- **Visual polish can slow frequent work.** No animation on scanner/keyboard paths; motion remains optional feedback.
- **Recommendations can look authoritative.** Replenishment always exposes inputs and remains editable.
- **Offline/network ambiguity can duplicate financial work.** Show save state, preserve idempotency, and never imply success before server confirmation.

## 24. Deliberately excluded from Phase 1

Multi-branch orchestration; manufacturing/BOM expansion; marketplace integrations; AI forecasting; marketing automation; native mobile apps; advanced ecommerce; franchise administration; international multi-currency; warehouse robotics/wave picking. Existing online/website or HRM features may remain available through legacy/shared administration, but they do not shape the Phase 1 retail shell.

## 25. Acceptance test for the future design

The redesign is successful when a cashier can complete routine checkout without a mouse; an owner can explain today’s sales, profit, money, obligations, and exceptions within seconds; inventory staff can work from scanner-led queues; purchasing can move from explained replenishment need to PO to receipt to payable without changing mental models; accountants can trace every operational amount to its journal; and no role needs to learn the application’s database history to find its work.
