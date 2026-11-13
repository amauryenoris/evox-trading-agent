# Requirements — CHANGE 0d-3: characterization scenarios for the entry-gate, auto-entry and ranking regions of runAgentCycle (tests only)

Baseline: HEAD `1e33ecf` plus one uncommitted change, `specs/docs-5-selector-criteria/tasks.md` (not part of this change). Characterization 63/63; full suite 1216 tests in 80 files; 61 goldens under `src/lib/__tests__/__golden__/claude-agent/`. The characterization file alone covers 463/574 statements and 391/533 branches of `claude-agent.ts:532-2015` (`runAgentCycle`). Line numbers are those of `claude-agent.ts` at that HEAD (2015 lines) and are re-read at implementation.

Note on the source request: the text of the request is cut in the middle of its section 3 ("…not from what"). Sections 4 onward were not received; the verification and report requirements below follow the conventions of 0d-1 and 0d-2 and of the previous splits (see Q-1 in `design.md`).

## Functional Requirements

### A. Scope and constraints on files

FR-01: The system shall add characterization scenarios, continuing the lettering after (an-2), to the `runAgentCycle` characterization suite.
FR-02: The system shall change only files under `src/lib/__tests__/` and the folder `specs/characterization-harness-0d-3/`.
FR-03: The system shall not modify any file under `src/` outside `src/lib/__tests__/`.
FR-04: The system shall not modify any workflow, config, settings, hook or documentation file.
FR-05: The system shall record the SHA-256 of every `src/lib/*.ts` production file before the work and show the same values after it.
FR-06: The system shall not modify, regenerate or delete any of the 61 existing goldens.
FR-07: The system shall record the SHA-256 of the 61 existing goldens and of `specs/docs-5-selector-criteria/tasks.md` before the work and show them equal after it.
FR-08: The system shall name each new golden `<letter>-<slug>.json`.
FR-09: The system shall record each scenario through the existing `buildRecord`, the frozen clock `PINS.nowIso` and the existing mocks.
FR-10: The system shall extend `world.ts`, `mocks.ts`, `builders.ts` or `harness.ts` only when a scenario cannot be built otherwise, and only with optional scripting whose defaults reproduce today's behaviour.
FR-11: The system shall write new test and harness files with LF line endings, as the existing ones.
FR-12: The system shall pin what the code does and shall not fix any behaviour.
FR-13: The system shall name each scenario that pins behaviour that looks wrong with "current behavior" or "QUIRK" in its title, and list it in the review.
FR-14: The system shall stop on a scenario that cannot be built without changing `src/`, explain why, and list it as not covered.

### B. Inventory (read-only, first)

FR-15: The system shall list every existing scenario (letter, name, golden file) before writing any new one.
FR-16: The system shall measure V8 coverage of `claude-agent.ts` with the characterization file alone, with the report written outside the repo.
FR-17: The system shall list the uncovered statements and branches of `runAgentCycle` grouped by region: entry gates, auto-entry, setup detection variants, buying power and position checks, ranking mode, others.
FR-18: The system shall build a scenario only when the inventory shows its target uncovered.
FR-19: The system shall name, for each candidate already covered, the existing scenario that covers it and skip it.
FR-20: The system shall report any candidate whose code path is unreachable and shall not build a scenario for it.
FR-21: The system shall record the final list of scenarios, with the `claude-agent.ts` line each one targets, in `design.md`.

### C. Observe first, then pin

FR-22: The system shall run each new scenario against the current code and inspect the result before recording any golden or writing any expectation.
FR-23: The system shall write each expectation from the observed result and not from the reading of the code.
FR-24: The system shall create a new golden only on the first observed run of its scenario, without any update flag.
FR-25: The system shall not use a snapshot update flag for any run.
FR-26: The system shall stop and report if a run changes any of the 61 existing goldens.

### D. Entry gates, normal mode

