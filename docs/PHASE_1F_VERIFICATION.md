# Phase 1F verification — 2026-09-26

**PHASE 1 ACCEPTANCE = FAIL**

**IS AADHAR RETAIL A COHERENT PRODUCTION-GRADE RETAIL ERP? NO**

This pass restored isolated PostgreSQL verification and implemented a bounded set of changes. It did **not** finish the full 55-part Phase 1F request. The workspace acceptance table below uses BLOCKED where required implementation or acceptance evidence remains absent; it does not mean every existing operation in that workspace fails.

## Verification environment and reproduction

- PostgreSQL 17, newly initialized cluster at `.commerce-tmp/phase1f/pg`, bound only to `127.0.0.1:55441`, dedicated role `phase1f_test`. No production database was used.
- `TEST_DATABASE_URL=postgresql://phase1f_test@127.0.0.1:55441/postgres` was set in each verification process. This is the control database; the integration runner creates and drops its own test databases.
- `scripts/verify-phase1f-environment.mjs` checks fresh migration, upgrade from 097 to current, seeds, and migration rerun. There are 96 numbered migration files through version 098, not 98 files. The upgrade test applies the actual files through 097 before applying the normal migration runner.
- The browser database is separate, with its local connection settings in `.commerce-tmp/phase1f/browser.env`. `scripts/seed-phase1f-browser.mjs` rejects other database names and remote hosts. It opens a business day and receives 1,000 units through the real GRN posting service. Rerunning the seed does not duplicate its GRN.
- The first browser attempt failed three tests because the older catalog-only seed lacked stock, an open day, and the named customer fixture. These prerequisites were added; the same seven-test selection then passed. These failures were not skipped.
- Browser server: port 3016, `.next-phase1f-dev`. Production output: `.next-phase1f`.
- Evidence logs and screenshots are in `.commerce-tmp/phase1f/`; this directory is ignored by Git and ESLint. The compact results are retained in `PHASE_1F_EVIDENCE.json`.

Commands, with the isolated environment above configured:

```powershell
node scripts/verify-phase1f-environment.mjs
npm run test:integration
npm run test:unit
npm run lint
# NEXT_DIST_DIR=.next-phase1f, workspace-local TEMP/TMP, NODE_OPTIONS=--max-old-space-size=8192
npm run build
# E2E_PORT=3016, E2E_ADMIN_PIN and E2E_CASHIER_PASSWORD from browser.env
npx playwright test tests/e2e/phase1d-personas.spec.js tests/e2e/phase1d-customers.spec.js tests/e2e/phase1d-registers.spec.js --project=desktop
npx playwright test tests/e2e/phase1f-evidence.spec.js
node --import ./tests/unit/loader-register.mjs scripts/benchmark-phase1f.mjs
```

The local cluster uses trust authentication only on loopback for disposable data. These are test instructions, not production deployment configuration.

## Requested final report

