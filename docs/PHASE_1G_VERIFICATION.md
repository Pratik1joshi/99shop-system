# Phase 1G acceptance evidence — 2026-09-26

**PHASE 1 ACCEPTANCE = FAIL**

**IS AADHAR RETAIL A COHERENT PRODUCTION-GRADE RETAIL ERP? NO**

The requested Phase 1 closure is not complete. This pass implements and verifies shared document/audit readers, prospective customer master evidence, cash variance review, and financial response filtering. It does not represent the remaining Settings, Roles, Insights, Finance modernization, or complete acceptance matrix as delivered. Phase 1F remains the baseline for unchanged areas. No Phase 2 work was started.

## Implementation and evidence

| # | Requested area | Result and remaining Phase 1 requirement |
|---|---|---|
| 1 | Missing shared surfaces | Added Transaction Explorer, Business Audit, cash variance review, and browser-local saved filters. Full shared-surface scope remains incomplete. |
| 2 | Customer audit | Customer API creates, master edits, and deletes write prospective audit evidence atomically. Only changed master fields are stored; balance updates are excluded. Owner timeline links to exact audit events. No historical changes were fabricated. Audit access is Owner-only, so broader authorized audit personas remain unfinished. |
| 3 | Source drill-down | Existing registry and journal evidence retained. Explorer/Audit provide source links where supported. Complete operational detail and both-direction acceptance for every source type remain. |
| 4 | Registers & Cash | Existing operational forms retained; no rewrite of cash/business-day posting. Full modern operational UX remains. |
| 5 | Cash variance | Added Unreviewed → Escalated/Accepted lifecycle over closed store sessions, reviewer/note/time, saved closing breakdown, and append-only review audit. Accepted decisions cannot be overwritten. Review itself creates no journal and changes no count. Owner/Manager checks and cash-reveal policy run on the server. Standalone drawer-only closures and complete source-movement drill coverage remain. |
| 6 | Expenses | Added missing PostgreSQL `expense_change_audit` schema used by the existing correction service. Full modern expense workspace remains. |
| 7 | Banking | Modern account detail/reconciliation UX and factual bank exception attention remain. |
| 8 | Transaction Explorer | One server-side UNION read with authorization before source inclusion, bounded pagination, exact document ranking, document/reference/customer/phone/supplier search, date/day/status/actor/amount/payment/product/SKU/barcode filters, and recorded serial/batch filters. Drawer inspection, source links, URL filters and back navigation exist. Full line-level inspection, all historical identity paths, purchasing amounts, all canonical financial source destinations, and all-role browser acceptance remain. |
| 9 | Audit | Reads canonical customer, register, expense, receipt reprint, returns/exchanges, store-credit/loyalty adjustments, collections/write-offs, inventory, PO approval/creation, receipt, transfer, discount, permission/settings and supported journal evidence. Before/after render as labeled fields. Complete event capture/coverage, authorization presets and approval formatting remain. |
| 10 | Settings | Approved searchable Settings Center and ACTIVE/LEGACY/UNUSED/HARDCODED policy inventory remain. Existing configuration screens were not relabeled as complete. |
| 11 | Roles | Full six-persona, business-facing Team & Role Center remains. |
| 12 | Role matrix | New Explorer/Audit API tests exercise all six roles. Cash review service rejects unauthorized roles. Finance/analytics tests cover restricted fields. Complete active-route/method/field matrix remains. |
| 13 | Insights | Curated unified Insights workspace remains. |
| 14 | Reports | Unified catalog and common scope/filter/export/cutoff conventions remain. |
| 15 | Sales analytics | Existing calculations retained; server now removes unauthorized COGS/profit/financial fields and profit ranking lists. Complete approved analysis UX remains. |
| 16 | Inventory analytics | Existing canonical readers retained. Full defined stock-health/ageing/movement/expiry/shrinkage analysis remains. |
| 17 | Customer analytics | Existing analytics retained with customer-access checks. Complete factual segments and approved UX remain. |
| 18 | Purchasing analytics | Purchasing analysis now requires purchasing-cost permission. Complete purchasing intelligence remains. |
| 19 | Profitability | Historical COGS services retained. Profit restrictions apply before the analytics payload reaches screen/CSV. Full profitability workspace and same-scope acceptance remain. |
| 20 | Metric registry | Complete canonical formula/source/tax/return/scope/drill definition registry remains. |
| 21 | Date/business day | New SQL text timestamp projections explicitly retain Nepal offset. Midnight consistency test added. Explorer labels recorded date separately from assigned business day. Full cross-module scope audit remains. |
| 22 | Overview | Added cash-variance attention and capability filtering for financial metrics; restricted metrics do not produce invalid links. Full destinations and same-period comparison remain. |
| 23 | Attention | Unreviewed closed-session cash differences use a documented Rs 0.01 threshold and medium severity. Complete bank/other attention classes and all destination acceptance remain. |
| 24 | Search | Existing universal search retained. Explorer adds cross-document querying. Full universal-search coverage and role leakage matrix remain. |
| 25 | Saved views | Explorer/Audit save per-user filters locally in the browser. No results, balances or credentials are snapshotted. Sort/column preferences and other requested workspaces remain. |
| 26 | Export security | Analytics CSV consumes the server-filtered payload; restricted profit rankings are also removed. Complete active export audit remains. |
| 27 | Legacy cleanup | Compatibility/restaurant routes and historical tables preserved. Parity-based active Retail navigation cleanup remains. |
| 28 | Vocabulary | New surfaces use Retail vocabulary. Full active-route terminology audit remains. |
| 29 | Visual consistency | New views use existing shell, tables, drawers, buttons and input styles. Explorer screenshots retained for desktop, tablet and mobile. Full active Retail visual audit remains. |
| 30 | Accessibility | Fixed shared table Enter handling and drawer focus restoration. New Explorer/Audit journey checks keyboard behavior and serious/critical WCAG A/AA findings. Complete critical-journey accessibility gate remains. |
| 31 | Performance | Extended isolated scale fixture with 100k customer audit events and Explorer/Audit measurements. Full specified performance surfaces and controlled stock-search regression determination remain. |
| 32 | Security | Fixed Explorer accounting-source exposure, held-sale privacy, Finance summary bypasses, and analytics sensitive fields/rankings. Full route/IDOR/export/settings/permission/session audit remains. |
| 33 | Persona E2E | Full existing suite invoked with real persona tests. The original run has failures and serial-suite skips. A focused rerun repairs fixture/selector issues but does not establish the complete requested matrix. See final run evidence below. |
| 34 | Tablet/mobile | New evidence journey passes at desktop, tablet and mobile. Full requested workflow/device matrix remains. |
| 35 | Cross-module consistency | Existing economic integration passes. One-period Overview/Insights/Reports/P&L/AR/AP/Inventory/Registers proof remains. |
| 36 | Drill verification | Customer correction → source → journal rerun passes at three sizes. Its selector now targets the exact correction among the newly added master audit events. Other mandatory chains remain. |
| 37 | Reconciliation | Final browser-fixture reconciliation FAILS: inventory valuation Rs 39,752.60 versus asset ledger Rs 39,938.02 (Rs 185.42 difference). Repeated sale/return cycles of the same serial suppress subsequent inbound movements while returns still post journals. Seeded bank reconciliation and complete same-period cross-module proof remain. |
| 38 | Test counts | Final counts and failures are recorded below and in `PHASE_1G_EVIDENCE.json`. Selected passing tests do not override the full-suite result. |
| 39 | Migrations | Fresh and 098→101 upgrade/rerun pass. Existing customer data is compared before/after upgrade. There are 99 numbered migration files through version 101. |
| 40 | Build/lint | Final build/lint outcomes recorded below. Existing lint warnings remain non-blocking only when there are no errors. |
| 41 | Workspace acceptance | All ten workspaces remain BLOCKED for the concrete required gaps below. |
| 42 | Non-blocking issues | Existing lint warnings and toolchain deprecation notices are not the basis for FAIL. |
| 43 | Phase 1 verdict | FAIL. |
| 44 | Production-grade ERP verdict | NO. |