FR-27: Scenario (ao) shall cover a candidate with previous-day volume 999,999, blocked by the liquidity gate (`:1611-1614`), and pin the HOLD, the error `Liquidity gate: prev day volume 999,999 < 1,000,000`, the Claude call and the absence of any order.
FR-28: Scenario (ao-b) shall cover previous-day volume exactly 1,000,000 passing the liquidity gate (`checkLiquidity`, `execution-gates.ts:2`) and reaching the order.
FR-29: Scenario (ap-1) shall cover a candidate with no quote, blocked by `Spread gate: no quote available` (`:1615-1618`).
FR-30: Scenario (ap-2) shall cover a candidate with a stale quote, blocked by `Spread gate: stale quote` (`:1619-1622`).
FR-31: Scenario (ap-3) shall cover a spread exactly equal to `MAX_SPREAD_BPS` passing the spread gate (`:1623`) and reaching the order.
FR-32: Scenario (aq-1) shall cover an entry at 9:44 ET, blocked by the trading-hours gate (`:1628-1631`), with the error `Trading hours gate: outside 9:45am–3:30pm ET window`.
FR-33: Scenario (aq-2) shall cover an entry at 15:31 ET, blocked by the same gate.
FR-34: Scenario (aq-3) shall cover an entry at exactly 9:45 ET passing the trading-hours gate.
FR-35: Scenario (aq-4) shall cover an entry at exactly 15:30 ET passing the trading-hours gate.
FR-36: Scenarios (aq-1) to (aq-4) shall set the clock inside the test and restore it with the harness teardown.
FR-37: Scenario (ar) shall cover a candidate when 5 buys were already executed today, blocked by the early gate `Gate: max buys per day (5/5)` (`:1569-1586`), and pin the decision entry and the near-miss call with reason `max_buys`.
FR-38: The system shall not build a scenario for the in-loop overtrading gate (`:1633-1636`) if the inventory confirms it is unreachable, and shall record that in the review.
FR-39: The system shall not build a scenario for the portfolio-risk rejection, already pinned by scenario (f).
FR-40: Scenario (av) shall cover a candidate while the market is closed and a position is open, ending with the error `Market closed — order queued but not executed` (`:1598-1599`) and no order.

### E. Setup variants

FR-41: Scenario (as) shall cover a trend-aligned candidate with z-score above 1.25 excluded as `TREND_ZGT125` (`:1352-1365`), and pin the HOLD entry, the error `TREND_ZGT125: excluded — zScore > 1.25` and the absence of a Claude call.
FR-42: Scenario (at) shall cover a `TREND_PULLBACK_3DAY` candidate with the price above SMA5 (`:1407-1422`), and pin the HOLD with the SMA5 reason and the absence of a Claude call.
FR-43: Scenario (au) shall cover a candidate whose sizing quantity is 0 because of insufficient buying power (`:1776-1779`), and pin the HOLD, the error `Insufficient buying power for position` and the absence of an order.
FR-44: The system shall not build a scenario for a symbol already in a position, already pinned by scenario (ah) at the main-loop skip.
FR-45: The system shall not build a scenario for the in-gate `Already in position` branch (`:1782-1784`) if the inventory confirms it is unreachable, and shall record that in the review.
FR-46: The system shall not build a scenario for a symbol in cooldown, already pinned by scenarios (s) and (t).

### F. Auto-entry

FR-47: Scenario (aw-1) shall cover an auto-entry symbol with no detected setup, taking the `[WATCHLIST] … auto-entry bypassing setup gate` log (`:1330-1332`) and then the `reached learning context without a setup — skipping` warning (`:1479-1482`), and pin that no Claude call, order or decision entry follows.
FR-48: Scenario (aw-1) shall assert both console lines with a spy because console output is not recorded.
FR-49: Scenario (aw-2) shall cover an auto-entry symbol with a setup that is blocked by an entry gate, and pin that the gates of the normal-mode path still apply to auto-entry.
FR-50: Scenario (aw-3) shall cover an auto-entry symbol with a trend-aligned z-score above 1.25 and pin the current outcome (the `TREND_ZGT125` exclusion or the absence of it).
FR-51: The system shall name each of the scenarios (aw-1) to (aw-3) so that the title says which gate auto-entry skips or keeps "as of the current behavior".

### G. Ranking mode (slotsAvailable <= 1)

