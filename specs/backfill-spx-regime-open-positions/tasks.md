# Tasks — Backfill SPX Regime into open_position_contexts

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] OQ-01 resolved (per-row buy_timestamp-anchored methodology confirmed)
- [X] OQ-02 resolved (per-field merge / preserve-existing-non-null confirmed)
- [X] OQ-03 resolved (`scripts/lib/` location confirmed)
- [X] Protected Zone changes confirmed: **None required**
- [X] Database migrations: **None required**

## Implementation Checklist

### Phase 1 — Shared helpers (extracted, pure functions)
- [x] T-01: Create `scripts/lib/spx-snapshot-helpers.ts` exporting `toEtDate(isoTimestamp: string): string` (copied logic from `backfill-spx-regime.ts`)
- [x] T-02: Add `smaAtIndex(closes: number[], index: number, period: number): number | null` to the same module
- [x] T-03: Add `findPriorBarIndex(bars: {date: string}[], etDate: string): number` (returns `-1` if none found) — extracts the reverse-scan loop currently inlined in `backfill-spx-regime.ts`
- [x] T-04: Add `classifyRegime(spyClose: number, sma50: number, sma200: number): 'BULL' | 'CAUTION' | 'BEAR'`

### Phase 2 — New backfill script
- [x] T-05: Create `scripts/backfill-spx-regime-open-positions.ts` — fetch all `open_position_contexts` rows
- [x] T-06: Classify rows into candidates (≥1 null `spx_*` field) vs. already-complete; early-exit with `[BACKFILL_OPC_DRY_DONE]`/`[BACKFILL_OPC_DONE]` (wouldUpdate=0/updated=0) if no candidates
- [x] T-07: Compute SPY fetch window from candidates only (`min(buy_timestamp)-400d` to `max(buy_timestamp)+5d`)
- [x] T-08: Single bulk Alpaca SPY bars fetch (same endpoint/params shape as reference script); `[BACKFILL_OPC_ERROR]` + exit 1 on failure
- [x] T-09: Per-candidate: ET-date conversion, prior-bar lookup, SMA50/SMA200 computation, regime classification — using Phase 1 helpers
- [x] T-10: Per-candidate: build the per-field merge object (only overwrite null fields; preserve existing non-null `spx_*` and all non-`spx_*` keys in `indicators`)
- [x] T-11: Dry-run mode (default): log `[BACKFILL_OPC_DRY]` per row, no Supabase writes
- [x] T-12: Live mode (`RUN_BACKFILL=true`): `UPDATE open_position_contexts SET indicators = merged WHERE symbol = row.symbol`; log `[BACKFILL_OPC]` on success, `[BACKFILL_OPC_ROW_ERROR]` + continue on row failure
- [x] T-13: `[BACKFILL_OPC_SKIP] reason=no_prior_bar` / `reason=insufficient_bars` handling matching FR-06/FR-08
- [x] T-14: Final summary log (`[BACKFILL_OPC_DRY_DONE]` / `[BACKFILL_OPC_DONE]`)

### Phase 3 — Testing
- [x] T-15: Unit tests for `toEtDate`, `smaAtIndex`, `findPriorBarIndex`, `classifyRegime` in `src/lib/__tests__/spx-snapshot-helpers.test.ts` (AAA pattern, no mocks needed — pure functions)
- [x] T-16: Verify 80% coverage on the new helper module (13/13 tests pass, all branches of all 4 functions exercised; vitest.config.ts's `coverage.include` only tracks `src/lib/db.ts` and was not changed — out of scope per design.md — so this is asserted by branch inspection, not the coverage tool)

### Phase 4 — Dry-run validation against live data
- [x] T-17: Run `npx tsx --env-file=.env.local scripts/backfill-spx-regime-open-positions.ts` (dry-run, default) against the real Supabase project
- [x] T-18: Live state shifted since the spec was written (positions open/close constantly, as flagged in requirements.md): COP closed and is no longer in the table; a new position OXY opened and arrived already-complete (post-`bbafb30` fix). Actual dry-run output: `XOM` resolves all 4 fields (`spy=741.67 sma50=722.75 sma200=686.28 regime=BULL`); `CVX` resolves only `spx_sma50/spx_sma200/spx_regime` (`fields_updated=[spx_sma50,spx_sma200,spx_regime]`) — its existing `spx_price=733.58` is correctly **not** in `fields_updated` and stays untouched, even though the recomputed reference close (`spy=733.62`) differs slightly, confirming the per-field-preserve design (OQ-02) works as intended.
- [x] T-19: AAPL, META, and OXY all confirmed already-complete — zero candidates among them, none touched by the dry run (`wouldUpdate=2 wouldSkip=0`, only XOM+CVX counted).
- [x] T-20: Amaury confirmed go-ahead; live run executed (`RUN_BACKFILL=true`) — `[BACKFILL_OPC_DONE] updated=2 skipped=0 failed=0`

## Post-Implementation

- [x] Run `/review backfill-spx-regime-open-positions` to verify implementation matches spec — see `review.md`
- [x] Confirm Protected Zone files unchanged (`git diff --stat` empty for `config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`)
- [x] Confirm `scripts/backfill-spx-regime.ts` byte-for-byte unchanged (`git diff --stat` empty for that file)
- [x] After a confirmed live run: re-query `open_position_contexts` to verify the affected fields now match expected values, and that no `indicators` keys were lost (kalman/macd/adx/etc. still present) — confirmed: XOM and CVX both fully populated, CVX's `spx_price=733.58` preserved exactly (not overwritten by the recomputed `733.62`), all rows retain `kalman`/`macd`/`adx`

## Estimated Complexity

**Low–Medium** — the core math (ET conversion, SMA, regime) is a proven, working copy from `backfill-spx-regime.ts`; the only genuinely new logic is the per-field null-coalescing merge (Phase 2, T-10) and the all-rows-fetch-then-filter-in-JS approach, both of which are small and isolated. No Protected Zone, no migration, no new db.ts function.
