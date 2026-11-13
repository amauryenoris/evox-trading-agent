# Review Report — CHANGE 0d-3: characterization scenarios for the entry-gate, auto-entry and ranking regions of runAgentCycle (tests only)

**Date**: 2026-11-13
**Reviewer**: Claude (automated)
**Status**: APPROVED

Verified at implementation time: `git status`/`git diff`, SHA-256 of every `src/lib/*.ts` (43 files) and of the 61 existing goldens before and after, `tsc`, the characterization file three times, the full suite, ESLint, CR counts and a V8 coverage run of the characterization file alone. An independent second pass (`/review`, same day) re-ran the production-file and golden hashes (43 and 61, identical), the check that only the 2 import lines of the test file were removed (309 added, 2 removed), `tsc`, the characterization file three times (87/87, no obsolete snapshots), the full suite (1240 in 80 files), ESLint, CR counts (0 in the test file and in the 20 new goldens), the absence of stray files and the task count, with the same results.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Scenarios added, lettering after (an-2) | ✅ | (ao) to (ax-7) in `claude-agent.characterization.test.ts` (63 -> 87 tests) |
| FR-02, FR-03 | Only `src/lib/__tests__/` and the spec folder changed | ✅ | `git status`: the test file, 20 new goldens, `specs/characterization-harness-0d-3/` (and `docs-5` `tasks.md`, modified before this change) |
| FR-04 | No workflow, config, settings, hook or doc changed | ✅ | |
| FR-05 | SHA-256 of every `src/lib/*.ts` before and after | ✅ | 43 files, `diff` empty |
| FR-06, FR-07 | The 61 existing goldens and `docs-5` `tasks.md` unchanged | ✅ | `git ls-files` on `__golden__` hashes equal the baseline; `docs-5` `a94014bf...` before and after |
| FR-08 | Golden naming `<letter>-<slug>.json` | ✅ | e.g. `ao-liquidity-gate-below-minimum.json`, `ax7-ranking-requote-not-regated.json` |
| FR-09 | Record through `buildRecord`, frozen clock, existing mocks | ✅ | |
| FR-10 | Harness extended only if needed | ✅ | No harness file changed: `account`, `quoteSequence`, `fillPlan`, `stopErrors`, `buysToday`, `autoEntry`, `marketOpen` and the indicator builders were enough |
| FR-11 | LF files | ✅ | Test file and goldens: 0 CR |
| FR-12, FR-13 | Pin, do not fix; name oddities | ✅ | (aw-1) and (ax-4) say QUIRK; (aw-*) and (ax-7) say "current behavior" |
| FR-14 | Stop on a scenario that cannot be built | ✅ | N/A: every planned scenario was built |
| FR-15 | List the existing scenarios | ✅ | In `design.md` |
| FR-16, FR-17 | V8 coverage with the characterization file alone, uncovered lines by region | ✅ | 463/574 statements, 391/533 branches before; table in `design.md` |
| FR-18, FR-19, FR-20, FR-21 | Build only the uncovered candidates, name the covered ones, report the unreachable ones, list targets | ✅ | `design.md` table; the unreachable ones are confirmed below |
| FR-22, FR-23 | Run first, observe, write expectations from the observation | ✅ | A disposable test ran all 24 cases on the current code and dumped decisions, orders, calls and logs outside the repo; the expectations were written from that output; deleted afterwards |
| FR-24, FR-25 | Goldens created on the first observed run, no update flag | ✅ | `Snapshots 20 written` on the first run of the real tests; no `-u` used |
| FR-26 | Stop if an existing golden changes | ✅ | N/A: none changed |
| FR-27 | (ao) liquidity 999,999 | ✅ | Error `Liquidity gate: prev day volume 999,999 < 1,000,000`; Claude called once; no order |
| FR-28 | (ao-b) exactly 1,000,000 passes | ✅ | BUY of 100 shares, one limit order and one stop |
| FR-29 | (ap-1) no quote | ✅ | `Spread gate: no quote available` |
| FR-30 | (ap-2) stale quote | ✅ | `Spread gate: stale quote` |
| FR-31 | (ap-3) spread exactly 100 passes | ✅ | BUY; log `spread: 100bps` |
| FR-32, FR-33 | (aq-1) 9:44 ET and (aq-2) 15:31 ET blocked | ✅ | `Trading hours gate: outside 9:45am–3:30pm ET window` |
| FR-34, FR-35 | (aq-3) 9:45 ET and (aq-4) 15:30 ET pass | ✅ | BUY in both; the gate ran about 2 s after the set time, still inside the same minute |
| FR-36 | Clock set inside the test, restored by the harness | ✅ | `vi.setSystemTime` after `world.reset`; harness `afterEach` restores timers |
| FR-37 | (ar) 5 buys already today | ✅ | `Gate: max buys per day (5/5)`; Claude called; `detectNearMisses` called twice |
| FR-38 | No scenario for the in-loop overtrading gate; report it | ✅ | `:1634-1635` still uncovered after the change; see Findings L-1 |
| FR-39 | No scenario for the risk rejection | ✅ | Pinned by (f) |
| FR-40 | (av) market closed with an open position | ✅ | Error `Market closed — order queued but not executed`; Claude still called; no order |
| FR-41 | (as) TREND_ZGT125 | ✅ | `TREND_ZGT125: excluded — zScore > 1.25`; no Claude call |
| FR-42 | (at) 3DAY above SMA5 | ✅ | Error `TREND_3DAY_ABOVE_SMA5: price $100.00 >= SMA5 $99.00 (3DAY exit would fire immediately)`; no Claude call |
| FR-43 | (au) insufficient buying power | ✅ | `Insufficient buying power for position`; `baseShares=0` |
| FR-44 | No scenario for a symbol in a position | ✅ | Pinned by (ah) |
| FR-45 | No scenario for `Already in position`; report it | ✅ | `:1783` still uncovered; see L-1 |
| FR-46 | No scenario for a symbol in cooldown | ✅ | Pinned by (s) and (t) |
| FR-47, FR-48 | (aw-1) auto-entry without a setup, both console lines | ✅ | Bypass log and learning warning asserted; no Claude call, no order, no decision entry |
| FR-49 | (aw-2) auto-entry blocked by a gate | ✅ | Liquidity gate still applies |
| FR-50 | (aw-3) auto-entry with trend z > 1.25 | ✅ | The bypass log is followed by the `TREND_ZGT125` exclusion |
| FR-51 | Titles say what auto-entry skips or keeps | ✅ | |
| FR-52 | (ax-1) no quote at ranking time | ✅ | `Error: Spread gate: no quote at ranking execution`; two `getQuote` calls; no order |
| FR-53 | (ax-2) zero fill | ✅ | `IOC_NOT_FILLED: limit buy canceled, 0 shares filled at $50`; no stop, no context |
| FR-54 | (ax-3) partial fill | ✅ | `IOC_PARTIAL_FILL` log; stop for 98 shares |
| FR-55 | (ax-4) stop failure | ✅ | `STOP_SUBMIT_FAILED: stop rejected`; entry executed; context saved |
| FR-56 | (ax-5) different z-scores | ✅ | BBB (z -1.6) wins; AAA `Outranked by BBB (z=-1.600 vs z=-1.500)` |
| FR-57 | (ax-6) same z, different confidence | ✅ | BBB (0.7) wins with 140 shares; AAA `Outranked by BBB (z=-1.500 vs z=-1.500)` |
| FR-58 | (ax-7) stale or wide re-fetched quote | ✅ | The order is sent at the stale 500 bps quote's ask, $50.2 |
| FR-59 | No scenario for ranking market closed; report it | ✅ | `:1868-1869` still uncovered; see L-1 |
| FR-60 | (l) untouched | ✅ | Its golden hash is unchanged |
| FR-61 | Baseline recorded | ✅ | HEAD `1e33ecf`; tsc clean; characterization 63/63 x3; full 1216 in 80 files; ESLint clean on the touched files; hashes saved |
| FR-62 | `tsc` passes | ✅ | |
| FR-63 | Characterization x3 identical | ✅ | 87/87 each |
| FR-64 | Full suite count | ✅ | 1240 in 80 files (1216 + 24) |
| FR-65 | ESLint, nothing new | ✅ | 0 warnings on the touched test file |
| FR-66 | Production hashes identical | ✅ | |
| FR-67 | Goldens and `docs-5` hashes identical | ✅ | |
| FR-68 | Only allowed paths in `git status` | ✅ | |
| FR-69 | Re-measure coverage | ✅ | 500/574 statements (+37), 419/533 branches (+28) |
| FR-70 | This review | ✅ | |
| FR-71 | Temporary files deleted | ✅ | Disposable test removed; coverage output and scratch files removed from the session scratchpad |
| FR-72 | No commit or push | ✅ | |
| NFR-01 to NFR-04 | Deterministic, fast, no secret, titles name the gate | ✅ | No network or key; titles carry the gate or branch |
| C-01 to C-04 | Constraints | ✅ | |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | |
| src/lib/claude-agent.ts | UNTOUCHED | SHA-256 identical before and after |
| src/lib/risk-manager.ts | UNTOUCHED | |
| src/lib/indicators.ts | UNTOUCHED | |
| src/lib/news-intelligence.ts | UNTOUCHED | |
| src/lib/watchlist-monitor.ts | UNTOUCHED | |
| src/lib/learning.ts | UNTOUCHED | |
| src/lib/order-execution.ts, protective-orders.ts and the rest | UNTOUCHED | Same |

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | No production change |
| Supabase patterns | ✅ | Not applicable |
| TypeScript quality | ✅ | No `any`; helpers reuse the harness types |
| Security | ✅ | No secrets |

