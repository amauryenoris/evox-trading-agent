# Tasks — Fix: checkAutoEntry() Bypasses MR_RANGING_ADX_GATE

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone change confirmed: `src/lib/watchlist-monitor.ts`
- [X] Database migrations: **None required**

## Implementation Checklist

### Phase 1 — checkAutoEntry() new checks (watchlist-monitor.ts)

- [x] T-01: Inside `checkAutoEntry()`'s `for (const entry of activeEntries)` loop, immediately after the existing `regimeOk` declaration, add:
  ```ts
  // mrRangingAdxFloor must stay in sync with claude-agent.ts's mrRangingAdxFloor (= 18)
  const adxValue = currentIndicators[entry.symbol]?.adx ?? null
  const mrRangingAdxBlocked =
    entry.signal_type === 'MEAN_REVERSION' &&
    regime === 'RANGING' &&
    typeof adxValue === 'number' &&
    Number.isFinite(adxValue) &&
    adxValue < 18

  const nullSignalTypeBlocked = entry.signal_type === null
  ```

- [x] T-02: Add two new early-exit branches before the existing combined `if`:
  ```ts
  if (mrRangingAdxBlocked) {
    console.log(`[AUTO-ENTRY] ${entry.symbol}: skipped — MR_RANGING_ADX_GATE (ADX=${adxValue} < 18, regime=RANGING)`)
    continue
  }

  if (nullSignalTypeBlocked) {
    console.log(`[AUTO-ENTRY] ${entry.symbol}: skipped — signal_type is null, no named setup`)
    continue
  }
  ```

- [x] T-03: Confirm the existing combined condition (`if (currentZScore <= threshold && regimeOk && openPositionsCount < maxPositions)`) is unchanged in structure — only reached after the two new early-exits.

### Phase 2 — Verification

- [x] T-04: Run `npx tsc --noEmit` — must pass with zero errors.
- [x] T-05: Run `npm run build` — must pass successfully.
- [x] T-06: Confirm `git diff --name-only` shows only `src/lib/watchlist-monitor.ts` (+ new test file) changed — `src/lib/claude-agent.ts` untouched. Confirmed.
- [x] T-07: Confirm `regimeOk`, `currentZScore <= threshold`, and `openPositionsCount < maxPositions` are byte-for-byte unchanged. Confirmed via `git diff` — diff is purely additive.
- [x] T-08: Confirm `detectNearMisses()`, `updateWatchlist()`, `markWatchlistTriggered()` are untouched. Confirmed — none appear in the diff.

### Phase 3 — Testing (TDD — write tests first, then confirm against implementation)

- [x] T-09: Create `src/lib/__tests__/watchlist-monitor.checkAutoEntry.test.ts`, mocking `db.ts`'s `getActiveNearMisses`/`updateNearMiss` (hoisted mocks, per project convention). Assert the 5 cases from the fix request, each as its own test:
  1. **NVDA replay**: `signal_type=null, regime='RANGING', z=-1.429, threshold=-1.22, adx=17.17` → NOT in `readyForEntry`.
  2. **MR + RANGING + ADX=17.9** (just under floor) → blocked, NOT in `readyForEntry`.
  3. **MR + RANGING + ADX=18.5** (just over floor) → NOT blocked by the new check (eligible, assuming z/position-count conditions also pass).
  4. **MR + TRANSITION (not RANGING) + ADX=10** → NOT blocked by the new check (mirrors RANGING-only scope; covers the live COP near-miss scenario). Note: COP still ends up excluded from `readyForEntry` via the pre-existing, untouched `regimeOk` check (MEAN_REVERSION requires RANGING) — the test asserts specifically that the new `MR_RANGING_ADX_GATE` log is NOT what excluded it, confirming the new check stays RANGING-scoped.
  5. **TREND_PULLBACK + RANGING + ADX=10** → NOT blocked by the new check (out of scope signal type, unaffected).
- [x] T-10: Add a 6th test confirming the `MR_RANGING_ADX_GATE` skip log message format exactly matches FR-07.
- [x] T-11: Add a 7th test confirming the null-signal-type skip log message format exactly matches FR-08.
- [x] T-12: Run `npx vitest run src/lib/__tests__/watchlist-monitor.checkAutoEntry.test.ts` — all new tests pass. 7/7 passing.
- [x] T-13: Run the full existing suite — confirm zero regressions, including `db.near-miss.test.ts`.

## Post-Implementation

- [ ] Run `/review fix-auto-entry-mr-ranging-adx-gate` to verify implementation matches spec
- [x] Confirm `src/lib/claude-agent.ts` unchanged (`git diff --stat` empty for that file) — confirmed
- [ ] After the next live cycle with an ACTIVE near-miss entry in RANGING+low-ADX or null-signal-type state, confirm via `agent_log`/console output that the symbol is correctly skipped (no order executed) and the new log line appears

## Estimated Complexity

**Low** — 2 new local checks + 2 new early-exit branches inside one existing function, in one file. No signature changes, no new fetches, no schema changes. The only real work is the new test file (none exists today for this function), which the spec already enumerates case-by-case.
