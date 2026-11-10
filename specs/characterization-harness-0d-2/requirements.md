# Requirements — CHANGE 0d-2: characterization harness, remaining setups, partial fills, stop-submit failure and the branches left over from 0d-1 (tests only)

Baseline: HEAD `bfc1f7f` (characterization 44/44; full suite 1188 tests in 78 files; 39 goldens under `src/lib/__tests__/__golden__/claude-agent/`; `claude-agent.ts` covered by the characterization file at 699/918 statements and 515/814 branches). Line numbers are at that HEAD and are re-read at implementation.

## Functional Requirements

### A. Scope and constraints on files (same rules as 0d-1)

FR-01: The system shall add scenarios (aa) to (an) to the `runAgentCycle` characterization suite.
FR-02: The system shall change only files under `src/lib/__tests__/` and the folder `specs/characterization-harness-0d-2/`.
FR-03: The system shall not modify any file under `src/` outside `src/lib/__tests__/`.
FR-04: The system shall not modify any workflow, config, settings, hook or documentation file.
FR-05: The system shall not modify, regenerate or delete any of the 39 existing goldens.
FR-06: The system shall record the SHA-256 of all 39 existing goldens and of `specs/docs-5-selector-criteria/tasks.md` before the work and show them equal after it.
FR-07: The system shall name each new golden `<letter>-<slug>.json` (and `<letter>-<slug>.prompt.txt` for prompt snapshots), continuing the lettering after (z5).
FR-08: The system shall record each scenario through the existing `buildRecord`, the frozen clock `PINS.nowIso` and the existing mocks.
FR-09: The system shall extend `world.ts` (and `mocks.ts` where a mock needs a hook) only with optional scripting whose defaults reproduce today's behaviour.
FR-10: The system shall follow the LF convention of the harness files.
FR-11: The system shall pin what the code does and shall not fix any behaviour.
FR-12: The system shall mark a behaviour that looks wrong as a "QUIRK" in the scenario title and in the review.
FR-13: The system shall stop on a scenario that cannot be built without changing `src/`, explain why, and list it as not covered.

### B. Buys by setup

FR-14: Scenario (aa) shall cover a `TREND_PULLBACK` BUY (`claude-agent.ts:1581-1600` for the setup, `:1719-1729` for the classification): uptrend structure, z-score <= 0, EMA50 slope rising, ADX >= 20 and MACD histogram > -2.0.
FR-15: Scenario (aa) shall pin the classification, the Claude call, the sizing, the IOC order, the GTC stop (`:2084`), the saved context with `signalType` `TREND_PULLBACK` (`:2139-2150`) and the `tp_population_bucket` field.
FR-16: Scenario (aa) shall assert, with a `console.log` spy, the `[TREND_PULLBACK_STATS]` line (`:2226`) because console output is not recorded.
FR-17: Scenario (ab) shall cover a `TREND_ZLE05` BUY (`:1623-1633`): 0 < z-score <= 1.25, ADX >= 18 (or >= 15 with histogram > 0.25) and histogram > 0.
FR-18: Scenario (ab) shall pin the same items as (aa), with `signalType` `TREND_ZLE05` and the `zle05_population_bucket` field (`:2127-2130`).
FR-19: Scenario (ac) shall cover an `EMA_RECLAIM` BUY (`:1654-1665`, `:1686`).
FR-20: Scenario (ac) shall pin the `0.75` setup size factor (`position-sizing.ts:10`, `:79-80`) in the quantity and in the saved context.
FR-21: The system shall add a prompt snapshot (`.prompt.txt`) for each of (aa), (ab) and (ac), as scenarios (a), (b) and (m) have.
FR-22: Scenario (ad-1) shall cover a `TREND_PULLBACK` candidate blocked by the MACD floor (`:1603`), and shall pin the resulting HOLD ("no setup", `:1805-1818`) with Claude not called.
FR-23: Scenario (ad-1) shall assert the `[TREND_PULLBACK_BLOCKED_MACD]` line with a `console.log` spy.
FR-24: Scenario (ad-2) shall cover a `TREND_ZLE05` candidate with insufficient ADX, ending in the `TREND_QUALITY_FAIL` HOLD (`:1772-1787`), with Claude not called.
FR-25: Scenario (ad-3) shall cover the `EMA_RECLAIM_NEAR` HOLD (`:1750-1769`), with Claude not called.

### C. Order execution

FR-26: Scenario (ae) shall cover an IOC partial fill whose remainder passes the drift gate (`IOC_RETRY_MAX_DRIFT_BPS`) and the size gate (`IOC_RETRY_MIN_REMAINDER_USD`) and is filled by the second order (`:851-905`).
FR-27: Scenario (ae) shall pin both limit orders, the quantity of each, the weighted average fill price, `fillAttempts` in the saved context and the stop quantity (the filled total).
FR-28: Scenario (af-1) shall cover an IOC partial fill whose remainder retry is skipped because the fresh quote has drifted above the limit (`:869-884`).
FR-29: Scenario (af-2) shall cover an IOC partial fill whose remainder retry is skipped because the remainder is below the minimum USD value.
FR-30: Scenarios (af-1) and (af-2) shall pin the partial position, the stop covering only the filled quantity and the single limit order.
FR-31: Scenarios (af-1) and (af-2) shall assert the `[ORDER] ... IOC_PARTIAL_FILL` line (`:2071`) and the `[IOC_RETRY] ... gate check failed` line (`:881`) with a `console.log` spy.
FR-32: Scenario (ag) shall cover a filled BUY whose GTC stop submission fails twice (`:2084-2088`).
FR-33: Scenario (ag) shall pin the `STOP_SUBMIT_FAILED: <reason>` error label, that the context is still saved, and that its `stopOrderId` is undefined.
FR-34: Scenario (ag) shall mark a QUIRK in its title if the position is left unprotected with only the error text on the agent_log entry and no separate alert.

