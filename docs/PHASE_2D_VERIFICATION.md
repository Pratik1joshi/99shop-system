# Phase 2D implementation and verification

Verified locally on 2026-09-27. Existing worktree changes were preserved.

## 1. Warranty policy architecture

Versioned business, brand, product and SKU policies use deterministic specificity. Revisions retire previous versions; configured terms include duration, proof, exclusions and replacement coverage.

## 2. Historical warranty snapshots

Checkout freezes fulfilled sale-line terms and each serialized identity. Later policy edits do not rewrite promises. Pre-upgrade purchases without evidence require manual review; migrations create no invented historical coverage.

## 3. Eligibility engine

Checks ownership, sale status, snapshot duration, proof, returned/replaced quantities and serial identity. Covered, expired, excluded, refunded/replaced and manual-review outcomes remain distinct.

## 4. Product ownership

Uses canonical paid sale lines and linked serials. Customer account purchase registry includes applicable snapshots and purchased batch identities.

## 5. Warranty search

Receipt, order, customer name/phone, SKU/barcode and exact serial lookup; bounded results. Authorized global search includes claim, repair and RMA documents.

## 6. Claim creation

Staff and authenticated customers create source-linked claims with issue, description, quantity, proof and batch/serial evidence. Intake alone creates no inventory or accounting transaction.

## 7. Claim lifecycle

Server state graph governs request, receipt, inspection, approval/rejection, repair, replacement/refund, readiness, collection, closure and cancellation. Custody and resolution are separately recorded.

## 8. Claim detail

Source purchase, coverage, inspections, operational jobs, customer/internal notes, timeline, supplier outcomes and permission-gated economics. UI offers actions appropriate to current state.

## 9. Customer self-service claim

Own-purchase selection, request submission and safe status/timeline at /store/account/warranty. Explicit response projections exclude internal notes, costs and retry metadata.

## 10. Inspection

Condition, observed fault, tests, physical/liquid damage, accessories and proof evidence are retained.

## 11. Approval/rejection

Inspection evidence is required; coverage overrides and rejection/cancellation require reasons. Approval has no economic posting.

## 12. Repair jobs

Diagnosis, technician, status and completion evidence are recorded. Repairing customer property does not add a sellable retailer asset. Paid-service invoicing is not invented.

## 13. Repair parts

Canonical inventory issue values parts once at actual carrying cost and links the journal to the claim. Replays cannot consume parts twice.

## 14. Warranty accounting

Warranty parts and retailer replacements debit account 5043 and credit canonical inventory 1210. warranty_economic is a registered accounting source. Customer-owned intake and supplier inspection have no automatic ledger effect.

## 15. Replacement workflow

Validates replacement SKU/serial and availability; locks source sale and inventory. Issues exact replacement identity and carrying cost once, excludes duplicate ordinary refunds, and retains old/new trace.

## 16. Replacement warranty

ORIGINAL_EXPIRY, NEW_FULL or SPECIFIED coverage is frozen on a successor snapshot. Missing historical terms require explicit documented replacement terms.

## 17. Defective item disposition

Customer custody is separate from retailer ownership. Store replacement can acquire the defective asset into non-sellable custody at zero recoverable value, or record scrap without creating stock. Canonical moving-average valuation remains authoritative.

## 18. Refund/store-credit resolution

Uses existing posted Retail Return and Store Credit issuance; no parallel refund ledger. Cash, bank and store credit preserve original canonical document links.

## 19. Supplier RMA

Customer-owned service custody and retailer-owned stock are distinguished. Retail-owned goods transfer to non-sellable RMA. Repair/no-fault/rejection restore appropriate custody; no-cost replacements preserve total carrying value; actual credit posts canonical Purchase Return. Direct customer-owned supplier replacement currently supports serialized goods.

## 20. Serial lifetime history

Serial detail links original sale, historical coverage, warranty claims, successor serials, repair/RMA and existing inventory events. Legacy mutable warranty endpoint refuses promise rewrites.

## 21. Warranty analytics

Factual open/closed counts, age, resolution duration, outcomes, issues and authorized warranty costs. No opaque quality score.

## 22. Product quality metrics

SKU period includes units sold, claims, returns, rates, minimum sample and warranty cost. Supporting claim links are bounded; aggregate totals are uncapped.