| # | Area | Actual result and remaining acceptance blocker |
|---|---|---|
| 1 | Verification environment | Isolated PostgreSQL restored; fresh, upgrade, seed and browser databases exercised. |
| 2 | PostgreSQL integration | 42 tests passed across production contracts, foundation, commerce search, Retail economic behavior, timeline and journal evidence. The 25-test economic suite is now included in the normal PostgreSQL runner. |
| 3 | Phase 1D gaps closed | Chronological timeline pagination and journal/source evidence improved. Registers, variance review, Expenses and Banking redesigns remain. |
| 4 | Customer timeline | One server-side UNION ALL over sale, credit sale, return, exchange, collection, write-off, store-credit and loyalty transactions, plus authorized credit overrides. Pagination happens after merging; stable timestamp/type/id ordering. Exact source-record filtering supports correction links. No monetary ledger was copied. Customer master-change audit capture/read coverage remains missing. |
| 5 | Accounting source drill-down | Central registry used by journal list and GL detail. New `/admin/retail-journals/[id]` shows source facts, posted lines and reversals. Search opens exact journal/expense records. Owner and Accountant are allowed; Cashier, Manager, Inventory and Purchasing are denied by the new API. Full document-line detail and drill acceptance for every source type remain. |
| 6 | Registers & Cash | Existing Owner and Cashier workspace browser smoke passed. Legacy underlying operational forms remain. |
| 7 | Cash variance review | Required review lifecycle, reviewer and resolution evidence remain unimplemented. |
| 8 | Expenses | Exact search links now use the supported expense parameter. Full modern workspace migration remains. |
| 9 | Banking | Modern account list/detail and coherent reconciliation experience remain. |
| 10 | Bank exceptions | Required factual exception worklist and direct attention filters remain. |
| 11 | Transaction Explorer | Full authorized server-backed explorer and filter set remain unimplemented. |
| 12 | Audit Center | Unified business audit read model and business-aware center remain unimplemented. |
| 13 | Settings Center | Searchable domains and active/legacy/unused/backend-enforcement audit remain. |
| 14 | Role & Permission Center | Business-friendly preset/capability center remains incomplete. |
| 15 | Role matrix | New journal evidence API checks all six roles. Existing specialist API smoke passes. Complete active API/route/export/field matrix remains. |
| 16 | Insights | Curated unified workspace remains. |
| 17 | Reports | Unified catalog, scope/filter/export/loading/error conventions remain. |
| 18 | Sales Insights | Existing canonical analytics exercised in economic integration; approved complete experience and browser acceptance remain. |
| 19 | Inventory Intelligence | Movement-query optimization implemented and measured. Defined intelligence views and complete acceptance remain. |
| 20 | Customer Insights | Approved factual measures and documented segments remain. |
| 21 | Purchasing Insights | Approved measures and explainable analysis remain. |
| 22 | Profitability | Existing historical COGS economic tests pass. Required analysis views and cross-module cutoff comparisons remain. |
| 23 | Overview finalization | Existing Overview retained. Missing Explorer/Insights/Attention destinations prevent finalization. |
| 24 | Attention completion | Cash variance and bank exceptions remain; complete severity rules and destination acceptance remain. |
| 25 | Universal Search | Exact journal and expense destinations fixed. Complete entity coverage, prioritization and all-role leakage acceptance remain. |
| 26 | Metric registry | Complete shared formula/source/tax/return/scope/drill registry remains. |
| 27 | Date/business-day consistency | Existing Nepal-time utilities used by new timeline/journal views. Full application filter audit remains. |
| 28 | Export security | Full role/field/filter/date/export audit remains unexecuted. |
| 29 | Visual consistency | Customer and new journal routes now use the Retail shell; missing system sans-serif fallback fixed. New journal mobile screenshot inspected. Full active-page audit remains. |
| 30 | Accessibility | Keyboard source-link activation and responsive journal semantics tested. Automated accessibility coverage and all critical keyboard workflows remain. |
| 31 | Performance | Five operations measured seven times at scale; see below. Remaining specified surfaces and large journals/GL/audit pools remain unmeasured. |
| 32 | Security audit | New API auth, six-role journal access, privacy and existing specialist denials exercised. Full active-route IDOR/field/search/export/settings/role/session audit remains. |
| 33 | Legacy cleanup | Existing routes preserved. Full parity-based navigation cleanup and route classification remain. |
| 34 | Vocabulary cleanup | Full active Retail vocabulary audit remains. |
| 35 | Persona browser results | Owner, Cashier, Manager, Inventory, Purchasing and Accountant were exercised by the selected seven desktop tests. This is not the complete required six-persona acceptance matrix. |
| 36 | Tablet results | New customer-correction → source → journal journey passed. Full requested tablet workflow set remains. |
| 37 | Mobile results | Same journey passed with no document horizontal overflow. Full mobile lookup/overview/attention/approval set remains. |
| 38 | Reconciliation | Browser fixture: inventory projection and all nine canonical checks reconcile; trial balance is recorded in evidence JSON. Seeded bank reconciliation acceptance remains. |
| 39 | Cross-module consistency | Canonical sale/collection/COGS/AR/AP/store-credit tests pass. Complete same-period Overview/Insights/Reports/P&L/Registers comparison remains. |
| 40 | Drill-down acceptance | Customer correction → source → journal passed at three sizes. Full seven specified cross-module drill paths remain. |
| 41 | Test counts | Unit: 332 passed. PostgreSQL: 42 passed. Selected desktop browser suite: 7 passed. New evidence journey: 3 passed (desktop/tablet/mobile). These counts are not the full E2E suite. |
| 42 | Build/lint/migrations | Production build passed; lint has 0 errors and 17 existing warnings. Fresh, 097→098 upgrade and migration rerun passed. |
| 43 | Remaining known issues | The blockers in this table remain release blockers. Phase 1F implementation is unfinished; no production certification is implied. |
| 44 | Workspace completion | See acceptance table below. |
| 45 | Phase 1 acceptance | FAIL. |
| 46 | Production-grade Retail ERP | NO. |