### D. Skips

FR-35: Scenario (ah) shall cover a blacklisted instrument skipped (`:1393-1396`).
FR-36: Scenario (ah) shall cover a symbol with an open position skipped (`:1398-1401`).
FR-37: Scenario (ah) shall cover a symbol with no indicators in the cache, ending in a HOLD with error `Skipped: no indicators available in cache` (`:1417-1431`).

### E. Leftovers from 0d-1

FR-38: Scenario (ai) shall cover the ATR trailing-stop exit of a non-MEAN_REVERSION position whose price falls to the active trailing stop (`:360-372`).
FR-39: Scenario (ai) shall pin the sell, the reason text and the cooldown it writes.
FR-40: Scenario (aj) shall cover a ghost-close with a profit when a cooldown already exists, taking the `COOLDOWN_SKIP` branch (`:1280-1288`) with no `upsert`.
FR-41: Scenario (ak) shall cover the peak-high update for a MEAN_REVERSION position (`:269-276`), with the stored high lower than the scripted peak high.
FR-42: Scenario (ak) shall pin that the new, higher high is persisted in the context.
FR-43: Scenario (al-1) shall cover the orphan buy-timestamp lookup with filled buy orders present, using the latest `filled_at` (`:142-156`).
FR-44: Scenario (al-2) shall cover the same lookup with no filled buy order, falling back to the cycle timestamp (`:157-160`).
FR-45: Scenario (al-2) shall assert the `[RECONCILE] ... no matching filled buy order found` warning with a `console.warn` spy.
FR-46: Scenario (am) shall cover an `UNKNOWN` exit reason in the cooldown loop with `COOLDOWN_UNKNOWN_EXIT_REASON` false (`:1338-1346`).
FR-47: Scenario (am) shall pin that no cooldown is applied to the symbol and shall assert the `[EXIT_COOLDOWN_UNKNOWN_REASON]` warning with a `console.warn` spy.
FR-48: Scenario (an-1) shall cover a `closePosition` failure inside `enforceStopLosses` (`:693-696`).
FR-49: Scenario (an-1) shall pin that no cooldown is written for the symbol.
FR-50: Scenario (an-2) shall cover a context-fetch failure at the start of `enforceStopLosses` (`:668-672`).
FR-51: Scenario (an-2) shall pin that the function returns without closing any position.

### F. Harness support (tests only)

FR-52: The system shall allow the world to script the quantity filled by each limit order of a symbol, as an absolute quantity or as a number of shares left unfilled.
FR-53: The system shall allow the world to script a sequence of quotes per symbol, consumed one per `getQuote` call, falling back to the static quote.
FR-54: The system shall allow the world to script the stored peak high returned by `getPeakHighSinceLastCheck` per symbol.
FR-55: The system shall allow the world to script a failure of `closePosition` per symbol.
FR-56: The system shall allow the world to script a failure of the first read of `getAllOpenPositionContexts`.
FR-57: The system shall allow the world to force the exit-reason mapping of a symbol to `UNKNOWN`, through a hook in `mocks.ts` that passes through to the real `toExitReason` by default.
FR-58: The system shall keep the recorded call shape of every existing mock unchanged.

### G. Stability and verification

FR-59: The system shall record each new golden by running the scenario once, then read the golden against the code path before accepting it.
FR-60: The system shall state in the review, for each golden, what it pins.
FR-61: The system shall run the characterization file three times with identical results and no golden written or changed.
FR-62: The system shall pass `tsc --noEmit`.
FR-63: The system shall pass the full Vitest suite and report the count against 1188 plus the new tests.
FR-64: The system shall run ESLint on the touched test files and the harness folder and report any warning not in the baseline.
FR-65: The system shall show in `git diff --name-only` and `git status` only files under `src/lib/__tests__/**` and the new spec folder.
FR-66: The system shall run the coverage report for `claude-agent.ts` (characterization file only) before and after and report the delta in statements and branches.
FR-67: The system shall list the statements and branches still uncovered in the setup detection, the order execution, `enforceExitRules`, the protective-order helpers and the ghost-close region.
FR-68: The system shall classify each remaining gap as an error-handling catch (low value) or a decision branch (needs a scenario).
FR-69: The system shall write `specs/characterization-harness-0d-2/review.md` with a table scenario -> code path (`file:line`) -> what the golden pins -> QUIRK.
FR-70: The system shall list in the final report the scenarios added, the scenarios not feasible without `src/` changes and why, the coverage delta, the quirks and anything not verified.
FR-71: The system shall not commit or push.

## Non-Functional Requirements

NFR-01: The new goldens shall not depend on wall-clock time, host time zone, asynchronous ordering or random ids.
NFR-02: The new scenarios shall make no network call and use no key.
NFR-03: The new test code shall follow the existing patterns (`installHarness`, `pump`, `runAndRecord`, grouping by `describe`).
NFR-04: Console assertions shall use the spies already installed by `installHarness`.

## Constraints

C-01: This change shall not modify the Protected Zone; `claude-agent.ts` is only read.
C-02: The system shall not touch `specs/docs-5-selector-criteria/tasks.md`.
C-03: The system shall not fix any quirk it finds.
C-04: The system shall not commit, push, branch or open a PR.

## Out of Scope

- Any change to `claude-agent.ts` or any other file under `src/` outside `src/lib/__tests__/`.
- Scenarios already covered by (a) to (z5).
- The ranking-mode execution path (`:2254-2290`) beyond what (l) already pins.
- Error-handling `.catch` callbacks (log-only), unless a scenario above reaches them.
- Closing `specs/docs-5-selector-criteria/tasks.md`.
