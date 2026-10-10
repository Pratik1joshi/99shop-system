# Phase 2B — Omnichannel commerce verification

Verification date: 27 September 2026, Asia/Kathmandu. Tests used disposable local PostgreSQL databases and a production Next.js build. No production database was migrated and no website was deployed. Existing workspace changes from earlier phases were preserved.

## Requested 53-part report

| # | Area | Delivered behavior and verification |
|---|---|---|
| 1 | Channel architecture | IN_STORE maps to canonical `retail_pos`; ONLINE maps to `online`. Orders orchestrate existing products, pricing, inventory, customers, sales, returns and journals. No second economic ledger or multi-branch implementation. |
| 2 | Online assortment | Explicit product/category publication, optional online category, feature/sort controls, and bulk publication of up to 200 existing products. Archived products cannot be published. |
| 3 | Public product APIs | `/api/storefront/catalog` and `/product` expose selected public fields only. Costs, suppliers, margin policy and internal pricing rule IDs are excluded. Unpublished products cannot be quoted. |
| 4 | Catalog | Responsive, paginated catalog with imagery, branding, categories, representative SKU prices and empty states. 24 products per page. |
| 5 | Search/filter | Product/category/brand/variant text search, six configured attribute facets, price ranges, availability and sorting. Price/stock filters use the shown option and require at most 1,000 candidate products. |
| 6 | Product detail | Stable slug, description, gallery, optional MRP, current price, stock, return policy and exact SKU selection. Local image thumbnails are resized WebP. |
| 7 | Variant UX | Generic attribute buttons/swatches, deterministic attribute ordering and disabled impossible combinations. No cosmetics-specific product model. Detail loads 100 variants per page, up to 1,000. Gallery selection and keyboard Add to bag are browser-tested. |
| 8 | Pricing integration | Canonical resolver receives ONLINE and the authenticated canonical customer. Public input cannot set payable prices, customer group or margin overrides. Internal rule metadata stays private. |
| 9 | Cart | Browser-persisted exact SKU/quantity lines; server quote, discounts, delivery charge and total. Quantities and line count are bounded. Browsing does not reserve stock. |
| 10 | Stock availability | Uses canonical sellable stock minus active, unexpired reservations. Expired batches and non-sellable locations are excluded. No ecommerce stock table. |
| 11 | Reservations | Placement atomically validates and reserves with the same sorted SKU/location locks used by POS. Repeated placement with the same key returns the original order. |
| 12 | Reservation expiry | Default 120 minutes, configurable 15–1,440. Availability ignores expiry immediately without a worker. Expired orders cannot fulfill. |
| 13 | Checkout | Server quote fingerprints require explicit acceptance; the browser shows changed prices and requires a second submission. The order is rechecked inside placement. |
| 14 | Guest flow | Opaque HttpOnly browser secret controls guest ownership. No phone/name auto-merge, loyalty redemption, store-credit spending or public credit sales. |
| 15 | Customer account | Staff-verified, single-use activation binds an existing canonical customer. Hashed passwords/sessions; authenticated history and logout. Browser acceptance includes account checkout. |
| 16 | Pickup | Pickup instructions and order confirmation; authorized staff collect payment and fulfill into a sale. Browser-tested end to end. |
| 17 | Delivery | Address, notes and separately quoted delivery fee. Delivery charges use canonical billing conventions. No route planning or courier integration. |
| 18 | Order lifecycle | Existing statuses remain compatible; independent channel, payment and derived fulfillment dimensions are exposed. Timeline records placement, confirmation, payment, cancellation and fulfillment. |
| 19 | Online Order admin | Permission-controlled queue with search, status filter and server pagination; detail, serial capture, payment confirmation and linked sale. Accessible from admin and cashier navigation. |
| 20 | Payment architecture | Explicit offline payment intent contains provider, NPR amount, order reference, status, instructions and next step. Cash and manual bank/QR are implemented. No fake gateway success. |
| 21 | Manual QR verification | Customer choice remains PENDING. Staff must verify receipt and provide a reference. `verify_payment` is separate from `fulfill` and denied to the default cashier. |
| 22 | Idempotency | Public request keys persist across retries; conflicting requests are rejected. Order lock and unique sale linkage make repeated/concurrent fulfillment return the original sale. |
| 23 | Order → Retail Sale | One atomic canonical hold/checkout/consume/link operation. Placement posts no sale or journal. Failed repricing/stock/serial checks leave no partial financial posting. |
| 24 | Inventory fulfillment | Canonical movements and carrying-value/COGS services post exactly once at fulfillment. Reservations are consumed in the same transaction. |
| 25 | Serial/batch behavior | Staff select exact serials; an online reservation blocks POS from taking reserved stock. Canonical FEFO allocation is tested, including expired and non-sellable stock. |
| 26 | Cancellation | Unfulfilled cancellation releases reservations and records an event. Cancel-versus-fulfill is serialized. Completed orders require the canonical return workflow. |
| 27 | Refunds | Canonical returns issue authorized refunds. Cancelling a pending bank order records payment-review requirements, not an automatic bank refund. Delivery charges are not automatically refunded by merchandise returns. |
| 28 | Returns | Customers can request return help; staff use the linked original Retail Sale and existing return service. Online sale/return accounting and inventory reversal are integration-tested. |
| 29 | Exchanges | Staff-assisted exchange remains in the existing Retail workflow from the linked sale. No separate self-service exchange or RMA economic engine. |
| 30 | Loyalty | Completed customer-linked sales use canonical earning and returns use canonical reversal where configured. Public account reads the same ledger. Online point redemption is disabled in this release. |
| 31 | Store Credit | Authenticated customers can read canonical credit history. Public redemption is disabled, including for authenticated accounts; no duplicate balance or guest balance lookup. Canonical POS redemption/return regression remains in the economic suite. |
| 32 | Wholesale/groups | Verified account identity selects canonical group/channel prices. Integration verifies an authenticated 80-price versus guest 100-price and rejects client customer/group spoofing. No separate B2B portal. |
| 33 | Promotions | Coupons and discounts pass through canonical sale quotation and checkout. Line totals and discounts are projected from that quote, not recalculated by a web rules engine. |
| 34 | Unified history | Public account shows its canonical completed sales across channels, loyalty and credit transactions. Staff retain the shared customer timeline and channel filter. |
| 35 | Channel analytics | Revenue, returns and COGS derive from posted canonical sales/returns. The integration gate checks channel net revenue against GL revenue plus sales-return contra-revenue. Pending orders are not revenue. |
| 36 | Overview/Search | Authorized open-order attention on Overview and global order search by order/customer/phone/payment reference. Public ownership tokens are never returned to staff clients. |
| 37 | Merchandising | Existing product editor supplies online content/media/SEO; bulk publish/feature/category actions are audited. Store settings include identity, hero, logo, accent, contact, guest policy and fulfillment instructions. Authenticated preview does not publish. |
| 38 | SEO | Product canonical metadata, Open Graph, truthful Product JSON-LD, category URLs, robots and publication-aware sitemap. No invented reviews or ratings. |
| 39 | Public security | Explicit projections, no-store private data, ownership checks, hashed tokens, origin checks, streamed 32 KiB body limit and atomic database rate limits. Private receipt paths require staff auth, including legacy Next-served upload paths. External proxy/CDN configuration remains a deployment check. |
| 40 | Concurrency | Integration exercises online-versus-online, online-versus-POS, two online attempts plus POS for the last unit, cancellation-versus-fulfillment, replay and atomic rate-limit contention. |
| 41 | Role permissions | Admin/cashier order permissions are separate from payment verification. Public admin access and default-cashier manual verification are rejected. Existing cashier sales/returns and pricing access restrictions are browser-tested. |
| 42 | Accessibility | Semantic labels, status/alert regions, focus styling, 44px button/navigation targets, disabled invalid choices and keyboard activation. Desktop/mobile no-overflow and keyboard checks pass. This is not a full WCAG or screen-reader certification. |
| 43 | Mobile UX | Pixel 7 Chromium acceptance covers pickup, manual-payment delivery/cancel, account activation/checkout, changed-price acknowledgement and security. Screenshot reviewed for checkout readability and overflow. |
| 44 | Performance | 26,000 SKUs, 1,001 products, one 1,000-variant product and 2,000 synthetic cancelled orders. Bounded queries and new indexes avoid full variant scans per product. Latest local timings are recorded below; they are not production load-test claims. |
| 45 | Phase 2A regression | Canonical pricing and merchandising integration suites plus desktop/mobile bulk merchandising, scheduled pricing and authentication browser scenarios. |
| 46 | ERP economic regression | Existing production/foundation, inventory monetary, serial returns, customer timeline and economic behavior suites pass. No balance-repair scripts or compensating journal edits were used to make tests pass. |
| 47 | Reconciliation | Final browser-fixture reconciliation and trial balance are recorded below after browser transactions. Integration also asserts reconciliation and channel-to-GL agreement. |
| 48 | Test counts | See the exact final gate table below. Counts are test-runner reported; TAP counts include parent tests. Repeated targeted runs are not added to the unique count. |
| 49 | Migrations | 105 public commerce, 106 discovery, 107 storefront configuration and 108 media/catalog indexes. Fresh install, upgrade from 104 and migration rerun pass; 106 migration files applied. Publication stays off and upgrade preserves in-store data without posting journals. |
| 50 | Build/lint | Production webpack build passes. ESLint has no errors and 17 existing warnings. An offline package-lock refresh could not resolve an unrelated uncached optional package; a clean online install was not tested. Installed Sharp is declared directly. |
| 51 | Known issues | Representative-SKU filter scope and 1,000-candidate cap; 1,000 variants per public detail; external HTTPS images are not optimized; no online balance redemption; manual payment only; no provider notifications; no full accessibility audit; no public deployment, CDN or production load test. Direct static hosting must protect legacy receipt files independently. |
| 52 | Phase 2B verdict | Final local gate result is recorded below. Production deployment readiness depends on the explicitly listed environment checks; local tests do not establish external infrastructure behavior. |
| 53 | Next large phase | Payment-provider integration and commerce operations: verified webhook contracts, settlement/refund reconciliation, notification delivery and production observability/load testing. Do not implement multi-branch as part of this work. |