## 23. Claim security

Server capabilities cover view/create/inspect/approve/repair/parts/replace/refund/RMA/close/cost/configure. Public requests require account ownership, same-origin checks, body limits and rate limits.

## 24. Claim concurrency/idempotency

Sale-row locks serialize replacement/refund competition; unique open serial claim, action retry hashes and one-replacement constraint prevent duplicate economic actions. Stock locks use deterministic SKU order.

## 25. Forecast architecture

Deterministic baseline-v1 on-demand selected-SKU computation, immutable fingerprinted evidence snapshots and bounded history. No external ML service or scheduled worker dependency.

## 26. Demand data policy

Gross completed Retail Sale units from up to 180 complete Nepal dates; pending/cancelled orders excluded. Returns remain a separate quality signal.

## 27. Stockout handling

Reconstructs daily closing sellable-location quantities from canonical movements. Zero-sale unavailable days are censored, never imputed. Historical intraday outages, reservations and expiry cannot be reconstructed and are disclosed.

## 28. Forecast eligibility

New, limited, sufficient, intermittent and no-reliable-forecast classifications. Fewer than 28 usable days or intermittent demand falls back to explicit reorder policy without precise demand predictions.

## 29. Forecast methods

Recent average, weighted average, exponential smoothing and weekly seasonal baseline; seasonal model requires enough training history.

## 30. Model selection/backtest

Chronological held-out validation; deterministic MAE selection with WAPE, bias, candidate errors and training/validation counts. No zero-demand MAPE.

## 31. Forecast horizons

7, 14 and 30 days. Expected units, history, evidence language, assumptions and observed error are visible; no fabricated confidence probability.

## 32. Replenishment 2.0

Manual, min/max, reorder point and forecast-assisted modes. Available stock excludes active reservations; only approved unreceived PO quantities count as incoming. Human edits produce only a canonical draft PO.

## 33. Safety stock

Explicit fixed-unit and demand-day buffers; policy changes audited. No unvalidated probabilistic service-level claim.

## 34. Days cover

Computed only with positive reliable daily demand. Cover target and lead-time need drive recommendations; unavailable forecasts show a fallback instead of infinity.

## 35. Supplier lead time

Median and mean elapsed approved-PO-to-posted-receipt time, sample count and manual override. Limited to latest 20 receipts and disclosed as observed receipt lead time.

## 36. Supplier metrics

Per-SKU supplier order counts, ordered/received units, partial lines, posted purchase returns, receipt costs and lead evidence. All-history fulfillment figures explicitly labeled; no supplier score.

## 37. Purchase cost intelligence

Latest/previous and quantity-weighted recent cost, source receipt history and configurable cost-increase signals. No automatic price change.

## 38. Margin erosion

Compares previous/current receipt cost at current SKU price; explicitly labels this as cost pressure rather than asserting historical selling prices were unchanged.

## 39. Slow/dead/overstock

Configurable age/velocity/cover rules produce factual review signals. They never change catalog status.

## 40. Expiry risk

Batch expiry quantities compared with expected FEFO sell-through; inadequate history remains labeled. Operational review only.

## 41. Return/discount/inventory anomalies

Minimum-sample return rate, line-discount share and repeated inventory-loss signals include thresholds/source links. Sales week spike/drop and channel-share shift compare the preceding four weeks, require adequate samples and suppress known stockout/promotion weeks; unrecorded closures remain a disclosed limitation.

## 42. Channel intelligence

Selected-SKU posted units, transactions, line revenue and COGS by channel. Existing canonical retail analytics remains the financial net-sales/margin source; this panel explicitly excludes bill discounts/refunds from line revenue.

## 43. Forecast vs actual

Historical snapshots can be measured after their complete horizon; displays expected demand, actual gross units, signed and absolute error. Incomplete windows cannot masquerade as final accuracy.

## 44. Intelligence workspace

Insights navigation, bounded SKU search, horizon selector, explanation/error, attention signals, quality/receipt/batch evidence, policy and purchasing decisions. A saved-snapshot attention/quality worklist covers up to 100 recently reviewed SKUs, shows evidence dates and opens a fresh computation. It does not imply unreviewed SKUs were analyzed.

