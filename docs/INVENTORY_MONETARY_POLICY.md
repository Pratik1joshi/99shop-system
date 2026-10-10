# Canonical inventory monetary policy — Phase 2.0B

Selected before implementation, 2026-09-26.

Quantity is the physical movement/balance truth. The existing per-SKU cost projection will carry an explicit two-decimal NPR `carrying_value`. This is the financial valuation authority. Average cost is derived from carrying value divided by quantity; its displayed/cached precision is informational, never a source for reconstructing posted money.

## Event rules

All economic amounts are allocated in integer currency cents. Quantities use the existing three-decimal stock precision. Ratios and remainder allocations use integer arithmetic. An ordinary issue takes the rounded proportional share of current carrying value; issuing all remaining stock takes every remaining cent. A receipt takes the exact inventory amount recognized by its owning document. The same final amount drives movement `total_cost`, carrying-value change, historical line totals, and the inventory/COGS or expense journal. Unit costs are informational.

For multiple destinations/units, cumulative proportional allocation assigns remainders deterministically in persisted line/identity order. Allocations sum exactly to the source amount. Partial returns consume the remaining immutable original sale-line `total_cost` in proportion to remaining returnable quantity. The final return consumes the remaining original cents; today's average never determines a return's cost. A no-stock refund consumes its historical quantity/cost allocation without restoring inventory or COGS.

Transfers pass exactly the outbound monetary amount to the inbound movement. They move physical quantity and its allocated value between locations but do not create company-wide value or a GL posting. This repository pools moving-average cost by SKU across locations; location report values are deterministic allocations of the SKU carrying value, not independently maintained location valuations.

Positive adjustments/count gains retain the existing explicit-cost-or-current-average policy. Losses, damage, expiry, shrinkage, testers, samples and internal use consume the allocated movement amount. Supplier credit and purchase-price variance retain their separate existing policy: only the inventory component follows the issued carrying amount.

## Evidence and migration

The existing immutable movement ledger gains a signed monetary delta for new events. `total_cost` already stores an event monetary total, so no duplicate unsigned total is needed. A projection's migration baseline plus subsequent signed deltas must equal its carrying value. Historical deltas remain unknown rather than fabricated.

Additive migration initializes existing carrying values by rounding each existing quantity × cached average to currency precision, with an explicit baseline quantity/value and movement watermark. It does not use GL to force equality, rewrite journals, or claim to repair prior corruption. Reconciliation continues to report existing GL differences. Newly empty databases start with zero baseline.

Receipts/imports must use canonical domain posting; low-level opening/receipt helpers alone do not manufacture missing accounting journals. Existing caller responsibility for an owning transaction is retained.

## Inspected path inventory

| Path | Current owner / required monetary treatment |
|---|---|
| GRN/direct receipt | `retail-purchasing`: journal uses line net amount (including existing discount/tax treatment); movement currently uses unit cost × stock quantity. Use the same net amount and allocate over batch/serial stock. |
| Sale / serial / FEFO batch issue | `retail-sales` / `retail-inventory`: checkout currently recomputes cost from rounded movement unit cost. Consume movement totals and retain immutable sale-line total. |
| Customer return / exchange | `retail-returns`; exchange delegates to return and checkout. Use original line total with deterministic partial-return allocation. Keep durable serial-return events unchanged. |
| Purchase return | `retail-purchasing`: keep supplier credit and PPV; inventory journal must sum all issued movement totals, including all serials. |
| Adjustments / all write-offs | `retail-inventory-adjustments`: journal reads movement totals but some paths retain only the first FEFO movement. Sum all physical legs. |
| Stock count gain/loss | `retail-stock-counts`: preserve approved valuation basis and serial/batch identity; monetary amount comes from legitimate movements. |
| Transfers / quarantine / serial moves | `retail-transfers`, `retail-serials`, adjustment reclassification: explicitly pair monetary totals across each outbound/inbound leg. |
| Opening / direct low-level receipts | `retail-inventory`: monetary projection follows canonical event amount; owning caller remains responsible for accounting. |
| Reports / reconciliation | `retail-inventory`, `retail-reporting`, `retail-inventory-reports`, stock/tracking queries: replace authoritative quantity × rounded average valuation with carrying value and deterministic breakdowns. |
| Cost access | Cost visibility filters must cover added carrying-value and allocation evidence fields. |

Financial reconciliation uses exact currency-rounded differences with the existing zero-cent requirement. No tolerance increase or balancing journal is permitted.