## Final gate and evidence

**PASS — Phase 2B implementation and local acceptance gate.** The canonical commerce invariants in the requested pass criteria are covered by the passing tests below. This is not approval of an untested production deployment. Payment gateways, external infrastructure, full accessibility certification and the explicitly disabled optional balance-redemption features are outside this verified release.

| Gate | Exact result | Evidence in `.commerce-tmp/phase2b/` |
|---|---|---|
| Unit | 344 passed, 0 failed, 0 skipped | `unit-accepted.log` |
| Full integration | 98 passed, 0 failed across 13 registered suite files | `integration-deliver.log` |
| Final targeted integration after attribute-order correction and added wholesale assertions | 21 passed, 0 failed; already included in the 98 above | `commerce-accepted.log` |
| Desktop production browser | 9 passed, 0 failed, retries disabled | `browser-desktop-final.log` |
| Mobile production browser | 9 passed, 0 failed, retries disabled | `browser-mobile-final.log` |
| Fresh migration / upgrade from 104 / rerun | Both database paths passed; 106 migration files each; publication off and economics unchanged | `migrations-deliver.log`, `migrations.json` |
| Production build | Passed; 287 generated pages | `build-accepted.log` |
| Lint | 0 errors, 17 existing warnings | `lint-accepted.log` |
| Final reconciliation | 9 of 9 checks reconciled; inventory projection has 0 differences | `reconciliation-final.log`, `reconciliation.json` |
| Final trial balance | Debit NPR 73,040 = credit NPR 73,040 | `reconciliation.json` |
| Inventory / serial return integrity | Valuation NPR 56,690; 0 missing serial-return events | `reconciliation.json` |