## Workspace acceptance

| Workspace | Status | Phase 1 blocker |
|---|---|---|
| Overview | BLOCKED | Required final destinations, complete attention classes, period comparisons and drill acceptance are unfinished. |
| Sell | BLOCKED | Focused UI journeys pass after fixture repair, but repeated serial return cycles fail economic reconciliation. Complete exchange/receipt/accessibility acceptance remains. |
| Catalog | BLOCKED | Full role/export/accessibility and device acceptance is incomplete. |
| Inventory | BLOCKED | Repeated serial returns suppress inventory restoration; Rs 185.42 valuation/GL discrepancy remains. Required intelligence and complete permission/device/drill acceptance are unfinished. |
| Purchasing | BLOCKED | Full purchasing analysis, source detail, role/export and device acceptance are unfinished. |
| Customers | BLOCKED | Master evidence improved; complete customer Insights and persona/device acceptance remain. |
| Suppliers | BLOCKED | Complete supplier/AP source, financial visibility, analysis and device acceptance remain. |
| Finance | BLOCKED | Modern Registers/Expenses/Banking, bank attention and complete source/reconciliation acceptance remain. |
| Insights | BLOCKED | Approved curated workspace/report catalog and metric registry remain. |
| Control | BLOCKED | Settings inventory/search, complete Role Center and full audit/security coverage remain. |

## Reproduction and limits