## 45. Recommendation audit

Snapshot, policy version, actor, reason, suggested/final quantity and resulting draft PO retained. Ignore decisions are recorded. Owner audit includes policy and decision changes.

## 46. Performance

25,000 synthetic SKUs and 100,000 synthetic completed sales, 180-day history: selected-SKU computation 1,755 ms locally; repeat snapshot identity verified. Synthetic fixture rolled back; this is not a concurrent production SLA.

## 47. Role/security results

Browser checks cover anonymous denial, default cashier denial and admin operation; customer responses exclude private fields. Fine-grained capability checks are server enforced. Exhaustive combinations of customized roles were not browser-tested.

## 48. Responsive results

Desktop, tablet and customer-mobile journeys check layout overflow and capture screenshots. Final matrix result recorded below.

## 49. Test counts

Final verification counts recorded below. Node integration counts include parent tests; do not add unit and integration totals as unique scenarios because some economic tests intentionally run on both adapters.

## 50. Migration results

Fresh database and upgrade from migration 108, followed by rerun: PASS. 109 migration files applied in this repository (numbering is non-contiguous). New phase files are 109, 110 and 111. Preserved prior product, no retroactive snapshots or journal entries.

## 51. Reconciliation

Canonical quantity/value inventory controls and accounting trial balance are asserted after replacement, parts, refund, supplier credit and batch RMA stories. Post-browser evidence recorded below.

## 52. Build/lint

Production webpack build uses workspace TEMP/TMP to avoid a Windows WinGet directory access failure. No dependency changes. Full lint: zero errors, 17 pre-existing warnings; touched-file lint clean.

## 53. Known issues

Historical stockout reconstruction is approximate. No attachment upload, external notification delivery, paid-repair invoice engine, vendor portal or multi-branch. Direct customer-owned nonserialized supplier replacement is not supported; retailer-owned nonserialized/batch replacement is. Worklist supports status, warranty state, issue, product, brand, customer, serial, assigned-staff and date/resolution filters. SLA presets and a staff-assignment editor are not included. The cross-SKU worklist covers saved snapshots rather than pretending all catalog items have been freshly forecast.

## 54. PHASE 2D VERDICT

PASS for the stated Phase 2D acceptance criteria, with the explicit operational/data limits in item 53. This is a bounded single-store implementation with human-reviewed recommendations, not a claim of exhaustive analytics or arbitrary-scale performance. Phase 2C and multi-branch were not started.

## Final verification evidence

| Gate | Result |
| --- | --- |
| Unit suite | 353 passed, 0 failed |
| PostgreSQL regression | 14 suites, 110 tests passed, 0 failed |
| Phase 2D PostgreSQL subset | 12 tests passed (included above); rerun after final domain/filter changes |
| Production browser matrix | 12 passed, 0 failed; desktop/tablet/mobile; 33.4 seconds |
| Full lint | 0 errors, 17 existing warnings |
| Touched-file lint | 0 errors, 0 warnings |
| Fresh / upgrade / migration rerun | Passed |
| Inventory quantity and value projections | Passed; no differences |
| Inventory asset vs valuation after browser stories | Rs 347.22 each; difference 0 |
| Trial balance after browser stories | Rs 3,000 debit / Rs 3,000 credit |
| Production build | Passed; final delivery build recorded in phase2d-build-delivery.log |

Structured evidence: [PHASE_2D_EVIDENCE.json](PHASE_2D_EVIDENCE.json).

Commands: `npm run test:unit`, `node scripts/run-integration.mjs`, `npm run lint`, `npm run build`, and `npx playwright test tests/e2e/phase2d-after-sales.spec.js --retries=0`. PostgreSQL tests use a disposable localhost server and create/drop only their own test databases. Migration/browser/benchmark helper scripts refuse non-local targets; benchmark rows are rolled back.

Local logs: `phase2d-unit-final.log`, `phase2d-regression-final.log`, `phase2d-browser-final.log`, `phase2d-migrations-final.log`, `phase2d-performance-final.log`, `phase2d-reconciliation-final.log`, `phase2d-lint-final.log`. Screenshots are under `.commerce-tmp/phase2d`. Local credentials and fixture databases are not committed.

No production deployment or production database migration was performed.
