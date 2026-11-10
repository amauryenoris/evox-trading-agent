# Review Report — CHANGE 0d-2: characterization harness, remaining setups, partial fills, stop-submit failure and leftovers (tests only)

**Date**: 2026-11-10
**Reviewer**: Claude (automated)
**Status**: APPROVED

Verified at implementation time: `git status` and `git diff --name-only`, SHA-256 of the 39 existing goldens before and after, three consecutive runs of the characterization file, `tsc`, the full suite, ESLint, and the coverage report for `claude-agent.ts` before and after. Every new golden was read against its code path (see the table). Run `/review` for an independent second pass.

---

## Result in numbers

| Item | Before | After |
|------|--------|-------|
| Characterization tests | 44 | 63 (+19) |
| Full suite | 1188 in 78 files | 1207 in 78 files |
| Golden files | 39 | 61 (+19 JSON, +3 prompt snapshots; the 39 existing are byte-identical) |
| `claude-agent.ts` statements covered (characterization file only) | 699 / 918 (76.1%) | 755 / 918 (82.2%), +56 |
| `claude-agent.ts` branches covered | 515 / 814 (63.3%) | 621 / 814 (76.3%), +106 |

## Scenario table

| Scenario | Code path (`claude-agent.ts`) | What the golden pins | QUIRK |
|----------|-------------------------------|----------------------|-------|
| (aa) TREND_PULLBACK BUY | `trendSetup` `:1581-1600`, classification `:1719-1729`, buy `:2033-2150` | Claude called once; BUY quantity 70; limit order + stop order (qty 70); context `signalType` `TREND_PULLBACK`, `tp_population_bucket` `PULLBACK`, state fingerprint (`macd_bucket` POSITIVE, `adx_bucket` HIGH). Test asserts the `[TREND_PULLBACK_STATS] blockedMacd=0` line. Prompt snapshot | — |
| (ab) TREND_ZLE05 BUY | `trendZLE05Setup` `:1623-1633`, `:2127-2130` | BUY quantity 70; context `signalType` `TREND_ZLE05`, `zle05_population_bucket` `CHOP`. Prompt snapshot | — |
| (ac) EMA_RECLAIM BUY | `emaReclaimSetup` `:1654-1665`; `position-sizing.ts:79-80` | BUY quantity 53 (70 x 0.75 = 52.5, rounded); context `signalType` `EMA_RECLAIM`. Prompt snapshot | — |
| (ad-1) MACD-floor near-miss | `:1603`, no-setup HOLD `:1805-1818` | HOLD "Setup gate: no mean reversion setup ... and no trend setup", `error` null, no `claude.create`, no order. Test asserts `[TREND_PULLBACK_BLOCKED_MACD]` and `blockedMacd=1` | — (the generic text is the only trace) |
| (ad-2) ZLE05 with ADX 19 | `:1772-1787` | HOLD, `error` `TREND_QUALITY_FAIL: adx=19.0 slope=ok`, no `claude.create` | Yes: the candidate passes its own ADX gate (>= 18) but the PULLBACK quality filter (>= 20) runs first and blocks it |
| (ad-3) EMA_RECLAIM_NEAR | `:1750-1769` | HOLD, `error` `EMA_RECLAIM_NEAR: conditions not met`, no `claude.create` | — |
| (ae) partial fill + retry | `executeIocWithRemainderRetry` `:851-905`, `:2062-2084` | Orders 100 @ 50 then 40 @ 50.05; `getOrder` poll between them; context `buyPrice` 50.02 (weighted), `fillAttempts` of two attempts, `requestedQty` 100; stop qty 100 at 47.5; BUY quantity 100 | — |
| (af-1) retry skipped on drift | gate `:869-884` | One limit order (100); context `quantity` 60; stop qty 60; `fillAttempts` of one attempt. Test asserts `IOC_PARTIAL_FILL: requested 100, filled 60` and `gate check failed (remainder=40)` | — |
| (af-2) retry skipped, remainder < 300 USD | same gate | One limit order; filled 98; stop qty 98. Test asserts `filled 98` and `(remainder=2)` | — |
| (ag) stop fails after BUY | `:2084-2088`, save `:2139` | BUY executed, quantity 100, `error` `STOP_SUBMIT_FAILED: stop rejected`; two `submitStopOrder` attempts; context saved without a `stopOrderId` | Yes: the position is left unprotected and the only trace is the `error` field of the agent_log entry (the buy path has no naked-stop alert) |
| (ah) main-loop skips | blacklist `:1393-1396`, open position `:1398-1401`, no indicators `:1417-1431` | One HOLD (`NOIND`, `Skipped: no indicators available in cache`); no order, no Claude call; the held symbol gets its normal `exit_rules_check`. Test asserts both skip log lines | Observation: the blacklisted symbol still has its bars fetched before it is skipped |
| (ai) ATR trailing-stop exit | stop update `:262-345`, exit `:360-372` | `cancelOrder trail-HLD`, `submitStopLimitOrder` (stop 105, limit 104.47), then `closePosition`; SELL decision with "Trailing stop triggered: price $103.90 <= stop $105.00 (high: $108.00)"; `cooldown.upsert TRAILING_STOP` (raw `until` next trading day) | Yes: a new stop-limit order is placed and the position is sold in the same pass, leaving the new order open after the close |
| (aj) ghost-close profit, existing cooldown | `:1280-1288` | Evaluation and context delete, agent_log `ghost_close`, no `upsert` | — |
| (ak) peak-high update | `:269-276`, `applyProfitFloor` | Context patch `highSinceEntry` 108, `trailingStop` 105; Capa A cancelled and a floor stop at 105 placed | — |
| (al-1) orphan buy timestamp | `:142-156` | Saved context `buyTimestamp` equals the latest filled buy of the symbol (`2026-11-02T15:00:00.000Z`, asserted raw); other symbols and sell orders ignored | — |
| (al-2) orphan fallback | `:157-160` | `buyTimestamp` equals the cycle timestamp (asserted raw); `[RECONCILE] ... no matching filled buy order found` warning asserted | — |
| (am) UNKNOWN exit reason | `:1338-1346` | Profit-target SELL, no `cooldown.upsert`; `[EXIT_COOLDOWN_UNKNOWN_REASON] symbol=HLD` warning asserted | The reason is forced through a `mocks.ts` hook; the real flow cannot produce `UNKNOWN` today |
| (an-1) Capa B close fails | `:693-696` | `closePosition` attempted once, no `upsert STOP_LOSS`; the error is logged; the exit rules then log `exit_rules_check` for the same position | — |
| (an-2) Capa B context read fails | `:668-672` | No close and no cooldown; `[enforceStopLosses] CRITICAL` error asserted; the second context read (exit rules) works | — |

