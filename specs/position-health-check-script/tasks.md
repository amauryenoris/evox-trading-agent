# Tasks — Position Health Monitor: the Health-Check Script

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed: **None** — new script + one
      `package.json` line only
- [X] Database migrations drafted: **None required** — table already exists
      (Prompt 2/4)

---

## Implementation Checklist

### Phase 1 — Script skeleton

- [x] T-01: Create `scripts/position-health-check.ts` with a header comment
      (purpose, methodology, dry-run vs. live invocation — matching the
      style of `scripts/backfill-spx-regime.ts`'s header).
- [x] T-02: Add imports:
      ```ts
      import { createClient } from '@supabase/supabase-js'
      import { getBars } from '../src/lib/alpaca.js'
      import { calculateAllIndicators } from '../src/lib/indicators.js'
      import { getAdxBucket, getMacdBucket, getZBucket, computeSpxSnapshot } from '../src/lib/state-fingerprint.js'
      import { getOpenPositionContexts } from '../src/lib/db.js'
      import type { OpenPositionContext } from '../src/lib/types.js'
      ```
      (`.js` extensions per design.md's `run-cycle.ts` precedent.)
- [x] T-03: Add the Supabase client construction:
      `const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)`.
- [x] T-04: Add the `toZBucketSignalType()` helper exactly as specified in
      design.md (normalizes `OpenPositionContext['signalType']` to the
      4-value-or-null union `getZBucket` accepts, mapping `'TREND'` and
      `undefined` to `null`).

### Phase 2 — Core computation logic

- [x] T-05: In `main()`, create `const snapshotTimestamp = new Date().toISOString()`
      as the very first line, before any fetch.
- [x] T-06: Fetch open positions: `const openPositions = await getOpenPositionContexts()`.
- [x] T-07: Fetch SPY bars once, with graceful degradation:
      ```ts
      const spyBars = await getBars('SPY', '1Day', 400).catch((err) => {
        console.error('[HEALTH_CHECK_ERROR] SPY: failed bars fetch:', err)
        return []
      })
      if (spyBars.length < 200) {
        console.error(`[HEALTH_CHECK_ERROR] SPY: insufficient bars fetch (${spyBars.length})`)
      }
      const spxSnapshot = spyBars.length >= 200
        ? computeSpxSnapshot(spyBars)
        : { spx_price: null, spx_sma50: null, spx_sma200: null, spx_regime: null }
      ```
- [x] T-08: Initialize `const rows: Record<string, unknown>[] = []`,
      `let processed = 0`, `let failed = 0`.
- [x] T-09: Loop over `openPositions`. For each `ctx`, wrap the per-symbol
      `getBars(ctx.symbol, '1Day', 400)` call in try/catch; on catch or on
      `bars.length < 200`, log `[HEALTH_CHECK_ERROR] ${symbol}: ...`,
      increment `failed`, `continue`.
- [x] T-10: Compute `currentIndicators = calculateAllIndicators(bars)` and
      derive `current_adx_bucket`/`current_macd_bucket`/`current_z_bucket`/
      `current_spx_regime` exactly per design.md's data flow (using
      `toZBucketSignalType(ctx.signalType)` for the z-bucket call).
- [x] T-11: Read entry-time fields defensively using the
      `Record<string, unknown>` + `typeof`-narrowing pattern from
      `learning.ts:73-90` (no `any`). If the cast object's
      `state_fingerprint` key is absent entirely, log an info-level line
      (not `console.error`) noting the position predates SF-B.
- [x] T-12: Compute `days_since_entry` using the replicated
      `getTradingDaysOpen` formula on `ctx.buyTimestamp`.
- [x] T-13: Build the row object with all 17 `position_health_snapshots`
      columns (`symbol`, `position_buy_timestamp`, `snapshot_timestamp`,
      4 `entry_*`, 4 `current_*_bucket`/`current_spx_regime`,
      `current_adx`, `current_macd_histogram`, `current_z_score`,
      `current_price`, `days_since_entry`), push into `rows`, increment
      `processed`, and log the `[HEALTH_CHECK] ${symbol}: entry=... current=...`
      comparison line.

### Phase 3 — Insert / dry-run logic

- [x] T-14: After the loop, if `rows.length === 0`: log
      `[HEALTH_CHECK_DONE] processed=0 inserted=0 failed=${failed}` and
      `return` — no `.insert()` call anywhere in this branch.
- [x] T-15: Else if dry-run (`process.env.RUN_HEALTH_CHECK !== 'true'`):
      `console.log(JSON.stringify(rows, null, 2))`, then log
      `[HEALTH_CHECK_DONE] processed=${processed} failed=${failed} inserted=0`.
- [x] T-16: Else (live mode, `rows.length > 0`): single
      `const { error } = await db.from('position_health_snapshots').insert(rows)`.
      On error: log `[HEALTH_CHECK_ERROR] batch insert failed: ${error.message}`
      and log `inserted=0` in the DONE line. On success: log
      `[HEALTH_CHECK_DONE] processed=${processed} failed=${failed} inserted=${rows.length}`.

### Phase 4 — package.json

- [x] T-17: Add `"health-check": "tsx scripts/position-health-check.ts"` to
      the `scripts` block in `package.json`, alongside `cycle`/`exit-only`/`report`.

### Phase 5 — Verification

- [x] T-18: Run `npx tsc --noEmit` — must pass with zero errors (in
      particular, confirms the `toZBucketSignalType` normalization and the
      `Record<string, unknown>` state-fingerprint read both type-check
      cleanly with no `any`).
- [x] T-19: Record the current row count of `position_health_snapshots`
      (read-only query). Recorded: 0 rows.
- [x] T-20: Run `npx tsx --env-file=.env.local scripts/position-health-check.ts`
      (dry-run, default). Confirmed: 3 open positions (INTC, AAPL, AMC), one
      `[HEALTH_CHECK]` comparison line each, full `rows` array printed, DONE
      line `processed=3 failed=0 inserted=0`. Re-queried
      `position_health_snapshots`: still 0 rows — unchanged from T-19,
      proving the dry run performed zero writes.
- [x] T-21: Code-review confirmation (static, not live-triggered — forcing
      these conditions against production data is unsafe/impractical):
      - The `rows.length === 0` branch contains no `.insert()` call
        anywhere in its code path (T-14).
      - The `<200`-bars and try/catch branches for per-symbol fetch both
        `continue` rather than `return`/`throw` (T-09) — confirms one bad
        symbol cannot abort the run for others.
      - The SPY-fetch-failure branch (T-07) produces an all-null
        `spxSnapshot` rather than throwing.
      - The entry-time field reads (T-11) use optional-chaining/`typeof`
        guards with no path that dereferences `undefined`.
      - The live-mode insert (T-16) has its error branch logging
        explicitly, not an empty `catch {}`.
      If any currently-open position happens to have no `state_fingerprint`
      (pre-SF-B) or the SPY/symbol bars fetch happens to genuinely fail
      during T-20's dry run, note the real observed log line here as
      additional live confirmation — but do not force these conditions
      artificially against production data.

      All 5 points confirmed by direct code inspection of
      `scripts/position-health-check.ts`:
      1. The `rows.length === 0` branch (`if (rows.length === 0) { ...; return }`)
         contains no `.insert()` call anywhere before its `return`.
      2. Both the per-symbol `catch` block and the `bars.length < 200` block
         use `continue`, never `return`/`throw`.
      3. The SPY fetch's `.catch(() => [])` plus the `spyBars.length >= 200`
         ternary produces an all-null `spxSnapshot` object; no throw path.
      4. `readEntryFingerprint()` guards `fingerprint` with `if (!fingerprint)`
         before any property access — no unguarded dereference.
      5. The live-mode insert checks `if (error)` (Supabase's
         return-not-throw convention) and calls `console.error` explicitly
         — not an empty `catch {}`.
      T-20's live dry run did not naturally trigger the missing-fingerprint,
      SPY-failure, or per-symbol-failure paths (all 3 open positions had a
      fingerprint, SPY fetch succeeded with 400 bars, all symbols had
      sufficient history) — this is expected given current data, and those
      paths remain verified by code review only, per this task's own scope.
- [x] T-22: Amaury approved; ran
      `RUN_HEALTH_CHECK=true npx tsx --env-file=.env.local scripts/position-health-check.ts`.
      Result: `[HEALTH_CHECK_DONE] processed=3 failed=0 inserted=3`.
      Re-queried `position_health_snapshots`: row count went 0 → 3
      (matches T-19 baseline + `inserted=3`), all 3 new rows share one
      identical `snapshot_timestamp` (`2026-07-08T20:59:00.022Z`).
- [x] T-23: Confirmed via `git status --porcelain`: `M package.json`,
      `?? scripts/position-health-check.ts`,
      `?? specs/position-health-check-script/`. No `db.ts`, `learning.ts`,
      or `claude-agent.ts` touched.

---

## Post-Implementation

- [x] Run `/review position-health-check-script` to verify implementation
      matches spec
- [x] Confirm Protected Zone files unchanged (expected: none touched)

---

## Estimated Complexity

**Medium** — No new data source or schema, but real orchestration logic:
one per-run SPY fetch, one per-position fetch loop with two independent
failure modes (fetch exception, insufficient bars) that must degrade
gracefully without aborting, a type-unsafe field read that must be handled
without `any`, a `getZBucket` signal-type mismatch requiring a small
normalization helper, and a strict single-atomic-batch-insert requirement
with an explicit empty-array guard. All building blocks are already pure
and tested elsewhere; the risk here is in correctly wiring them together
under the stated failure-handling rules, not in the individual pieces.