## Performance evidence

Synthetic, disposable PostgreSQL fixture: 25,000 SKUs, 1,000,000 inventory movements, 25,000 customers, 100,000 sale headers and 100,000 loyalty events. Synthetic sales are query-load fixtures, not economic reconciliation evidence. This database is dropped after measurement and never mixed with browser accounting.

Seven samples per operation; median is the observed middle sample. Other validation processes ran on the same machine, so these observations are not an SLA or a controlled hardware comparison.

| Operation | Before median (ms) | After median (ms) |
|---|---:|---:|
| Movement first page | 315.88 | 84.51 |
| Movement SKU search | 1975.72 | 520.21 |
| Stock search | 679.47 | 984.79 |
| Exact barcode | 63.97 | 78.96 |
| Customer timeline, 100k loyalty events | 86.11 | 96.25 |

Only movement query implementation changed between these measurements. It now resolves matching identities using small-table subqueries, counts directly from movements, and paginates movements before joining display metadata. Existing variant, batch and movement indexes are reused. No additional write-cost indexes were introduced. PostgreSQL equivalence tests cover old joined-query results, ordering, pagination, literal wildcard handling, injection-shaped search and cost-field visibility. The observed 520 ms movement search is below the previously reported ~914 ms, but those runs did not use identical conditions.

## Ownership, source behavior and intentional limits

- Customer timeline owns no balances; `retail_sales`, `retail_returns`, `retail_exchanges`, `retail_credit_collections`, `retail_credit_writeoffs`, `store_credit_transactions`, `loyalty_transactions` and `retail_credit_overrides` remain canonical.
- Timeline types are Sale, Credit Sale, Return, Exchange, Collection, Write-off, Store Credit Issue/Redemption/Correction, Loyalty Earn/Redemption/Reversal/Adjustment, and Credit Override. Other recorded loyalty/store-credit types retain their recorded type. Historical customer master events are not invented.
- Accounting identity/display mapping lives in `lib/accounting-source-registry.js`. Exact supported operational destinations are used when available; otherwise a journal evidence page is used. An unknown source does not fabricate an operational URL.
- Cash movement, bank movement and supplier payment journals can themselves be the canonical financial record with no separate `source_id`. Stock transfers do not need artificial accounting merely to create a link.
- Journal evidence truncates after 500 lines with an explicit notice and no misleading totals; reversals are bounded. This is not a substitute for completing large-GL pagination/export acceptance.
- Source inspection uses Nepal date/time formatting. Accounting date, recorded timestamp and business-day identity remain distinct. It does not recalculate historical profit.
- Shared tables keep Arrow Up/Down navigation and Enter inspection. New source links support keyboard Enter. No new shortcut vocabulary was introduced.
- Existing compatibility and 99 Shop routes were not deleted or represented as modernized. Existing ownership documentation remains in `RETAIL_CANONICAL_OWNERSHIP.md`.

## Workspace-by-workspace acceptance

| Workspace | Status | Evidence and blocker necessary for acceptance |
|---|---|---|
| Overview | BLOCKED | Existing canonical metrics tested; final destinations, role emphasis, cross-module drills and responsive acceptance remain. |
| Sell | BLOCKED | PostgreSQL sale/return/exchange economics pass; complete cashier billing/hold/split/receipt/return/exchange/browser/accessibility matrix remains. |
| Catalog | BLOCKED | Search at 25k SKUs and existing catalog integration pass; complete visual, role/export and browser acceptance remain. |
| Inventory | BLOCKED | Movement performance and economic identity/count/transfer tests pass; full intelligence, a11y and device journeys remain. |
| Purchasing | BLOCKED | PostgreSQL PO/GRN/return economics and specialist smoke pass; full workspace, reports, permission and device acceptance remain. |
| Customers | BLOCKED | Timeline, collection, privacy and correction journeys pass; master-change audit and complete Insights/role/device acceptance remain. |
| Suppliers | BLOCKED | AP economics and specialist access tested; full source/drill/financial visibility/device acceptance remain. |
| Finance | BLOCKED | Journal source evidence and reconciliation pass; modern Registers/Expenses/Banking, variance lifecycle, bank exceptions and complete drills remain. |
| Insights | BLOCKED | Curated Insights/report catalog and standardized analysis experiences remain. |
| Control | BLOCKED | Audit, searchable audited Settings, complete Role Center and all-active-route permission/export matrix remain. |

No Phase 2 work was started.