## Files changed

- `src/lib/__tests__/claude-agent.characterization.test.ts` — new `describe` blocks for (aa) to (an) and two import changes.
- `src/lib/__tests__/support/claude-agent/world.ts` — optional scripting: `fillPlan`, `quoteSequence`, `peakHighs`, `closeErrors`, `contextReadFailures`, `forceUnknownExitReason`; `makeOrder` exported. Defaults reproduce the old behaviour.
- `src/lib/__tests__/support/claude-agent/mocks.ts` — the peak-high stub reads `peakHighs`; a `vi.mock` of `exit-cooldown` that passes through to the real `toExitReason` unless `forceUnknownExitReason` is set.
- `src/lib/__tests__/support/claude-agent/builders.ts` — `trendPullbackIndicators`, `trendZle05Indicators`, `emaReclaimIndicators`.
- 22 new golden files and `specs/characterization-harness-0d-2/`.

Nothing outside `src/lib/__tests__/**` and the spec folder was touched; `claude-agent.ts` was only read.

Deviation from the spec: `forceUnknownExitReason` is a single boolean, not a per-symbol map, because `toExitReason` receives only the reason text, not the symbol. The scenario has one exiting symbol, so the effect is the same.

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Scenarios (aa) to (an) added | ✅ | 19 cases |
| FR-02 / FR-03 / FR-04 | Only `src/lib/__tests__/**` and the spec folder | ✅ | `git status` |
| FR-05 / FR-06 | 39 existing goldens untouched; docs-5 `tasks.md` unchanged | ✅ | SHA-256 equal before and after |
| FR-07 / FR-08 | Naming; `buildRecord` and frozen clock | ✅ | |
| FR-09 / FR-10 | Optional scripting only; LF | ✅ | 0 CR in all touched files |
| FR-11 / FR-12 / FR-13 | Pin, mark QUIRKs, stop if infeasible | ✅ | QUIRKs: (ad-2), (ag), (ai); none infeasible |
| FR-14 to FR-21 | Buys (aa) (ab) (ac) with prompt snapshots | ✅ | |
| FR-22 to FR-25 | Near-misses (ad-1) (ad-2) (ad-3) | ✅ | See table; (ad-1) has no specific text |
| FR-26 to FR-31 | Partial fills (ae) (af-1) (af-2) | ✅ | Log lines asserted with spies |
| FR-32 to FR-34 | Stop failure (ag) | ✅ | QUIRK |
| FR-35 to FR-37 | Skips (ah) | ✅ | |
| FR-38 to FR-51 | Leftovers (ai) (aj) (ak) (al) (am) (an) | ✅ | |
| FR-52 to FR-58 | Harness scripting; call shapes unchanged | ✅ | FR-57 as a boolean (see deviation) |
| FR-59 / FR-60 | Goldens read against the code; described | ✅ | Table above |
| FR-61 | Three runs identical | ✅ | 63/63 each; no snapshot written on runs 2 and 3 |
| FR-62 | `tsc` | ✅ | |
| FR-63 | Full suite | ✅ | 1207 (1188 + 19) |
| FR-64 | ESLint | ✅ | No output on the harness folder and the test file |
| FR-65 | Only allowed files | ✅ | |
| FR-66 / FR-67 / FR-68 | Coverage and remaining gaps | ✅ | Below |
| FR-69 / FR-70 | This table and the final report | ✅ | |
| FR-71 | No commit or push | ✅ | |
| NFR-01 to NFR-04 | Stability, no network, patterns, spies | ✅ | |
| C-01 / C-02 | Protected Zone and docs-5 untouched | ✅ | |

