# Design — TREND_PULLBACK_3DAY: No Entry When Price Is Above the SMA5 Exit Level

## Architecture Decision

One small pure module, `src/lib/sma5-exit.ts`, owns the SMA5 comparison. `enforceExitRules` (the 3DAY exit, now at `claude-agent.ts:335-340`) and the entry detection block (`claude-agent.ts:1982-1999`, not 1842-1857 as in the brief — the file has grown) both call it, so entry and exit cannot diverge. In the entry block the existing SMA200 and streak conditions stay as they are; a new `trendPullback3DaySma5Blocked` flag is computed from them plus the shared function, and `trendPullback3DaySetup` becomes "conditions met and not blocked". The blocked record follows the existing pattern (`console.log` + `decisions.push` HOLD + `error` prefix + `continue`) and is placed next to `TREND_QUALITY_FAIL`. No `db.ts` or `types.ts` change is needed.

## Verified Facts (fail-fast checks)

- **Same series (fail-fast #1: not triggered).** Entry and exit both read `calculateAllIndicators(bars)`: `sma5 = calculateSMA(bars, 5)` is the mean of the last five daily closes and `currentPrice = bars[last].c`, so the SMA5 includes the current price as its fifth value in both paths (`indicators.ts:132-136, 336-355`; caches built at `claude-agent.ts:1506, 1540, 1560`). The exit compares `ind.currentPrice > ind.sma5` (`claude-agent.ts:337`).
- **Logging needs no `db.ts`/`types.ts` change (fail-fast #2: not triggered).** `insertAgentLogEntry` stores `error` as free text and the full `indicators` object (`db.ts:35-52`); other blocked records use the same `decisions.push` shape. The dashboard shows any HOLD with a non-empty `error` as a gate-blocked entry (`AgentReasoningLog.tsx` `detectKind`), so no UI edit is needed.
- **Operator.** The exit fires only when `price > sma5` (strict). `price == sma5` does not fire the exit.

## Data Flow

1. `calculateAllIndicators` → `indicators` (`prevClose`, `closeMinus2-4`, `sma200`, `sma5`, `currentPrice`).
2. Existing: `trendPullback3DayUptrendOk && trendPullback3DayStreakOk` → `trendPullback3DayCandidate`.
3. New: if `trendPullback3DayCandidate`, call `isSma5ExitConditionMet(currentPrice, sma5)`:
   - SMA5 missing/non-finite → not blocked, one `console.warn` with the symbol.
   - exit condition met → blocked.
4. `trendPullback3DaySetup = trendPullback3DayCandidate && !blocked`.
5. If blocked and no other setup is detected → log + HOLD record `TREND_3DAY_ABOVE_SMA5: price $X >= SMA5 $Y (3DAY exit would fire immediately)` → `continue`.
6. If blocked and another setup is detected → console line only; the symbol continues as that setup.
7. Exit side: `enforceExitRules` replaces its inline comparison with the same function; text and behavior unchanged.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Shared function in a new module `sma5-exit.ts` | Pure, directly unit-testable, not Protected Zone, entry and exit provably share it | One new file | **Chosen** |
| Shared function inside `claude-agent.ts` | No new file | Not importable by tests without loading the whole agent; more Protected Zone surface | Rejected |
| Gate with `>=` while the exit keeps `>` | Matches the brief's log text literally | Entry and exit would diverge at equality, which the brief forbids | Rejected |
| Change the exit to `>=` | Consistent with the text | Changes the exit rule (forbidden) | Rejected |
| Always `continue` after blocking | Simple | Would also block a symbol that qualifies for MR, TREND_PULLBACK, TREND_ZLE05 or EMA_RECLAIM (other setups must not change) | Rejected |
| Extract the whole 3DAY detection into the module | Fully testable | Touches the SMA200/streak conditions (forbidden to change) | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| src/lib/sma5-exit.ts | CREATE | `isSma5ExitConditionMet(price, sma5)` (`sma5 != null && price > sma5`, the exact exit expression), helper to decide gate state (`allowed` / `blocked` / `sma5_unusable`), and the reason text builder |
| src/lib/claude-agent.ts ⚠️ | MODIFY (Protected) | Exit: call the shared function. Entry: add the gate after the SMA200/streak conditions, keep them untouched; add the blocked-candidate record next to `TREND_QUALITY_FAIL` |
| src/lib/__tests__/sma5-exit.test.ts | CREATE | Pure function and gate-state tests, table of price/SMA5 pairs |
| src/lib/__tests__/trend-3day-sma5-gate-exit-rules.test.ts | CREATE | Exit direction through `enforceExitRules` with the same table |
| src/lib/__tests__/trend-pullback-3day-setup.test.ts | UNCHANGED | Must pass as is |

## Test Strategy

- **Operator, stated in the tests:** exit fires only for price > SMA5; equal does not fire and is allowed at entry; above is blocked.
- **One test per direction:** (entry) the gate state equals "exit condition met" for every pair in a table; (exit) `enforceExitRules` on a 3DAY position fires the exit for exactly the same pairs.
- Missing / NaN / Infinity SMA5 → not blocked, in the pure function and in the warn path.
- Record shape (prefix, text with two-decimal numbers, indicators carried) is tested through the pure reason builder; the `decisions.push` wiring inside `runAgentCycle` follows the project convention (that function is not run directly by tests) and is checked in review against the existing blocked records.
- Other setups: the existing exit-rule tests for other setups keep passing; the pure gate returns `allowed` for non-3DAY inputs by construction (it is only called for 3DAY candidates).

## Protected Zone Impact

- ⚠️ `src/lib/claude-agent.ts` — exit comparison, 3DAY entry gate, blocked record. Requires Amaury confirmation before implementation.
- Not touched: `config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, `db.ts`, `types.ts`.

## Database Changes

None.

## Open Questions

- **O-1 (operator at equality):** the brief says "equal and above blocked" and the text uses `>=`, but also "according to the exit's operator", and the exit is strict (`>`). With a strict exit, equality does not fire the exit, so a gate built as its negation allows equality. Recommended: follow the exit (block only when price > SMA5; equal is allowed), keep the brief's log text as written (it is true for every blocked case). Equality of two floating averages is practically never hit. Confirm, or say if equality must be blocked (that would require changing the exit to `>=`, which is forbidden).
- **O-2 (another setup on the same symbol):** if a blocked 3DAY candidate also qualifies for another setup, recommended: let it proceed under that setup (3DAY had the highest classification priority, so it would now be classified as that other setup) with only a console line, and write the HOLD record only when nothing else is detected. The alternative (always `continue`) would suppress other setups, which is forbidden. Confirm.
- **O-3 (new file):** the shared comparison lives in a new non-Protected module `src/lib/sma5-exit.ts` instead of inside `claude-agent.ts`. Confirm.
- **O-4 (brief line numbers):** the brief cites lines 1842-1857; the detection is now at ~1982-1999 and the exit at ~335-340. The authorization is read as covering those same blocks.
