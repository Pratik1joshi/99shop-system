# Phase 2A verification

PHASE 2A CATALOG / PRICING INTEGRITY GATE = PASS (2026-09-26).

The monetary prerequisite is PASS, recorded in `PHASE_20B_MONETARY_CLOSURE.md`. The policy and implementation boundaries are described in `PHASE_2A_PRICING_POLICY.md`.

## Evidence

- Unit suite: 338 passed, zero failed (`.commerce-tmp/phase2a/unit-gate.log`).
- PostgreSQL: 77 passed across 11 suites, zero failed (`integration-gate.log`). Includes original-value returns, wholesale/group/channel/tier/schedule pricing, promotion and margin controls, atomic import, 100 proposed / 82 selected variants, two duplicate barcode errors, corrected 84-SKU scan coverage, stale previews, retries and concurrent barcode claims.
- Fresh migration, upgrade from 103, and repeat migration: passed (`migrations.json`). Migration 104 is additive.
- Full lint: zero errors, 17 existing warnings (`lint-gate.log`).
- Production build: passed, 275 pages (`build-final.log`).
- Initial broad browser regression: 43 passed / 2 failed. The failures exposed a barcode state-updater defect and a test navigation wait; both were corrected. Separate pricing tests exposed a price-explanation formatting issue and a real mobile drawer overflow, also corrected. Failed runs are retained, not counted as clean passes.
- Corrected pricing browser run: 6 passed / zero failed across desktop, tablet and mobile (`pricing-confirmed.log`). Final combined browser run: 12 passed / zero failed, covering cashier, merchandising and pricing (`browser-verified.log`).
- Read-only reconciliation after cashier transactions: all nine controls passed, physical projections matched and trial balance balanced (`reconciliation-final.log`). No repair or balancing entries were used.

## Performance

The fixture loads 25,000 SKUs. Two queries price 200 lines in 16 ms. Bounded 40-result search measured 349 ms cold and 237 ms warm after collecting PostgreSQL statistics. These are local measurements, not production latency guarantees.

The first freshly loaded fixture lacked planner statistics: its main catalog SELECT took 13,796 ms during a production build. Profiling evidence is preserved in `performance-no-statistics.json`; the analyzed result is in `performance.json`. Bulk database loads need current planner statistics; normal deployment autovacuum/analyze must remain enabled. No stock or financial assertion was weakened.

## Operational boundaries

CSV supports selected-product import, preview, atomic application and stable-identity reimport. XLSX is not enabled. Labels are browser-print templates, not a hardware-printer integration. Cost fields remain permission-gated. Online publishing is off by default. No multi-branch work was introduced.
