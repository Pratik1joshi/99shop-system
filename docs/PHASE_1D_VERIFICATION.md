# Phase 1D verification — 2026-09-26

**Status: partial implementation. Phase 1D acceptance is not yet met.** This report separates working Retail paths from legacy screens and remaining gaps.

| # | Requested area | Current result |
| --- | --- | --- |
| 1 | Phase 1C gaps | Exact serial count variance and adjustments, real specialist roles, and tablet journeys implemented and tested. |
| 2 | Customer workspace | New paginated Retail list and customer detail at `/admin/retail-customers`. |
| 3 | Customer timeline | Source backed sales, returns, collections, store credit, and loyalty events; capped per source. Exchange and manual adjustment event coverage remains incomplete. |
| 4 | Receivables | New paginated open Retail AR workspace with source sale and allocations. |
| 5 | Collections | One atomic payment can allocate across multiple sales; partial collection and idempotent retry tested. A collection receipt can be reopened and printed. |
| 6 | Credit policy | Retail checkout enforces configured positive limits against posted Retail due. A Manager or Owner can complete an over-limit sale with a required reason; the sale, exposure, limit, actor, and time are audited. Zero remains the existing unlimited setting. |
| 7 | Statements | Retail customer statement reads posted customer tagged AR journal lines with opening, charges, reductions, and closing balance. |
| 8 | Store credit | Separate balance and transaction history, authorized signed correction form, source-linked liability journal, and idempotent correction retries. Existing canonical issue and redemption service retained. |
| 9 | Loyalty | Separate points balance, history, tier, rule explanation, and Admin settings with an audit table. |
| 10 | Customer attention | Receivable, over limit, store credit, VIP, and inactive filters plus bounded top-10 worklists for outstanding debt, over-limit customers, balances older than 30 days, and largest store credit. |
| 11 | Registers and cash | Retail sales, collections, and refunds classified in closing cash breakdown; Retail day activity shown. A new Registers & Cash workspace places business-day control and cash-drawer movement views behind one status header and tab navigation. Owner and Cashier browser paths passed. Their underlying sessions remain separate. |
| 12 | Cash movement | Existing journal backed cash drawer workflow remains active. |
| 13 | Cash count | Existing counted versus expected workflow and blind count policy remain active. No new variance approval workflow was added. |
| 14 | Close and reopen | Existing session and same day business day behavior retained; existing tests pass. |
| 15 | Expenses | Existing finance expense entry and correction routes remain active. Retail specific UX consolidation remains. |
| 16 | Banking | Existing account and movement screen linked from Finance. |
| 17 | Bank reconciliation | Existing manual reconciliation screen linked from Finance; no imported statement flow added. |
| 18 | Finance workspace | New Retail plus GL overview at `/admin/retail-finance`, with links to operational and accounting views. |
| 19 | Owner Finance | Owner sees Retail activity, cash/bank/AR/AP/inventory/store credit GL balances, and trial balance status. |
| 20 | Accountant | Real Accountant login lands in Finance; direct API persona test confirms access to journal, trial balance, payables, bank, and Retail sale sources before the cashier cash reveal cutoff. |
| 21 | Chart of accounts | Existing account workspace linked. |
| 22 | Journal explorer | Existing bounded journal explorer linked. |
| 23 | General ledger | Existing account ledger linked; accepts an account code and date range from statements. |
| 24 | Trial balance | Existing journal derived trial balance, also summarized in Finance overview. |
| 25 | Profit and loss | Existing statement; account rows link to the corresponding general ledger, whose Retail sale and collection line details link to the operational source. |
| 26 | Balance sheet | Existing journal derived statement linked. |
| 27 | Cash flow | Existing journal derived statement linked. |
| 28 | Source drill down | Sale and collection journals and account-ledger line details link to their Retail sources. Accountant can read those sources through server gates. Other source types still lack direct drill down. |
| 29 | Reconciliation | New Retail sale due versus Retail AR journal control. Existing inventory, sales, AR/AP, and store credit checks retained. |
| 30 | Financial attention | Finance shows unbalanced trial balance, stale register, receivables older than 30 days, over-limit customer count, outstanding GL payable, and reconciliation link. Cash variance and unreconciled bank item worklists remain incomplete. |
| 31 | Manager role | Real server gated Manager persona and browser test. |
| 32 | Accountant role | Real server gated Accountant persona and browser test. |
| 33 | Financial security | Cashier denied new Retail Finance, write off, and owner only loyalty settings in browser tests; Accountant access to GL, statements, payables, bank, expense and customer finance routes is permission gated. Older shared routes still need a full audit. |
| 34 | Customer security | Cashier cannot read internal notes, edit credit controls, or delete customer records; browser tested. |
| 35 | Global search | Customer links point to Retail profiles; added collection, expense, and journal groups with permission gates. |
| 36 | Responsive and accessibility | Customer and Finance route smoke passed desktop, tablet, and mobile. Complete accessibility audit remains. |
| 37 | Performance | Existing 10,000 SKU / 1,000,000 movement stock benchmarks passed in Phase 1C; fresh 10,000 SKU search two page result was 851 ms. Customer/Finance load testing remains. |
| 38 | Audit coverage | Collections, write offs, and manual store-credit corrections use idempotency keys and journal links; loyalty rule changes audit old/new values and actor; credit override records sale, exposure, limit, reason, actor, and time. Full Finance audit inventory remains. |
| 39 | Persona E2E | Owner, Manager, Cashier, Inventory Staff, Purchasing Staff, and Accountant paths exercised. |
| 40 | Reconciliation | Seeded browser PostgreSQL database reports zero differences after collection and operations transactions. |
| 41 | Gates | 326 unit tests passed; fresh PostgreSQL integration suites passed through migration 098 (1, 6, and 7 tests); lint passed with 0 errors and 17 existing warnings; final production build passed. |
| 42 | Legacy navigation | Active Customers and Finance navigation points to new Retail workspaces. Legacy routes remain accessible for functions not yet migrated. |
| 43 | Substantial files | `lib/retail-receivables.js`, `lib/retail-customers.js`, `lib/retail-customer-statements.js`, `lib/business-days.js`, `lib/retail-reconciliation.js`, `lib/retail-sales.js`, `lib/retail-store-credit.js`, Retail customer/AR/Finance routes and pages, staff roles, serial count and adjustment services, migrations 093–098. |
| 44 | Visual routes | `/admin/retail-customers`, `/admin/retail-customers/1`, `/admin/retail-receivables`, `/admin/retail-finance`, `/admin/retail-loyalty`, `/admin/retail-registers`. |
| 45 | Known issues | Timeline and journal source drill down are incomplete; the Register tabs reuse legacy forms and cash variance review remains limited; Expenses and Banking retain legacy UX; bank exception attention, full accessibility and load coverage remain. Credit limit zero retains unlimited legacy meaning. |
| 46 | Next phase | Finish the Phase 1D gaps above before starting Overview, Insights, or Control transformation. |

## Financial checks

- Multi sale collection: Rs 50 settled across two Rs 100 credit sales in browser E2E; Retail revenue unchanged and AR decreased by Rs 50. The customer statement closed at Rs 150.
- Retail closing summary: unit test confirms a Retail cash sale increments cash collections and Retail sale count without changing credit collection classification.
- Retail reconciliation: `reconciled: true`, zero failed checks, zero inventory projection differences on the seeded PostgreSQL E2E database after collection, credit override, and store-credit correction browser transactions.
- Fresh migrations through `098_store_credit_adjustment_idempotency.sql` passed. The prior integration test assumed a fixed 20:30 cash cutoff; it now inserts a test cutoff explicitly so the result does not depend on local time.
- Credit policy: SQLite unit test rejects an over-limit sale without approval, records one override on completion, and replays without duplication. Desktop browser test confirms the Manager persona can access Billing, receives 409 without approval, completes with a reason, and reads the sale audit.
- Store credit correction: focused unit test confirms one journal and transaction on retry, rejects reused keys with changed terms, and posts a signed reversal against the liability.
- Store credit correction browser test: Owner posts and retries the same key, reads one Rs 25 balance, and sees the authorized correction control in the customer detail.
