# Review Report — CHANGE 0: characterization harness for runAgentCycle (tests only)

**Date**: 2026-11-04
**Reviewer**: Claude (automated)
**Status**: APPROVED

Re-verified at review time: `git status` and `git diff --name-only` (one tracked change, `vitest.config.ts`; everything else new and untracked), `npx tsc --noEmit` (clean), ESLint on the new files and `vitest.config.ts` (clean), the new tests three times (14/14 each, goldens byte-identical before and after), the full suite (72 files, **987/987**), and coverage. Two extra checks run during this review: (1) the new tests with `fetch` and `net.Socket.connect` poisoned to throw (14/14 still pass, so no network use), and (2) one golden converted to CRLF (still passes, so Windows line-ending conversion by git will not break them). Nothing is committed and no live cycle was run.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Run the real `runAgentCycle` with doubles | ✅ | Test imports `runAgentCycle` from `../claude-agent`. |
| FR-02 | Double Alpaca, DB modules, Anthropic, news/market context, selector | ✅ | `mocks.ts`: alpaca, db, db-cooldowns, db-earnings, agent-log, indicators, peak-high, risk-manager, stock-selector, news-intelligence, market-daily-briefing, watchlist-monitor, Anthropic SDK, `learning.evaluateClosedTrade`. |
| FR-03 | No network, no real key | ✅ | Passes with `fetch` and sockets poisoned; keys are `test-*`. |
| FR-04 | Frozen clock | ✅ | `vi.useFakeTimers` + `setSystemTime(2026-11-04T15:30Z)`. |
| FR-05 | Fixed time zone | ✅ | `TZ=UTC` set and restored per test. |
| FR-06 | Counter-based `randomUUID` | ✅ | `crypto` mocked; ids `uuid-0001`... |
| FR-07 | Fixed env, restored after each test | ✅ | `RISK_PCT`, `STOP_LOSS_PCT`, `MAX_POSITIONS`, `MAX_POSITION_SIZE`, keys, `TZ`; `TRADING_WATCHLIST` removed; restore in `afterEach`. |
| FR-08 | No production file modified | ✅ | `git diff --name-only`: only `vitest.config.ts`. |
| FR-09 | Pin `config.ts` constants | ✅ | `ZSCORE_ENTRY_THRESHOLD`, `MAX_SPREAD_BPS`, `INSTRUMENT_BLACKLIST` overridden in the `../config` mock. |
| FR-10 | Pin the z override via a wrapper | ✅ | `computeBuyQuantity` wrapped with `zOverrideEnabled: false`. Flipping it fails 5 scenarios (checked during implementation). |
| FR-11 | A z <= -2 entry in a BUY scenario | ✅ | Scenario (a) z -2.4: 100 shares with the pin off (override on would give 200). |
| FR-12 | Report states the pinned value and why | ✅ | Report section 5. |
| FR-13 | Scenario (a) MR BUY | ✅ | |
| FR-14 | Scenario (b) TREND_PULLBACK_3DAY BUY | ✅ | |
| FR-15 | Scenario (c) MR_RANGING_ADX_GATE | ✅ | Asserts Claude is never called. |
| FR-16 | Scenario (d) spread gate | ✅ | |
| FR-17 | Scenario (e) EARNINGS_BLOCK | ✅ | Asserts Claude is never called. |
| FR-18 | Scenario (f) risk-manager rejection | ✅ | |
| FR-19 | Scenario (g) exit SELL | ✅ | z-score reverted on a MEAN_REVERSION position. |
| FR-20 | Scenario (h) rotation close | ✅ | |
| FR-21 | Scenario (i) no candidates | ✅ | Plus the market-closed variant. |
| FR-22 | Scenario (j) Claude / broker error | ✅ | One scenario covers both. |
| FR-23 | Add STEP 0 scenarios if useful | ✅ | Added a2 (auto-entry), k (IOC zero fill), l (ranking). |
| FR-24 | Stop if a scenario needs a production edit | ✅ | None needed. |
| FR-25 | Capture decision per symbol | ✅ | `decisions` block. |
| FR-26 | Capture orders (symbol, side, qty, type) | ✅ | `orders` block; market closes have `qty: null`. |
| FR-27 | Capture agent_log rows | ✅ | Batch rows and per-position insert rows with action, reasoning prefix, error. |
| FR-28 | Capture context writes | ✅ | save / update / delete / protective-stop updates. |
| FR-29 | Capture snapshot fields incl. `earnings` | ✅ | `contexts[].learningContext.earnings` plus state fingerprint and fill attempts. |
| FR-30 | Mask timestamps and generated ids | ⚠️ | Timestamps are masked. Ids are counter values and are deliberately **not** masked, because they pin the push order of log entries. Rationale stated in the report. |
| FR-31 | Capture the exact prompt in (a) and (b) | ✅ | `a-...prompt.txt` (system + user), `b-...prompt.txt` (user). |
| FR-32 | Goldens generated once, stored in a support folder | ✅ | 16 files under `__golden__/claude-agent/`. |
| FR-33 | Missing golden fails in CI | ✅ | Verified with `CI=true` during implementation. |
| FR-34 | `entryLogId` quirk captured | ✅ | Scenario a2 asserts it, with a comment. |
| FR-35 | Rotation-does-not-clear-context quirk captured | ✅ | Scenario h asserts no `deleteOpenPositionContext` and no cooldown for P1. |
| FR-36 | Further quirks listed, none fixed | ✅ | Four more in the report (stale counter after rotation, rejected order persisted as BUY, outranked requestedQty, per-candidate risk check). |
| FR-37 | Identical results in three runs | ✅ | Re-run here: 14/14 x3, goldens unchanged. |
| FR-38 | Add `claude-agent.ts` to coverage include | ✅ | |
| FR-39 | Change nothing else in the config | ✅ | The diff is one line. |
| FR-40 | Report the coverage | ✅ | 72.2% statements full suite; 60.5% from the new tests alone. |
| FR-41 | `tsc` passes | ✅ | |
| FR-42 | Full suite passes, existing tests unchanged | ✅ | 987/987; no existing test file modified. |
| FR-43 | ESLint clean on new files | ✅ | |
| FR-44 | Only new test files, goldens and one config line | ✅ | |
| FR-45 | Report at `.tmp/claude-agent-characterization-report.md` | ✅ | |
| FR-46 | Report contents | ✅ | Scenarios, quirks, pins, coverage, line count, the `prompt-builder` recommendation. |
| FR-47 | Uncommitted | ✅ | |
| NFR-01 | About 650 to 900 lines | ✅ | 651 lines, at the low end of the range. |
| NFR-02 | Helpers under 50 lines | ⚠️ | `createWorld` in `world.ts` is a ~95-line factory of closures (mostly one-line doubles); `mocks.ts` is a flat list of `vi.mock` blocks. Readable, but not strictly "small helpers". |
| NFR-03 | Runtime comparable to the suite | ✅ | The new file runs in about half a second; fake timers are pumped, no real waiting. |
| NFR-04 | No secrets printed | ✅ | |
| NFR-05 | Unverified claims labelled | ✅ | Report sections 7 and 10. |
| C-01 | No `claude-agent.ts` or Protected Zone edit | ✅ | See below. |
| C-02 | No production file edit | ✅ | |
| C-03 | No threshold, flag or logic change; no quirk fixed | ✅ | |
| C-04 | No tuning of production code to pass | ✅ | |
| C-05 | Only new test files, folder, goldens and the one config line | ✅ | |
| C-06 | No commit/push/branch/PR | ✅ | |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | Mocked (partial) in tests; not edited. |
| src/lib/claude-agent.ts | UNTOUCHED | Executed by the tests; not edited. |
| src/lib/risk-manager.ts | UNTOUCHED | `isNewPositionAllowed` doubled in tests only. |
| src/lib/indicators.ts | UNTOUCHED | `calculateAllIndicators` doubled in tests only. |
| src/lib/news-intelligence.ts | UNTOUCHED | Doubled in tests only. |
| src/lib/watchlist-monitor.ts | UNTOUCHED | Doubled in tests only. |
| src/lib/learning.ts | UNTOUCHED | Real except `evaluateClosedTrade`, stubbed in tests only. |

