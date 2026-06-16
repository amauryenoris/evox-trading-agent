# Tasks — Jun 17 Parte A: Remove Temp Logging ZLE05 + TREND_PULLBACK + EXIT_COOLDOWN

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Amaury has confirmed Protected Zone changes for `src/lib/claude-agent.ts`

## Implementation Checklist

### Phase 1 — Group A: TREND_ZLE05 temp logging

- [x] T-01: Remove the `// TEMP LOGGING — remove ~2026-06-17` comment and the 4 counter `let` declarations
        (`trendZLE05Signals`, `legacySignals`, `expandedSignals`, `trendZLE05Rejected`) at ~lines 1107–1111.
        Do NOT remove `trendPullbackBlockedMacd` (line 1112) or `mrBlockedRangingAdxSymbols` (line 1113).

- [x] T-02: Remove the `if (adxValue === null && zScore > 0 && zScore <= 1.25 ...)` ADX-null if-block
        (the `[TREND_ZLE05]` log) at ~lines 1345–1347.

- [x] T-03: Remove the `if (trendZLE05Setup)` block at ~lines 1372–1379, including the local
        `zBucket`, `adxBucket` declarations and the `[TREND_ZLE05_ENTRY]` log inside it.

- [x] T-04: Remove the `if (!trendZLE05Setup && zScore > 1.25 ...)` block at ~lines 1381–1384
        (`[TREND_ZLE05_REJECTED_Z]` log).

- [x] T-05: Remove the `[TREND_ZLE05_STATS]` console.log line at ~line 1842.

### Phase 2 — Group B: TREND_PULLBACK temp logging

- [x] T-06: Remove the outer `zBucket` declaration block at ~lines 1288–1296, including the
        `// TEMP LOGGING — remove ~2026-06-17` comment that precedes it.

- [x] T-07: Remove the `populationBucket` declaration block at ~lines 1298–1301.

- [x] T-08: Remove the `if (trendSetup)` block at ~lines 1326–1334 (`[TREND_PULLBACK_ENTRY]` log).

- [x] T-09: Remove the `if (trendSetup && indicators.marketRegime === 'HIGH_VOLATILITY')` block
        at ~lines 1336–1343 (`[TREND_PULLBACK_HIGH_VOL]` log).

### Phase 3 — Group C: EXIT_COOLDOWN logging

- [x] T-10: Remove the `console.log(\`[EXIT_COOLDOWN]...\`)` line at ~line 331.
        Keep the `exitReasons.set(position.symbol, mapped)` line above it intact.

- [x] T-11: Remove `console.log(\`[EXIT_COOLDOWN_ADD] symbol=${symbol} reason=UNKNOWN\`)` at ~line 1064.
        Keep `cooldownSymbols.add(symbol)` and the `COOLDOWN_UNKNOWN_EXIT_REASON` conditional intact.

- [x] T-12: Remove `console.log(\`[EXIT_COOLDOWN_ADD] symbol=${symbol} reason=${reason}\`)` at ~line 1070.
        Keep `cooldownSymbols.add(symbol)` intact.

- [x] T-13: Remove `activeBreakdown` variable declaration (~lines 1845–1847).

- [x] T-14: Remove `excludedBreakdown` variable declaration (~lines 1849–1854).

- [x] T-15: Remove the `[EXIT_COOLDOWN_STATS]` console.log block (~lines 1856–1861).

### Phase 4 — Verification

- [x] T-16: Run `npx tsc --noEmit` — PASSED (zero errors).

- [x] T-17: Run `npm run build` — PASSED (✓ Compiled successfully in 4.3s).

- [x] T-18: Run all grep verifications:
    ```
    grep -F "[TREND_ZLE05_ENTRY]"       src/lib/claude-agent.ts  # → 0 ✅
    grep -F "[TREND_ZLE05_REJECTED_Z]"  src/lib/claude-agent.ts  # → 0 ✅
    grep -F "[TREND_ZLE05_STATS]"       src/lib/claude-agent.ts  # → 0 ✅
    grep -F "[TREND_PULLBACK_ENTRY]"    src/lib/claude-agent.ts  # → 0 ✅
    grep -F "[TREND_PULLBACK_HIGH_VOL]" src/lib/claude-agent.ts  # → 0 ✅
    grep -F "[EXIT_COOLDOWN]"           src/lib/claude-agent.ts  # → 0 ✅
    grep -F "[EXIT_COOLDOWN_ADD]"       src/lib/claude-agent.ts  # → 0 ✅
    grep -F "[EXIT_COOLDOWN_STATS]"     src/lib/claude-agent.ts  # → 0 ✅
    grep -F "[TREND_PULLBACK_BLOCKED_MACD]" src/lib/claude-agent.ts  # → 1 ✅
    grep -F "[TREND_PULLBACK_STATS]"    src/lib/claude-agent.ts  # → 1 ✅
    grep "zBucket"           src/lib/claude-agent.ts  # → 0 ✅
    grep "populationBucket"  src/lib/claude-agent.ts  # → 0 ✅
    grep "trendZLE05Signals" src/lib/claude-agent.ts  # → 0 ✅
    ```

## Post-Implementation

- [x] Run `/review jun-17-parte-a-remove-temp-logging` to verify implementation matches spec
- [x] Confirm `src/lib/claude-agent.ts` is the only file changed (git diff --name-only)

## Estimated Complexity

**Low** — Pure deletion of isolated logging blocks. No logic changes, no type changes,
no cross-file impact. The 15 tasks are all mechanical removes; tsc validates completeness.
