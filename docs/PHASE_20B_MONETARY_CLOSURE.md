# Phase 2.0B monetary closure

**PHASE 2 INTEGRITY GATE = PASS — 2026-09-26.**

The policy was written first in `INVENTORY_MONETARY_POLICY.md`. The following reflects the integrity checkpoint before Phase 2A changes.

| # | Required result | Evidence |
|---|---|---|
| 1 | Carrying-value policy | Currency cents are monetary authority; physical quantity remains the movement/balance authority; average is derived. |
| 2 | Schema | Additive migration 103: carrying value, explicit upgrade baseline and watermark, signed movement delta, immutable return total COGS; read-only location/batch allocation view. |
| 3 | Historical initialization | Existing quantity × average snapshot rounded per SKU, never initialized from GL. Journals and old movement evidence remain unchanged. Unknown historical deltas remain null. |
| 4 | Receipts | The existing receipt journal's net inventory amount drives carrying value, including discounts, tax treatment and purchase-unit conversion. Batch splits allocate the exact source total. |
| 5 | Sales | Movement totals drive historical sale total, COGS and Inventory Asset. Exhaustion takes the final cent. |
| 6 | Returns | Allocate remaining original line total over remaining returnable quantity; final return restores remaining cents. Serial return event identity is preserved. |
| 7 | Supplier returns | Inventory journal consumes actual movement totals; supplier credit and PPV policy retained. Each serial uses its existing supplier-return identity row. |
| 8 | Adjustments/counts | Losses consume movement totals, including all FEFO legs. Positive adjustments preserve explicit-cost/current-average policy. Count postings remain legitimate events. |
| 9 | Transfers | Inbound value must match immutable outbound evidence; global value and GL remain unchanged. |
| 10 | Remainders | BigInt cents and quantity thousandths; deterministic cumulative allocation; informational unit costs never reconstruct posted money. |
| 11 | Reconciliation | Carrying value versus GL; baseline plus signed deltas versus projection; cost-projection quantity versus physical quantity. Existing zero-cent threshold retained. Reports use allocated carrying values. |
| 12 | Fractional fixture | Original zero-difference assertion passes. 2 × 150 + 9 × 80 ends at 11 units, Rs 1,020.00 carrying value after three cycles. |
| 13 | Property matrix | Six PostgreSQL subcases plus parent pass: 100/3 partial returns, FEFO loss, six write-off types, converted receipt, multi-serial PPV, transfers/counts, and 12 deterministic seeded cycles (20260926). |
| 14 | Serial cycles | One and two serials per line pass concurrent retries and old-event replay. Three movements per returned serial; exact serial-state counts checked. |
| 15 | Cash browser fixture | Independently posts a canonical funding cash sale. Cash-refund controls unchanged. Cashier journey passes desktop/tablet/mobile before the admin suite. |
| 16 | Counts | Unit 336/336; PostgreSQL 58/58 across eight isolated suites; focused browser 39 passed/3 failed originally, with all three fixture failures subsequently passing the corrected rerun. Independent cashier run 3/3. |
| 17 | Verdict | PASS. Build passes (267 static pages); fresh/102→103 upgrade/rerun checks pass; lint 0 errors/17 existing warnings. |

Final fresh browser fixture: Inventory carrying value **Rs 39,999.58**, Inventory Asset **Rs 39,999.58**, difference **Rs 0.00**. All nine accounting controls, physical projection, monetary projection and trial-balance checks pass. No physical serial return is missing an event.

The broader 42-case browser run found an unrelated replenishment fixture with no qualifying low-stock SKU. The corrected test creates its own SKU, sets reorder policy and supplies a known purchase cost. Its final three-size rerun passes. Original failures and the intermediate rerun are retained; there was no single clean 42-pass invocation. The required cash-refund journey passed independently and in the broader run.

The SELECT-only `scripts/diagnose-inventory-value.mjs` reports SKU/location quantity, average, carrying value, allocated location value, baseline, monetary movement evidence and differences. It explicitly declines unsupported per-location GL attribution for mixed-SKU journal lines. Migration tests prove a preexisting valuation is retained without creating a journal. Previously corrupted development data is not claimed repaired.

Evidence: `.commerce-tmp/phase20b/` contains final unit, integration, build, lint, migration, browser, corrected replenishment and reconciliation artifacts. The isolated database credentials stay in ignored files. No production database was used.

Phase 2A proceeds from this checkpoint. Phase 2B remains conditional on Phase 2A catalog/pricing acceptance. No multi-branch work is authorized or implemented.
