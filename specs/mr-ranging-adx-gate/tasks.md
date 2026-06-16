# Tasks — MR Ranging ADX Gate (temporary)

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] ⚠️ Protected Zone change confirmed by Amaury — src/lib/claude-agent.ts (REQUIRED — separate from spec approval)
- [x] Database migrations drafted (N/A — no DB changes)

## Implementation Checklist

### Phase 1 — Gate logic (claude-agent.ts)

- [x] T-01: Replace the exact line at claude-agent.ts:1239:

  ```ts
  const meanReversionSetup = zScore <= effectiveThreshold
  ```

  with:

  ```ts
  // MR signal — z-score only, no gate
  const meanReversionSignal = zScore <= effectiveThreshold

  // MR Ranging ADX gate — temporary until MR Policy layer (Macro-B/C)
  // Disable by setting enableMrRangingAdxGate = false
  const enableMrRangingAdxGate = true
  const mrRangingAdxFloor = 18

  // Fail-open on invalid ADX data — do not block setups due to indicator corruption
  const hasValidAdx =
    typeof adxValue === 'number' &&
    Number.isFinite(adxValue)

  const mrRangingAdxGateOk =
    !enableMrRangingAdxGate ||
    !(
      indicators.marketRegime === 'RANGING' &&
      hasValidAdx &&
      adxValue < mrRangingAdxFloor
    )

  const meanReversionSetup = meanReversionSignal && mrRangingAdxGateOk
  ```

- [x] T-02: Verify all existing `meanReversionSetup` consumers still reference the gated variable and NONE reference `meanReversionSignal`: lines ~1415 (`setup_detected`), ~1416 (auto-entry check), ~1424 (`signalType`). Run `grep -n meanReversionSignal src/lib/claude-agent.ts` — it must appear ONLY in the new block (definition + `meanReversionSetup` composition + T-04 log condition).

### Phase 2 — Observability

- [x] T-03: Next to the cycle counter at claude-agent.ts:1112 (`let trendPullbackBlockedMacd = 0`), add:

  ```ts
  const mrBlockedRangingAdxSymbols = new Set<string>()
  ```

- [x] T-04: Immediately AFTER the closing brace of the `[TREND_PULLBACK_BLOCKED_MACD]` block (claude-agent.ts:1281–1289), add:

  ```ts
  if (!meanReversionSetup && meanReversionSignal && !mrRangingAdxGateOk) {
    mrBlockedRangingAdxSymbols.add(symbol)
    console.log(
      `[MR_BLOCKED_RANGING_ADX] symbol=${symbol}` +
      ` adx=${adxValue?.toFixed(2)}` +
      ` adxFloor=${mrRangingAdxFloor}` +
      ` z=${zScore.toFixed(2)}` +
      ` regime=${indicators.marketRegime}` +
      ` macd=${macdHistogram?.toFixed(2)}` +
      ` dist_ema50=${indicators.distanceToEma50Pct?.toFixed(1)}`
    )
  }
  ```

- [x] T-05: Extend the stats log at claude-agent.ts:1808:

  ```ts
  console.log(`[TREND_PULLBACK_STATS] blockedMacd=${trendPullbackBlockedMacd} mrBlockedRangingAdx=${mrBlockedRangingAdxSymbols.size}`)
  ```

### Phase 3 — Testing (TDD — write before T-01 if strictly RED-first)

- [x] T-06: Create `src/lib/__tests__/mr-ranging-adx-gate.test.ts` replicating the gate logic inline (repo convention — see trend-zle05-setup.test.ts). AAA structure. Cases (the full verify matrix):
  1. RANGING + ADX 13.0 + z=-1.81 → signal=true, setup=false (NEM profile)
  2. RANGING + ADX 15.2 + z=-1.57 → signal=true, setup=false (UUUU profile)
  3. RANGING + ADX 16.4 + z=-3.18 → signal=true, setup=false (RBLX profile)
  4. RANGING + ADX 17.6 + z=-1.28 → signal=true, setup=false (edge below floor; threshold -1.2 news-relaxed case)
  5. HIGH_VOLATILITY + ADX 17.6 + z=-1.28 → setup=true (OXY profile)
  6. RANGING + ADX 18.1 + z=-1.81 → setup=true (≥ floor)
  7. RANGING + ADX 18.0 + z=-1.81 → setup=true (boundary: NOT < 18)
  8. TRANSITION + ADX 22.7 + z=-1.92 → setup=true
  9. HIGH_VOLATILITY + ADX 27.1 + z=-1.42 → setup=true
  10. TRENDING + ADX 32.4 + z=-2.53 → setup=true
  11. RANGING + ADX NaN → hasValidAdx=false → gateOk=true → setup=signal (fail-open)
  12. RANGING + ADX null → gateOk=true → setup=signal (fail-open)
  13. enableMrRangingAdxGate=false → setup===signal for ALL above inputs
  14. signal=false (z above threshold) → setup=false regardless of gate

  Note for cases 1–4: use an effectiveThreshold that makes signal=true for the given z (e.g. -1.2 for the -1.28/-1.57 profiles).

- [x] T-07: Run `npx vitest run` — full suite green, including the new file.

### Phase 4 — Verification

- [x] T-08: Run `npx tsc --noEmit` — zero errors (confirms the aliased-condition narrowing on `adxValue` compiles without casts).

- [x] T-09: Run `npm run build` — must complete successfully.

- [x] T-10: `git diff src/lib/claude-agent.ts` — confirm the only hunks are: line-1239 block, counter declaration, blocked-log block, stats-log line. `effectiveThreshold`, `trendSetup`, `wouldPassWithoutMacdFloor`, `[TREND_PULLBACK_BLOCKED_MACD]`, TREND_ZLE05/EMA_RECLAIM blocks, and exit rules byte-identical.

## Post-Implementation

- [x] Run /review mr-ranging-adx-gate to verify implementation matches spec
- [x] Confirm no Protected Zone file other than claude-agent.ts changed
- [ ] First live cycle: confirm [MR_BLOCKED_RANGING_ADX] appears (if any RANGING+lowADX signal fires) and [TREND_PULLBACK_STATS] carries mrBlockedRangingAdx=N
- [ ] Reminder: this gate is TEMPORARY — schedule removal/replacement when MR Policy layer (Macro-B/C) ships

## Estimated Complexity

**Low-Medium** — Four small, anchored edits in one Protected Zone file plus one self-contained test file. Logic is a pure boolean composition with an explicit truth table; risk is concentrated in touching the live decision engine, mitigated by the one-line kill switch and byte-identical constraints on neighboring blocks.
