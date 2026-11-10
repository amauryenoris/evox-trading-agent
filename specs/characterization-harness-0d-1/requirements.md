# Requirements — CHANGE 0d-1: characterization harness, scenarios for exits, stops and ghost-close (tests only)

Baseline: HEAD `78b96f2` (full suite 1167 tests in 78 files; characterization 23/23; three known ESLint warnings in `claude-agent.ts`; 18 existing goldens under `src/lib/__tests__/__golden__/claude-agent/`). Line numbers are at that HEAD and are re-read at implementation.

## Functional Requirements

### A. Scope and constraints on files

FR-01: The system shall add scenarios (n) to (z5) to the `runAgentCycle` characterization suite.
FR-02: The system shall change only files under `src/lib/__tests__/` and the folder `specs/characterization-harness-0d-1/`.
FR-03: The system shall not modify any file under `src/` outside `src/lib/__tests__/`.
FR-04: The system shall not modify any workflow, config, settings, hook or documentation file.
FR-05: The system shall not modify, regenerate or delete any of the 18 existing goldens.
FR-06: The system shall record the SHA-256 of every existing golden before and after the work and show them equal.
FR-07: The system shall name each new golden `<letter>-<slug>.json` in `__golden__/claude-agent/`, continuing the lettering after (m).
FR-08: The system shall record each scenario through the existing `buildRecord` (timestamp masking, key sorting) and the existing frozen clock `PINS.nowIso`.
FR-09: The system shall reuse the existing mocks (`mocks.ts`) and helpers (`builders.ts`, `world.ts`) and add new ones only where a scenario needs them, in the same style.
FR-10: The system shall give every new world option a default that reproduces today's behaviour, so that the 23 existing tests produce byte-identical records.
FR-11: The system shall follow the line-ending convention of the existing harness files (LF).
FR-12: The system shall pin what the code does today and shall not fix any behaviour.
FR-13: The system shall mark a behaviour that looks wrong as a "QUIRK" in the scenario title and in the review.
FR-14: The system shall stop on a scenario that cannot be built without changing `src/`, explain why, and list it as not covered.

### B. Ghost-close scenarios

FR-15: Scenario (n) shall cover a ghost-close with a loss and no existing cooldown (`claude-agent.ts:1196-1250`): `evaluateClosedTrade`, `recordSelectionOutcome`, `removeOpenPositionContext`, an agent_log entry with error `ghost_close`, and a `STOP_LOSS` cooldown write.
FR-16: Scenario (o) shall cover a ghost-close with a loss when a cooldown already exists for the symbol, taking the `COOLDOWN_SKIP` branch (`:1258-1262`) with no `upsert`.
FR-17: Scenario (p) shall cover a ghost-close with a profit whose sell order id equals `ctx.trailingStopOrderId`, writing reason `TRAILING_STOP` (`:1263-1278`).
FR-18: Scenario (q) shall cover a ghost-close with a profit whose sell order is not the trailing stop, writing reason `GHOST_CLOSE_PROFIT`, and shall record in its title that `GHOST_CLOSE_PROFIT` is not a member of `ExitReason`.
FR-19: Scenario (r) shall cover a ghost-close where `tradeEvaluationExists` returns true: the audit-trail-only branch (`:1207-1211`), with no second `evaluateClosedTrade`.
FR-20: Scenario (s) shall cover a symbol closed by ghost-close this cycle that is also in the watchlist: skipped with `GTC_STOP` (`:1321`, `:1404-1409`) and with no Claude call and no order.
FR-21: Scenario (t) shall cover a watchlist symbol with an active cooldown row: skipped (`:1360-1372`, `:1404-1409`) and with no Claude call.
FR-22: The system shall assert, in the body of scenarios (n), (o), (p) and (q), the raw `until` value of each `cooldown.upsert` call, because the golden masks timestamps.

### C. Profit-floor and trailing-stop scenarios

FR-23: Scenario (u) shall cover the MEAN_REVERSION profit floor activation at a high of +5% or more (`:576-621`): the old stop is cancelled, a new stop is submitted, and `updatePositionContext` and `updatePositionProtectiveStop` are called.
FR-24: Scenario (u) shall assert the order calls and the persisted stop snapshot, and shall not assert exact dates.
FR-25: Scenario (v) shall cover the profit-floor sell-now path (`handleFloorSellNow`, `:562-574`): price already below the computed floor, selling instead of replacing.
FR-26: Scenario (w) shall cover a profit-floor replacement where the cancel fails (outcome `cancel_failed`, `:487-505`).
FR-27: Scenario (w) shall cover, as a separate case, a replacement where the cancel succeeds and the submit fails after the retry (outcome `naked`, `logNakedStopAlert`, error `trailing_stop_naked`, `:463-474`, `:519`).
FR-28: Scenario (x) shall cover the ATR trailing activation for a `TREND_PULLBACK_3DAY` context at the activation threshold of `protective-stop.ts` (`TRAILING_ACTIVATION_PCT`).
FR-29: Scenario (x) shall cover the same for an `EMA_RECLAIM` context.
FR-30: Scenario (x) shall cover the replacement of the Capa A stop by the trailing stop-limit order and the saved `trailingStopOrderId`.

