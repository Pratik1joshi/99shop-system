# Next-session brief: expand Shop 99 as a retail POS/ERP

## Copy this into the next Codex session

> I have added my 99 Shop POS project to this workspace as a **reference**. Work on the Shop 99 retail app in this repository. Read `docs/RETAIL_EXPANSION_NEXT_SESSION.md` fully, locate the 99 Shop reference, inspect both applications, and carry out the retail expansion in coherent, verified phases. The 99 Shop project's **sidebar visual style** is the design reference for Shop 99's sidebar. Keep Shop 99's navigation and business workflows retail-specific. Start by reporting a concrete comparison and implementation order, then implement the highest-priority slice that can be completed safely in this session. Do not ask me to re-explain the feature list below.

## Intent

The user created Shop 99 from an earlier 99 Shop POS. They want the breadth and polish of the 99 Shop product where it makes sense for a retail shop, particularly reports, finance, accounting, HRM, customers, suppliers, inventory, and administration. They **do not** want the 99 Shop application copied wholesale. They also explicitly want the **sidebar to look like the 99 Shop sidebar** once that reference is available. Its visual treatment is the reference; its 99 Shop labels and workflows are not.

This document is a handoff, not a claim that the 99 Shop reference has already been examined. Locate and inspect it in the next session. If its location is ambiguous, search the workspace first and ask only for the missing path if necessary. A future session can read files, but should not assume it remembers this conversation or knows where a newly added project is.

## Repo facts verified on 2026-09-28

- This is a Next.js 16 retail POS/ERP with PostgreSQL production storage and SQLite local fallback. `package.json` has build, lint, unit, integration, and Playwright scripts.
- The current shell is `components/erp/app-shell.jsx`; `components/admin/admin-layout.jsx` delegates to it. Admin navigation currently has Overview, Sell, Catalog, Inventory, Purchasing, Customers, Suppliers, Finance, Insights, and Control. Cashier navigation is more limited. Inspect the current code again before editing because the worktree is active.
- Core retail services and views already exist: billing and sales, returns, product variants/SKUs, inventory movements/balances/counts/transfers, purchase orders/receipts/returns, suppliers, customer receivables, loyalty/store credit, cash registers/business days, general ledger, bank reconciliation, financial statements, and retail analytics. Presence of a route does **not** prove the workflow is complete or correct.
- The canonical data and metric rules are in `docs/RETAIL_CANONICAL_OWNERSHIP.md`. The product/UX direction is in `docs/AADHAR_RETAIL_ERP_PRODUCT_UX_MASTER_SPEC.md`. The older `docs/PRD.md`, `docs/README.md`, `SYSTEM_OVERVIEW.md`, and `docs/FUTURE_ROADMAP.md` still contain 99 Shop-era or stale statements; treat them as historical context and verify against current code.
- `docs/RETAIL_ERP_AUDIT_2026-09-21.md` identified the original two-engine problem and incomplete operator flows. Some findings may have been resolved since then; verify each one instead of repeating it as current fact.
- At handoff, `git status --short` showed a **large number of existing modified and untracked files**. These are user/other-session work. Inspect status and diffs before editing. Preserve them, do not reset/clean/reformat broadly, and do not overwrite changes you do not understand.

## Feature translation, not feature copying

| 99 Shop capability | Retail decision and expected adaptation |
| --- | --- |
| Dashboard, POS analytics, daily summary | Keep; show retail sales, gross profit, payments, receivables/payables, stock value, and actionable exceptions from canonical retail data. Define date and business-day cutoffs. |
| Sales, finance, expense, purchase, supplier, inventory, employee, customer, previous-day reports | Keep selectively; make a coherent report library with filters, drill-down, exports, clear definitions, and permissions. Audit old reports for 99 Shop `orders`/`bills` reads before exposing them as retail reports. |
| Products/categories, promotions/combos | Translate menu concepts to retail products, SKU variants, brands/attributes, prices, labels, discounts, and optional bundles/kits. Bundles need explicit stock, pricing, tax, and return behavior. |
| Purchases, suppliers, unit conversion, stock movements/counts, wastage | Keep; use retail PO -> receipt -> payable/payment/return. Translate wastage into reason-coded damage, expiry, shrinkage, tester/sample, or internal use through the canonical movement service. |
| Expenses, funding, savings/deposits, cash exchange | Keep where a real shop needs them; distinguish owner capital, transfers, revenue, and expense in accounting. Check existing implementations before adding pages. |
| Opening/closing, scheduled cash counts, cash drawer, bank, reconciliation, chart of accounts, ledger, cash/bank books, financial reports, corrections | Keep the shared accounting core; make retail transactions post balanced, source-linked journals and reconcile by business day/register. Avoid duplicate financial ledgers or manually maintained totals. |
| Staff, departments, designations, attendance, payroll, holidays, performance, permissions | Keep and adapt. Staff performance should use retail attribution and appropriate permissions; do not use waiter/KOT metrics. Check what HRM pages/data already exist and build a coherent People area only for useful shop workflows. |
| Customer/supplier ledgers and reminders | Keep; tie balances and follow-ups to receivables/payables and customer/supplier profiles. Distinguish a reminder workflow from actually sending messages. |
| Online orders, website CMS, reviews, delivery | Evaluate against this shop's real selling/fulfillment needs. The repository already has retail online-order/storefront areas; extend those instead of reviving 99 Shop order flows. |
| Tables, KOT, waiter calls, host desk, reservations, recipes/kitchen analytics | Exclude from retail navigation and implementation unless the user later states a specific retail use case. Do not import the 99 Shop data model or terminology to create apparent feature parity. |

## Sidebar requirement