FR-52: Scenario (ax-1) shall cover a ranking winner whose re-fetched quote is missing (`:1871-1872`, scripted through `quoteSequence`), and pin the entry error `Error: Spread gate: no quote at ranking execution` (`:1989-1992`) and the absence of an order.
FR-53: Scenario (ax-2) shall cover a ranking winner with a zero fill (`:1876-1879`), and pin the `IOC_NOT_FILLED` error, the absence of a stop and of a saved context.
FR-54: Scenario (ax-3) shall cover a ranking winner with a partial fill (`:1881-1883`), and pin the `IOC_PARTIAL_FILL` log, the stop quantity and the saved quantity.
FR-55: Scenario (ax-4) shall cover a ranking winner whose stop submission fails twice (`:1898-1900`), and pin the `STOP_SUBMIT_FAILED` error label and that the context is still saved.
FR-56: Scenario (ax-5) shall cover two candidates without the z-score <= -2 edge and with different z-scores (`:1859`), and pin that the lower z-score wins and the other is not bought.
FR-57: Scenario (ax-6) shall cover two candidates with the same z-score and different confidence (`:1860`), and pin that the higher confidence wins and the other is not bought.
FR-58: Scenario (ax-7) shall cover a ranking winner whose re-fetched quote is stale or has a spread above `MAX_SPREAD_BPS`, and pin that the order is still sent, named "current behavior".
FR-59: The system shall not build a scenario for the ranking market-closed branch (`:1867-1870`) if the inventory confirms it is unreachable, and shall record that in the review.
FR-60: The system shall leave scenario (l) and its golden untouched.

### H. Verification and report

FR-61: The system shall record a baseline before any edit: `git status`, `git rev-parse HEAD`, `tsc --noEmit`, the characterization file three times (63/63), the full suite (1216 in 80 files), ESLint on the files to touch, CR and line count of every file to touch, the SHA-256 of the 61 goldens, of `docs-5` `tasks.md` and of every `src/lib/*.ts`.
FR-62: The system shall pass `tsc --noEmit` after the change.
FR-63: The system shall pass the characterization file three times with identical results and report the new count.
FR-64: The system shall pass the full suite and report the exact count against 1216.
FR-65: The system shall run ESLint on every touched file and report any warning that is not in the baseline.
FR-66: The system shall show that the SHA-256 of every `src/lib/*.ts` production file is identical before and after.
FR-67: The system shall show that the SHA-256 of the 61 existing goldens and of `docs-5` `tasks.md` are identical before and after.
FR-68: The system shall show in `git diff --name-only` and `git status` only files under `src/lib/__tests__/` and `specs/characterization-harness-0d-3/`.
FR-69: The system shall re-measure the V8 coverage with the characterization file alone and report the change in statements and branches of `runAgentCycle`.
FR-70: The system shall write `specs/characterization-harness-0d-3/review.md` in the format of the previous reviews, with each new golden and each pending observation.
FR-71: The system shall delete any temporary file and coverage output created outside the repo.
FR-72: The system shall not commit or push.

## Non-Functional Requirements

NFR-01: The new scenarios shall be deterministic: no network, no key, no real clock beyond the frozen one and the clock set inside the test.
NFR-02: The new scenarios shall add no noticeable time to the suite beyond the harness `pump`.
NFR-03: The change shall print no secret value.
NFR-04: Each new scenario shall name the gate or branch it pins in its title.

## Constraints

C-01: The system shall not edit `claude-agent.ts`, `order-execution.ts`, `protective-orders.ts` or any other production file; no authorization to edit the Protected Zone is given or needed.
C-02: The system shall not touch any existing golden, settings or hook file.
C-03: The system shall not touch `specs/docs-5-selector-criteria/tasks.md`.
C-04: The system shall not commit, push, branch or open a PR.

## Out of Scope

- Any fix of the behaviours observed (see the observations in `design.md`).
- Regions outside entry gates, auto-entry and ranking: the argument guards at `:534-563`, the macro and sector helpers, the rotation failure paths (`:1077-1080`) and the cleanup catch (`:1850`).
- The uncovered lines listed as optional in `design.md` (Q-3).
- Moving `runAgentCycle` (the next change).