`.env*`, `vercel.json`, `package.json` and the lockfile are also untouched. `vitest.config.ts` is not on the Protected list.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | N/A, `claude-agent.ts` untouched. The scripted Claude reply is analysis only; tests confirm the persisted action is system-decided. |
| Supabase patterns | ✅ | N/A. All database access is doubled; no query added. |
| TypeScript quality | ✅ | No `any`, `@ts-ignore` or `console.log` (grep); immutable builders; named constants (`TIMER_STEP_MS`, `MAX_PUMP_ROUNDS`, `PINS`); files 52 to 197 lines. One factory exceeds 50 lines (NFR-02 note). |
| Security | ✅ | Fake keys only; golden scan found no secrets or absolute paths. |

## Task Checklist

- Implementation tasks: 27/27 completed (T-01 to T-27), plus the 4 pre-implementation boxes.
- 3 unchecked boxes remain under Post-Implementation (this review, Protected Zone confirmation, "nothing committed"). They close with this review and your commit decision; not implementation gaps.

## Findings

### CRITICAL (blocks merge)
- None.

### HIGH (should fix)
- None.

### MEDIUM (consider fixing)
- **M-1** The safety net is partial: `claude-agent.ts` is covered at 72.2% statements, 59.6% branches and 57.0% functions with the whole suite (60.5% / 48.3% / 46.2% from the new tests alone). Not reached: the ghost-close loop, trailing-stop and profit-floor replacement, the TREND_PULLBACK / TREND_ZLE05 / EMA_RECLAIM setups, several pre-Claude gates (TREND_ZGT125, EMA_RECLAIM_NEAR, TREND_QUALITY_FAIL, 3DAY above SMA5), cooldown skips, the IOC partial-fill retry, max-buys-per-day and the stop-submit failure. The harness is enough for the planned first move (`prompt-builder`), but moves that touch those areas (setup detection, cooldowns, closed positions) need more scenarios first.
- **M-2** The Claude request parameters are not locked in the goldens: `claude.create` calls are recorded but filtered out of the call log, and only the prompt text is stored for (a) and (b). A move that changed the model name, `max_tokens` or the system/user split would not be detected. Cheap to add (store model and max tokens in the prompt golden).
- **M-3** Several wiring reads are not recorded (`getNextTradingDay`, `getAllOpenPositionContexts`, `getTodayBuyExecutions`, `getActiveCooldowns`, `tradeEvaluationExists`). A refactor that dropped or reordered one of them would show up only if the output changed. Acceptable for now; worth recording before the cooldown or closed-position extractions.

### LOW (optional)
- **L-1** Scenarios use one symbol except (j) and (l), so multi-symbol ordering of pushes is only locked there.
- **L-2** The STEP 0 acceptance idea of deleting a gate line in `claude-agent.ts` was replaced by input perturbations (flipping the pinned override, changing a scripted spread, removing a golden under `CI=true`), as agreed in design O-5. The harness demonstrably fails on those, but it has not been run against an actual source mutation.
- **L-3** The goldens are LF in the repository and will be CRLF in Windows working copies (`core.autocrlf=true`). Verified that vitest still passes with a CRLF golden, so no action is needed.
- **L-4** The new tests have only run on this Windows host. `TZ` is set at runtime and the pump uses fake timers; both are expected to behave the same on the Linux CI runner, but that has not been observed.
- **L-5** `createWorld` is ~95 lines and `heldIndicators` / the scenario setup repeats the position and context lists; acceptable, but a candidate for trimming if the file grows.
- **L-6** The harness stubs `learning.evaluateClosedTrade` (it calls Claude), so the post-mortem path is not characterized.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit. Suggested before using it as the net for the first production move: take M-2 (lock the model and `max_tokens`), since the first move is `prompt-builder`.
