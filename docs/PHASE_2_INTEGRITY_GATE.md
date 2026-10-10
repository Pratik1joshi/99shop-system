# Phase 2 integrity gate — 2026-09-26

**PHASE 2 INTEGRITY GATE = FAIL**

The repeated serial-return event identity defect is fixed prospectively. A separate, reproducible moving-average valuation defect remains. Work stopped at Part 0 as required. No Phase 2A, Phase 2B, or multi-branch functionality was implemented.

## Delivered integrity change

- Migration `102_serial_return_events.sql` adds a durable event row for each `(return_line_id, serial_id)` pair, with a unique constraint and foreign keys. Multiple serials on one return line receive distinct movement identities.
- `postReturn` supplies the immutable return line ID. `returnSerial` requires it, verifies original sale-line/variant ownership, locks the serial row, and uses the event ID under reference type `retail_return_serial_event`.
- A retry returns without reposting inventory or changing serial state. In particular, replaying an earlier return after a resale cannot restore the now-sold serial.
- New events require `SOLD` state. Posting remains inside the owning return transaction, so event creation, stock restoration, serial state and accounting commit or roll back together.
- The inventory replay guard remains enabled. Historical movements, stock values and journals were not altered or backfilled.
- The older unit lifecycle fixture now returns through the canonical return service and verifies that a missing event identity is rejected.

## Regression evidence

`tests/integration/serial-return-integrity.test.js` is included in the ordinary PostgreSQL runner. It creates fully journaled receipts and exercises receive → sell → return → resell → return → resell → return.

The one-serial and two-serial cases at Rs 92.73 cost pass. Checks include repeated receipt/checkout posting, concurrent return retries, low-level event retries, replay after resale, exact serial state, movement counts, stock balances, valuation, inventory asset, COGS restoration, sales-return revenue reversal, one journal per sale/return, canonical reconciliation and balanced trial balance. Three cycles create exactly three inbound return movements per serial.

The additional fractional-average case intentionally asserts the required zero difference and **fails**. It is retained as an executable gate blocker, not skipped or weakened. Consequently the final PostgreSQL suite is red.

## Exact remaining economic cause

The fractional fixture receives 2 serials at Rs 150 and 9 at Rs 80: 11 units with Rs 1,020 inventory asset. The average is stored as `92.7273`.

Three full sale/return cycles of one of these serials produce:

| Cycle | Quantity after return | Stored average | Unrounded inventory value | Sale COGS / return cost |
|---|---:|---:|---:|---:|
| 1 | 11 | 92.7275 | 1,020.0025 | 92.73 |
| 2 | 11 | 92.7277 | 1,020.0047 | 92.73 |
| 3 | 11 | 92.7279 | 1,020.0069 | 92.73 |

All three `CUSTOMER_RETURN` movements exist. Quantity projection reconciles and the trial balance remains balanced. Nevertheless the fractional SKU rounds to Rs 1,020.01 while its Inventory Asset contribution remains Rs 1,020.00. Including the two preceding successful fixtures, canonical reconciliation reports:

- Inventory valuation: **Rs 1,298.20**.
- Inventory Asset GL: **Rs 1,298.19**.
- Difference, GL minus valuation: **Rs -0.01**.

This is caused by inconsistent precision and valuation arithmetic:

1. `inventory_costs.average_cost` is `NUMERIC(14,4)` (migration 078).
2. PostgreSQL `inventory_movements.unit_cost` is `NUMERIC(14,2)` (migration 075).
3. Inventory issue retains the four-decimal average for remaining stock; checkout calculates COGS from the two-decimal movement unit cost and rounds the sale's historical unit cost to two decimals.
4. Return receives at that rounded historical unit cost, blending Rs 92.73 back into stock valued at an average of Rs 92.7273. Each cycle raises the cached average even though equal sale/return journals leave Inventory Asset unchanged.
5. Reconciliation values inventory using quantity times average. It does not retain a monetary carrying-value remainder aligned with posted rounded economic movements.

Increasing movement precision alone does not resolve the sale snapshot's explicit two-decimal rounding or the general monetary remainder problem. A complete fix must define and implement a consistent carrying-value/rounding policy across receipt, issue, historical return cost, transfer and all valuation readers, preserving immutable historical economics. No balancing journal, direct stock-value mutation, or tolerance relaxation was used.

## Fresh browser fixture

A separate disposable local PostgreSQL database was freshly migrated through 102 and seeded through canonical GRNs. The old corrupted Phase 1G database was left untouched. This is a fresh reproduction, not a claim that the historical Rs 185.42 discrepancy has been repaired.

The focused browser run covered admin checkout, split payment, hold/resume, serial sale/return, history, authorized missing-stock return, cashier sale/return/exchange, exact serial transfer and blind serial count at desktop, tablet and mobile sizes.

- **17 passed, 1 failed**, across 18 cases.
- The desktop cashier case failed on its initial attempt and retry. Trace shows HTTP 409: `Not enough cash available to refund.` The test collected Rs 10 cash plus an online payment and then requested a full cash refund. Its available drawer cash was insufficient. This is recorded as a fixture/economic prerequisite failure, not accepted as a passing browser gate.
- The same cashier journey passed later at tablet/mobile sizes when preceding transactions had supplied cash. This demonstrates an order-dependent fixture prerequisite; those later passes do not erase the desktop failure.
- Final fresh browser-fixture valuation and Inventory Asset: **Rs 40,540.00 each**, difference **Rs 0.00**.
- All **9/9** accounting controls pass; quantity projection passes; no posted physical serial return is missing an event.
- Trial balance: **Rs 44,168.23 debit = Rs 44,168.23 credit**.

The fractional regression above still blocks the overall gate despite this browser fixture reconciling.