## Still uncovered in the requested regions

| Region | Uncovered (from) | Statements | Classification |
|--------|------------------|------------|----------------|
| `enforceExitRules` `:93-440` | 13 (from 18) | `:116`, `:188`, `:190`, `:297-298`, `:356`, `:387`, `:409`, `:429`, `:435` (error-handling `.catch` and cleanup failures); `:140` (orphan stop-submit failure log); `:158` (order-history lookup failure); `:325` (corrupt-stop guard) | Mostly low value; `:325` and `:140` are small decision branches |
| Protective-order helpers `:461-621` | 11 (unchanged) | `.catch` callbacks (`:473`, `:514`, `:534`, `:553`); guards `:477`, `:491`, `:551`; `:601-602`, `:606-607` ("no order needed" and "exit already set") | `.catch` and guards are low value; `:601-607` are decision branches that need two scenarios |
| `enforceStopLosses` `:664-699` | 0 (from 3) | — | Fully covered |
| Ghost-close `:1196-1290` | 2 (from 4) | `:1247` agent_log insert failure; `:1289` loop failure | Error-handling catch |
| Cooldown skip and restore `:1320-1410` | 2 (from 10) | `:1342` (the `COOLDOWN_UNKNOWN_EXIT_REASON` true branch, a constant that is false); `:1359` restore-skip log | `:1342` is dead under the current constant; `:1359` is log-only |
| Setup detection `:1411-1830` | 12 (from 26) | `:1458`, `:1461` rotation failure and skip logs; `:1569` SMA5-unusable warn; `:1712` auto-entry bypass of the setup gate; `:1734-1735` `TREND_ZGT125` HOLD; `:1745`; `:1789-1792` and `:1802` 3DAY blocked above SMA5 | Decision branches: `TREND_ZGT125`, the auto-entry bypass, 3DAY above SMA5, rotation failure |
| Learning, Claude call and gates `:1831-2030` | 23 (unchanged) | News and near-miss lookups (`:1873-1883`), Claude response errors (`:1914`, `:1921`), the market-closed and gate failures (`:1980`, `:1993`, `:1997`, `:2001`, `:2010`, `:2015`) | Gate failures (liquidity, spread, hours, overtrading, market closed) are decision branches that need scenarios; response errors are catches |
| Buy execution `:2031-2150` | 0 (from 8) | — | Fully covered |
| Post-buy and ranking `:2151-2396` | 23 (unchanged) | Insufficient buying power (`:2158`), already in position (`:2164`), `COOLDOWN_CLEAN_FATAL` (`:2231`), ranking-mode execution (`:2240-2342`, `:2364`, `:2371`) | `:2158`, `:2164` and the ranking-mode buy branches are decision branches |

## Task Checklist

- Completed: 40/40 boxes in `tasks.md` (4 pre-implementation, 34 implementation tasks, 2 post-implementation). Incomplete: 0. Every check above was re-run independently at review time and gave the same results: SHA-256 of the 39 existing goldens equal, 61 golden files on disk (22 new, all untracked), three runs of 63/63 with no snapshot written, `tsc` clean, full suite 1207 passed, ESLint clean, 0 CR in all touched files, no Protected Zone file in the diff, docs-5 `tasks.md` SHA unchanged. The only `any` in the touched test files is `expect.any(Error)` (a matcher, not a type).

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- **L-1** Quirks pinned, not fixed: a ZLE05 candidate with ADX 18 to 19.99 is held by the PULLBACK quality filter (ad-2); the buy path leaves an unprotected position with only an error text (ag); a trailing stop-limit order is placed and the position sold in the same pass (ai).
- **L-2** The `UNKNOWN` branch is reached only through a mock hook; the real flow cannot produce it. `COOLDOWN_UNKNOWN_EXIT_REASON` is a constant `false`, so `:1342` stays unreachable.
- **L-3** Decision branches still not pinned and worth a follow-up: the entry gates (liquidity, spread, trading hours, overtrading, market closed), `TREND_ZGT125`, the auto-entry setup bypass, 3DAY blocked above SMA5, insufficient buying power, already in position, and the ranking-mode buy.
- **L-4** Coverage numbers are for the characterization file alone and `claude-agent.ts` only.
- **L-5** `specs/docs-5-selector-criteria/tasks.md` is still modified and uncommitted.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