- Isolated PostgreSQL 17 on `127.0.0.1:55441`, dedicated disposable role/database fixtures. No production database was used.
- Full integration: `TEST_DATABASE_URL` set to the local control database, then `npm run test:integration`.
- Migration proof: `node scripts/verify-phase1g-migrations.mjs`.
- Scale measurements: `node --import ./tests/unit/loader-register.mjs scripts/benchmark-phase1g.mjs`.
- Browser app: port 3017, `.next-phase1g-dev`, isolated Phase 1F browser database freshly migrated through 101. Credentials are read from the ignored local fixture file, not included in this report.
- Full browser gate: `npx playwright test`; focused verification also writes separate output directories to preserve full-run failure evidence.
- Browser fixture failures and restaurant/public tests run against Retail data are identified separately from demonstrated product defects. They do not establish that restaurant deployments were broken by these changes.
- Performance runs performed during other validation are explicitly labeled as concurrent-load observations, not an SLA or controlled before/after comparison.
- Review creation never balances cash. The pre-existing closing service's own journal behavior was not rewritten.
- Saved views are local to this browser/account, not server-synchronized preferences.
- Audit is Owner-only in this implementation. Absence of recorded historical snapshots is displayed; historical events are not synthesized.

## Final gate evidence

| Gate | Actual result |
|---|---|
| Unit | 335 passed, 0 failed |
| PostgreSQL integration | 47 passed across six isolated suites, 0 failed |
| Full browser run (114 cases) | 68 passed, 37 failed, 3 flaky, 6 did not run |
| Focused Retail rerun (57 cases) | 55 passed, 2 flaky, 0 final failures; desktop/tablet/mobile |
| Explorer/Audit keyboard, filter, saved-view, accessibility journey | 3 passed |
| Customer correction ? source ? journal journey | 3 passed |
| Cash review browser script | PASS: counted cash unchanged, zero review journals, zero serious/critical WCAG A/AA findings, same-day reopen |
| Fresh + upgrade migrations | PASS: 99 files through 101; upgrade from 098; customer preserved; rerun safe |
| Final production build | PASS: 267 static pages; isolated workspace temporary directory |
| Final lint | 0 errors, 17 existing warnings |
| Canonical reconciliation | FAIL: 8/9 accounting controls pass; inventory valuation differs by Rs 185.42. Quantity projection passes. |
| Trial balance | Balanced: Rs 48,113.88 debit and credit |
| Bank statement reconciliation / full common-period proof | NOT VERIFIED |

The original browser gate mixed Retail fixtures with restaurant/public assumptions (24 failing public cases). Other failures included missing serial prerequisites, login throttling, and ambiguous source/payment selectors. Missing serials were subsequently received through a canonical GRN. The payment test now selects its unique reference, and the timeline test targets its exact correction. The focused rerun used the production build on port 3018 with test-process-only RATE_LIMIT_LOGIN=1000; production defaults were unchanged. Its two flaky cases timed out at sign-in and passed on retry. No combined or inflated ?all tests passed? count is reported.

The cash status filter received an explicit accessible label after its initial browser check could not locate it exactly. The final cash journey passed against the development server, and the final production build includes that label. One build attempt failed while scanning the Windows system temporary folder; the rerun passed with TEMP/TMP scoped to the workspace.

The serial trace records POSTED return lines 7, 11 and 15 for sale lines 55, 73 and 91. Only the first return produced a CUSTOMER_RETURN movement. In lib/retail-returns.js the call omits a return-event reference; lib/retail-serials.js falls back to the serial row ID. The inventory movement replay guard therefore treats later cycles as the first return. This is an unresolved integrity defect, not a fixture exemption. No balancing journal or historical movement repair was inserted to hide it. Weighted-average rounding also needs exact residual investigation.

Evidence and detailed timings are retained in [PHASE_1G_EVIDENCE.json](PHASE_1G_EVIDENCE.json). Raw local logs/screenshots are under .commerce-tmp/phase1g*, with the original full browser failures in test-results/. These ignored artifacts are not shipped application data.


## Scale measurements

25,000 SKUs, 1,000,000 movements, 25,000 customers, 100,000 sales, 100,000 loyalty events and 100,000 customer audit events; seven samples per query. Final run followed build/browser completion. Synthetic database was dropped afterward.

| Query | Median (ms) |
|---|---:|
| movement_first_page | 81.14 |
| movement_sku_search | 445.92 |
| stock_search | 639.43 |
| exact_barcode | 56.87 |
| customer_timeline_100k_events | 73.18 |
| transaction_explorer_first_page | 100.16 |
| transaction_explorer_exact_sale | 58.87 |
| audit_first_page_100k | 68.62 |
| audit_search_100k | 50.18 |

These are backend query measurements, not end-to-end UI timings or a controlled before/after regression proof. Earlier concurrent-load samples are preserved separately. Stock search remains a measured performance concern; full specified surface coverage and regression determination remain incomplete.
