# Phase 1E status — 2026-09-26

**Verdict: incomplete. Phase 1 acceptance has not passed.**

Subsequent verification and remaining release blockers are recorded in [Phase 1F verification](PHASE_1F_VERIFICATION.md). The PostgreSQL environment blocker below has been resolved; the full Phase 1 acceptance verdict remains FAIL.

## Implemented in this pass

- `/admin/dashboard` now uses a source-backed owner/manager Overview. Sales, returns, profit and inventory come from the existing Retail analytics service; cash balance comes from the posted Cash account. Definitions, scopes, cutoffs and drill targets are carried with each metric.
- `/admin/retail-attention` shows bounded issue classes from stock, overdue Retail receivables, stale registers and reconciliation differences. A class appears once and links to a workspace. The header attention action opens this view.
- `/api/admin/retail-overview` is limited to Admin and Manager. Manager cash balance follows the configured cash reveal policy; manager links avoid unauthorized GL/AP routes. The older aggregate dashboard API no longer serves Cashiers because its response contains profit, COGS and payable figures.
- Four unit tests cover metric definitions, attention deduplication, acknowledged register state, and manager cash/link policy.

## Verified

- Unit: 330 passed, 0 failed.
- Lint: 0 errors, 17 existing warnings.
- Production build: passed with `NEXT_DIST_DIR=.next-phase1e` and workspace-local temp directory.
- PostgreSQL integration: **not run**. The test runner requires an explicit isolated `TEST_DATABASE_URL`; the existing local cluster did not provide a known test role to the session.
- Browser persona, accessibility and load tests: **not run in this pass**.

## Required before a Phase 1 YES verdict

The Phase 1D gaps recorded in `PHASE_1D_VERIFICATION.md` remain: complete customer timeline and journal source links, cash variance review, modern Expenses and Banking workspaces, bank exception attention, and measured accessibility/performance work. Phase 1E also still needs the unified Transaction Explorer, full Audit and Settings centers, a curated Insights/Reports experience, cross-module drill consistency, a server-verified role matrix, and six-persona browser acceptance. Overview currently has six attention classes and eight metrics; this is the first source-backed control surface, not final ERP unification.