The 18 browser cases comprise ten Phase 2B cases and eight Phase 2A/cashier regression cases. They ran against the same final production build on port 3029. Desktop and mobile were separated by the existing staff-login rate-limit window; limits were not disabled. An earlier combined run hit that limit after 17 passing cases. Earlier selector ambiguities were corrected, deterministic attribute ordering was added, and thumbnail selection was fixed before the final passing runs.

The integration runner creates and drops its own local databases. The browser fixture remains isolated from production. Reconciliation was read-only after the final mobile transactions; no balance repair or journal adjustment was performed. The persisted gate summary is also available in [PHASE_2B_EVIDENCE.json](PHASE_2B_EVIDENCE.json).

Local performance sample (milliseconds): catalog 120; search 107; category 86; brand 85; attribute 140; price range 99; detail 68; 25-line cart quote 222; order queue 45; customer history below 1 ms; 1,000-variant product first/last page 66/67. These are local measurements, not a production SLA.

Evidence is retained under `.commerce-tmp/phase2b/` (ignored generated artifacts). Reproducible test and verification scripts are in `tests/integration/retail-public-commerce.test.js`, `tests/integration/public-catalog-performance.test.js`, `tests/e2e/phase2b-store.spec.js`, `tests/e2e/phase2b-security.spec.js`, `scripts/verify-phase2b-environment.mjs`, and `scripts/verify-phase2b-integrity.mjs`. See [commerce policy](PHASE_2B_COMMERCE_POLICY.md) for fulfillment, payment, privacy and deployment rules.