## Task Checklist

- Completed: 36/36 boxes in `tasks.md` (4 pre-implementation, 30 implementation tasks, 2 post-implementation). Incomplete: 0.

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- **M-1** `claude-agent.characterization.test.ts` is now 1268 lines (was 961), above the 800-line guideline. The spec placed the scenarios in this file; splitting it by region is a possible follow-up that the harness already supports.

### LOW (optional)
- **L-1** Pending observations (pinned or reported, not changed):
  - Ranking mode re-fetches a quote and does not re-apply the stale, spread or hours gates (pinned by (ax-7): a stale 500 bps quote still gets the order).
  - Three branches stay unreachable and uncovered: the in-loop overtrading gate (`:1633-1636`), `Already in position` (`:1782-1784`) and the ranking market-closed branch (`:1867-1870`; `marketOpen` is a `const`).
  - With the market closed and a position open, Claude is still called for the candidate and the entry carries only the queued-not-executed error (pinned by (av)).
  - An auto-entry symbol with no setup logs that it bypasses the setup gate and is then dropped without any decision entry (pinned by (aw-1)); auto-entry does not bypass the liquidity gate or the `TREND_ZGT125` exclusion.
  - `detectNearMisses` is called for every candidate, including those that end in a BUY.
- **L-2** Optional regions left out by design (Q-3): the TREND_PULLBACK / TREND_ZLE05 context fields of a ranking winner (`:1943-1961`), the auto-entry mark after a ranking buy (`:1983`), the watchlist context in the prompt (`:1497-1502`), the SMA5-unusable warning (`:1188`), Claude returning non-text or invalid JSON (`:1533`, `:1540-1541`).
- **L-3** `specs/docs-5-selector-criteria/tasks.md` is still modified and uncommitted.
- **L-4** The request text that started this change was cut in the middle of its section 3; the spec followed the conventions of 0d-1 and 0d-2 for the missing part (Q-1, accepted).

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