### D. Exit-rule scenarios

FR-31: Scenario (y) shall cover `TREND_PULLBACK` exiting with reason `EMA_FAILURE` when price falls below EMA50 (`:212-218`).
FR-32: Scenario (y) shall cover `EMA_RECLAIM` exiting with reason `EMA_FAILURE` when price falls below EMA50 (`:228-234`).
FR-33: Scenario (y) shall cover `TREND_ZLE05` exiting at z-score >= 1.25 (`:220-226`) and not exiting on an EMA50 break.
FR-34: Scenario (y) shall cover `TREND_PULLBACK_3DAY` exiting on an SMA5 reclaim, extending the existing coverage only where a branch is missing.
FR-35: Scenario (z1) shall cover the profit target at 10% for a normal setup, just below the target and at the target.
FR-36: Scenario (z1) shall cover the profit target at 5% for `TREND_ZLE05`, just below the target and at the target.
FR-37: Scenario (z2) shall cover a position open 20 or more trading days: a `TIME_STOP` sell with no cooldown written.
FR-38: Scenario (z2) shall cover, as a separate case, an invalid `buyTimestamp`: no sell, and the `[TIME_STOP_SKIPPED_INVALID_TIMESTAMP]` warning asserted with a `console.warn` spy in the test body.
FR-39: Scenario (z3) shall cover `enforceStopLosses` (Capa B, `:664-699`): a held position down 5% or more is closed and a `STOP_LOSS` cooldown is written with the next-third-trading-day date.
FR-40: Scenario (z4) shall cover an orphaned position with no context row and no protecting sell order: a stop is submitted, the context is backfilled with the `[AUTO-RECONCILED]` text and the `orphaned_position_reconciled` entry is logged (`:124-190`).
FR-41: Scenario (z4) shall cover, as a separate case, an orphaned position that already has a sell order: no new stop is submitted.
FR-42: Scenario (z5) shall cover a held position whose indicators have no Kalman in the cache: the `exit_rules_skip` entry is logged and the loop continues (`:105-116`).

### E. Harness support changes (tests only)

FR-43: The system shall allow the world to script the latest sell order per symbol (id, fill price, fill time), which `getLatestSellOrder` returns today as `null`.
FR-44: The system shall allow the world to script `tradeEvaluationExists` per symbol, which returns `false` today.
FR-45: The system shall allow the world to script the open and filled order lists returned by `getOrders`, which returns `[]` today.
FR-46: The system shall allow the world to script a failure of `cancelOrder` and of `submitStopOrder` per symbol.
FR-47: The system shall keep the recorded call shape of every existing mock unchanged, so that existing records do not change.

### F. Stability and verification

FR-48: The system shall record each new golden by running the scenario once, then read the golden and check it against the code path before accepting it.
FR-49: The system shall state in the review, for each golden, what it pins; a scenario shall not count as covered merely because its golden was recorded.
FR-50: The system shall run the characterization file three times and show identical results with no change to any golden.
FR-51: The system shall pass `tsc --noEmit`.
FR-52: The system shall pass the full Vitest suite and report the count against 1167 plus the new tests.
FR-53: The system shall run ESLint on every touched test file and report any warning that is not in the baseline.
FR-54: The system shall show in `git diff --name-only` and `git status` only files under `src/lib/__tests__/**` and the new spec folder.
FR-55: The system shall run the coverage report for `src/lib/claude-agent.ts` before and after and report the delta in statements and branches.
FR-56: The system shall list the lines and branches of the exit, stop and ghost-close regions that are still uncovered after the change.
FR-57: The system shall write `specs/characterization-harness-0d-1/review.md` with a table scenario -> code path (`file:line`) -> what the golden pins -> QUIRK.
FR-58: The system shall list in the final report the scenarios added, the scenarios not feasible without `src/` changes, the coverage delta, the quirks and anything not verified.
FR-59: The system shall not commit or push.

## Non-Functional Requirements

NFR-01: The new goldens shall not depend on wall-clock time, host time zone, ordering of asynchronous work or random ids.
NFR-02: The new scenarios shall make no network call and use no key.
NFR-03: The new test code shall follow the existing patterns (AAA where assertions are added, `installHarness`, `pump`, `runAndRecord`).
NFR-04: The characterization file shall remain readable: scenarios are grouped in `describe` blocks by theme.

## Constraints

C-01: This change shall not modify the Protected Zone; `claude-agent.ts` is only read.
C-02: The system shall not touch `specs/docs-5-selector-criteria/tasks.md`; it stays modified and uncommitted, and its SHA-256 is recorded before and after.
C-03: The system shall not fix any quirk it finds.
C-04: The system shall not commit, push, branch or open a PR.

## Out of Scope

- Any change to `claude-agent.ts` or any other file under `src/` outside `src/lib/__tests__/`.
- Scenarios for entries, holds, rotation, ranking and IOC (already covered by (a) to (m)).
- Direct unit tests of helpers (already covered by `exit-cooldown.test.ts` and `time-stop-invalid-timestamp.test.ts`).
- Closing `specs/docs-5-selector-criteria/tasks.md`.
- Fixing the quirks found.