1. Inspect the 99 Shop sidebar **in code and in a rendered view** if feasible. Record its width, spacing, typography, colors, icons, section headers, nesting, active/hover/focus states, badges, collapse behavior, footer/profile area, and desktop/mobile behavior. Screenshots supplied by the user can supplement this.
2. Recreate the recognizable visual style and interaction quality in Shop 99 using its existing app shell and design tokens where practical. Preserve accessibility, keyboard navigation, responsive behavior, role/capability filtering, and active-route indication.
3. Keep retail information architecture. Map visual groups to retail tasks such as Overview, Sell, Catalog, Inventory, Purchasing, Customers, Suppliers, Finance, Insights, People (if implemented), and Control. Do not import 99 Shop groups merely to match the reference. Do not expose links to incomplete or legacy pages as if they are working retail features.
4. Review both admin and cashier/specialist views. A sidebar change is complete only when permitted users see the right destinations and no restricted action becomes reachable through a new link. Verify mobile opening/closing and long navigation lists.
5. If the 99 Shop reference conflicts with Shop 99 usability, preserve the stylistic cues while adapting the behavior for retail. Explain the adaptation.

## Work sequence for the next session and later phases

### 1. Discover and compare

- Read repo instructions, current status, the canonical ownership doc, the UX spec, current shell/navigation, relevant routes/services, and the newly added 99 Shop project.
- Identify the 99 Shop project's reusable **visual patterns and workflow ideas**. Do not assume its code or database schema can be pasted into Shop 99.
- Build an evidence-based matrix for each requested area: existing and working; present but legacy/incomplete; missing; 99 Shop-only. Cite file paths and distinguish a route from a verified working workflow.
- Identify the actual retail business model (single or multiple stores, credit sales, online fulfillment, tax/receipt needs, staff roles) from code/config and user input where needed. Ask only questions that materially change the design.
- Choose a coherent first implementation slice. Prefer correcting misleading reports or broken end-to-end retail flows before adding decorative destinations.

### 2. Secure the retail foundation

- Trace sale, return, receipt, purchase return, stock adjustment/count, expense, and cash operations to their retail source records, inventory movements, and journals.
- Ensure dashboard, reports, customer/supplier balances, inventory value, GL, and business-day close agree for the same cutoff. Record metric definitions and reconcile rather than patching display totals.
- Treat `retail_sales`, retail movement ledger, retail procurement/return records, and `journal_entries`/`journal_lines` according to `docs/RETAIL_CANONICAL_OWNERSHIP.md`. Historical 99 Shop tables remain historical. Never silently union unlike documents or double count.

### 3. Expand useful retail workspaces

- **Insights:** sales and margin, payments, returns/discounts, purchases/suppliers, stock/valuation/loss, customers/credit, expenses/cash, staff activity. Provide filters, drill-down, export where useful, explicit status for unavailable metrics, and permission-aware profit/cost visibility.
- **Finance/accounting:** one flow for registers/cash counts, expenses, funding/transfers, bank activity/reconciliation, AP/AR, GL, and statements. Prefer improving current modules over duplicate pages.
- **People:** staff directory, attendance, payroll, holidays, departments/designations, role permissions, and retail-appropriate performance only where supported by real data. Payroll and attendance should not be inferred from sales alone.
- **Operations:** complete purchasing and stock exceptions; add customer/supplier reminders only with a real due-date and communication model.
- **Catalog/commerce:** consider retail bundles and storefront improvements after the transaction and stock rules are clear.

### 4. Apply 99 Shop sidebar styling

- Implement the reviewed visual style in the retail shell. Keep the retail navigation concise, permission-aware, and free of 99 Shop concepts. Test admin, cashier, specialist, desktop, and mobile states.

Implement in small vertical slices with real end-to-end behavior. For each slice, connect UI -> API/service -> data -> accounting/stock effect where applicable -> report/reconciliation -> permission -> tests. Keep migrations additive and follow the repo's migration process. Update current docs in the same change. Report what was completed and what remains; do not claim the entire feature list is complete after one slice.

## Non-negotiable boundaries

- Do not port 99 Shop tables, reservations, KOT, waiter/kitchen logic, or 99 Shop-only reports into the retail operator experience.
- Do not create a second sales, purchase, inventory, or accounting engine. Do not write retail sales to legacy `orders`/`bills` or maintain stock in two places.
- Do not equate route existence with working feature parity. Verify user flows and financial effects.
- Do not copy the 99 Shop sidebar's labels or navigation tree; copy its style after inspecting it.
- Do not make accounting or stock corrections by directly editing balances. Use source-linked transactions/reversals and preserve audit history.
- Do not expose financial costs, margins, payroll, or privileged actions to roles lacking permission.
- Do not delete historical data or legacy compatibility code without a verified migration/reconciliation plan.
- Do not overwrite the existing dirty worktree, run destructive cleanup, or deploy/publish without the user's instruction.
- Do not turn the work into a broad visual redesign of every page before core retail numbers and workflows are trustworthy.

## Verification and reporting

- Before editing, capture current status and identify affected files so existing work is preserved.
- Use focused tests for each changed economic rule or workflow: sale/return, receipt/stock, cash close, GL posting, report definitions, and role gating as relevant. Run lint/build and appropriate integration/browser checks for changed surfaces; use a suitable workspace-local temp/build directory if the Windows environment requires it.
- Compare a representative transaction from source document through stock movement, journal, and report. Check idempotency, reversals, cutoff/time zone, and authorization where relevant.
- Visually inspect the sidebar at desktop and mobile sizes and check keyboard/focus behavior.
- End each session with a concise evidence-based summary: implemented slice, files changed, tests/results, remaining gaps, and next slice. Clearly label any unverified assumption.