## Final verification counts

| Check | Final result |
|---|---|
| Unit suite | 335 passed, 0 failed |
| Existing six PostgreSQL suites | 47 passed, 0 failed |
| New serial integrity suite | 2 passed, 2 failed as counted by Node: one fractional subtest failure plus its parent |
| Combined final PostgreSQL run | 49 passed, 2 failed; one underlying economic failure |
| Focused Retail browser gate | 17 passed, 1 failed; 18 cases across three screen sizes |
| Fresh / 101 → 102 upgrade | Both passed; rerun safe; existing customer preserved; event uniqueness and both foreign keys verified |
| Production build | Passed; 267 static pages generated |
| Full lint | 0 errors, 17 existing warnings |
| Fresh browser reconciliation | 9/9 accounting controls and quantity projection pass; Rs 0.00 valuation difference |
| Fractional-cost reconciliation | Fails by Rs 0.01 after three complete cycles |

The first integration run before the fractional regression passed 50 tests. It is superseded by the final stricter run; it is not the gate result. An earlier fixture setup error (missing category) was corrected before these counts.

## Requested final report

“Not started” below refers to work in this phase. It does not claim the repository lacks earlier implementations.

| # | Requested area | Result |
|---|---|---|
| 1 | Phase 2 integrity gate | FAIL: fractional valuation regression and focused browser failure remain. |
| 2 | Serial return defect fix | Prospective durable per-return-line/per-serial event identity implemented and tested. |
| 3 | Final valuation reconciliation | Fresh browser: Rs 40,540.00 = Rs 40,540.00. Fractional fixture: Rs 1,298.20 versus Rs 1,298.19. |
| 4 | Product/attribute architecture | Not started; blocked by Part 0. |
| 5 | Variant matrix | Not started. |
| 6 | Bulk editor | Not started. |
| 7 | SKU/barcode generation | Not started. |
| 8 | Product import | Not started. |
| 9 | Bulk price management | Not started. |
| 10 | Price Lists | Not started. |
| 11 | Customer Groups | Not started. |
| 12 | Wholesale pricing | Not started. |
| 13 | Quantity tiers | Not started. |
| 14 | Scheduled pricing | Not started. |
| 15 | Margin controls | Not started. |
| 16 | Supplier product pricing | Not started. |
| 17 | Product media | Not started. |
| 18 | Online assortment | Not started. |
| 19 | Canonical price resolver | Not started. |
| 20 | Sales channel model | Not started. |
| 21 | Public Catalog | Not started. |
| 22 | Product Detail | Not started. |
| 23 | Cart | Not started. |
| 24 | Checkout | Not started. |
| 25 | Customer/Guest flows | Not started. |
| 26 | Inventory reservations | Not started. |
| 27 | Order lifecycle | Not started. |
| 28 | Online Order Admin | Not started. |
| 29 | Click & Collect | Not started. |
| 30 | Delivery | Not started. |
| 31 | Payments | Not started. |
| 32 | Order → Retail Sale conversion | Not started. |
| 33 | Cancellation | Not started. |
| 34 | Returns/Exchanges | Canonical serial-return identity fixed; online scope not started. |
| 35 | Loyalty/Store Credit online behavior | Not started. |
| 36 | Unified customer history | No new implementation. Existing regression suite passes. |
| 37 | Channel reporting | Not started. |
| 38 | SEO basics | Not started. |
| 39 | Public security review | Not performed; no public Phase 2 changes. |
| 40 | Concurrency/idempotency results | Concurrent retries and old-event replay pass in serial fixtures; broader Phase 2 matrix not run. |
| 41 | Performance results | Phase 2 performance benchmark not run. |
| 42 | Responsive/public mobile results | Focused Retail tests ran at three sizes; public Phase 2 acceptance not run. |
| 43 | Admin merchandising UX results | Not started. |
| 44 | Tests | 335 unit passes; PostgreSQL 49 passes/2 failures; focused browser 17 passes/1 failure. |
| 45 | Migrations | Additive 102; fresh/upgrade/rerun checks pass; historical repair not performed. |
| 46 | Build/lint | Build passes; lint 0 errors/17 warnings. |
| 47 | Reconciliation | Fractional regression remains red despite fresh browser zero difference. |
| 48 | Known issues | Precision/carrying-value drift, order-dependent cash-refund fixture, previously corrupted historical data, deferred Phase 1 work. |
| 49 | Recommended next Phase 2 scope | Finish Part 0 monetary valuation policy and deterministic cash-refund fixture, rerun the complete integrity gate, then begin Part A. Part B waits for stable merchandising identity and pricing. |

## Reproduction and retained artifacts

Use an isolated localhost `TEST_DATABASE_URL`, then run `npm run test:integration`. The runner creates and drops its own per-suite databases. The fractional test must become green before the gate can pass.

- `scripts/prepare-phase2-integrity-fixture.mjs`: creates a new disposable browser database, records ignored local fixture credentials, and receives opening inventory through the canonical domain.
- `scripts/verify-phase2-integrity-migration.mjs`: fresh/upgrade/rerun proof.
- `scripts/verify-phase2-integrity.mjs`: read-only browser reconciliation and serial event evidence.
- `.commerce-tmp/phase2/integration-fractional.log`: final PostgreSQL failure with exact values.
- `.commerce-tmp/phase2/browser.log` and `browser-results/`: focused browser outcomes and HTTP 409 trace.
- `.commerce-tmp/phase2/reconciliation.json`, `migrations.json`, `unit.log`, `lint.log`, `build.log`: retained local verification evidence.

The browser verification server used port 3020 and a separate build directory. Its test-process-only login rate limit was raised for automated login traffic; application defaults were unchanged. No production data or deployment was used.
