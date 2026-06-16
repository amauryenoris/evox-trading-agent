# Requirements — Fix Backfill SPX Cleanup (MEDIUM findings)

## Functional Requirements

FR-01: The system shall log `[BACKFILL_DONE] updated=0 skipped=0 failed=0` when `RUN_BACKFILL=true` and the trade candidate list is empty.

FR-02: The system shall log `[BACKFILL_DRY_DONE] wouldUpdate=0 wouldSkip=0` when `RUN_BACKFILL` is not set and the trade candidate list is empty.

FR-03: The system shall compute the SPY bar date range as: `earliestBuyDate − 400 calendar days` through `latestBuyDate + 5 calendar days`.

## Non-Functional Requirements

NFR-01: All existing log labels (`[BACKFILL_DRY]`, `[BACKFILL]`, `[BACKFILL_DONE]`, `[BACKFILL_DRY_DONE]`, `[BACKFILL_SKIP]`, `[BACKFILL_ERROR]`, `[BACKFILL_ROW_ERROR]`) shall remain unchanged for non-empty runs.

NFR-02: The `tsc --noEmit` check shall pass after these changes with zero errors.

## Constraints

C-01: This feature must not modify the Protected Zone (config.ts, claude-agent.ts, risk-manager.ts, indicators.ts).

C-02: No file in `src/` shall be touched.

C-03: Only two files may be modified: `scripts/backfill-spx-regime.ts` and `specs/backfill-spx-regime/requirements.md`.

C-04: No logic beyond the early-exit block and the `isLive` declaration position shall change in `scripts/backfill-spx-regime.ts`.

## Out of Scope

- Any other findings from the backfill-spx-regime review (LOW severity items).
- Adding `.limit(10000)` defensive cap (separate LOW finding).
- Env-var startup validation (separate LOW finding).
- Supabase MCP token fix.
